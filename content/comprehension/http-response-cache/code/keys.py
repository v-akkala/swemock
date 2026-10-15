"""Cache keys: what makes two requests 'the same' request."""
from urllib.parse import parse_qsl, urlencode, urlsplit


def normalize_url(url):
    """Lower-case scheme and host, default path '/', and sorted query parameters."""
    parts = urlsplit(url)
    query = urlencode(sorted(parse_qsl(parts.query)))
    base = f"{parts.scheme.lower()}://{parts.netloc.lower()}{parts.path or '/'}"
    return f"{base}?{query}" if query else base


def cache_key(request, vary=()):
    """Method, normalized URL, and the request headers named in Vary."""
    extras = "|".join(f"{name}={request.headers.get(name, '')}" for name in vary)
    return f"{request.method.upper()} {normalize_url(request.url)} [{extras}]"


def url_marker(url):
    """The part of a key that identifies the URL, whatever the method or Vary headers."""
    return f" {normalize_url(url)} ["
