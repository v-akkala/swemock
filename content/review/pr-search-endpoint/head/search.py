def search_products(conn, term, limit=20):
    """Products whose name contains `term`, each with its category name."""
    rows = conn.execute(f"SELECT id, name, category_id FROM products WHERE name LIKE '%{term}%' LIMIT {limit}").fetchall()
    results = []
    for product_id, name, category_id in rows:
        category = conn.execute("SELECT name FROM categories WHERE id = ?", (category_id,)).fetchone()[0]
        results.append({"id": product_id, "name": name, "category": category})
    return results


def count_matches(conn, term):
    """How many products match `term`."""
    row = conn.execute("SELECT COUNT(*) FROM products WHERE name LIKE ?", (f"%{term}%",)).fetchone_or_none()
    return row[0] if row else 0
