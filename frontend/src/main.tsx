import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy, Download, FileInput, Upload } from "lucide-react";
import "../styles.css";

const sampleUrl =
  "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040387904&fileKind=0";

type SheetPreview = {
  sheet_name?: string;
  range?: string;
  max_row?: number;
  max_column?: number;
  truncated?: boolean;
  rows?: unknown[][];
};

type DataRegion = {
  range?: string;
  first_data_row?: number;
  last_data_row?: number;
  first_value_column?: string;
  last_value_column?: string;
};

type ValueRange = {
  min: number | null;
  max: number | null;
  count: number;
  zero_count: number;
};

type DimensionItem = {
  axis?: string;
  cell_range?: string;
  name?: string;
  values?: unknown[];
};

type AggregationItem = {
  name?: string;
  unit?: string;
  cell_range?: string;
  value_columns?: string[];
};

type StatisticalMetadata = {
  sheet_name?: string;
  title?: string;
  time_axis?: { value?: string }[];
  data_region?: DataRegion;
  original_data_region?: DataRegion;
  value_range?: ValueRange;
  original_value_range?: ValueRange;
  aggregation_items?: AggregationItem[];
  original_aggregation_items?: AggregationItem[];
  classification_items?: DimensionItem[];
  regional_items?: DimensionItem[];
};

type Metadata = {
  file?: { name?: string };
  workbook?: { sheet_count?: number };
  source?: { url?: string };
  statistical_metadata?: StatisticalMetadata[];
  sheet_previews?: SheetPreview[];
};

type AppSettings = {
  sourceUrl: string;
  includeEmptyCells: boolean;
  selectedSheetIndex: number;
};

type Status = {
  message: string;
  isError?: boolean;
};

function App() {
  const [sourceUrl, setSourceUrl] = useState(sampleUrl);
  const [includeEmptyCells, setIncludeEmptyCells] = useState(false);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [status, setStatus] = useState<Status>({
    message: "URLを入力して抽出できます。",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [rangeMessage, setRangeMessage] = useState<Status | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const settingsInputRef = useRef<HTMLInputElement>(null);
  const metadataInputRef = useRef<HTMLInputElement>(null);

  const apiBaseUrl = (
    window.MINER_API_BASE_URL ||
    import.meta.env.VITE_MINER_API_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  const stats = metadata?.statistical_metadata || [];
  const previews = metadata?.sheet_previews || [];
  const selectedStat = stats[selectedSheetIndex];
  const selectedPreview = previews[selectedSheetIndex];
  const jsonText = useMemo(
    () => JSON.stringify(metadata || {}, null, 2),
    [metadata],
  );

  async function extractFromUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ message: "抽出中です。ファイルをダウンロードして解析しています。" });
    setIsLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: sourceUrl,
          include_empty_cells: includeEmptyCells,
        }),
      });
      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(responseDetail(payload) || "抽出に失敗しました。");
      }
      setMetadata(payload as Metadata);
      setSelectedSheetIndex(0);
      setRangeMessage(null);
      setStatus({ message: "抽出が完了しました。" });
    } catch (error) {
      setStatus({ message: errorMessage(error), isError: true });
    } finally {
      setIsLoading(false);
    }
  }

  function importMetadataFile(file: File) {
    readJsonFile(file)
      .then((payload) => {
        setMetadata(payload as Metadata);
        setSelectedSheetIndex(0);
        setRangeMessage(null);
        setStatus({ message: "整理済みメタデータを読み込みました。" });
      })
      .catch((error) => {
        setStatus({ message: errorMessage(error), isError: true });
      });
  }

  function importSettingsFile(file: File) {
    readJsonFile(file)
      .then((payload) => {
        const settings = payload as Partial<AppSettings>;
        setSourceUrl(settings.sourceUrl || sampleUrl);
        setIncludeEmptyCells(Boolean(settings.includeEmptyCells));
        setSelectedSheetIndex(settings.selectedSheetIndex || 0);
        setStatus({ message: "設定をインポートしました。" });
      })
      .catch((error) => {
        setStatus({ message: errorMessage(error), isError: true });
      });
  }

  function exportSettings() {
    downloadJson("miner-settings.json", {
      sourceUrl,
      includeEmptyCells,
      selectedSheetIndex,
    } satisfies AppSettings);
    setStatus({ message: "設定をエクスポートしました。" });
  }

  function exportMetadata() {
    downloadJson("miner-metadata.json", metadata || {});
    setStatus({ message: "メタデータをエクスポートしました。" });
  }

  function applyDataRange(rangeValue: string) {
    if (!metadata || !selectedStat || !selectedPreview) return;
    const normalizedRange = normalizeRange(rangeValue);
    if (!normalizedRange) {
      setRangeMessage({
        message: "A1形式の範囲で入力してください。例: C9:I19",
        isError: true,
      });
      return;
    }

    const range = parseRange(normalizedRange);
    if (!range) return;
    if (
      range.endRow > (selectedPreview.max_row || 0) ||
      range.endCol > (selectedPreview.max_column || 0)
    ) {
      setRangeMessage({
        message: `範囲がシートサイズを超えています。最大 ${columnName(
          selectedPreview.max_column || 0,
        )}${selectedPreview.max_row || 0}`,
        isError: true,
      });
      return;
    }

    const nextMetadata = structuredClone(metadata);
    const stat = nextMetadata.statistical_metadata?.[selectedSheetIndex];
    const preview = nextMetadata.sheet_previews?.[selectedSheetIndex];
    if (!stat || !preview) return;

    if (!stat.original_data_region) {
      stat.original_data_region = structuredClone(stat.data_region);
      stat.original_value_range = structuredClone(stat.value_range);
      stat.original_aggregation_items = structuredClone(stat.aggregation_items);
    }
    updateStatDataRegion(stat, preview, normalizedRange);
    setMetadata(nextMetadata);
    setRangeMessage({
      message: `数値セル範囲を ${normalizedRange} に更新しました。`,
    });
    setStatus({ message: `数値セル範囲を ${normalizedRange} に更新しました。` });
  }

  function resetDataRange() {
    if (!metadata) return;
    const nextMetadata = structuredClone(metadata);
    const stat = nextMetadata.statistical_metadata?.[selectedSheetIndex];
    if (!stat?.original_data_region) return;

    stat.data_region = structuredClone(stat.original_data_region);
    stat.value_range = structuredClone(stat.original_value_range);
    stat.aggregation_items = structuredClone(stat.original_aggregation_items);
    setMetadata(nextMetadata);
    setRangeMessage({ message: "推定された数値セル範囲に戻しました。" });
    setStatus({ message: "推定された数値セル範囲に戻しました。" });
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="sidebar">
          <div>
            <p className="eyebrow">e-Stat Excel</p>
            <h1>メタデータ抽出</h1>
          </div>

          <form className="input-panel" onSubmit={extractFromUrl}>
            <label htmlFor="source-url">ファイルダウンロードURL</label>
            <textarea
              id="source-url"
              spellCheck={false}
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
            />
            <label className="check-row">
              <input
                type="checkbox"
                checked={includeEmptyCells}
                onChange={(event) => setIncludeEmptyCells(event.target.checked)}
              />
              <span>空セルも走査</span>
            </label>
            <button disabled={isLoading} type="submit">
              {isLoading ? "抽出中" : "抽出"}
            </button>
          </form>

          <div
            className={`drop-zone${isDragging ? " dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) importMetadataFile(file);
            }}
          >
            <Upload size={18} aria-hidden="true" />
            <span>整理済みメタデータJSON</span>
          </div>

          <div className="tool-grid">
            <button type="button" onClick={() => metadataInputRef.current?.click()}>
              <FileInput size={16} aria-hidden="true" />
              読込
            </button>
            <button type="button" onClick={exportMetadata}>
              <Download size={16} aria-hidden="true" />
              出力
            </button>
            <button type="button" onClick={() => settingsInputRef.current?.click()}>
              <FileInput size={16} aria-hidden="true" />
              設定読込
            </button>
            <button type="button" onClick={exportSettings}>
              <Download size={16} aria-hidden="true" />
              設定出力
            </button>
          </div>

          <input
            ref={metadataInputRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importMetadataFile(file);
              event.target.value = "";
            }}
          />
          <input
            ref={settingsInputRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importSettingsFile(file);
              event.target.value = "";
            }}
          />

          <div className={`status${status.isError ? " error" : ""}`} role="status">
            {status.message}
          </div>
        </aside>

        <section className="results" aria-live="polite">
          <SummaryGrid metadata={metadata} />
          <section className="panel">
            <div className="panel-heading">
              <h2>統計表メタデータ</h2>
              <SheetSelect
                items={stats}
                selectedIndex={selectedSheetIndex}
                onChange={(index) => {
                  setSelectedSheetIndex(index);
                  setRangeMessage(null);
                }}
              />
            </div>
            <StatisticalView
              item={selectedStat}
              rangeMessage={rangeMessage}
              onApplyRange={applyDataRange}
              onResetRange={resetDataRange}
            />
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Excelプレビュー</h2>
              <SheetSelect
                items={previews}
                selectedIndex={selectedSheetIndex}
                onChange={setSelectedSheetIndex}
              />
            </div>
            <ExcelPreview preview={selectedPreview} stat={selectedStat} />
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>JSON</h2>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(jsonText);
                  setStatus({ message: "JSONをコピーしました。" });
                }}
              >
                <Copy size={16} aria-hidden="true" />
                コピー
              </button>
            </div>
            <pre>{jsonText}</pre>
          </section>
        </section>
      </section>
    </main>
  );
}

function SummaryGrid({ metadata }: { metadata: Metadata | null }) {
  const stat = metadata?.statistical_metadata?.[0] || {};
  const valueRange = stat.value_range;
  const metrics = [
    ["ファイル", metadata?.file?.name || "-"],
    ["シート数", metadata?.workbook?.sheet_count ?? 0],
    ["表題", stat.title || "-"],
    [
      "数値範囲",
      valueRange
        ? `${formatNumber(valueRange.min)} - ${formatNumber(valueRange.max)}`
        : "-",
    ],
  ];

  return (
    <div className="summary-grid">
      {metrics.map(([label, value]) => (
        <div className="metric" key={label}>
          <span>{label}</span>
          <strong>{String(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function SheetSelect({
  items,
  selectedIndex,
  onChange,
}: {
  items: { sheet_name?: string }[];
  selectedIndex: number;
  onChange: (index: number) => void;
}) {
  return (
    <select
      aria-label="シート選択"
      disabled={items.length === 0}
      value={selectedIndex}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {items.map((item, index) => (
        <option key={`${item.sheet_name || "sheet"}-${index}`} value={index}>
          {item.sheet_name || `Sheet ${index + 1}`}
        </option>
      ))}
    </select>
  );
}

function StatisticalView({
  item,
  rangeMessage,
  onApplyRange,
  onResetRange,
}: {
  item?: StatisticalMetadata;
  rangeMessage: Status | null;
  onApplyRange: (range: string) => void;
  onResetRange: () => void;
}) {
  const [rangeValue, setRangeValue] = useState(item?.data_region?.range || "");
  React.useEffect(() => {
    setRangeValue(item?.data_region?.range || "");
  }, [item?.data_region?.range]);

  if (!item) {
    return (
      <div className="statistical-view empty-state">
        統計表メタデータは検出されませんでした。
      </div>
    );
  }

  const regionalItems = item.regional_items || [];
  const classificationItems = withoutRegionalItems(
    item.classification_items || [],
    regionalItems,
  );

  return (
    <div className="statistical-view">
      <form
        className="range-editor"
        onSubmit={(event) => {
          event.preventDefault();
          onApplyRange(rangeValue);
        }}
      >
        <label htmlFor="data-range-input">数値セル範囲</label>
        <input
          id="data-range-input"
          value={rangeValue}
          placeholder="C9:I19"
          onChange={(event) => setRangeValue(event.target.value)}
        />
        <button type="submit">適用</button>
        <button type="button" onClick={onResetRange}>
          推定に戻す
        </button>
        <p className={`range-editor-message${rangeMessage?.isError ? " error" : ""}`}>
          {rangeMessage?.message || ""}
        </p>
      </form>

      <div className="detail-grid">
        <Detail label="表題" value={item.title || "-"} />
        <Detail
          label="時間軸事項"
          value={(item.time_axis || []).map((time) => time.value).join(" / ") || "-"}
        />
        <Detail label="数値セル範囲" value={item.data_region?.range || "-"} />
        <Detail
          label="値列"
          value={
            item.data_region
              ? `${item.data_region.first_value_column} - ${item.data_region.last_value_column}`
              : "-"
          }
        />
        <Detail label="数値件数" value={item.value_range?.count ?? "-"} />
        <Detail label="ゼロ値" value={item.value_range?.zero_count ?? "-"} />
      </div>

      <MetadataSection title="分類事項">
        <DimensionCards items={classificationItems} emptyText="分類事項はありません。" />
      </MetadataSection>
      <MetadataSection title="地域事項">
        <DimensionCards items={regionalItems} emptyText="地域事項候補はありません。" />
      </MetadataSection>
      <MetadataSection title="集計事項">
        <AggregationTable items={item.aggregation_items || []} />
      </MetadataSection>
    </div>
  );
}

function ExcelPreview({
  preview,
  stat,
}: {
  preview?: SheetPreview;
  stat?: StatisticalMetadata;
}) {
  if (!preview) {
    return <div className="excel-preview empty-state">Excelプレビューはありません。</div>;
  }

  const rows = preview.rows || [];
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const dataRange = parseRange(stat?.data_region?.range);
  const activeCell = findFirstNonEmptyCell(rows);

  return (
    <div className="excel-preview">
      <div className="preview-meta">
        <span>{preview.sheet_name || "-"}</span>
        <span>{preview.range || "-"}</span>
        <span>{`${preview.max_row}行 x ${preview.max_column}列`}</span>
        <span>{preview.truncated ? "一部表示" : "全体表示"}</span>
      </div>
      <div className="sheet-wrap">
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="corner-cell" />
              {Array.from({ length: maxCols }, (_, index) => (
                <th className="column-heading" key={index}>
                  {columnName(index + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className="row-heading">{rowIndex + 1}</th>
                {Array.from({ length: maxCols }, (_, colIndex) => {
                  const value = row[colIndex];
                  const classes = ["sheet-cell"];
                  if (typeof value === "number") classes.push("number-cell");
                  if (isCellInRange(rowIndex + 1, colIndex + 1, dataRange)) {
                    classes.push("data-region-cell");
                  }
                  if (
                    activeCell?.row === rowIndex + 1 &&
                    activeCell?.col === colIndex + 1
                  ) {
                    classes.push("active-cell");
                  }
                  return (
                    <td className={classes.join(" ")} key={colIndex}>
                      {formatCell(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetadataSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{String(value)}</strong>
    </div>
  );
}

function DimensionCards({
  items,
  emptyText,
}: {
  items: DimensionItem[];
  emptyText: string;
}) {
  if (!items.length) return <div className="empty-state">{emptyText}</div>;
  return (
    <div className="item-list">
      {items.map((item, index) => (
        <article className="item" key={`${item.name || "item"}-${index}`}>
          <h3>{item.name || "-"}</h3>
          <p className="empty-state">{item.cell_range || ""}</p>
          <div className="tags">
            {(item.values || []).map((value, valueIndex) => (
              <span className="tag" key={valueIndex}>
                {String(value)}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function AggregationTable({ items }: { items: AggregationItem[] }) {
  if (!items.length) return <div className="empty-state">集計事項はありません。</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>単位</th>
            <th>数値範囲</th>
            <th>値列</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.name || "aggregation"}-${index}`}>
              <td>{item.name || "-"}</td>
              <td>{item.unit || "-"}</td>
              <td>{item.cell_range || "-"}</td>
              <td>
                <div className="tags">
                  {(item.value_columns || []).map((value) => (
                    <span className="tag" key={value}>
                      {value}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function readJsonFile(file: File): Promise<unknown> {
  return file.text().then((text) => JSON.parse(text));
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) {
      return { detail: `${response.status} ${response.statusText}`.trim() };
    }
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { detail: text.slice(0, 300) };
  }
}

function responseDetail(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }
  return null;
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function withoutRegionalItems(
  classificationItems: DimensionItem[],
  regionalItems: DimensionItem[],
) {
  const regionalKeys = new Set(regionalItems.map((item) => dimensionKey(item)));
  return classificationItems.filter((item) => !regionalKeys.has(dimensionKey(item)));
}

function dimensionKey(item: DimensionItem) {
  return [item.axis || "", item.cell_range || "", item.name || ""].join("|");
}

function updateStatDataRegion(
  stat: StatisticalMetadata,
  preview: SheetPreview,
  rangeValue: string,
) {
  const range = parseRange(rangeValue);
  if (!range) return;
  const values = numericValuesInRange(preview.rows || [], range);
  const valueColumns = Array.from(
    { length: range.endCol - range.startCol + 1 },
    (_, index) => columnName(range.startCol + index),
  );

  stat.data_region = {
    ...(stat.data_region || {}),
    range: rangeValue,
    first_data_row: range.startRow,
    last_data_row: range.endRow,
    first_value_column: columnName(range.startCol),
    last_value_column: columnName(range.endCol),
  };
  stat.value_range = summarizeNumericValues(values);
  stat.aggregation_items = (stat.aggregation_items || []).map((item) => ({
    ...item,
    cell_range: rangeValue,
    value_columns: valueColumns,
  }));
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("ja-JP").format(value);
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function columnName(index: number) {
  let name = "";
  let current = index;
  while (current > 0) {
    current -= 1;
    name = String.fromCharCode(65 + (current % 26)) + name;
    current = Math.floor(current / 26);
  }
  return name;
}

function parseRange(range?: string | null) {
  if (!range) return null;
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  if (!match) return null;
  return {
    startCol: columnIndex(match[1]),
    startRow: Number(match[2]),
    endCol: columnIndex(match[3]),
    endRow: Number(match[4]),
  };
}

function normalizeRange(range: string) {
  const compact = String(range || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(compact);
  if (!match) return null;
  const startCol = columnIndex(match[1]);
  const startRow = Number(match[2]);
  const endCol = columnIndex(match[3]);
  const endRow = Number(match[4]);
  if (startRow < 1 || endRow < 1) return null;
  const left = Math.min(startCol, endCol);
  const right = Math.max(startCol, endCol);
  const top = Math.min(startRow, endRow);
  const bottom = Math.max(startRow, endRow);
  return `${columnName(left)}${top}:${columnName(right)}${bottom}`;
}

function columnIndex(name: string) {
  return name
    .split("")
    .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function isCellInRange(
  row: number,
  col: number,
  range: ReturnType<typeof parseRange>,
) {
  if (!range) return false;
  return (
    row >= range.startRow &&
    row <= range.endRow &&
    col >= range.startCol &&
    col <= range.endCol
  );
}

function findFirstNonEmptyCell(rows: unknown[][]) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (let colIndex = 0; colIndex < rows[rowIndex].length; colIndex += 1) {
      const value = rows[rowIndex][colIndex];
      if (value !== null && value !== undefined && String(value) !== "") {
        return { row: rowIndex + 1, col: colIndex + 1 };
      }
    }
  }
  return null;
}

function numericValuesInRange(
  rows: unknown[][],
  range: NonNullable<ReturnType<typeof parseRange>>,
) {
  const values: number[] = [];
  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex - 1] || [];
    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const value = row[colIndex - 1];
      if (typeof value === "number") {
        values.push(value);
      } else if (typeof value === "string") {
        const parsed = Number(value.replace(/,/g, ""));
        if (Number.isFinite(parsed) && value.trim() !== "") values.push(parsed);
      }
    }
  }
  return values;
}

function summarizeNumericValues(values: number[]): ValueRange {
  if (!values.length) {
    return { min: null, max: null, count: 0, zero_count: 0 };
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
    zero_count: values.filter((value) => value === 0).length,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "処理に失敗しました。";
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
