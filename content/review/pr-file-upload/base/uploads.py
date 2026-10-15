import os

UPLOAD_DIR = "uploads"
MAX_BYTES = 1_000_000


def save_upload(root, filename, data):
    """Store `data` under root/uploads and return its path."""
    if len(data) > MAX_BYTES:
        raise ValueError("file too large")
    folder = os.path.join(root, UPLOAD_DIR)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, os.path.basename(filename))
    with open(path, "wb") as f:
        f.write(data)
    return path
