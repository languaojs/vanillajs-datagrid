#!/usr/bin/env python3
"""Zero-dependency API server for the VanillaDataGrid server-side demo.

    python server_side.py
    open http://localhost:8001/server_side.html

The endpoint speaks the grid's remote contract:

    GET /api/users?page=1&limit=10&search=ada&sort=score&order=desc
    -> { "page": 1, "total": 57, "rows": [[cell, ...], ...] }

Each cell is either an HTML string or { html, text, className }. CORS is open
so the page can also be served by another static server, for example:

    python -m http.server 8000
    open http://localhost:8000/server_side.html?api=http://localhost:8001/api/users
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import date, timedelta
from html import escape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent

FIRST_NAMES = [
    "Ada", "Grace", "Alan", "Katherine", "Linus", "Margaret",
    "Donald", "Barbara", "Edsger", "Radia", "Tim", "Anita",
]
LAST_NAMES = ["Lovelace", "Hopper", "Turing", "Johnson", "Torvalds"]
ROLES = ["Engineer", "Researcher", "Analyst", "Maintainer", "Mathematician"]
STATUSES = ["Active", "Away"]
TOTAL_ROWS = 57


def build_dataset() -> list[dict]:
    rows = []
    start = date(2016, 1, 4)
    for index in range(TOTAL_ROWS):
        first = FIRST_NAMES[index % len(FIRST_NAMES)]
        last = LAST_NAMES[(index // len(FIRST_NAMES)) % len(LAST_NAMES)]
        name = f"{first} {last}"
        row = {
            "first": first,
            "last": last,
            "name": name,
            # Every 11th row is blank to demonstrate blanks-last sorting.
            "score": "" if index % 11 == 0 else str(45 + (index * 17) % 56),
            "role": ROLES[index % len(ROLES)],
            "joined": (start + timedelta(days=(index * 53) % 3200)).isoformat(),
            "status": STATUSES[index % len(STATUSES)],
        }
        row["_search"] = " ".join(
            [row["name"], row["role"], row["joined"], row["status"], row["score"]]
        ).lower()
        rows.append(row)
    return rows


ROWS = build_dataset()

SORTERS = {
    "name": lambda row: row["name"].casefold(),
    "role": lambda row: row["role"].casefold(),
    "score": lambda row: float(row["score"]) if row["score"] else None,
    "joined": lambda row: row["joined"],
    "status": lambda row: row["status"].casefold(),
}


def sort_rows(rows: list[dict], field: str, order: str) -> list[dict]:
    key = SORTERS.get(field)
    if key is None:
        return rows
    present = [row for row in rows if key(row) not in (None, "")]
    missing = [row for row in rows if key(row) in (None, "")]
    present.sort(key=key, reverse=order == "desc")
    return present + missing


def to_cells(row: dict) -> list:
    name_html = f"<strong>{escape(row['first'])}</strong> {escape(row['last'])}"
    status = row["status"]
    return [
        {"html": name_html, "text": row["name"]},
        row["role"],
        row["score"],
        row["joined"],
        {
            "html": f'<span class="status {status.lower()}">{status}</span>',
            "text": status,
        },
    ]


def int_param(params: dict, name: str, default: int) -> int:
    try:
        return int(params.get(name, [default])[0])
    except (TypeError, ValueError):
        return default


def build_payload(params: dict) -> dict:
    rows = ROWS

    search = (params.get("search", [""])[0] or "").strip().lower()
    if search:
        rows = [row for row in rows if search in row["_search"]]

    field = (params.get("sort", [""])[0] or "").strip()
    order = (params.get("order", ["asc"])[0] or "asc").strip().lower()
    rows = sort_rows(rows, field, "desc" if order == "desc" else "asc")

    total = len(rows)
    limit = max(1, min(100, int_param(params, "limit", 10)))
    total_pages = max(1, math.ceil(total / limit))
    page = max(1, min(total_pages, int_param(params, "page", 1)))
    start = (page - 1) * limit

    return {
        "page": page,
        "total": total,
        "rows": [to_cells(row) for row in rows[start:start + limit]],
    }


class DemoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        super().end_headers()

    def send_json(self, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802 (stdlib naming)
        self.send_response(204)
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") == "/api/users":
            self.send_json(build_payload(parse_qs(parsed.query)))
            return
        super().do_GET()


def main() -> None:
    parser = argparse.ArgumentParser(description="VanillaDataGrid server-side demo")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.bind, args.port), DemoHandler)
    print(f"Page: http://localhost:{args.port}/server_side.html")
    print(f"API:  http://localhost:{args.port}/api/users?page=1&limit=5&sort=score&order=desc")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
