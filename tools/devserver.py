"""Server pengembangan lokal untuk folder app/ tanpa cache browser.

Pemakaian: python tools/devserver.py [port]
Hanya untuk pengembangan di PC; aplikasi yang dipakai di HP di-hosting di Cloudflare Pages.
"""
import functools
import http.server
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / 'app'


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.webmanifest': 'application/manifest+json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = functools.partial(NoCacheHandler, directory=str(APP))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as srv:
        print(f'Neraca dev server: http://127.0.0.1:{port}')
        srv.serve_forever()
