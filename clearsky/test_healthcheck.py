# -*- coding: utf-8 -*-
"""healthcheck 模块的离线单元测试（本地 mock HTTP 服务器，不依赖外网）。

运行:
    .venv/bin/python -m pytest clearsky/test_healthcheck.py -v
    .venv/bin/python clearsky/test_healthcheck.py
"""
import time
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from clearsky.healthcheck import check_url, check_all
from clearsky.urls import URLEntry


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/ok":
            body = b"ok"
            self.send_response(200)
        elif self.path == "/slow":
            time.sleep(0.4)
            body = b"slow"
            self.send_response(200)
        elif self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "/ok")
            body = b""
        elif self.path == "/err":
            body = b"boom"
            self.send_response(500)
        elif self.path == "/timeout":
            time.sleep(3)
            body = b"late"
            self.send_response(200)
        else:
            body = b"nope"
            self.send_response(404)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def log_message(self, *a):
        pass


class HealthCheckTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        cls.t = threading.Thread(target=cls.srv.serve_forever, daemon=True)
        cls.t.start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def entry(self, id_, path, **kw):
        return URLEntry(id=id_, name=id_, group="test",
                        url=self.base + path, **kw)

    def test_ok(self):
        r = check_url(self.entry("ok", "/ok"), timeout=2)
        self.assertTrue(r.ok)
        self.assertEqual(r.status, 200)
        self.assertGreaterEqual(r.connect_ms, 0)
        self.assertGreaterEqual(r.ttfb_ms, 0)
        self.assertGreater(r.total_ms, 0)
        self.assertIsNone(r.error)

    def test_redirect_followed(self):
        r = check_url(self.entry("redir", "/redirect"), timeout=2)
        self.assertTrue(r.ok)
        self.assertEqual(r.status, 200)
        self.assertTrue(r.final_url.endswith("/ok"))
        self.assertGreaterEqual(r.connect_ms, 0)  # 两次连接的累加

    def test_http_error_reported(self):
        r = check_url(self.entry("err", "/err"), timeout=2)
        self.assertFalse(r.ok)
        self.assertEqual(r.status, 500)
        self.assertIn("HTTP 500", r.error)

    def test_not_found(self):
        r = check_url(self.entry("nf", "/nope"), timeout=2)
        self.assertFalse(r.ok)
        self.assertEqual(r.status, 404)
        self.assertIn("HTTP 404", r.error)

    def test_timeout(self):
        r = check_url(self.entry("to", "/timeout"), timeout=0.5)
        self.assertFalse(r.ok)
        self.assertIsNone(r.status)
        self.assertIsNotNone(r.error)
        self.assertLess(r.total_ms, 2500)  # 没有等到 3s 才返回

    def test_check_all_parallel(self):
        entries = [
            self.entry("a_ok", "/ok"),
            self.entry("b_slow", "/slow", timeout=2),
            self.entry("c_err", "/err"),
        ]
        rep = check_all(entries=entries, workers=4, timeout=2)
        self.assertEqual(rep.ok_count, 2)
        self.assertEqual(rep.fail_count, 1)
        self.assertEqual(len(rep.results), 3)
        self.assertGreater(rep.finished, rep.started)
        # 并发验证: 总耗时 < 串行 (0.4s slow + 快速两端点)
        self.assertLess(rep.summary()["elapsed_s"], 0.8)


if __name__ == "__main__":
    unittest.main(verbosity=2)
