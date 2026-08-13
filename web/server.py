#!/usr/bin/env python3
# ClearSky实现版 - 本地服务 + API代理
# 用法: python3 server.py [端口] [--check] [--check-exit]
#   端口默认 8890; --check 启动前先做 URL 健康检查; --check-exit 关键服务失败则中止启动
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
    print(f"[健康检查] 检查 {group} 分组端点 ...")
    rep = check_all(group=group)
    print(format_report(rep))
    if rep.critical_failures and exit_on_critical:
        print(f"[健康检查] {len(rep.critical_failures)} 个关键服务异常，--check-exit 已设置，中止启动")
        return False
    return True

def parse_args():
    ap = argparse.ArgumentParser(description="ClearSky实现版本地服务 + API代理")
    ap.add_argument("port", nargs="?", type=int, default=8890, help="监听端口 (默认 8890)")
    ap.add_argument("--check", action="store_true", help="启动前先做 URL 健康检查")
    ap.add_argument("--check-exit", action="store_true", help="关键服务失败时中止启动 (需配合 --check)")
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

socketserver.TCPServer.allow_reuse_address = True

if __name__ == "__main__":
    if ARGS.check and not run_healthcheck(ARGS.check_group, ARGS.check_exit):
        sys.exit(1)
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"ClearSky实现版已启动: http://localhost:{PORT}  (手机同WiFi用 http://<本机IP>:{PORT})")
        httpd.serve_forever()
