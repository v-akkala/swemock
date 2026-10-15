from cache import Cache
from client import CachingClient
from headers import parse_cache_control
from keys import cache_key, normalize_url
from models import Request, Response


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_normalize_url_sorts_query_and_lowercases_host():
    assert normalize_url("HTTP://Example.com/a?b=2&a=1") == "http://example.com/a?a=1&b=2"
    assert normalize_url("http://example.com") == "http://example.com/"


def test_cache_key_includes_method_and_vary_headers():
    r = Request("http://x/y", headers={"accept": "text/html"})
    assert cache_key(r, ("accept",)) == "GET http://x/y [accept=text/html]"


def test_parse_cache_control_max_age():
    assert parse_cache_control("max-age=60")["max-age"] == "60"


def test_a_cacheable_response_is_served_from_the_cache():
    calls = []

    def fetch(request):
        calls.append(request.url)
        return Response(200, "body", {"Cache-Control": "max-age=60"})

    client = CachingClient(fetch, Cache(now=lambda: 0.0))
    assert client.request(Request("http://x/a")).body == "body"
    assert client.request(Request("http://x/a")).body == "body"
    assert len(calls) == 1


def test_responses_without_max_age_are_not_reused():
    calls = []

    def fetch(request):
        calls.append(1)
        return Response(200, "x", {})

    client = CachingClient(fetch, Cache())
    client.request(Request("http://x/b"))
    client.request(Request("http://x/b"))
    assert len(calls) == 2


def test_etag_revalidation_uses_a_conditional_request():
    seen = []

    def fetch(request):
        seen.append(request.headers.get("if-none-match"))
        if request.headers.get("if-none-match") == '"v1"':
            return Response(304)
        return Response(200, "data", {"cache-control": "max-age=0", "etag": '"v1"'})

    client = CachingClient(fetch, Cache())
    client.request(Request("http://x/c"))
    assert client.request(Request("http://x/c")).body == "data"
    assert seen == [None, '"v1"']
