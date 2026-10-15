import pytest

from uploads import MAX_BYTES, save_upload


def test_saved_file_can_be_read_back(tmp_path):
    path = save_upload(str(tmp_path), "a.txt", b"hello")
    with open(path, "rb") as f:
        assert f.read() == b"hello"


def test_oversized_files_are_rejected(tmp_path):
    with pytest.raises(ValueError):
        save_upload(str(tmp_path), "big.bin", b"x" * (MAX_BYTES + 1))
