from __future__ import annotations

from excel_metadata_extractor.downloader import (
    _filename_from_response,
    is_url,
)


def test_is_url_only_accepts_http_urls() -> None:
    assert is_url("https://www.e-stat.go.jp/file-download")
    assert is_url("http://example.test/book.xlsx")
    assert not is_url("/work/book.xlsx")
    assert not is_url("ftp://example.test/book.xlsx")


def test_filename_from_content_disposition_utf8() -> None:
    filename = _filename_from_response(
        "https://example.test/download",
        "attachment; filename*=UTF-8''%E7%B5%B1%E8%A8%88.xls",
    )

    assert filename == "統計.xls"


def test_filename_from_url_path() -> None:
    filename = _filename_from_response(
        "https://example.test/files/sample.xlsx?download=1",
        None,
    )

    assert filename == "sample.xlsx"

