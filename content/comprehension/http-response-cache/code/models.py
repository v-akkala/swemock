"""The request and response shapes the cache works with."""
from headers import lower_keys


class Request:
    def __init__(self, url, method="GET", headers=None):
        self.url = url
        self.method = method
        self.headers = lower_keys(headers or {})


class Response:
    def __init__(self, status, body="", headers={}):
        self.status = status
        self.body = body
        self.headers = lower_keys(headers) if headers else headers

    def copy(self):
        return Response(self.status, self.body, dict(self.headers))
