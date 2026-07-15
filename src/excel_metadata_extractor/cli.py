from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

from .downloader import DownloadError, download_workbook, is_url
from .extractor import ExcelMetadataError, extract_metadata


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extract metadata from an Excel workbook and emit JSON."
    )
    parser.add_argument(
        "source",
        help="Path or e-Stat download URL for .xlsx/.xlsm/.xltx/.xltm workbook",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Write JSON to this path instead of stdout",
    )
    parser.add_argument(
        "--include-empty-cells",
        action="store_true",
        help="Include empty cells in sheet used ranges when counting cell types",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output",
    )
    parser.add_argument(
        "--download-only",
        type=Path,
        metavar="OUTPUT_DIR",
        help="Download URL to OUTPUT_DIR and print the downloaded path without extraction",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        source = _resolve_source(args.source, args.download_only)
        if args.download_only:
            sys.stdout.write(str(source) + "\n")
            return 0

        metadata = extract_metadata(
            source,
            include_empty_cells=args.include_empty_cells,
        )
        if is_url(args.source):
            metadata["source"] = {"url": args.source}
    except ExcelMetadataError as exc:
        parser.error(str(exc))
    except DownloadError as exc:
        parser.error(str(exc))
    except OSError as exc:
        parser.error(f"failed to read workbook: {exc}")

    indent = 2 if args.pretty else None
    payload = json.dumps(metadata, ensure_ascii=False, indent=indent)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        sys.stdout.write(payload + "\n")

    return 0


def _resolve_source(source: str, download_only: Path | None) -> Path:
    if is_url(source):
        if download_only:
            return download_workbook(source, download_only)

        temp_dir = tempfile.TemporaryDirectory(prefix="excel-metadata-download-")
        # Keep the directory alive until process exit; extraction happens immediately.
        _TEMP_DIRS.append(temp_dir)
        return download_workbook(source, Path(temp_dir.name))

    if download_only:
        raise DownloadError("--download-only requires an http(s) URL")

    return Path(source)


_TEMP_DIRS: list[tempfile.TemporaryDirectory[str]] = []


if __name__ == "__main__":
    raise SystemExit(main())
