import json
import os
import re
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

port = int(os.getenv("PORT", 8080))

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
CONTACT_FROM = os.getenv("CONTACT_FROM", "Nomous Contact Form <hello@nomous.tech>")
CONTACT_TO = [addr.strip() for addr in os.getenv("CONTACT_TO", "").split(",") if addr.strip()]

SUBJECT_LABELS = {
    "demo": "Request a demo",
    "pricing": "Pricing question",
    "technical": "Technical question",
    "account": "Account support",
    "other": "Other",
}


def clean(value, max_len=2000):
    # strip header-injection characters and cap length; form fields are
    # plain text only, never used as raw email headers
    return str(value or "").replace("\r", " ").replace("\n", " ").strip()[:max_len]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress access logs

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/contact":
            self._send_json(404, {"error": "Not found"})
            return

        if not RESEND_API_KEY or not CONTACT_TO:
            self._send_json(500, {"error": "Contact form is not configured yet."})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send_json(400, {"error": "Invalid request."})
            return

        name = clean(data.get("name"), 200)
        email = clean(data.get("email"), 200)
        subject_key = clean(data.get("subject"), 50)
        message = clean(data.get("message"), 5000)

        if not name or not email or not message:
            self._send_json(400, {"error": "Name, email, and message are required."})
            return
        if not EMAIL_RE.match(email):
            self._send_json(400, {"error": "Please enter a valid email address."})
            return

        subject_label = SUBJECT_LABELS.get(subject_key, "General enquiry")

        text_body = (
            f"New contact form submission from nomous.tech\n\n"
            f"Name: {name}\n"
            f"Email: {email}\n"
            f"Topic: {subject_label}\n\n"
            f"Message:\n{message}\n"
        )

        payload = json.dumps({
            "from": CONTACT_FROM,
            "to": CONTACT_TO,
            "subject": f"Nomous Contact: {subject_label} - {name}",
            "text": text_body,
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            print("Resend API error:", e.code, e.read())
            self._send_json(502, {"error": "Could not send message right now. Please email us directly."})
            return
        except Exception as e:
            print("Contact form send failed:", e)
            self._send_json(502, {"error": "Could not send message right now. Please email us directly."})
            return

        self._send_json(200, {"ok": True})


httpd = HTTPServer(("0.0.0.0", port), Handler)
print(f"Serving on port {port}")
httpd.serve_forever()
