"""
image_utils.py

Resizing, base64 encoding, and file-type checks for images going into the
Gemini API. Kept deliberately provider-agnostic in shape (returns raw bytes +
mime type + a base64 string) so gemini_client.py doesn't have to know
anything about Flask's FileStorage vs. a plain filesystem path.
"""

import base64
import io
import os
import time

from PIL import Image, UnidentifiedImageError

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "bmp", "gif"}

# Gemini has no hard requirement here, but large uploads slow down the
# request and burn tokens/quota for no accuracy benefit. Resize the long
# edge down to this before encoding.
MAX_LONG_EDGE = 1536

MIME_BY_FORMAT = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "BMP": "image/bmp",
    "GIF": "image/gif",
}


class ImageLoadError(Exception):
    """Raised when an uploaded file can't be read/decoded as an image."""


def allowed_file(filename: str) -> bool:
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def _read_source_bytes(source) -> bytes:
    """
    Accepts either:
      - a Flask FileStorage-like object (has .read())
      - a filesystem path (str)
      - raw bytes
    and returns raw bytes.
    """
    if isinstance(source, (bytes, bytearray)):
        return bytes(source)

    if isinstance(source, str):
        if not os.path.isfile(source):
            raise ImageLoadError(f"File not found: {source}")
        with open(source, "rb") as f:
            return f.read()

    if hasattr(source, "read"):
        source.seek(0)
        data = source.read()
        source.seek(0)
        return data

    raise ImageLoadError(f"Unsupported image source type: {type(source)!r}")


def load_and_encode_image(source, max_long_edge: int = MAX_LONG_EDGE):
    """
    Loads an image from `source` (FileStorage, path, or bytes), resizes it
    so its longest edge is at most `max_long_edge` (upscaling never
    happens), and returns a tuple:

        (base64_str, mime_type, load_seconds)

    Raises ImageLoadError on anything unreadable/corrupt/truncated so the
    caller can surface a clean per-image error instead of a stack trace.
    """
    start = time.perf_counter()

    try:
        raw = _read_source_bytes(source)
        img = Image.open(io.BytesIO(raw))
        img.load()  # force full decode now, not lazily later
    except UnidentifiedImageError as e:
        raise ImageLoadError(f"Unrecognized or corrupt image format: {e}") from e
    except OSError as e:
        raise ImageLoadError(f"Truncated or unreadable image file: {e}") from e

    # Normalize mode: Gemini/JPEG doesn't like palette/alpha modes.
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    fmt = img.format if img.format in MIME_BY_FORMAT else "JPEG"

    width, height = img.size
    long_edge = max(width, height)
    if long_edge > max_long_edge:
        scale = max_long_edge / float(long_edge)
        new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
        img = img.resize(new_size, Image.LANCZOS)

    buf = io.BytesIO()
    save_kwargs = {"quality": 90} if fmt == "JPEG" else {}
    try:
        img.save(buf, format=fmt, **save_kwargs)
    except (OSError, ValueError):
        # Some odd source formats (e.g. GIF frames) can fail to re-encode
        # in their original format — fall back to JPEG, which always works.
        buf = io.BytesIO()
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        fmt = "JPEG"
        img.save(buf, format=fmt, quality=90)

    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    mime_type = MIME_BY_FORMAT[fmt]

    load_seconds = round(time.perf_counter() - start, 4)
    return encoded, mime_type, load_seconds
