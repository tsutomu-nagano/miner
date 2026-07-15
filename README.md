---
title: Excel Metadata API
emoji: 📊
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
---

# miner

Excelファイル（`.xlsx`, `.xlsm`, `.xltx`, `.xltm`, `.xls`）から、ブック・シート・セル構造のメタデータをJSONとして抽出するCLI/APIです。

APIコンテナは LibreOffice を同梱し、`.xls` 変換 API とメタデータ抽出 API を 1 コンテナで提供します。フロントエンドは `frontend/` に分離し、Vercel で運用します。

## 抽出する主な情報

- ファイル名、絶対パス、拡張子、サイズ、更新日時
- ブックのプロパティ、シート一覧、アクティブシート、計算設定
- 名前定義
- 各シートの表示状態、使用範囲、固定ペイン、オートフィルタ
- テーブル、結合セル、グラフ数、画像数、入力規則数、条件付き書式数
- セル種別の集計、数式、コメント、ハイパーリンク
- シート保護設定

## Dockerで実行

APIコンテナ:

```bash
docker build -t miner-api .
docker run --rm -p 7860:7860 miner-api
```

CLIコンテナ:

```bash
docker build -f Dockerfile.cli -t miner .
docker run --rm -v "$PWD:/work" miner /work/path/to/workbook.xlsx --pretty
```

## APIをローカル起動

```bash
docker compose up --build
```

`http://localhost:8000` でAPIを起動します。`.xls` は同じコンテナ内で `.xlsx` に変換してから処理します。

同じコンテナで以下の API を提供します。

- `POST /api/extract`: URLからExcelをダウンロードし、メタデータをJSONで返します。
- `POST /convert?filename=legacy.xls`: リクエストボディの `.xls` を `.xlsx` に変換して返します。
- `GET /health`: ヘルスチェックを返します。

Hugging Face Docker Space では root の `Dockerfile` を使います。コンテナは `PORT` 環境変数を優先し、未指定の場合は `7860` で起動します。

GitHub Actions から Hugging Face Space に同期する場合は、GitHub に以下を設定します。

- Secret: `HF_TOKEN`
- Repository variable: `HF_SPACE_ID`（例: `username/space-name`）

Vercel でフロントエンドを運用する場合は、Vercel Project の Root Directory を `frontend` にします。

- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable: `MINER_API_BASE_URL`（例: `https://your-hf-space.hf.space`）

HF API 側には、Vercel のURLを許可するために `ALLOWED_ORIGINS` を設定します。複数指定する場合はカンマ区切りです。

```text
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
```

フロントエンドをローカルでビルドする場合:

```bash
cd frontend
MINER_API_BASE_URL=http://localhost:8000 npm run build
```

e-StatのファイルダウンロードURLを直接処理する場合:

```bash
docker build -f Dockerfile.cli -t miner .
docker run --rm -v "$PWD:/work" miner "https://www.e-stat.go.jp/..." --pretty
```

CLIで `.xls` を処理する場合は、変換専用イメージもビルドします。

```bash
docker build -f Dockerfile.converter -t miner-xls-converter .
docker run --rm -v "$PWD:/work" miner-xls-converter /work/path/to/legacy.xls
docker run --rm -v "$PWD:/work" miner /work/path/to/legacy.xlsx --pretty
```

ラッパースクリプトを使うと、`.xls` の変換と抽出をまとめて実行できます。内部では変換用と抽出用で別々のコンテナを起動します。

```bash
docker build -f Dockerfile.cli -t miner .
docker build -f Dockerfile.converter -t miner-xls-converter .
scripts/extract-excel-metadata path/to/legacy.xls --pretty
```

URL先が `.xls` の可能性がある場合も、ラッパースクリプトを使ってください。URLのファイルを抽出用コンテナで `.downloads/` に保存し、`.xls` なら変換専用コンテナで `.xlsx` にしてから抽出します。

```bash
docker build -f Dockerfile.cli -t miner .
scripts/extract-excel-metadata "https://www.e-stat.go.jp/..." --pretty
```

JSONファイルへ保存する場合:

```bash
docker build -f Dockerfile.cli -t miner .
docker run --rm -v "$PWD:/work" miner /work/path/to/workbook.xlsx --pretty --output /work/outputs/metadata.json
```

空セルも走査対象に含める場合:

```bash
docker build -f Dockerfile.cli -t miner .
docker run --rm -v "$PWD:/work" miner /work/path/to/workbook.xlsx --include-empty-cells --pretty
```

## テスト

依存関係のインストールが必要なため、テストもDockerで実行します。

```bash
docker build -f Dockerfile.cli -t miner .
docker run --rm --entrypoint pytest miner
```
