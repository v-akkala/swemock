from schema import connect


def test_tables_exist():
    conn = connect()
    assert conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0
