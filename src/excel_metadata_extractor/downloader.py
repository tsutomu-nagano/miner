from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen


DOWNLOAD_SUFFIXES = {".xlsx", ".xlsm", ".xltx", ".xltm", ".xls"}


class DownloadError(ValueError):
    """Raised when a workbook cannot be downloaded."""


def is_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def download_workbook(url: str, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": "miner-excel-metadata/0.1"})

    try:
        with urlopen(request, timeout=60) as response:
            filename = _filename_from_response(url, response.headers.get("Content-Disposition"))
            output_path = _unique_path(output_dir / filename)
            with output_path.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
    except OSError as exc:
        raise DownloadError(f"failed to download workbook: {exc}") from exc

    if output_path.suffix.lower() not in DOWNLOAD_SUFFIXES:
        raise DownloadError(
            f"downloaded file has unsupported extension '{output_path.suffix}'"
        )
    if output_path.stat().st_size == 0:
        raise DownloadError("downloaded file is empty")

    return output_path


def _filename_from_response(url: str, content_disposition: str | None) -> str:
    if content_disposition:
        filename = _filename_from_content_disposition(content_disposition)
        if filename:
            return filename

    path_name = Path(unquote(urlparse(url).path)).name
    if path_name:
        return path_name

    return "downloaded-workbook.xlsx"


def _filename_from_content_disposition(value: str) -> str | None:
    encoded = re.search(r"filename\*=UTF-8''([^;]+)", value, flags=re.IGNORECASE)
    if encoded:
        return Path(unquote(encoded.group(1).strip().strip('"'))).name

    plain = re.search(r'filename="?([^";]+)"?', value, flags=re.IGNORECASE)
    if plain:
        return Path(plain.group(1).strip()).name

    return None


def _unique_path(path: Path) -> Path:
    if not path.exists():
        return path

    stem = path.stem
    suffix = path.suffix
    for index in range(1, 1000):
        candidate = path.with_name(f"{stem}-{index}{suffix}")
        if not candidate.exists():
            return candidate

    raise DownloadError(f"could not create unique download path for {path}")

