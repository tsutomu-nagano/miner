from __future__ import annotations

import tempfile
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .converter_api import convert_xls_file, router as converter_router
from .downloader import DownloadError, download_workbook, is_url
from .extractor import ExcelMetadataError, extract_metadata
from .preview import extract_sheet_previews


app = FastAPI(title="Excel Metadata Visualizer")
app.include_router(converter_router)

allowed_origins = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )


class ExtractRequest(BaseModel):
    source: str
    include_empty_cells: bool = False


@app.get("/")
def index() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "excel-metadata-api",
        "endpoints": ["/api/extract", "/convert", "/health", "/docs"],
    }


@app.post("/api/extract")
def extract_from_url(request: ExtractRequest) -> dict[str, object]:
    source = request.source.strip()
    if not is_url(source):
        raise HTTPException(status_code=400, detail="http(s) URLを指定してください。")

    with tempfile.TemporaryDirectory(prefix="excel-metadata-web-") as temp_dir:
        try:
            workbook_path = download_workbook(source, Path(temp_dir))
            if workbook_path.suffix.lower() == ".xls":
                workbook_path = convert_xls_file(workbook_path, Path(temp_dir))
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
