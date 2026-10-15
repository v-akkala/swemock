import os

from uploads import save_upload, signed_url


def test_nested_folders_are_created(tmp_path):
    path = save_upload(str(tmp_path), "reports/2024/q1.csv", b"a,b")
    assert os.path.exists(path)
    assert path.endswith(os.path.join("reports", "2024", "q1.csv"))


def test_signed_url_mentions_the_file():
    assert "q1.csv" in signed_url("q1.csv")
