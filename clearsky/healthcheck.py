# -*- coding: utf-8 -*-
"""URL 健康检查：运行前确认数据源可用性 + 延迟。

功能:
    - check_url : 单 URL 检测（TCP/TLS 连接时间、TTFB、总耗时、状态码、重定向）
    - check_all : 并发检测整个 URL 注册表（clearsky.urls.URLS）
    - 结果支持 dict / 中文表格输出，供 CLI、Web 启动前、CI 使用

用法:
    from clearsky.healthcheck import check_all, check_url
    report = check_all(group="core")
    print(report.summary())
    for r in report.results:
        print(r.ok, r.id, r.total_ms)

    from clearsky.urls import URLEntry
    r = check_url(URLEntry("x", "示例", "misc", "https://example.com/"))
"""
import http.client
import ssl
import socket
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Optional, Union
from urllib.parse import urlparse, urljoin

from .urls import URLEntry, get_urls, GROUPS, GROUP_LABELS

# 只读取响应体前 N 字节就断开（检查连通性，避免把大文件/云图整个下载下来）
READ_LIMIT = 2048
_RANGE_HEADER = f"bytes=0-{READ_LIMIT - 1}"


@dataclass
class CheckResult:
    id: str
    name: str
    group: str
    url: str
    ok: bool
    status: Optional[int] = None
    connect_ms: float = 0.0      # TCP 连接 + TLS 握手（重定向时累加）
    ttfb_ms: float = 0.0         # 请求发出到响应头到达
    total_ms: float = 0.0        # 全过程（含重定向）
    error: Optional[str] = None
    final_url: Optional[str] = None
    note: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "group": self.group,
            "url": self.url, "ok": self.ok, "status": self.status,
            "connect_ms": round(self.connect_ms, 1),
            "ttfb_ms": round(self.ttfb_ms, 1),
            "total_ms": round(self.total_ms, 1),
            "error": self.error, "final_url": self.final_url,
        }


@dataclass
class HealthReport:
    results: list = field(default_factory=list)
    started: float = 0.0
    finished: float = 0.0

    @property
    def ok_count(self) -> int:
        return sum(1 for r in self.results if r.ok)

    @property
    def fail_count(self) -> int:
        return len(self.results) - self.ok_count

    @property
    def critical_failures(self) -> list:
        return [r for r in self.results if not r.ok and getattr(r, "critical", False)]

    def summary(self) -> dict:
        return {
            "total": len(self.results),
            "ok": self.ok_count,
            "fail": self.fail_count,
            "critical_fail": len(self.critical_failures),
            "elapsed_s": round(self.finished - self.started, 2),
            "avg_total_ms": round(
                sum(r.total_ms for r in self.results) / max(1, len(self.results)), 1),
        }

    def to_dict(self) -> dict:
        return {
            "summary": self.summary(),
            "results": [r.to_dict() for r in self.results],
        }


def _request_once(url: str, method: str, headers: dict, timeout: float):
    """发起一次 HTTP 请求，返回 (status, location, connect_ms, ttfb_ms, total_ms, error)。

    不跟随重定向；由调用方循环处理。
    """
    p = urlparse(url)
    host = p.hostname
    port = p.port or (443 if p.scheme == "https" else 80)
    path = p.path or "/"
    if p.query:
        path += "?" + p.query

    t_start = time.perf_counter()
    t_conn_start = t_start
    try:
        if p.scheme == "https":
            ctx = ssl.create_default_context()
            conn = http.client.HTTPSConnection(host, port, timeout=timeout, context=ctx)
        else:
            conn = http.client.HTTPConnection(host, port, timeout=timeout)
        conn.connect()
        connect_ms = (time.perf_counter() - t_conn_start) * 1000
    except Exception as e:
        return None, None, (time.perf_counter() - t_conn_start) * 1000, 0.0, 0.0, _short_err(e)

    t_req = time.perf_counter()
    try:
        hdrs = dict(headers)
        hdrs.setdefault("User-Agent", "Mozilla/5.0 (compatible; clearsky/1.1)")
        hdrs.setdefault("Accept", "*/*")
        hdrs.setdefault("Range", _RANGE_HEADER)
        conn.request(method, path, headers=hdrs)
        resp = conn.getresponse()
        ttfb_ms = (time.perf_counter() - t_req) * 1000
        status = resp.status
        location = resp.getheader("Location")
        try:
            resp.read(READ_LIMIT)
        except Exception:
            pass
        conn.close()
        total_ms = (time.perf_counter() - t_start) * 1000
        return status, location, connect_ms, ttfb_ms, total_ms, None
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        total_ms = (time.perf_counter() - t_start) * 1000
        return None, None, connect_ms, 0.0, total_ms, _short_err(e)


def _short_err(e: Exception, limit: int = 160) -> str:
    s = str(e)
    if len(s) > limit:
        s = s[: limit - 3] + "..."
    return s or e.__class__.__name__


def check_url(entry: Union[URLEntry, dict], timeout: Optional[float] = None,
              max_redirects: int = 3) -> CheckResult:
    """检测单个 URL。entry 可为 URLEntry 或 dict（含 id/name/group/url/...）。"""
    if isinstance(entry, dict):
        entry = URLEntry(
            id=entry.get("id", "custom"), name=entry.get("name", entry.get("id", "custom")),
            group=entry.get("group", "misc"), url=entry["url"],
            critical=bool(entry.get("critical", False)),
            method=entry.get("method", "GET"),
            timeout=float(entry.get("timeout", 8.0)),
            headers=entry.get("headers") or {},
            note=entry.get("note", ""),
        )
    timeout = timeout or entry.timeout
    url = entry.url
    final_url = url
    connect_total = 0.0
    ttfb_last = 0.0
    total_accum = 0.0
    error = None
    status = None

    for _ in range(max_redirects + 1):
        status, location, cms, ttfb, total, err = _request_once(
            url, entry.method, entry.headers, timeout)
        connect_total += cms
        if ttfb:
            ttfb_last = ttfb
        total_accum += total
        final_url = url
        if err is not None:
            error = err
            status = None
            break
        if location and 300 <= status < 400:
            url = urljoin(url, location)
            continue
        break
    else:
        error = f"too many redirects (> {max_redirects})"
        status = None

    if error is None and status is not None and not (200 <= status < 400):
        error = f"HTTP {status} (非 2xx/3xx)"
    ok = (error is None and status is not None and 200 <= status < 400)
    return CheckResult(
        id=entry.id, name=entry.name, group=entry.group, url=entry.url,
        ok=ok, status=status, connect_ms=connect_total, ttfb_ms=ttfb_last,
        total_ms=total_accum, error=error, final_url=final_url, note=entry.note,
    )


def check_all(group: Optional[str] = None, timeout: Optional[float] = None,
              workers: int = 12, critical_only: bool = False,
              max_redirects: int = 3,
              entries: Optional[list] = None) -> HealthReport:
    """并发检测整个注册表（或指定分组）。group 可为 'all' / 组名 / None。

    entries 可传入自定义 URLEntry 列表（测试/离线场景），默认用 clearsky.urls 注册表。
    """
    if entries is None:
        entries = get_urls(group, critical_only=critical_only)
    report = HealthReport(started=time.time())

    with ThreadPoolExecutor(max_workers=max(1, min(workers, len(entries) or 1))) as ex:
        futs = {ex.submit(check_url, e, timeout=timeout, max_redirects=max_redirects): e
                for e in entries}
        for fut in as_completed(futs):
            report.results.append(fut.result())

    report.finished = time.time()
    # 按分组顺序排序，组内按 id
    order = {g: i for i, g in enumerate(GROUPS)}
    report.results.sort(key=lambda r: (order.get(r.group, 99), r.id))
    return report


def format_report(report: HealthReport, verbose: bool = False) -> str:
    """渲染中文表格。verbose=True 时附上 URL。"""
    lines = []
    s = report.summary()
    lines.append(f"健康检查: {s['total']} 个端点 | 通过 {s['ok']} | 失败 {s['fail']} "
                 f"| 关键失败 {s['critical_fail']} | 总耗时 {s['elapsed_s']}s")
    lines.append("-" * 88)
    cur_group = None
    for r in report.results:
        if r.group != cur_group:
            cur_group = r.group
            lines.append(f"[{GROUP_LABELS.get(cur_group, cur_group)}]")
        flag = "✓" if r.ok else "✗"
        mark = "★" if getattr(r, "critical", False) else " "
        if r.ok:
            line = (f"  {flag} {mark} {r.id:28s} {r.name:22s} "
                    f"HTTP {r.status}  连接 {r.connect_ms:6.1f}ms  TTFB {r.ttfb_ms:6.1f}ms  "
                    f"总 {r.total_ms:7.1f}ms")
        else:
            line = (f"  {flag} {mark} {r.id:28s} {r.name:22s} 失败: {r.error or 'unknown'}")
        if verbose and r.ok:
            line += f"\n       {r.url}"
        if not r.ok and verbose:
            line += f"\n       {r.url}"
        lines.append(line)
    lines.append("-" * 88)
    if report.critical_failures:
        lines.append("关键服务异常（影响观星决策主链路）:")
        for r in report.critical_failures:
            lines.append(f"  ✗ {r.id} {r.name} -> {r.error}")
    else:
        lines.append("关键服务全部正常 ✔")
    return "\n".join(lines)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="URL 健康检查")
    ap.add_argument("--group", default="all")
    ap.add_argument("--timeout", type=float, default=None)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    rep = check_all(args.group, timeout=args.timeout)
    if args.json:
        print(json_dumps(rep.to_dict()))
    else:
        print(format_report(rep, verbose=True))


def json_dumps(d: dict) -> str:
    import json
    return json.dumps(d, ensure_ascii=False, indent=2)
