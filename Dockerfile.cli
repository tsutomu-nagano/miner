FROM python:3.12-slim

WORKDIR /app
ENV PYTHONPATH=/app/src

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pyproject.toml README.md ./
COPY src ./src
COPY tests ./tests

ENTRYPOINT ["python", "-m", "excel_metadata_extractor.cli"]
