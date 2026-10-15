import sqlite3


def connect(path=":memory:"):
    """Open a database with the catalog tables."""
    conn = sqlite3.connect(path)
    conn.executescript(
        "CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT);"
        "CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT, category_id INTEGER);"
    )
    return conn
