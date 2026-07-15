const form = document.querySelector("#extract-form");
const statusBox = document.querySelector("#status");
const submitButton = document.querySelector("#submit-button");
const summaryGrid = document.querySelector("#summary-grid");
const sheetSelect = document.querySelector("#sheet-select");
const previewSheetSelect = document.querySelector("#preview-sheet-select");
const statisticalView = document.querySelector("#statistical-view");
const excelPreview = document.querySelector("#excel-preview");
const jsonOutput = document.querySelector("#json-output");
const copyJsonButton = document.querySelector("#copy-json");
const apiBaseUrl = (window.MINER_API_BASE_URL || "").replace(/\/$/, "");

let currentMetadata = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("抽出中です。ファイルをダウンロードして解析しています。");
  submitButton.disabled = true;

  const requestPayload = {
    source: document.querySelector("#source-url").value,
    include_empty_cells: document.querySelector("#include-empty-cells").checked,
  };

  try {
    const response = await fetch(`${apiBaseUrl}/api/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });
    const responsePayload = await response.json();
    if (!response.ok) {
      throw new Error(responsePayload.detail || "抽出に失敗しました。");
    }
    currentMetadata = responsePayload;
    renderMetadata(responsePayload);
    setStatus("抽出が完了しました。");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

sheetSelect.addEventListener("change", () => {
  if (!currentMetadata) return;
  renderStatisticalView(currentMetadata.statistical_metadata[sheetSelect.value]);
  previewSheetSelect.value = sheetSelect.value;
  renderExcelPreview(currentMetadata.sheet_previews?.[previewSheetSelect.value]);
});

previewSheetSelect.addEventListener("change", () => {
  if (!currentMetadata) return;
  sheetSelect.value = previewSheetSelect.value;
  renderStatisticalView(currentMetadata.statistical_metadata?.[sheetSelect.value]);
  renderExcelPreview(currentMetadata.sheet_previews?.[previewSheetSelect.value]);
});

copyJsonButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(jsonOutput.textContent);
  setStatus("JSONをコピーしました。");
});

function renderMetadata(metadata) {
  jsonOutput.textContent = JSON.stringify(metadata, null, 2);
  renderSummary(metadata);
  renderSheetOptions(metadata.statistical_metadata || []);
  renderPreviewSheetOptions(metadata.sheet_previews || []);
  renderStatisticalView((metadata.statistical_metadata || [])[0]);
  renderExcelPreview((metadata.sheet_previews || [])[0]);
}

function renderSummary(metadata) {
  const stat = (metadata.statistical_metadata || [])[0] || {};
  const sheetCount = metadata.workbook?.sheet_count ?? 0;
  const valueRange = stat.value_range;
  const metrics = [
    ["ファイル", metadata.file?.name || "-"],
    ["シート数", sheetCount],
    ["表題", stat.title || "-"],
    ["数値範囲", valueRange ? `${formatNumber(valueRange.min)} - ${formatNumber(valueRange.max)}` : "-"],
  ];

  summaryGrid.innerHTML = metrics
    .map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`)
    .join("");
}

function renderPreviewSheetOptions(items) {
  previewSheetSelect.innerHTML = "";
  items.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = item.sheet_name || `Sheet ${index + 1}`;
    previewSheetSelect.appendChild(option);
  });
  previewSheetSelect.disabled = items.length === 0;
}

function renderSheetOptions(items) {
  sheetSelect.innerHTML = "";
  items.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = item.sheet_name || `Sheet ${index + 1}`;
    sheetSelect.appendChild(option);
  });
  sheetSelect.disabled = items.length === 0;
}

function renderExcelPreview(preview) {
  if (!preview) {
    excelPreview.className = "excel-preview empty-state";
    excelPreview.textContent = "Excelプレビューはありません。";
    return;
  }

  const rows = preview.rows || [];
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const stat = currentMetadata?.statistical_metadata?.find(
    (item) => item.sheet_name === preview.sheet_name,
  );
  const dataRange = parseRange(stat?.data_region?.range);
  const activeCell = findFirstNonEmptyCell(rows);
  const headerCells = Array.from(
    { length: maxCols },
    (_, index) => `<th class="column-heading">${columnName(index + 1)}</th>`,
  ).join("");
  const bodyRows = rows
    .map((row, rowIndex) => `
      <tr>
        <th class="row-heading">${rowIndex + 1}</th>
        ${Array.from({ length: maxCols }, (_, colIndex) => {
          const value = row[colIndex];
          const classes = ["sheet-cell"];
          if (typeof value === "number") classes.push("number-cell");
          if (isCellInRange(rowIndex + 1, colIndex + 1, dataRange)) {
            classes.push("data-region-cell");
          }
          if (activeCell?.row === rowIndex + 1 && activeCell?.col === colIndex + 1) {
            classes.push("active-cell");
          }
          return `<td class="${classes.join(" ")}">${escapeHtml(formatCell(value))}</td>`;
        }).join("")}
      </tr>
    `)
    .join("");

  excelPreview.className = "excel-preview";
  excelPreview.innerHTML = `
    <div class="preview-meta">
      <span>${escapeHtml(preview.sheet_name || "-")}</span>
      <span>${escapeHtml(preview.range || "-")}</span>
      <span>${escapeHtml(`${preview.max_row}行 x ${preview.max_column}列`)}</span>
      ${preview.truncated ? "<span>一部表示</span>" : "<span>全体表示</span>"}
    </div>
    <div class="sheet-wrap">
      <table class="sheet-table">
        <thead>
          <tr><th class="corner-cell"></th>${headerCells}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function renderStatisticalView(item) {
  if (!item) {
    statisticalView.className = "statistical-view empty-state";
    statisticalView.textContent = "統計表メタデータは検出されませんでした。";
    return;
  }

  const regionalItems = item.regional_items || [];
  const classificationItems = withoutRegionalItems(
    item.classification_items || [],
    regionalItems,
  );

  statisticalView.className = "statistical-view";
  statisticalView.innerHTML = `
    <form class="range-editor" data-sheet-name="${escapeHtml(item.sheet_name || "")}">
      <label for="data-range-input">数値セル範囲</label>
      <input id="data-range-input" name="dataRange" value="${escapeHtml(item.data_region?.range || "")}" placeholder="C9:I19" />
      <button type="submit">適用</button>
      <button type="button" data-reset-range>推定に戻す</button>
      <p id="range-editor-message" class="range-editor-message"></p>
    </form>
    <div class="detail-grid">
      ${detail("表題", item.title || "-")}
      ${detail("時間軸事項", (item.time_axis || []).map((time) => time.value).join(" / ") || "-")}
      ${detail("数値セル範囲", item.data_region?.range || "-")}
      ${detail("値列", item.data_region ? `${item.data_region.first_value_column} - ${item.data_region.last_value_column}` : "-")}
      ${detail("数値件数", item.value_range?.count ?? "-")}
      ${detail("ゼロ値", item.value_range?.zero_count ?? "-")}
    </div>
    <section>
      <h3>分類事項</h3>
      <div class="item-list">${renderDimensionCards(classificationItems) || '<div class="empty-state">分類事項はありません。</div>'}</div>
    </section>
    <section>
      <h3>地域事項</h3>
      <div class="item-list">${renderDimensionCards(regionalItems) || '<div class="empty-state">地域事項候補はありません。</div>'}</div>
    </section>
    <section>
      <h3>集計事項</h3>
      ${renderAggregationTable(item.aggregation_items || [])}
    </section>
  `;

  const rangeEditor = statisticalView.querySelector(".range-editor");
  rangeEditor.addEventListener("submit", (event) => {
    event.preventDefault();
    applyDataRange(item.sheet_name, rangeEditor.elements.dataRange.value);
  });
  rangeEditor.querySelector("[data-reset-range]").addEventListener("click", () => {
    resetDataRange(item.sheet_name);
  });
}

function withoutRegionalItems(classificationItems, regionalItems) {
  const regionalKeys = new Set(regionalItems.map((item) => dimensionKey(item)));
  return classificationItems.filter((item) => !regionalKeys.has(dimensionKey(item)));
}

function dimensionKey(item) {
  return [item.axis || "", item.cell_range || "", item.name || ""].join("|");
}

function renderDimensionCards(items) {
  return items
    .map((item) => `
      <article class="item">
        <h3>${escapeHtml(item.name || "-")}</h3>
        <p class="empty-state">${escapeHtml(item.cell_range || "")}</p>
        <div class="tags">${(item.values || []).map((value) => tag(value)).join("")}</div>
      </article>
    `)
    .join("");
}

function renderAggregationTable(items) {
  if (!items.length) {
    return '<div class="empty-state">集計事項はありません。</div>';
  }
  return `
    <div class="table-wrap">
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
          ${items
            .map((item) => `
              <tr>
                <td>${escapeHtml(item.name || "-")}</td>
                <td>${escapeHtml(item.unit || "-")}</td>
                <td>${escapeHtml(item.cell_range || "-")}</td>
                <td><div class="tags">${(item.value_columns || []).map((value) => tag(value)).join("")}</div></td>
              </tr>
            `)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function applyDataRange(sheetName, rangeValue) {
  const normalizedRange = normalizeRange(rangeValue);
  const message = statisticalView.querySelector("#range-editor-message");
  if (!normalizedRange) {
    message.textContent = "A1形式の範囲で入力してください。例: C9:I19";
    message.classList.add("error");
    return;
  }

  const preview = currentMetadata.sheet_previews?.find((item) => item.sheet_name === sheetName);
  const stat = currentMetadata.statistical_metadata?.find((item) => item.sheet_name === sheetName);
  if (!preview || !stat) return;

  const range = parseRange(normalizedRange);
  if (range.endRow > preview.max_row || range.endCol > preview.max_column) {
    message.textContent = `範囲がシートサイズを超えています。最大 ${columnName(preview.max_column)}${preview.max_row}`;
    message.classList.add("error");
    return;
  }

  if (!stat.original_data_region) {
    stat.original_data_region = structuredClone(stat.data_region);
    stat.original_value_range = structuredClone(stat.value_range);
    stat.original_aggregation_items = structuredClone(stat.aggregation_items);
  }

  updateStatDataRegion(stat, preview, normalizedRange);
  syncAfterRangeEdit(stat, preview, `数値セル範囲を ${normalizedRange} に更新しました。`);
}

function resetDataRange(sheetName) {
  const preview = currentMetadata.sheet_previews?.find((item) => item.sheet_name === sheetName);
  const stat = currentMetadata.statistical_metadata?.find((item) => item.sheet_name === sheetName);
  if (!preview || !stat?.original_data_region) return;

  stat.data_region = structuredClone(stat.original_data_region);
  stat.value_range = structuredClone(stat.original_value_range);
  stat.aggregation_items = structuredClone(stat.original_aggregation_items);
  syncAfterRangeEdit(stat, preview, "推定された数値セル範囲に戻しました。");
}

function updateStatDataRegion(stat, preview, rangeValue) {
  const range = parseRange(rangeValue);
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

function syncAfterRangeEdit(stat, preview, messageText) {
  renderSummary(currentMetadata);
  renderStatisticalView(stat);
  renderExcelPreview(preview);
  jsonOutput.textContent = JSON.stringify(currentMetadata, null, 2);
  const message = statisticalView.querySelector("#range-editor-message");
  message.textContent = messageText;
  message.classList.remove("error");
  setStatus(messageText);
}

function detail(label, value) {
  return `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function tag(value) {
  return `<span class="tag">${escapeHtml(String(value))}</span>`;
}

function setStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function formatCell(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function columnName(index) {
  let name = "";
  let current = index;
  while (current > 0) {
    current -= 1;
    name = String.fromCharCode(65 + (current % 26)) + name;
    current = Math.floor(current / 26);
  }
  return name;
}

function parseRange(range) {
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

function normalizeRange(range) {
  const compact = String(range || "").replace(/\s+/g, "").toUpperCase();
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

function columnIndex(name) {
  return name.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function isCellInRange(row, col, range) {
  if (!range) return false;
  return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol;
}

function findFirstNonEmptyCell(rows) {
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

function numericValuesInRange(rows, range) {
  const values = [];
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

function summarizeNumericValues(values) {
  if (!values.length) {
    return {
      min: null,
      max: null,
      count: 0,
      zero_count: 0,
    };
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
    zero_count: values.filter((value) => value === 0).length,
  };
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
