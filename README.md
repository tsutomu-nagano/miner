# miner

Excelファイル（`.xlsx`, `.xlsm`, `.xltx`, `.xltm`, `.xls`）から、ブック・シート・セル構造のメタデータをJSONとして抽出するCLI/APIです。

Web/API コンテナは LibreOffice を同梱し、`.xls` 変換 API とメタデータ抽出 API を 1 コンテナで提供します。

## 抽出する主な情報

- ファイル名、絶対パス、拡張子、サイズ、更新日時
- ブックのプロパティ、シート一覧、アクティブシート、計算設定
- 名前定義
- 各シートの表示状態、使用範囲、固定ペイン、オートフィルタ
- テーブル、結合セル、グラフ数、画像数、入力規則数、条件付き書式数
- セル種別の集計、数式、コメント、ハイパーリンク
- シート保護設定

## Dockerで実行

```bash
docker build -t miner .
docker run --rm -v "$PWD:/work" miner /work/path/to/workbook.xlsx --pretty
```

## Webアプリで可視化

```bash
docker compose up --build
```

ブラウザで `http://localhost:8000` を開くと、e-StatのファイルダウンロードURLから抽出した統計表メタデータを可視化できます。`.xls` は同じコンテナ内で `.xlsx` に変換してから処理します。

同じコンテナで以下の API を提供します。

- `POST /api/extract`: URLからExcelをダウンロードし、メタデータをJSONで返します。
- `POST /convert?filename=legacy.xls`: リクエストボディの `.xls` を `.xlsx` に変換して返します。
- `GET /health`: ヘルスチェックを返します。

Hugging Face Docker Space へデプロイする場合は `Dockerfile.web` を使います。コンテナは `PORT` 環境変数を優先し、未指定の場合は `7860` で起動します。

e-StatのファイルダウンロードURLを直接処理する場合:

```bash
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
docker build -t miner .
docker build -f Dockerfile.converter -t miner-xls-converter .
scripts/extract-excel-metadata path/to/legacy.xls --pretty
```

URL先が `.xls` の可能性がある場合も、ラッパースクリプトを使ってください。URLのファイルを抽出用コンテナで `.downloads/` に保存し、`.xls` なら変換専用コンテナで `.xlsx` にしてから抽出します。

```bash
scripts/extract-excel-metadata "https://www.e-stat.go.jp/..." --pretty
```

JSONファイルへ保存する場合:

```bash
docker run --rm -v "$PWD:/work" miner /work/path/to/workbook.xlsx --pretty --output /work/outputs/metadata.json
```

空セルも走査対象に含める場合:

```bash
docker run --rm -v "$PWD:/work" miner /work/path/to/workbook.xlsx --include-empty-cells --pretty
```

## テスト

依存関係のインストールが必要なため、テストもDockerで実行します。

```bash
docker build -t miner .
docker run --rm --entrypoint pytest miner
```
