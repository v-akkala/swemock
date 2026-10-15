from catalog import Catalog


def test_all_returns_a_copy():
    catalog = Catalog([1, 2, 3])
    items = catalog.all()
    items.append(4)
    assert catalog.all() == [1, 2, 3]
