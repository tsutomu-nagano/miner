from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse


app = FastAPI(title="XLS Converter")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/convert")
async def convert_xls(
    request: Request,
    filename: str = Query(default="workbook.xls"),
) -> FileResponse:
    if not filename.lower().endswith(".xls"):
        raise HTTPException(status_code=400, detail="filename must end with .xls")

    with tempfile.TemporaryDirectory(prefix="xls-converter-") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / Path(filename).name
        input_path.write_bytes(await request.body())

        if input_path.stat().st_size == 0:
            raise HTTPException(status_code=400, detail="empty file")

        result = subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to",
                "xlsx",
                "--outdir",
                str(temp_path),
                str(input_path),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip()
            raise HTTPException(status_code=422, detail=detail)

        output_path = temp_path / f"{input_path.stem}.xlsx"
        if not output_path.exists():
            raise HTTPException(status_code=422, detail="converted file was not created")

        stable_output = Path(tempfile.gettempdir()) / f"{input_path.stem}.xlsx"
        stable_output.write_bytes(output_path.read_bytes())
        return FileResponse(
            stable_output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=stable_output.name,
        )

