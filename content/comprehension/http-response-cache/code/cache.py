"""An in-memory HTTP response cache (private cache semantics)."""
import time

from headers import parse_cache_control, parse_int, vary_names
from keys import cache_key, normalize_url, url_marker


class Entry:
    def __init__(self, response, stored_at, max_age, etag):
        self.response = response
        self.stored_at = stored_at
        self.max_age = max_age
        self.etag = etag


class Found:
    """What a lookup returns: the entry and whether it may be served without asking the origin."""

    def __init__(self, entry, age, fresh):
        self.entry = entry
        self.age = age
        self.fresh = fresh

    @property
    def response(self):
        return self.entry.response


class Cache:
    def __init__(self, now=time.time, max_entries=100):
        self._now = now
        self.max_entries = max_entries
        self._store = {}  # key -> Entry, oldest first
        self._vary = {}  # normalized URL -> tuple of Vary header names

    def put(self, request, response):
        """Store a response if its headers allow it. Returns True if it was stored."""
        directives = parse_cache_control(response.headers.get("cache-control"))
        if "no-store" in directives or request.method.upper() != "GET" or response.status != 200:
            return False
        vary = vary_names(response.headers)
        if "*" in vary:
            return False
        entry = Entry(
            response.copy(),
            time.time(),
            parse_int(directives.get("max-age"), 0),
            response.headers.get("etag"),
        )
        key = cache_key(request, vary)
        self._vary[normalize_url(request.url)] = vary
        self._store.pop(key, None)
        if len(self._store) > self.max_entries:
            oldest = next(iter(self._store))
            del self._store[oldest]
        self._store[key] = entry
        return True

    def lookup(self, request):
        """The cached entry for this request, with its age and freshness, or None."""
        vary = self._vary.get(normalize_url(request.url))
        if vary is None:
            return None
        entry = self._store.get(cache_key(request, vary))
        if entry is None:
            return None
        age = self._now() - entry.stored_at
        return Found(entry, age, fresh=age < entry.max_age)

    def refresh(self, request, found, response):
        """The origin said 'not modified': keep the body, restart the clock, adopt new headers."""
        directives = parse_cache_control(response.headers.get("cache-control"))
        found.entry.stored_at = self._now()
        if "max-age" in directives:
            found.entry.max_age = parse_int(directives["max-age"], found.entry.max_age)
        return found.entry.response

    def invalidate(self, request):
        """A write to a URL makes what we know about it obsolete."""
        self._store.pop(cache_key(request), None)

    def __len__(self):
        return len(self._store)
