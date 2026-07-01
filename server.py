import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

port = int(os.getenv("PORT", 8080))

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress access logs

httpd = HTTPServer(("0.0.0.0", port), Handler)
print(f"Serving on port {port}")
httpd.serve_forever()
