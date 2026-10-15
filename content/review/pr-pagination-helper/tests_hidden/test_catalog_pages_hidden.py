import pytest

from catalog import Catalog


def test_first_page_has_a_full_page_of_items():
    assert Catalog(range(1, 6)).page(1, 2) == [1, 2]


def test_last_page_may_be_short():
    assert Catalog(range(1, 6)).page(3, 2) == [5]


def test_sizes_are_validated():
    catalog = Catalog(range(10))
    with pytest.raises(ValueError):
        catalog.page(1, 0)
    with pytest.raises(ValueError):
        catalog.page(1, 101)
