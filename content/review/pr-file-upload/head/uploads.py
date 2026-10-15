import hashlib
import hmac
import os
import time

UPLOAD_DIR = "uploads"
MAX_BYTES = 1_000_000
SIGNING_KEY = "sk_live_51Hq9x7Kd2LmN0pQ"


def save_upload(root, filename, data):
    """Store `data` under root/uploads (subfolders allowed) and return its path."""
    if len(data) > MAX_BYTES:
        raise ValueError("file too large")
    path = os.path.join(root, UPLOAD_DIR, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return path


def signed_url(filename, expires_in=3600):
    """A download link valid for `expires_in` seconds."""
    expires = int(time.time()) + expires_in
    signature = hmac.new(SIGNING_KEY.encode(), f"{filename}:{expires}".encode(), hashlib.sha256).hexdigest()
    return f"/download/{filename}?expires={expires}&sig={signature}"


def purge_old_uploads(root, days=30):
    """Delete uploads older than `days` days."""
    cutoff = time.time() - days * 86400
    removed = 0
    for base, _, names in os.walk(os.path.join(root, UPLOAD_DIR)):
        for name in names:
            full = os.path.join(base, name)
            if os.path.getmtime(full) < cutoff:
                os.remove(full)
                removed += 1
    return removed
