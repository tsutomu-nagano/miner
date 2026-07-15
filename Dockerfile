FROM python:3.12-slim

WORKDIR /app
ENV PYTHONPATH=/app/src

RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-calc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pyproject.toml README.md ./
COPY src ./src

EXPOSE 7860

CMD ["sh", "-c", "uvicorn excel_metadata_extractor.web:app --host 0.0.0.0 --port ${PORT:-7860}"]
