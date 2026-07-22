import json
import os
import re
import smtplib
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid
from http.server import HTTPServer, SimpleHTTPRequestHandler

port = int(os.getenv("PORT", 8080))

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SMTP_HOST = os.getenv("SMTP_HOST", "mail.privateemail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
CONTACT_TO = [addr.strip() for addr in os.getenv("CONTACT_TO", SMTP_USER or "").split(",") if addr.strip()]

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

        if not SMTP_USER or not SMTP_PASS:
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

        body = (
            f"New contact form submission from nomous.tech\n\n"
            f"Name: {name}\n"
            f"Email: {email}\n"
            f"Topic: {subject_label}\n\n"
            f"Message:\n{message}\n"
        )
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = f"Nomous Contact: {subject_label} - {name}"
        msg["From"] = SMTP_USER
        msg["To"] = ", ".join(CONTACT_TO)
        # No Reply-To here on purpose: setting it to the visitor's address
        # (a different domain than From) is exactly the pattern Namecheap's
        # spam filter flags as likely reply-spoofing (their error JFE040032).
        # The visitor's email is in the body above; reply from there instead.
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain=SMTP_USER.split("@")[-1])

        try:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_USER, CONTACT_TO, msg.as_string())
        except Exception:
            self._send_json(502, {"error": "Could not send message right now. Please email us directly."})
            return

        self._send_json(200, {"ok": True})


httpd = HTTPServer(("0.0.0.0", port), Handler)
print(f"Serving on port {port}")
httpd.serve_forever()
