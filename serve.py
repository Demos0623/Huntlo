#!/usr/bin/env python3
# Valo dev server: static files with caching disabled, so ES module edits are
# always picked up on reload (static `import` specifiers can't be cache-busted
# with a query string). Usage: python3 serve.py [port]
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    # Bind all interfaces (0.0.0.0) so other machines on the LAN can connect for
    # multiplayer. On the host, use http://localhost:<port>; friends use your IP.
    HTTPServer(('0.0.0.0', port), NoCacheHandler).serve_forever()
