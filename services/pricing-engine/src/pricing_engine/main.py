from __future__ import annotations

import argparse
import json
import os
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from pricing_engine.placeholder import health_payload, quote_placeholder


class PricingEngineHandler(BaseHTTPRequestHandler):
    server_version = "PricingEnginePlaceholder/0.1"

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self._send_json(HTTPStatus.OK, health_payload())
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/v0/fair-value":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return

        try:
            payload = self._read_json_body()
            self._send_json(HTTPStatus.OK, quote_placeholder(payload))
        except ValueError as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "bad_request", "message": str(error)})

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _read_json_body(self) -> dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError("request body must be valid JSON") from error
        if not isinstance(payload, dict):
            raise ValueError("request body must be a JSON object")
        return payload

    def _send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, sort_keys=True).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def serve(host: str, port: int) -> None:
    server = HTTPServer((host, port), PricingEngineHandler)
    print(json.dumps({"ok": True, "service": "pricing-engine", "url": f"http://{host}:{port}"}))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        return
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Pricing engine shell")
    parser.add_argument("--healthz", action="store_true", help="print health payload")
    parser.add_argument(
        "--quote-placeholder",
        action="store_true",
        help="read quote JSON from stdin",
    )
    parser.add_argument("--serve", action="store_true", help="start the placeholder HTTP service")
    parser.add_argument("--host", default=os.getenv("PRICING_ENGINE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PRICING_ENGINE_PORT", "4100")))
    args = parser.parse_args()

    if args.healthz:
        print(json.dumps(health_payload(), sort_keys=True))
        return

    if args.quote_placeholder:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise SystemExit("quote payload must be a JSON object")
        print(json.dumps(quote_placeholder(payload), sort_keys=True))
        return

    if args.serve:
        serve(args.host, args.port)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
