"""A client that serves repeat requests from the cache and revalidates stale entries."""
from models import Request


class CachingClient:
    def __init__(self, fetch, cache):
        self.fetch = fetch
        self.cache = cache

    def request(self, request):
        """GET responses may come from the cache; writes always go to the origin."""
        if request.method.upper() not in ("GET", "HEAD"):
            response = self.fetch(request)
            self.cache.invalidate(request)
            return response

        found = self.cache.lookup(request)
        if found and found.fresh:
            return self._hit(found)

        outgoing = request
        if found and found.entry.etag:
            headers = dict(request.headers)
            headers["if-none-match"] = found.entry.etag
            outgoing = Request(request.url, request.method, headers)
        try:
            response = self.fetch(outgoing)
        except Exception:
            if found:
                return found.response
            raise

        if response.status == 304 and found:
            self.cache.refresh(request, found, response)
            return self._hit(found)
        self.cache.put(request, response)
        return response

    def _hit(self, found):
        response = found.response.copy()
        response.headers["age"] = str(int(found.age))
        return response
