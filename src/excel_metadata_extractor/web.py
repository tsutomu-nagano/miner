from __future__ import annotations

import tempfile
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .downloader import DownloadError, download_workbook, is_url
from .extractor import ExcelMetadataError, extract_metadata
from .preview import extract_sheet_previews


STATIC_DIR = Path(__file__).resolve().parent / "web_static"

app = FastAPI(title="Excel Metadata Visualizer")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class ExtractRequest(BaseModel):
    source: str
    include_empty_cells: bool = False


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/extract")
def extract_from_url(request: ExtractRequest) -> dict[str, object]:
    source = request.source.strip()
    if not is_url(source):
        raise HTTPException(status_code=400, detail="http(s) URLを指定してください。")

    with tempfile.TemporaryDirectory(prefix="excel-metadata-web-") as temp_dir:
        try:
            workbook_path = download_workbook(source, Path(temp_dir))
            if workbook_path.suffix.lower() == ".xls":
                workbook_path = convert_xls_with_service(workbook_path, Path(temp_dir))
            metadata = extract_metadata(
                workbook_path,
                include_empty_cells=request.include_empty_cells,
            )
            metadata["sheet_previews"] = extract_sheet_previews(workbook_path)
        except DownloadError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except ExcelMetadataError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    metadata["source"] = {"url": source}
    return metadata


def convert_xls_with_service(workbook_path: Path, output_dir: Path) -> Path:
    converter_url = os.environ.get("CONVERTER_URL")
    if not converter_url:
        raise ExcelMetadataError(
            ".xls files require CONVERTER_URL for the separate converter container"
        )

    query = urlencode({"filename": workbook_path.name})
    request = Request(
        f"{converter_url.rstrip('/')}/convert?{query}",
        data=workbook_path.read_bytes(),
        headers={"Content-Type": "application/vnd.ms-excel"},
        method="POST",
    )
    with urlopen(request, timeout=120) as response:
        output_path = output_dir / f"{workbook_path.stem}.xlsx"
        output_path.write_bytes(response.read())
        return output_path
