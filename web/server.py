#!/usr/bin/env python3
# ClearSky实现版 - 本地服务 + API代理
# 用法: python3 server.py [端口]
# 手机同网访问: http://<电脑IP>:8890
import http.server, urllib.request, urllib.parse, socketserver, os, sys, json

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8890
ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"

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
with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"ClearSky实现版已启动: http://localhost:{PORT}  (手机同WiFi用 http://<本机IP>:{PORT})")
    httpd.serve_forever()
