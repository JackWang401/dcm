const state = {
  filePath: "",
  sourceHash: "",
  files: [],
  original: new Map(),
  current: new Map(),
  selectedName: null,
};

const els = {
  filePath: document.querySelector("#file-path"),
  fileList: document.querySelector("#file-list"),
  parameterList: document.querySelector("#parameter-list"),
  parameterSearch: document.querySelector("#parameter-search"),
  parameterCount: document.querySelector("#parameter-count"),
  summaryFile: document.querySelector("#summary-file"),
  summaryTotal: document.querySelector("#summary-total"),
  summaryChanged: document.querySelector("#summary-changed"),
  summarySelection: document.querySelector("#summary-selection"),
  status: document.querySelector("#status"),
  emptyState: document.querySelector("#empty-state"),
  detailView: document.querySelector("#detail-view"),
  detailKind: document.querySelector("#detail-kind"),
  detailName: document.querySelector("#detail-name"),
  lineRange: document.querySelector("#line-range"),
  visualHint: document.querySelector("#visual-hint"),
  editorSlot: document.querySelector("#editor-slot"),
  visualSlot: document.querySelector("#visual-slot"),
  compareSlot: document.querySelector("#compare-slot"),
  compareSummary: document.querySelector("#compare-summary"),
  refreshFiles: document.querySelector("#refresh-files"),
  loadFile: document.querySelector("#load-file"),
  saveFile: document.querySelector("#save-file"),
  sampleFile: document.querySelector("#sample-file"),
  resetParameter: document.querySelector("#reset-parameter"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function showStatus(message, type = "info") {
  els.status.textContent = message;
  els.status.dataset.type = type;
}

function clearStatus() {
  els.status.textContent = "";
  els.status.dataset.type = "";
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parameterNames() {
  return [...state.current.keys()];
}

function diffParameter(current, original) {
  const result = { changed: false, changedCells: 0, notes: [] };
  if (!current || !original) {
    return result;
  }

  if (current.kind === "scalar") {
    result.changed = current.value !== original.value;
    result.changedCells = result.changed ? 1 : 0;
    if (result.changed) {
      result.notes.push("Value changed");
    }
    return result;
  }

  if (current.kind === "list") {
    current.values.forEach((value, index) => {
      if (value !== original.values[index]) {
        result.changed = true;
        result.changedCells += 1;
      }
    });
    if (result.changed) {
      result.notes.push(`${result.changedCells} value(s) changed`);
    }
    return result;
  }

  if (current.kind === "curve") {
    current.x_axis.forEach((value, index) => {
      if (value !== original.x_axis[index]) {
        result.changed = true;
        result.changedCells += 1;
      }
    });
    current.values.forEach((value, index) => {
      if (value !== original.values[index]) {
        result.changed = true;
        result.changedCells += 1;
      }
    });
    if (result.changed) {
      result.notes.push(`${result.changedCells} axis/value item(s) changed`);
    }
    return result;
  }

  if (current.kind === "map") {
    current.x_axis.forEach((value, index) => {
      if (value !== original.x_axis[index]) {
        result.changed = true;
        result.changedCells += 1;
      }
    });
    current.y_axis.forEach((value, index) => {
      if (value !== original.y_axis[index]) {
        result.changed = true;
        result.changedCells += 1;
      }
    });
    current.map_values.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (value !== original.map_values[rowIndex][columnIndex]) {
          result.changed = true;
          result.changedCells += 1;
        }
      });
    });
    if (result.changed) {
      result.notes.push(`${result.changedCells} axis/cell item(s) changed`);
    }
    return result;
  }

  return result;
}

function changedParameterCount() {
  return parameterNames().filter((name) => diffParameter(state.current.get(name), state.original.get(name)).changed).length;
}

function setDocument(payload) {
  state.filePath = payload.path;
  state.sourceHash = payload.source_hash;
  state.original = new Map(payload.parameters.map((parameter) => [parameter.name, deepClone(parameter)]));
  state.current = new Map(payload.parameters.map((parameter) => [parameter.name, deepClone(parameter)]));
  state.selectedName = payload.parameters[0]?.name || null;
  els.filePath.value = payload.path;
  renderAll();
}

function renderAll() {
  renderFiles();
  renderParameterList();
  renderSummary();
  renderDetail();
}

function renderFiles() {
  if (!state.files.length) {
    els.fileList.innerHTML = '<p class="muted">No `.dcm` files found under this workspace.</p>';
    return;
  }

  els.fileList.innerHTML = "";
  state.files.forEach((path) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-item";
    button.textContent = path;
    button.addEventListener("click", () => {
      els.filePath.value = path;
      loadDocument(path);
    });
    els.fileList.appendChild(button);
  });
}

function renderParameterList() {
  const search = els.parameterSearch.value.trim().toLowerCase();
  const names = parameterNames().filter((name) => name.toLowerCase().includes(search));
  els.parameterCount.textContent = String(names.length);
  els.parameterList.innerHTML = "";

  names.forEach((name) => {
    const parameter = state.current.get(name);
    const diff = diffParameter(parameter, state.original.get(name));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "parameter-item";
    if (state.selectedName === name) {
      button.classList.add("active");
    }
    if (diff.changed) {
      button.classList.add("changed");
    }
    button.innerHTML = `<strong>${name}</strong><br><span class="muted">${parameter.kind}</span>`;
    button.addEventListener("click", () => {
      state.selectedName = name;
      renderAll();
    });
    els.parameterList.appendChild(button);
  });
}

function renderSummary() {
  els.summaryFile.textContent = state.filePath || "None";
  els.summaryTotal.textContent = String(parameterNames().length);
  els.summaryChanged.textContent = String(changedParameterCount());
  els.summarySelection.textContent = state.selectedName || "None";
}

function renderDetail() {
  const parameter = state.current.get(state.selectedName);
  const original = state.original.get(state.selectedName);
  if (!parameter || !original) {
    els.emptyState.classList.remove("hidden");
    els.detailView.classList.add("hidden");
    return;
  }

  els.emptyState.classList.add("hidden");
  els.detailView.classList.remove("hidden");
  els.detailKind.textContent = parameter.keyword;
  els.detailName.textContent = parameter.name;
  els.lineRange.textContent = `Lines ${parameter.line_range.start}-${parameter.line_range.end}`;
  renderEditor(parameter, original);
  renderVisualization(parameter, original);
  renderComparison(parameter, original);
}

function renderEditor(parameter, original) {
  els.editorSlot.innerHTML = "";
  if (parameter.kind === "scalar") {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <label class="summary-label">Value</label>
      <input id="scalar-input" type="text" value="${escapeHtml(parameter.value)}" />
      ${renderMetadata(parameter)}
    `;
    els.editorSlot.appendChild(wrapper);
    wrapper.querySelector("#scalar-input").addEventListener("change", (event) => {
      parameter.value = event.target.value;
      renderAll();
    });
    return;
  }

  if (parameter.kind === "list") {
    const table = document.createElement("table");
    table.className = "editor-table";
    table.innerHTML = `
      <thead><tr><th>Index</th><th>Value</th><th>Previous</th></tr></thead>
      <tbody>
        ${parameter.values
          .map((value, index) => {
            const changed = value !== original.values[index] ? "changed-cell" : "";
            return `
              <tr class="${changed}">
                <td>${index}</td>
                <td><input data-index="${index}" type="text" value="${escapeHtml(value)}" /></td>
                <td>${escapeHtml(original.values[index])}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    `;
    wireInputs(table, "input[data-index]", (event) => {
      parameter.values[Number(event.target.dataset.index)] = event.target.value;
      renderAll();
    });
    els.editorSlot.appendChild(table);
    appendMetadata(parameter);
    return;
  }

  if (parameter.kind === "curve") {
    const table = document.createElement("table");
    table.className = "editor-table";
    table.innerHTML = `
      <thead><tr><th>Index</th><th>X</th><th>Value</th><th>Previous</th></tr></thead>
      <tbody>
        ${parameter.values
          .map((value, index) => {
            const changed = value !== original.values[index] || parameter.x_axis[index] !== original.x_axis[index] ? "changed-cell" : "";
            return `
              <tr class="${changed}">
                <td>${index}</td>
                <td><input data-axis="${index}" type="text" value="${escapeHtml(parameter.x_axis[index])}" /></td>
                <td><input data-value="${index}" type="text" value="${escapeHtml(value)}" /></td>
                <td>${escapeHtml(`${original.x_axis[index]} -> ${original.values[index]}`)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    `;
    wireInputs(table, "input[data-axis]", (event) => {
      parameter.x_axis[Number(event.target.dataset.axis)] = event.target.value;
      renderAll();
    });
    wireInputs(table, "input[data-value]", (event) => {
      parameter.values[Number(event.target.dataset.value)] = event.target.value;
      renderAll();
    });
    els.editorSlot.appendChild(table);
    appendMetadata(parameter);
    return;
  }

  if (parameter.kind === "map") {
    const table = document.createElement("table");
    table.className = "editor-table";
    const header = parameter.x_axis
      .map((axisValue, columnIndex) => `<th><input data-x="${columnIndex}" type="text" value="${escapeHtml(axisValue)}" /></th>`)
      .join("");
    const rows = parameter.map_values
      .map((row, rowIndex) => {
        const cells = row
          .map((value, columnIndex) => {
            const changed =
              value !== original.map_values[rowIndex][columnIndex] ||
              parameter.x_axis[columnIndex] !== original.x_axis[columnIndex] ||
              parameter.y_axis[rowIndex] !== original.y_axis[rowIndex]
                ? "changed-cell"
                : "";
            return `<td class="${changed}"><input data-row="${rowIndex}" data-column="${columnIndex}" type="text" value="${escapeHtml(value)}" /></td>`;
          })
          .join("");
        return `<tr><th><input data-y="${rowIndex}" type="text" value="${escapeHtml(parameter.y_axis[rowIndex])}" /></th>${cells}</tr>`;
      })
      .join("");
    table.innerHTML = `<thead><tr><th>Y \\ X</th>${header}</tr></thead><tbody>${rows}</tbody>`;
    wireInputs(table, "input[data-x]", (event) => {
      parameter.x_axis[Number(event.target.dataset.x)] = event.target.value;
      renderAll();
    });
    wireInputs(table, "input[data-y]", (event) => {
      parameter.y_axis[Number(event.target.dataset.y)] = event.target.value;
      renderAll();
    });
    wireInputs(table, "input[data-row]", (event) => {
      const row = Number(event.target.dataset.row);
      const column = Number(event.target.dataset.column);
      parameter.map_values[row][column] = event.target.value;
      renderAll();
    });
    els.editorSlot.appendChild(table);
    appendMetadata(parameter);
  }
}

function renderVisualization(parameter, original) {
  els.visualSlot.innerHTML = "";
  els.visualHint.textContent = "";

  if (parameter.kind === "scalar") {
    els.visualHint.textContent = "Single calibration value";
    els.visualSlot.innerHTML = `
      <div class="compare-grid">
        <div class="compare-pill">Previous: ${escapeHtml(original.value)}</div>
        <div class="compare-pill">Current: ${escapeHtml(parameter.value)}</div>
      </div>
    `;
    return;
  }

  if (parameter.kind === "list" || parameter.kind === "curve") {
    const xValues = parameter.kind === "curve" ? parameter.x_axis : parameter.values.map((_, index) => String(index));
    const yValues = parameter.values;
    const chartMarkup = renderLineChart(xValues, yValues);
    els.visualHint.textContent = parameter.kind === "curve" ? "X-axis vs value curve" : "Index vs value trend";
    els.visualSlot.innerHTML = `
      <div class="viz-wrapper">
        ${chartMarkup}
      </div>
    `;
    return;
  }

  if (parameter.kind === "map") {
    els.visualHint.textContent = "Heatmap generated from current cell values";
    els.visualSlot.appendChild(renderHeatmap(parameter));
  }
}

function renderComparison(parameter, original) {
  const diff = diffParameter(parameter, original);
  els.compareSummary.textContent = diff.changed ? diff.notes.join(" · ") : "No changes";
  els.compareSlot.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "compare-grid";
  summary.innerHTML = `
    <div class="compare-pill">Previous snapshot preserved from file load</div>
    <div class="compare-pill">Changed items: ${diff.changedCells}</div>
  `;
  els.compareSlot.appendChild(summary);

  if (parameter.kind === "scalar") {
    const table = document.createElement("table");
    table.className = "compare-table";
    table.innerHTML = `
      <thead><tr><th>Field</th><th>Previous</th><th>Current</th></tr></thead>
      <tbody><tr class="${parameter.value !== original.value ? "changed-cell" : ""}"><td>Value</td><td>${escapeHtml(original.value)}</td><td>${escapeHtml(parameter.value)}</td></tr></tbody>
    `;
    els.compareSlot.appendChild(table);
    return;
  }

  if (parameter.kind === "list") {
    const table = document.createElement("table");
    table.className = "compare-table";
    table.innerHTML = `
      <thead><tr><th>Index</th><th>Previous</th><th>Current</th><th>Changed</th></tr></thead>
      <tbody>
        ${parameter.values
          .map((value, index) => `
            <tr class="${value !== original.values[index] ? "changed-cell" : ""}">
              <td>${index}</td>
              <td>${escapeHtml(original.values[index])}</td>
              <td>${escapeHtml(value)}</td>
              <td class="delta-cell">${value !== original.values[index] ? "Yes" : "No"}</td>
            </tr>`)
          .join("")}
      </tbody>
    `;
    els.compareSlot.appendChild(table);
    return;
  }

  if (parameter.kind === "curve") {
    const table = document.createElement("table");
    table.className = "compare-table";
    table.innerHTML = `
      <thead><tr><th>Index</th><th>Previous</th><th>Current</th></tr></thead>
      <tbody>
        ${parameter.values
          .map((value, index) => {
            const previous = `${original.x_axis[index]} -> ${original.values[index]}`;
            const current = `${parameter.x_axis[index]} -> ${value}`;
            const changed = previous !== current ? "changed-cell" : "";
            return `<tr class="${changed}"><td>${index}</td><td>${escapeHtml(previous)}</td><td>${escapeHtml(current)}</td></tr>`;
          })
          .join("")}
      </tbody>
    `;
    els.compareSlot.appendChild(table);
    return;
  }

  if (parameter.kind === "map") {
    const table = document.createElement("table");
    table.className = "compare-table";
    const head = parameter.x_axis.map((value, columnIndex) => {
      const changed = value !== original.x_axis[columnIndex] ? "changed-cell" : "";
      return `<th class="${changed}">${escapeHtml(`${original.x_axis[columnIndex]} -> ${value}`)}</th>`;
    }).join("");
    const body = parameter.map_values.map((row, rowIndex) => {
      const yChanged = parameter.y_axis[rowIndex] !== original.y_axis[rowIndex] ? "changed-cell" : "";
      const cells = row.map((value, columnIndex) => {
        const previous = original.map_values[rowIndex][columnIndex];
        const changed = value !== previous ? "changed-cell" : "";
        return `<td class="${changed}">${escapeHtml(`${previous} -> ${value}`)}</td>`;
      }).join("");
      return `<tr><th class="${yChanged}">${escapeHtml(`${original.y_axis[rowIndex]} -> ${parameter.y_axis[rowIndex]}`)}</th>${cells}</tr>`;
    }).join("");
    table.innerHTML = `<thead><tr><th>Y \\ X</th>${head}</tr></thead><tbody>${body}</tbody>`;
    els.compareSlot.appendChild(table);
  }
}

function renderHeatmap(parameter) {
  const numericRows = parameter.map_values.map((row) => row.map((value) => Number(value)));
  if (numericRows.some((row) => row.some(Number.isNaN))) {
    const fallback = document.createElement("p");
    fallback.className = "muted";
    fallback.textContent = "Heatmap is available only when every cell is numeric.";
    return fallback;
  }

  const flat = numericRows.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const range = max - min || 1;

  const wrapper = document.createElement("div");
  wrapper.className = "heatmap";
  wrapper.style.gridTemplateColumns = "1fr";

  numericRows.forEach((row, rowIndex) => {
    const rowElement = document.createElement("div");
    rowElement.className = "heatmap-row";
    rowElement.style.gridTemplateColumns = `120px repeat(${row.length}, minmax(0, 1fr))`;

    const label = document.createElement("div");
    label.className = "compare-pill";
    label.textContent = `Y ${parameter.y_axis[rowIndex]}`;
    rowElement.appendChild(label);

    row.forEach((value) => {
      const ratio = (value - min) / range;
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      cell.style.background = `hsl(${24 + ratio * 120}, 58%, ${34 + ratio * 18}%)`;
      cell.textContent = String(value);
      rowElement.appendChild(cell);
    });

    wrapper.appendChild(rowElement);
  });
  return wrapper;
}

function renderLineChart(labels, values) {
  const numericValues = values.map((value) => Number(value));
  if (numericValues.some(Number.isNaN)) {
    return '<p class="muted">Chart is available only when every value is numeric.</p>';
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;
  const points = numericValues.map((value, index) => {
    const x = (index / Math.max(numericValues.length - 1, 1)) * 100;
    const y = 90 - ((value - min) / range) * 70;
    return `${x},${y}`;
  }).join(" ");

  const dots = numericValues.map((value, index) => {
    const x = (index / Math.max(numericValues.length - 1, 1)) * 100;
    const y = 90 - ((value - min) / range) * 70;
    return `<circle cx="${x}" cy="${y}" r="2.8" fill="#9c4f24"></circle><text x="${x}" y="${y - 6}" text-anchor="middle" font-size="3" fill="#756251">${escapeHtml(labels[index])}</text>`;
  }).join("");

  return `
    <svg class="line-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x="0" y="0" width="100" height="100" fill="transparent"></rect>
      <line x1="5" y1="90" x2="95" y2="90" stroke="rgba(117, 98, 81, 0.4)" stroke-width="0.6"></line>
      <line x1="5" y1="15" x2="5" y2="90" stroke="rgba(117, 98, 81, 0.4)" stroke-width="0.6"></line>
      <polyline fill="none" stroke="#9c4f24" stroke-width="1.4" points="${points}"></polyline>
      ${dots}
    </svg>
  `;
}

function appendMetadata(parameter) {
  if (!parameter.metadata.length) {
    return;
  }
  const box = document.createElement("div");
  box.className = "metadata";
  box.textContent = parameter.metadata.join("\n");
  els.editorSlot.appendChild(box);
}

function renderMetadata(parameter) {
  return parameter.metadata.length
    ? `<div class="metadata">${escapeHtml(parameter.metadata.join("\n"))}</div>`
    : "";
}

function wireInputs(root, selector, handler, eventName = "change") {
  root.querySelectorAll(selector).forEach((input) => input.addEventListener(eventName, handler));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function collectParameters() {
  return parameterNames().map((name) => state.current.get(name));
}

async function loadFiles() {
  try {
    const data = await api("/api/files");
    state.files = data.files || [];
    renderFiles();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function loadSamplePath() {
  const data = await api("/api/sample");
  els.filePath.value = data.path;
}

async function loadDocument(path) {
  const targetPath = path || els.filePath.value.trim();
  if (!targetPath) {
    showStatus("Provide a DCM file path first.", "error");
    return;
  }

  try {
    clearStatus();
    const payload = await api("/api/load", {
      method: "POST",
      body: JSON.stringify({ path: targetPath }),
    });
    setDocument(payload);
    showStatus(`Loaded ${payload.parameters.length} parameters from ${payload.path}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function saveDocument() {
  if (!state.filePath || !parameterNames().length) {
    showStatus("Load a DCM file before saving.", "error");
    return;
  }

  try {
    const payload = await api("/api/save", {
      method: "POST",
      body: JSON.stringify({
        path: state.filePath,
        source_hash: state.sourceHash,
        parameters: collectParameters(),
      }),
    });
    state.sourceHash = payload.source_hash;
    state.original = new Map(parameterNames().map((name) => [name, deepClone(state.current.get(name))]));
    renderAll();
    showStatus(`Saved ${payload.path}. Backup: ${payload.backup_path}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
}

function resetSelectedParameter() {
  if (!state.selectedName) {
    return;
  }
  state.current.set(state.selectedName, deepClone(state.original.get(state.selectedName)));
  renderAll();
  showStatus(`Reset ${state.selectedName} to the loaded snapshot.`, "info");
}

els.refreshFiles.addEventListener("click", loadFiles);
els.sampleFile.addEventListener("click", loadSamplePath);
els.loadFile.addEventListener("click", () => loadDocument());
els.saveFile.addEventListener("click", saveDocument);
els.resetParameter.addEventListener("click", resetSelectedParameter);
els.parameterSearch.addEventListener("input", renderParameterList);

loadFiles();
loadSamplePath();
