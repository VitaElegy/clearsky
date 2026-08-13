#!/usr/bin/env python3
# ClearSky实现版 - 本地服务 + API代理
# 用法: python3 server.py [端口] [--no-check] [--check-exit]
#   端口默认 8890; 启动前自动做 URL 健康检查(延迟报告); --no-check 跳过; --check-exit 关键失败中止
# 手机同网访问: http://<电脑IP>:8890
import http.server, urllib.request, urllib.parse, socketserver, os, sys, json, argparse

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)   # 启动时健康检查输出实时可见

def run_healthcheck(group="all", exit_on_critical=False):
    """启动前 URL 健康检查。返回 True 表示可以继续启动。"""
    try:
        from clearsky.healthcheck import check_all, format_report
    except ImportError:
        print("[健康检查] 未安装 clearsky 库 (pip install -e .)，跳过")
        return True
    print(f"[健康检查] 检查 {group} 分组端点 ... (默认超时 8s/请求, 并发 12)")
    rep = check_all(group=group)
    s = rep.summary()
    slow = sorted([r for r in rep.results if r.ok], key=lambda r: -r.total_ms)[:5]
    print(f"[健康检查] 结论: {s['ok']}/{s['total']} 可用, 平均延迟 {s['avg_total_ms']}ms")
    for r in slow:
        print(f"   慢端点 TOP: {r.id:28s} {r.total_ms:7.0f}ms  (连接 {r.connect_ms:.0f}ms / TTFB {r.ttfb_ms:.0f}ms)")
    print(format_report(rep))
    if rep.critical_failures and exit_on_critical:
        print(f"[健康检查] {len(rep.critical_failures)} 个关键服务异常，--check-exit 已设置，中止启动")
        return False
    return True

def clearsky_api(path, qs):
    """对接 clearsky 库: /api/info | /api/predict | /api/health。返回 (data, ctype)。"""
    try:
        from clearsky import explain
        from clearsky.healthcheck import check_all
        from clearsky.cli import load_metadata
    except Exception as e:
        return {"error": f"clearsky 库不可用: {e}（请先 pip install -e .）"}, "application/json"

    if path == "/api/info":
        return load_metadata(), "application/json"
    if path == "/api/predict":
        def num(k, default=None):
            v = qs.get(k, [default])[0]
            if v is None:
                return v
            try:
                return float(v)
            except (TypeError, ValueError):
                raise ValueError(f"参数 {k} 不是数字: {v!r}")
        try:
            r = explain(
                model=qs.get("model", ["icon"])[0],
                cloud_index=num("cloud"), transparency=num("trans"),
                seeing=num("seeing"), dew_risk=num("dew", 0.0),
                precipitation=qs.get("precip", ["false"])[0].lower() in ("1", "true", "yes"),
                fog=qs.get("fog", ["false"])[0].lower() in ("1", "true", "yes"),
            )
            return {
                "model": r.model, "score": r.score, "base": r.base,
                "capped": r.capped, "reasons": r.reasons,
                "inputs": r.inputs,
                "formula": "ICON: 89.673-88.057*c+5.290*t+5.111*s-8.905*d | IFS: 90.042-87.849*c+5.126*t+4.666*s-32.640*d",
            }, "application/json"
        except Exception as e:
            return {"error": str(e)}, "application/json"
    if path == "/api/health":
        group = qs.get("group", ["all"])[0]
        timeout = qs.get("timeout", ["8"])[0]
        try:
            timeout = float(timeout)
        except ValueError:
            timeout = 8.0
        rep = check_all(group=group, timeout=min(timeout, 15.0))
        return rep.to_dict(), "application/json"
    return {"error": "unknown api"}, "application/json"


def parse_args():
    ap = argparse.ArgumentParser(description="ClearSky实现版本地服务 + API代理")
    ap.add_argument("port", nargs="?", type=int, default=8890, help="监听端口 (默认 8890)")
    ap.add_argument("--no-check", action="store_true", help="跳过启动前 URL 健康检查")
    ap.add_argument("--check-exit", action="store_true", help="关键服务失败时中止启动")
    ap.add_argument("--check-group", default="all", help="健康检查分组 (默认 all)")
    return ap.parse_args()

ARGS = parse_args()
PORT = ARGS.port

# nodeapi 带 Origin 会被拒, 这里服务端转发(不带Origin)
def proxy(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://www.twtapp.com/",
    })
    with urllib.request.urlopen(req, timeout=25) as r:
        data = r.read()
        ctype = r.headers.get("Content-Type", "application/json")
        return data, ctype

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        pu = urlparse(self.path)
        if pu.path.startswith("/api/"):
            try:
                data, ctype = clearsky_api(pu.path, parse_qs(pu.query))
                body = json.dumps(data, ensure_ascii=False).encode()
                self.send_response(200)
                self.send_header("Content-Type", ctype + "; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                body = json.dumps({"error": str(e)}).encode()
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            return
        if self.path.startswith("/proxy?url="):
            try:
                url = urllib.parse.unquote(self.path[len("/proxy?url="):])
                data, ctype = proxy(url)
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                body = json.dumps({"error": str(e)}).encode()
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            return
        super().do_GET()
    def log_message(self, fmt, *args):
        pass

# 多线程处理: /api/health 全量检查(10-15s) 不能阻塞其他静态/代理请求
class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == "__main__":
    if not ARGS.no_check and not run_healthcheck(ARGS.check_group, ARGS.check_exit):
        sys.exit(1)
    with ThreadingServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"ClearSky实现版已启动: http://localhost:{PORT}  (手机同WiFi用 http://<本机IP>:{PORT})")
        httpd.serve_forever()
