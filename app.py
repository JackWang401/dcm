from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from hashlib import sha256
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from dcm_parser import DcmDocument, ParseError, ValidationError


class AppState:
    def __init__(self, root_dir: Path, static_dir: Path) -> None:
        self.root_dir = root_dir
        self.static_dir = static_dir

    def list_dcm_files(self) -> list[str]:
        results: list[str] = []
        for path in self.root_dir.rglob("*"):
            if path.is_dir():
                continue
            if path.suffix.lower() != ".dcm":
                continue
            results.append(str(path))
            if len(results) >= 200:
                break
        return sorted(results)

    def resolve_path(self, requested_path: str) -> Path:
        candidate = Path(requested_path).expanduser()
        if not candidate.is_absolute():
            candidate = (self.root_dir / candidate).resolve()
        return candidate

    def load_document(self, requested_path: str) -> dict:
        path = self.resolve_path(requested_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        document = DcmDocument.from_file(path)
        return document.to_payload()

    def save_document(
        self,
        requested_path: str,
        source_hash: str,
        parameters: list[dict],
        output_path: str | None = None,
    ) -> dict:
        source_path = self.resolve_path(requested_path)
        if not source_path.exists():
            raise FileNotFoundError(f"File not found: {source_path}")
        current_text = source_path.read_text(encoding="utf-8")
        current_hash = sha256(current_text.encode("utf-8")).hexdigest()
        if current_hash != source_hash:
            raise ValidationError("The file changed on disk after it was loaded. Reload it before saving.")

        document = DcmDocument.from_text(current_text, source_path)
        document.apply_payloads(parameters)
        new_text = document.render_text()

        target_path = self.resolve_path(output_path) if output_path else source_path
        target_path.parent.mkdir(parents=True, exist_ok=True)

        backup_path: Path | None = None
        if target_path.exists():
            backup_path = target_path.with_suffix(target_path.suffix + f".{datetime.now().strftime('%Y%m%d_%H%M%S')}.bak")
            shutil.copy2(target_path, backup_path)
        target_path.write_text(new_text, encoding="utf-8")

        return {
            "path": str(target_path),
            "backup_path": str(backup_path) if backup_path else None,
            "source_hash": sha256(new_text.encode("utf-8")).hexdigest(),
            "validation_issues": document.collect_validation_issues(),
            "source_path": str(source_path),
        }

    def compare_document(self, current_path: str, parameters: list[dict], compare_path: str) -> dict:
        current_document = DcmDocument.from_file(self.resolve_path(current_path))
        current_document.apply_payloads(parameters)
        baseline_document = DcmDocument.from_file(self.resolve_path(compare_path))
        comparison = current_document.compare_to(baseline_document)
        return {
            "compare_path": str(self.resolve_path(compare_path)),
            "parameters": [parameter.to_payload() for parameter in baseline_document.parameters],
            "validation_issues": baseline_document.collect_validation_issues(),
            **comparison,
        }


class DcmRequestHandler(BaseHTTPRequestHandler):
    state: AppState

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/files":
            self._send_json({"files": self.state.list_dcm_files()})
            return
        if parsed.path == "/api/sample":
            sample_path = self.state.root_dir / "examples" / "sample.dcm"
            self._send_json({"path": str(sample_path)})
            return
        if parsed.path == "/" or parsed.path == "/index.html":
            self._serve_static("index.html", "text/html; charset=utf-8")
            return

        static_path = parsed.path.lstrip("/")
        file_path = self.state.static_dir / static_path
        if file_path.exists() and file_path.is_file():
            self._serve_static(static_path, _guess_content_type(file_path.suffix))
            return

        self._send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            payload = self._read_json_body()
            if parsed.path == "/api/load":
                path = payload.get("path", "")
                self._send_json(self.state.load_document(path))
                return
            if parsed.path == "/api/save":
                path = payload.get("path", "")
                source_hash = payload.get("source_hash", "")
                parameters = payload.get("parameters", [])
                output_path = payload.get("output_path")
                result = self.state.save_document(path, source_hash, parameters, output_path=output_path)
                self._send_json(result)
                return
            if parsed.path == "/api/compare":
                current_path = payload.get("current_path", "")
                parameters = payload.get("parameters", [])
                compare_path = payload.get("compare_path", "")
                result = self.state.compare_document(current_path, parameters, compare_path)
                self._send_json(result)
                return
        except FileNotFoundError as error:
            self._send_error(HTTPStatus.NOT_FOUND, str(error))
            return
        except (ParseError, ValidationError, ValueError, json.JSONDecodeError) as error:
            self._send_error(HTTPStatus.BAD_REQUEST, str(error))
            return

        self._send_error(HTTPStatus.NOT_FOUND, "Not found")

    def log_message(self, format: str, *args) -> None:
        return

    def _read_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length).decode("utf-8")
        return json.loads(raw_body or "{}")

    def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _send_error(self, status: HTTPStatus, message: str) -> None:
        self._send_json({"error": message}, status=status)

    def _serve_static(self, relative_path: str, content_type: str) -> None:
        file_path = self.state.static_dir / relative_path
        if relative_path == "index.html":
            file_path = self.state.static_dir / "index.html"
        content = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def _guess_content_type(suffix: str) -> str:
    return {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
    }.get(suffix, "application/octet-stream")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Lightweight DCM editor")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    root_dir = Path(__file__).resolve().parent
    static_dir = root_dir / "static"
    state = AppState(root_dir=root_dir, static_dir=static_dir)
    handler_class = type("BoundDcmRequestHandler", (DcmRequestHandler,), {"state": state})
    server = ThreadingHTTPServer((args.host, args.port), handler_class)
    print(f"Serving DCM editor at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
