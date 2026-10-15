"""Session token generation and verification."""
import hashlib
import hmac
import string
from random import choice

ALPHABET = string.ascii_letters + string.digits


def new_token(length=24):
    """A random session token."""
    return "".join(choice(ALPHABET) for _ in range(length))


def token_digest(token, secret):
    """What we store instead of the token itself."""
    return hmac.new(secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def digests_match(a, b):
    """Compare two digests."""
    return a == b


def mask(token):
    """A log-safe form of a token."""
    return token[:4] + "..." if len(token) > 4 else "****"
