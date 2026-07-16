# miner

Excelファイル（`.xlsx`, `.xlsm`, `.xltx`, `.xltm`, `.xls`）から、ブック・シート・セル構造のメタデータをJSONとして抽出するCLI/APIです。

APIコンテナは LibreOffice を同梱し、`.xls` 変換 API とメタデータ抽出 API を 1 コンテナで提供します。フロントエンドは `frontend/` に分離した Vite + React アプリです。

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

## Renderへデプロイ

このリポジトリは Render の Blueprint に対応しています。Render Dashboard で GitHub リポジトリを選び、root の `render.yaml` から Blueprint を作成してください。

作成されるサービス:

- `miner-api`: Docker Web Service。root の `Dockerfile` を使い、FastAPI + LibreOffice を起動します。

フロントエンドは Render では作成せず、Cloudflare Pages 側で `frontend/` をデプロイします。

Render作成時に以下の環境変数を設定します。

```text
ALLOWED_ORIGINS=https://<Cloudflare Pages のURL>
```

複数指定する場合はカンマ区切りです。

```text
ALLOWED_ORIGINS=https://miner-frontend.pages.dev,http://localhost:5174
```

APIコンテナは Render が渡す `PORT` 環境変数を優先し、未指定の場合は `7860` で起動します。Render Web Service は外部HTTPを受けるために `0.0.0.0` へbindする必要があり、この `Dockerfile` はその条件を満たしています。

Renderを手動で作る場合:

- API: Web Service / Docker / Dockerfile Path `./Dockerfile`

## フロントエンド

Cloudflare Pages または任意の静的ホスティングで運用できます。Cloudflare Pages の場合は、Pages Project の Root Directory を `frontend` にします。

- Build Command: `npm run build`
- Build output directory: `dist`
- Environment variable: `MINER_API_BASE_URL`（例: `https://miner-api.onrender.com`）

フロントエンドは Vite + React + TypeScript です。依存関係をインストールしてローカル起動する場合:

```bash
cd frontend
npm install
MINER_API_BASE_URL=http://localhost:8000 npm run dev
```

Cloudflare Pages をWranglerで手元からデプロイする場合:

```bash
cd frontend
npm run deploy:pages
```

Cloudflare Pages のGit連携でデプロイする場合、Deploy command に `wrangler deploy` は指定しません。Pagesの設定は以下にしてください。

```text
Root directory: frontend
Build command: npm run build
Build output directory: dist
```

API 側には、フロントエンドのURLを許可するために `ALLOWED_ORIGINS` を設定します。複数指定する場合はカンマ区切りです。

```text
ALLOWED_ORIGINS=https://miner-frontend.pages.dev
```

フロントエンドをローカルでビルドする場合:

```bash
cd frontend
MINER_API_BASE_URL=http://localhost:8000 npm run typecheck
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
