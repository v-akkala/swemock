from cache import Cache
from client import CachingClient
from headers import parse_cache_control
from models import Request, Response


class Clock:
    def __init__(self):
        self.now = 5000.0

    def __call__(self):
        return self.now


def test_bug_no_store_ignored():
    assert parse_cache_control("max-age=60, no-store").get("no-store") is True
    cache = Cache()
    assert cache.put(Request("http://x/s"), Response(200, "secret", {"cache-control": "max-age=60, no-store"})) is False


def test_bug_capacity_plus_one():
    cache = Cache(max_entries=2)
    for i in range(5):
        cache.put(Request(f"http://x/{i}"), Response(200, "b", {"cache-control": "max-age=60"}))
    assert len(cache) == 2


def test_bug_shared_headers():
    a, b = Response(200, "a"), Response(200, "b")
    a.headers["x-test"] = "1"
    assert b.headers == {}
    assert Response(200).headers == {}


def test_bug_write_keeps_cache():
    origin = {"body": "v1"}

    def fetch(request):
        if request.method == "POST":
            origin["body"] = "v2"
            return Response(200, "ok")
        return Response(200, origin["body"], {"cache-control": "max-age=600"})

    client = CachingClient(fetch, Cache())
    assert client.request(Request("http://x/doc")).body == "v1"
    client.request(Request("http://x/doc", "POST"))
    assert client.request(Request("http://x/doc")).body == "v2"


def test_bug_error_hides_staleness():
    state = {"down": False}

    def fetch(request):
        if state["down"]:
            raise ConnectionError("origin is down")
        return Response(200, "data", {"cache-control": "max-age=0"})

    client = CachingClient(fetch, Cache())
    client.request(Request("http://x/e"))
    state["down"] = True
    response = client.request(Request("http://x/e"))
    assert response.body == "data"
    assert "110" in response.headers.get("warning", "")


def test_bug_wall_clock():
    clock = Clock()
    cache = Cache(now=clock)
    cache.put(Request("http://x/t"), Response(200, "t", {"cache-control": "max-age=60"}))
    found = cache.lookup(Request("http://x/t"))
    assert found is not None and found.fresh
    clock.now += 61
    assert not cache.lookup(Request("http://x/t")).fresh
