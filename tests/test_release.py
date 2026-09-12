from __future__ import annotations

import tempfile
import threading
import unittest
import urllib.error
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

from scripts import download_models
from studio import server


class LocalRequestValidationTests(unittest.TestCase):
    def test_accepts_loopback_hostnames_on_the_studio_port(self) -> None:
        for value in ("127.0.0.1:7865", "localhost:7865", "LOCALHOST.:7865"):
            with self.subTest(value=value):
                self.assertTrue(server.local_request_target(value, 7865))

    def test_rejects_nonlocal_or_wrong_port_hosts(self) -> None:
        for value in ("", "evil.example:7865", "127.0.0.1:8091", "localhost:not-a-port"):
            with self.subTest(value=value):
                self.assertFalse(server.local_request_target(value, 7865))

    def test_accepts_only_same_origin_http_mutations(self) -> None:
        self.assertTrue(server.local_request_target("http://127.0.0.1:7865", 7865, origin=True))
        self.assertTrue(server.local_request_target("http://localhost:7865", 7865, origin=True))
        self.assertFalse(server.local_request_target("https://127.0.0.1:7865", 7865, origin=True))
        self.assertFalse(server.local_request_target("https://evil.example", 7865, origin=True))
        self.assertFalse(server.local_request_target("null", 7865, origin=True))


class LocalHttpBoundaryTests(unittest.TestCase):
    class QuietHandler(server.StudioHandler):
        def log_message(self, fmt: str, *args: object) -> None:
            pass

    def setUp(self) -> None:
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), self.QuietHandler)
        self.port = int(self.httpd.server_address[1])
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)

    def request(self, method: str, path: str, host: str, origin: str | None = None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=2)
        connection.putrequest(method, path, skip_host=True)
        connection.putheader("Host", host)
        if origin is not None:
            connection.putheader("Origin", origin)
        connection.putheader("Content-Length", "0")
        connection.endheaders()
        response = connection.getresponse()
        payload = response.read()
        headers = dict(response.getheaders())
        connection.close()
        return response.status, headers, payload

    def test_valid_local_get_is_not_cached(self) -> None:
        status, headers, _ = self.request("GET", "/", f"127.0.0.1:{self.port}")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Cache-Control"), "no-store")

    def test_rejects_dns_rebinding_host(self) -> None:
        status, _, _ = self.request("GET", "/", f"evil.example:{self.port}")
        self.assertEqual(status, 403)

    def test_rejects_cross_origin_mutation(self) -> None:
        status, _, _ = self.request(
            "POST", "/api/queue/clear", f"127.0.0.1:{self.port}", "https://evil.example"
        )
        self.assertEqual(status, 403)


class ModelDownloadResumeTests(unittest.TestCase):
    @staticmethod
    def range_error(url: str) -> urllib.error.HTTPError:
        return urllib.error.HTTPError(url, 416, "Range Not Satisfiable", {}, None)

    def test_416_accepts_only_an_expected_size_partial(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "model.gguf"
            partial = destination.with_name(destination.name + ".part")
            partial.write_bytes(b"complete")
            with mock.patch.object(
                download_models.urllib.request,
                "urlopen",
                side_effect=self.range_error("https://example.invalid/model"),
            ):
                download_models.download("https://example.invalid/model", destination, len(b"complete"))
            self.assertEqual(destination.read_bytes(), b"complete")
            self.assertFalse(partial.exists())

    def test_416_discards_a_truncated_partial(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "model.gguf"
            partial = destination.with_name(destination.name + ".part")
            partial.write_bytes(b"short")
            with mock.patch.object(
                download_models.urllib.request,
                "urlopen",
                side_effect=self.range_error("https://example.invalid/model"),
            ):
                with self.assertRaisesRegex(RuntimeError, "rejected resume"):
                    download_models.download("https://example.invalid/model", destination, 100)
            self.assertFalse(destination.exists())
            self.assertFalse(partial.exists())


if __name__ == "__main__":
    unittest.main()
