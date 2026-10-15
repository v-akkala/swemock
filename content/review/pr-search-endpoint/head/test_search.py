from schema import connect
from search import search_products


def make():
    conn = connect()
    conn.execute("INSERT INTO categories VALUES (1, 'Tools')")
    conn.executemany("INSERT INTO products VALUES (?, ?, 1)", [(1, "Hammer"), (2, "Hand saw"), (3, "Ladder")])
    return conn


def test_search_finds_matching_products():
    results = search_products(make(), "Ha")
    assert [r["name"] for r in results] == ["Hammer", "Hand saw"]
    assert results[0]["category"] == "Tools"
