from schema import connect
from search import count_matches, search_products


def make():
    conn = connect()
    conn.execute("INSERT INTO categories VALUES (1, 'Tools')")
    conn.executemany("INSERT INTO products VALUES (?, ?, 1)", [(1, "Hammer"), (2, "Hand saw"), (3, "Ladder")])
    return conn


def test_injection_payload_matches_nothing():
    assert search_products(make(), "%' OR 1=1 --") == []


def test_count_matches():
    assert count_matches(make(), "Ha") == 2
    assert count_matches(make(), "zzz") == 0
