import os

from uploads import save_upload


def test_cannot_escape_the_upload_folder(tmp_path):
    folder = os.path.realpath(str(tmp_path / "uploads"))
    try:
        path = save_upload(str(tmp_path), "../escape.txt", b"x")
    except ValueError:
        return
    assert os.path.realpath(path).startswith(folder + os.sep)


def test_nested_names_still_work(tmp_path):
    path = save_upload(str(tmp_path), "a/b/c.txt", b"x")
    assert os.path.exists(path)
