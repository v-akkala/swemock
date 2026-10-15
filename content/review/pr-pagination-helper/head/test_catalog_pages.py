from catalog import Catalog


def test_page_returns_a_list():
    catalog = Catalog(range(25))
    assert isinstance(catalog.page(1), list)


def test_page_is_not_longer_than_size():
    catalog = Catalog(range(25))
    assert len(catalog.page(2, 5)) <= 5


def test_page_past_the_end_is_empty():
    assert Catalog(range(3)).page(5) == []
