const MAX_HISTORY = 100;
const SIDEBAR_WIDTH_KEY = "dcm-editor-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 290;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 520;
const DETAIL_VISUAL_WIDTH_KEY = "dcm-editor-detail-visual-width";
const DEFAULT_DETAIL_VISUAL_WIDTH = 360;
const MIN_DETAIL_VISUAL_WIDTH = 260;
const MAX_DETAIL_VISUAL_WIDTH = 760;
const DETAIL_PANE_HEIGHT_KEY = "dcm-editor-detail-pane-height";
const DEFAULT_DETAIL_PANE_HEIGHT = 560;
const MIN_DETAIL_PANE_HEIGHT = 320;
const MAX_DETAIL_PANE_HEIGHT = 1100;

const state = {
  filePath: "",
  sourceMode: "filesystem",
  sourceText: "",
  sourceHash: "",
  files: [],
  original: new Map(),
  current: new Map(),
  selectedName: null,
  documentIssues: [],
  comparePath: "",
  compareBaseline: new Map(),
  compareIssues: [],
  undoStack: [],
  redoStack: [],
  surfaceView: {
    yaw: -0.8,
    pitch: 1.02,
    zoom: 1,
  },
};

const els = {
  filePath: document.querySelector("#file-path"),
  sidebarResizer: document.querySelector("#sidebar-resizer"),
  detailResizer: document.querySelector("#detail-resizer"),
  detailHeightResizer: document.querySelector("#detail-height-resizer"),
  dcmFileInput: document.querySelector("#dcm-file-input"),
  pickDcmFile: document.querySelector("#pick-dcm-file"),
  comparePath: document.querySelector("#compare-path"),
  fileList: document.querySelector("#file-list"),
  parameterList: document.querySelector("#parameter-list"),
  parameterSearch: document.querySelector("#parameter-search"),
  parameterCount: document.querySelector("#parameter-count"),
  summaryFile: document.querySelector("#summary-file"),
  summaryTotal: document.querySelector("#summary-total"),
  summaryChanged: document.querySelector("#summary-changed"),
  summarySelection: document.querySelector("#summary-selection"),
  summaryCompare: document.querySelector("#summary-compare"),
  summaryDirty: document.querySelector("#summary-dirty"),
  status: document.querySelector("#status"),
  issuesPanel: document.querySelector("#issues-panel"),
  issuesCount: document.querySelector("#issues-count"),
  issuesList: document.querySelector("#issues-list"),
  compareOverview: document.querySelector("#compare-overview"),
  compareOverviewPath: document.querySelector("#compare-overview-path"),
  compareOverviewBody: document.querySelector("#compare-overview-body"),
  emptyState: document.querySelector("#empty-state"),
  detailView: document.querySelector("#detail-view"),
  main: document.querySelector(".main"),
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
  saveAsFile: document.querySelector("#save-as-file"),
  saveFile: document.querySelector("#save-file"),
  sampleFile: document.querySelector("#sample-file"),
  addParameter: document.querySelector("#add-parameter"),
  deleteParameter: document.querySelector("#delete-parameter"),
  compareFile: document.querySelector("#compare-file"),
  clearCompare: document.querySelector("#clear-compare"),
  csvFileInput: document.querySelector("#csv-file-input"),
  importCsv: document.querySelector("#import-csv"),
  exportCsv: document.querySelector("#export-csv"),
  exportChangedCsv: document.querySelector("#export-changed-csv"),
  exportDiffReport: document.querySelector("#export-diff-report"),
  undoChange: document.querySelector("#undo-change"),
  redoChange: document.querySelector("#redo-change"),
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

function clampSidebarWidth(width) {
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width));
}

function clampDetailVisualWidth(width) {
  return Math.max(MIN_DETAIL_VISUAL_WIDTH, Math.min(MAX_DETAIL_VISUAL_WIDTH, width));
}

function clampDetailPaneHeight(height) {
  return Math.max(MIN_DETAIL_PANE_HEIGHT, Math.min(MAX_DETAIL_PANE_HEIGHT, height));
}

function applySidebarWidth(width, persist = true) {
  const normalizedWidth = clampSidebarWidth(width);
  document.documentElement.style.setProperty("--sidebar-width", `${normalizedWidth}px`);
  if (persist) {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(normalizedWidth));
  }
}

function applyDetailVisualWidth(width, persist = true) {
  const normalizedWidth = clampDetailVisualWidth(width);
  document.documentElement.style.setProperty("--detail-visual-width", `${normalizedWidth}px`);
  if (persist) {
    window.localStorage.setItem(DETAIL_VISUAL_WIDTH_KEY, String(normalizedWidth));
  }
}

function applyDetailPaneHeight(height, persist = true) {
  const normalizedHeight = clampDetailPaneHeight(height);
  document.documentElement.style.setProperty("--detail-pane-height", `${normalizedHeight}px`);
  if (persist) {
    window.localStorage.setItem(DETAIL_PANE_HEIGHT_KEY, String(normalizedHeight));
  }
}

function initializeSidebarWidth() {
  const storedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (Number.isFinite(storedWidth)) {
    applySidebarWidth(storedWidth, false);
    return;
  }
  applySidebarWidth(DEFAULT_SIDEBAR_WIDTH, false);
}

function initializeDetailVisualWidth() {
  const storedWidth = Number(window.localStorage.getItem(DETAIL_VISUAL_WIDTH_KEY));
  if (Number.isFinite(storedWidth)) {
    applyDetailVisualWidth(storedWidth, false);
    return;
  }
  applyDetailVisualWidth(DEFAULT_DETAIL_VISUAL_WIDTH, false);
}

function initializeDetailPaneHeight() {
  const storedHeight = Number(window.localStorage.getItem(DETAIL_PANE_HEIGHT_KEY));
  if (Number.isFinite(storedHeight)) {
    applyDetailPaneHeight(storedHeight, false);
    return;
  }
  applyDetailPaneHeight(DEFAULT_DETAIL_PANE_HEIGHT, false);
}

function setupSidebarResizer() {
  if (!els.sidebarResizer) {
    return;
  }

  const startResize = (startX) => {
    const startWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"))
      || DEFAULT_SIDEBAR_WIDTH;

    const handleMove = (clientX) => {
      const nextWidth = startWidth + (clientX - startX);
      applySidebarWidth(nextWidth, false);
    };

    const onPointerMove = (event) => {
      handleMove(event.clientX);
    };

    const stopResize = () => {
      document.body.classList.remove("is-resizing");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      const width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"));
      applySidebarWidth(width, true);
    };

    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

  els.sidebarResizer.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 1100px)").matches) {
      return;
    }
    event.preventDefault();
    els.sidebarResizer.setPointerCapture?.(event.pointerId);
    startResize(event.clientX);
  });

  els.sidebarResizer.addEventListener("keydown", (event) => {
    const currentWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"))
      || DEFAULT_SIDEBAR_WIDTH;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applySidebarWidth(currentWidth - 20, true);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      applySidebarWidth(currentWidth + 20, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      applySidebarWidth(MIN_SIDEBAR_WIDTH, true);
    } else if (event.key === "End") {
      event.preventDefault();
      applySidebarWidth(MAX_SIDEBAR_WIDTH, true);
    }
  });

  els.sidebarResizer.addEventListener("dblclick", () => {
    applySidebarWidth(DEFAULT_SIDEBAR_WIDTH, true);
  });
}

function setupDetailResizer() {
  if (!els.detailResizer) {
    return;
  }

  const startResize = (startX) => {
    const startWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--detail-visual-width"))
      || DEFAULT_DETAIL_VISUAL_WIDTH;

    const handleMove = (clientX) => {
      const nextWidth = startWidth - (clientX - startX);
      applyDetailVisualWidth(nextWidth, false);
    };

    const onPointerMove = (event) => {
      handleMove(event.clientX);
    };

    const stopResize = () => {
      document.body.classList.remove("is-detail-resizing");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      const width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--detail-visual-width"));
      applyDetailVisualWidth(width, true);
    };

    document.body.classList.add("is-detail-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

  els.detailResizer.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 1100px)").matches) {
      return;
    }
    event.preventDefault();
    els.detailResizer.setPointerCapture?.(event.pointerId);
    startResize(event.clientX);
  });

  els.detailResizer.addEventListener("keydown", (event) => {
    const currentWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--detail-visual-width"))
      || DEFAULT_DETAIL_VISUAL_WIDTH;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applyDetailVisualWidth(currentWidth + 20, true);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      applyDetailVisualWidth(currentWidth - 20, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      applyDetailVisualWidth(MIN_DETAIL_VISUAL_WIDTH, true);
    } else if (event.key === "End") {
      event.preventDefault();
      applyDetailVisualWidth(MAX_DETAIL_VISUAL_WIDTH, true);
    }
  });

  els.detailResizer.addEventListener("dblclick", () => {
    applyDetailVisualWidth(DEFAULT_DETAIL_VISUAL_WIDTH, true);
  });
}

function setupDetailHeightResizer() {
  if (!els.detailHeightResizer) {
    return;
  }

  const startResize = (startY) => {
    const startHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--detail-pane-height"))
      || DEFAULT_DETAIL_PANE_HEIGHT;

    const handleMove = (clientY) => {
      const nextHeight = startHeight + (clientY - startY);
      applyDetailPaneHeight(nextHeight, false);
    };

    const onPointerMove = (event) => {
      handleMove(event.clientY);
    };

    const stopResize = () => {
      document.body.classList.remove("is-detail-height-resizing");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      const height = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--detail-pane-height"));
      applyDetailPaneHeight(height, true);
    };

    document.body.classList.add("is-detail-height-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

  els.detailHeightResizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    els.detailHeightResizer.setPointerCapture?.(event.pointerId);
    startResize(event.clientY);
  });

  els.detailHeightResizer.addEventListener("keydown", (event) => {
    const currentHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--detail-pane-height"))
      || DEFAULT_DETAIL_PANE_HEIGHT;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      applyDetailPaneHeight(currentHeight - 24, true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      applyDetailPaneHeight(currentHeight + 24, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      applyDetailPaneHeight(MIN_DETAIL_PANE_HEIGHT, true);
    } else if (event.key === "End") {
      event.preventDefault();
      applyDetailPaneHeight(MAX_DETAIL_PANE_HEIGHT, true);
    }
  });

  els.detailHeightResizer.addEventListener("dblclick", () => {
    applyDetailPaneHeight(DEFAULT_DETAIL_PANE_HEIGHT, true);
  });
}

function parameterNames(map = state.current) {
  return [...map.keys()];
}

function collectParameters(map = state.current) {
  return parameterNames(map).map((name) => deepClone(map.get(name)));
}

function snapshotState() {
  return {
    parameters: collectParameters(),
    selectedName: state.selectedName,
  };
}

function restoreSnapshot(snapshot) {
  state.current = new Map(snapshot.parameters.map((parameter) => [parameter.name, deepClone(parameter)]));
  state.selectedName = snapshot.selectedName && state.current.has(snapshot.selectedName)
    ? snapshot.selectedName
    : snapshot.parameters[0]?.name || null;
}

function pushUndoSnapshot(snapshot) {
  state.undoStack.push(deepClone(snapshot));
  if (state.undoStack.length > MAX_HISTORY) {
    state.undoStack.shift();
  }
}

function snapshotEquals(left, right) {
  return JSON.stringify(left.parameters) === JSON.stringify(right.parameters)
    && left.selectedName === right.selectedName;
}

function commitChange(mutator, statusMessage = "") {
  const before = snapshotState();
  mutator();
  const after = snapshotState();
  if (snapshotEquals(before, after)) {
    return;
  }
  pushUndoSnapshot(before);
  state.redoStack = [];
  renderAll();
  if (statusMessage) {
    showStatus(statusMessage, "info");
  }
}

function applyHistorySnapshot(snapshot, origin) {
  const currentSnapshot = snapshotState();
  restoreSnapshot(snapshot);
  if (origin === "undo") {
    state.redoStack.push(deepClone(currentSnapshot));
  } else {
    pushUndoSnapshot(currentSnapshot);
  }
  renderAll();
}

function baselineLabel() {
  return state.comparePath || "Loaded snapshot";
}

function displayFileLabel() {
  if (!state.filePath) {
    return "None";
  }
  return state.sourceMode === "upload" ? `${state.filePath} (chosen in browser)` : state.filePath;
}

function isDirty() {
  return changedParameterCount() > 0;
}

function isNumericLike(value) {
  const normalized = String(value).trim();
  if (!normalized) {
    return false;
  }
  return Number.isFinite(Number(normalized));
}

function countMetadataChanges(current, baseline) {
  const currentMetadata = current.metadata || [];
  const baselineMetadata = baseline.metadata || [];
  const length = Math.max(currentMetadata.length, baselineMetadata.length);
  let changed = 0;
  for (let index = 0; index < length; index += 1) {
    const currentItem = currentMetadata[index];
    const baselineItem = baselineMetadata[index];
    if (!currentItem || !baselineItem) {
      changed += 1;
      continue;
    }
    if (currentItem.key !== baselineItem.key || currentItem.value !== baselineItem.value) {
      changed += 1;
    }
  }
  return changed;
}

function diffParameter(current, original) {
  const result = { changed: false, changedCells: 0, notes: [] };
  if (!current && original) {
    return { changed: true, changedCells: 1, notes: ["Parameter deleted"] };
  }
  if (current && !original) {
    return { changed: true, changedCells: 1, notes: ["Parameter added"] };
  }
  if (!current || !original) {
    return result;
  }

  if (current.kind !== original.kind) {
    return { changed: true, changedCells: 1, notes: ["Parameter kind changed"] };
  }

  const dataChangedCellsBeforeMetadata = () => result.changedCells - countMetadataChanges(current, original);

  if (current.kind === "scalar") {
    result.changed = current.value !== original.value;
    result.changedCells = result.changed ? 1 : 0;
  } else if (current.kind === "list") {
    current.values.forEach((value, index) => {
      if (value !== original.values[index]) {
        result.changed = true;
        result.changedCells += 1;
      }
    });
  } else if (current.kind === "axis") {
    current.x_axis.forEach((value, index) => {
      if (value !== original.x_axis[index]) {
        result.changed = true;
        result.changedCells += 1;
      }
    });
  } else if (current.kind === "curve") {
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
  } else if (current.kind === "map") {
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
  }

  const metadataChanges = countMetadataChanges(current, original);
  if (metadataChanges) {
    result.changed = true;
    result.changedCells += metadataChanges;
  }

  if (result.changed) {
    const dataChangedCells = dataChangedCellsBeforeMetadata();
    if (current.kind === "scalar" && dataChangedCells > 0) {
      result.notes.push("Value changed");
    } else if (current.kind === "list" && dataChangedCells > 0) {
      result.notes.push(`${dataChangedCells} value item(s) changed`);
    } else if (current.kind === "axis" && dataChangedCells > 0) {
      result.notes.push(`${dataChangedCells} axis item(s) changed`);
    } else if (current.kind === "curve" && dataChangedCells > 0) {
      result.notes.push(`${dataChangedCells} axis/value item(s) changed`);
    } else if (current.kind === "map" && dataChangedCells > 0) {
      result.notes.push(`${dataChangedCells} axis/cell item(s) changed`);
    }
    if (metadataChanges) {
      result.notes.push(`${metadataChanges} metadata field(s) changed`);
    }
  }

  return result;
}

function changedParameterCount() {
  const names = new Set([...parameterNames(state.current), ...parameterNames(state.original)]);
  return [...names].filter((name) => diffParameter(state.current.get(name), state.original.get(name)).changed).length;
}

function collectValidationIssues() {
  const issues = [...state.documentIssues];
  for (const name of parameterNames()) {
    const current = state.current.get(name);
    const original = state.original.get(name);
    if (!current || !original) {
      continue;
    }

    if (current.kind === "scalar" && isNumericLike(original.value) && !isNumericLike(current.value)) {
      issues.push({ parameter: name, message: "Value must stay numeric" });
    }

    if (current.kind === "list") {
      current.values.forEach((value, index) => {
        if (isNumericLike(original.values[index]) && !isNumericLike(value)) {
          issues.push({ parameter: name, message: `values[${index}] must stay numeric` });
        }
      });
    }

    if (current.kind === "axis") {
      current.x_axis.forEach((value, index) => {
        if (isNumericLike(original.x_axis[index]) && !isNumericLike(value)) {
          issues.push({ parameter: name, message: `x_axis[${index}] must stay numeric` });
        }
      });
    }

    if (current.kind === "curve") {
      if (current.values.length !== current.x_axis.length) {
        issues.push({ parameter: name, message: "ST/X and WERT lengths do not match" });
      }
      current.x_axis.forEach((value, index) => {
        if (isNumericLike(original.x_axis[index]) && !isNumericLike(value)) {
          issues.push({ parameter: name, message: `x_axis[${index}] must stay numeric` });
        }
      });
      current.values.forEach((value, index) => {
        if (isNumericLike(original.values[index]) && !isNumericLike(value)) {
          issues.push({ parameter: name, message: `values[${index}] must stay numeric` });
        }
      });
    }

    if (current.kind === "map") {
      if (current.map_values.length !== current.y_axis.length) {
        issues.push({ parameter: name, message: "ST/Y length and map row count do not match" });
      }
      current.x_axis.forEach((value, index) => {
        if (isNumericLike(original.x_axis[index]) && !isNumericLike(value)) {
          issues.push({ parameter: name, message: `x_axis[${index}] must stay numeric` });
        }
      });
      current.y_axis.forEach((value, index) => {
        if (isNumericLike(original.y_axis[index]) && !isNumericLike(value)) {
          issues.push({ parameter: name, message: `y_axis[${index}] must stay numeric` });
        }
      });
      current.map_values.forEach((row, rowIndex) => {
        if (row.length !== current.x_axis.length) {
          issues.push({ parameter: name, message: `row ${rowIndex} length does not match ST/X length` });
        }
        row.forEach((value, columnIndex) => {
          if (isNumericLike(original.map_values[rowIndex][columnIndex]) && !isNumericLike(value)) {
            issues.push({ parameter: name, message: `map_values[${rowIndex}][${columnIndex}] must stay numeric` });
          }
        });
      });
    }
  }
  return issues;
}

function computeCompareOverview() {
  if (!state.comparePath || !state.compareBaseline.size) {
    return null;
  }

  const names = new Set([...parameterNames(), ...parameterNames(state.compareBaseline)]);
  const rows = [];
  const summary = { changed: 0, added: 0, removed: 0, unchanged: 0 };

  [...names].sort().forEach((name) => {
    const current = state.current.get(name);
    const baseline = state.compareBaseline.get(name);

    if (!baseline) {
      summary.added += 1;
      rows.push({ name, status: "missing_in_compare", note: "Only in current file" });
      return;
    }

    if (!current) {
      summary.removed += 1;
      rows.push({ name, status: "missing_in_current", note: "Missing from current file" });
      return;
    }

    if (current.kind !== baseline.kind) {
      summary.changed += 1;
      rows.push({ name, status: "kind_changed", note: `${baseline.kind} -> ${current.kind}` });
      return;
    }

    const diff = diffParameter(current, baseline);
    if (diff.changed) {
      summary.changed += 1;
      rows.push({ name, status: "changed", note: diff.notes.join(" · ") || `${diff.changedCells} item(s) changed` });
      return;
    }

    summary.unchanged += 1;
    rows.push({ name, status: "unchanged", note: "No changes" });
  });

  return { summary, rows };
}

function activeCompareBaseline(name) {
  if (state.comparePath && state.compareBaseline.has(name)) {
    return state.compareBaseline.get(name);
  }
  return state.original.get(name);
}

function setDocument(payload) {
  state.filePath = payload.path;
  state.sourceMode = payload.source_mode || "filesystem";
  state.sourceHash = payload.source_hash;
  state.original = new Map(payload.parameters.map((parameter) => [parameter.name, deepClone(parameter)]));
  state.current = new Map(payload.parameters.map((parameter) => [parameter.name, deepClone(parameter)]));
  state.selectedName = payload.parameters[0]?.name || null;
  state.documentIssues = payload.validation_issues || [];
  state.undoStack = [];
  state.redoStack = [];
  clearCompare();
  els.filePath.value = payload.path;
  renderAll();
}

function setDocumentFromUpload(payload, sourceText) {
  state.sourceText = sourceText;
  setDocument(payload);
}

function clearCompare(render = false) {
  state.comparePath = "";
  state.compareBaseline = new Map();
  state.compareIssues = [];
  els.comparePath.value = "";
  if (render) {
    renderAll();
  }
}

function renderAll() {
  renderFiles();
  renderParameterList();
  renderSummary();
  renderIssues();
  renderCompareOverview();
  renderDetail();
  renderButtons();
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
  const previousScrollTop = els.parameterList.scrollTop;
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
    button.dataset.name = name;
    if (state.selectedName === name) {
      button.classList.add("active");
    }
    if (diff.changed) {
      button.classList.add("changed");
    }
    button.innerHTML = `<strong>${name}</strong>`;
    button.addEventListener("click", () => {
      state.selectedName = name;
      updateParameterSelection();
      renderSummary();
      renderDetail();
      renderButtons();
      revealDetailInMainPane();
    });
    els.parameterList.appendChild(button);
  });
  els.parameterList.scrollTop = previousScrollTop;
}

function revealDetailInMainPane() {
  if (!els.main || !els.detailView || els.detailView.classList.contains("hidden")) {
    return;
  }
  requestAnimationFrame(() => {
    const parameterListScrollTop = els.parameterList.scrollTop;
    const target = els.detailView.querySelector(".detail-grid") || els.detailView;
    const mainRect = els.main.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = targetRect.top - mainRect.top + els.main.scrollTop - 8;
    els.main.scrollTop = Math.max(0, top);
    els.parameterList.scrollTop = parameterListScrollTop;
  });
}

function updateParameterSelection() {
  els.parameterList.querySelectorAll(".parameter-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.name === state.selectedName);
  });
}

function renderSummary() {
  els.summaryFile.textContent = displayFileLabel();
  els.summaryTotal.textContent = String(parameterNames().length);
  els.summaryChanged.textContent = String(changedParameterCount());
  els.summarySelection.textContent = state.selectedName || "None";
  els.summaryCompare.textContent = baselineLabel();
  els.summaryDirty.textContent = isDirty() ? "Unsaved changes" : "Clean";
}

function renderIssues() {
  const issues = collectValidationIssues();
  els.issuesCount.textContent = String(issues.length);
  if (!issues.length) {
    els.issuesPanel.classList.add("hidden");
    els.issuesList.innerHTML = "";
    return;
  }

  els.issuesPanel.classList.remove("hidden");
  els.issuesList.innerHTML = "";
  issues.forEach((issue) => {
    const item = document.createElement("div");
    item.className = "issue-item";
    item.innerHTML = `<strong>${escapeHtml(issue.parameter)}</strong><span>${escapeHtml(issue.message)}</span>`;
    els.issuesList.appendChild(item);
  });
}

function renderCompareOverview() {
  const overview = computeCompareOverview();
  if (!overview) {
    els.compareOverview.classList.add("hidden");
    els.compareOverviewBody.innerHTML = "";
    els.compareOverviewPath.textContent = "";
    return;
  }

  els.compareOverview.classList.remove("hidden");
  els.compareOverviewPath.textContent = state.comparePath;
  const topRows = overview.rows.filter((row) => row.status !== "unchanged").slice(0, 15);
  const summaryCards = `
    <div class="compare-grid">
      <div class="compare-pill">Changed: ${overview.summary.changed}</div>
      <div class="compare-pill">Only in current: ${overview.summary.added}</div>
      <div class="compare-pill">Only in compare: ${overview.summary.removed}</div>
      <div class="compare-pill">Unchanged: ${overview.summary.unchanged}</div>
    </div>
  `;
  const listMarkup = topRows.length
    ? `<div class="compare-overview-list">${topRows
        .map((row) => `
          <div class="compare-overview-item">
            <div><strong>${escapeHtml(row.name)}</strong><br><span class="muted">${escapeHtml(row.note)}</span></div>
            <span class="compare-status">${escapeHtml(row.status.replaceAll("_", " "))}</span>
          </div>
        `)
        .join("")}</div>`
    : '<p class="muted">No parameter differences between the current editor state and the compare file.</p>';
  els.compareOverviewBody.innerHTML = `${summaryCards}${listMarkup}`;
}

function renderButtons() {
  const hasDocument = Boolean(state.filePath && (parameterNames().length || state.original.size));
  els.saveFile.disabled = !hasDocument;
  els.saveAsFile.disabled = !hasDocument;
  els.compareFile.disabled = !state.filePath || !parameterNames().length || !els.comparePath.value.trim();
  els.clearCompare.disabled = !state.comparePath;
  els.pickDcmFile.disabled = false;
  els.importCsv.disabled = !hasDocument;
  els.exportCsv.disabled = !hasDocument;
  els.exportChangedCsv.disabled = !hasDocument || changedParameterCount() === 0;
  els.exportDiffReport.disabled = !hasDocument;
  els.undoChange.disabled = state.undoStack.length === 0;
  els.redoChange.disabled = state.redoStack.length === 0;
  els.addParameter.disabled = !state.filePath;
  els.deleteParameter.disabled = !state.selectedName || !state.current.has(state.selectedName);
}

function renderDetail() {
  const parameter = state.current.get(state.selectedName);
  const storedOriginal = state.original.get(state.selectedName);
  const original = storedOriginal || createEmptyBaseline(parameter);
  if (!parameter) {
    els.emptyState.classList.remove("hidden");
    els.detailView.classList.add("hidden");
    return;
  }

  els.emptyState.classList.add("hidden");
  els.detailView.classList.remove("hidden");
  els.detailKind.textContent = parameter.keyword;
  els.detailName.textContent = parameter.name;
  els.lineRange.textContent = parameter.header_suffix
    ? `Lines ${parameter.line_range.start}-${parameter.line_range.end} · ${parameter.header_suffix}`
    : `Lines ${parameter.line_range.start}-${parameter.line_range.end}`;
  renderEditor(parameter, original);
  renderVisualization(parameter, storedOriginal || parameter);
  renderComparison(parameter);
}

function createEmptyBaseline(parameter) {
  if (!parameter) {
    return null;
  }
  const baseline = deepClone(parameter);
  baseline.metadata = (parameter.metadata || []).map((item) => ({ ...item, value: "" }));
  if (parameter.kind === "scalar") {
    baseline.value = "";
  }
  if (parameter.kind === "list") {
    baseline.values = parameter.values.map(() => "");
  }
  if (parameter.kind === "axis") {
    baseline.x_axis = parameter.x_axis.map(() => "");
  }
  if (parameter.kind === "curve") {
    baseline.x_axis = parameter.x_axis.map(() => "");
    baseline.values = parameter.values.map(() => "");
  }
  if (parameter.kind === "map") {
    baseline.x_axis = parameter.x_axis.map(() => "");
    baseline.y_axis = parameter.y_axis.map(() => "");
    baseline.map_values = parameter.map_values.map((row) => row.map(() => ""));
  }
  return baseline;
}

function renderEditor(parameter, original) {
  els.editorSlot.innerHTML = "";
  if (parameter.kind === "scalar") {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <label class="summary-label">Value</label>
      <input id="scalar-input" type="text" value="${escapeHtml(parameter.value)}" />
    `;
    els.editorSlot.appendChild(wrapper);
    wrapper.querySelector("#scalar-input").addEventListener("change", (event) => {
      commitChange(() => {
        state.current.get(parameter.name).value = event.target.value;
      }, `Updated ${parameter.name}`);
    });
    appendMetadataEditor(parameter, original);
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
      const index = Number(event.target.dataset.index);
      commitChange(() => {
        state.current.get(parameter.name).values[index] = event.target.value;
      }, `Updated ${parameter.name}[${index}]`);
    });
    els.editorSlot.appendChild(table);
    appendMetadataEditor(parameter, original);
    return;
  }

  if (parameter.kind === "axis") {
    const table = document.createElement("table");
    table.className = "editor-table";
    table.innerHTML = `
      <thead><tr><th>Index</th><th>Axis Value</th><th>Previous</th></tr></thead>
      <tbody>
        ${parameter.x_axis
          .map((value, index) => {
            const changed = value !== original.x_axis[index] ? "changed-cell" : "";
            return `
              <tr class="${changed}">
                <td>${index}</td>
                <td><input data-axis="${index}" type="text" value="${escapeHtml(value)}" /></td>
                <td>${escapeHtml(original.x_axis[index])}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    `;
    wireInputs(table, "input[data-axis]", (event) => {
      const index = Number(event.target.dataset.axis);
      commitChange(() => {
        state.current.get(parameter.name).x_axis[index] = event.target.value;
      }, `Updated ${parameter.name} axis ${index}`);
    });
    els.editorSlot.appendChild(table);
    appendMetadataEditor(parameter, original);
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
      const index = Number(event.target.dataset.axis);
      commitChange(() => {
        state.current.get(parameter.name).x_axis[index] = event.target.value;
      }, `Updated ${parameter.name} X-axis ${index}`);
    });
    wireInputs(table, "input[data-value]", (event) => {
      const index = Number(event.target.dataset.value);
      commitChange(() => {
        state.current.get(parameter.name).values[index] = event.target.value;
      }, `Updated ${parameter.name} value ${index}`);
    });
    els.editorSlot.appendChild(table);
    appendMetadataEditor(parameter, original);
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
      const index = Number(event.target.dataset.x);
      commitChange(() => {
        state.current.get(parameter.name).x_axis[index] = event.target.value;
      }, `Updated ${parameter.name} X-axis ${index}`);
    });
    wireInputs(table, "input[data-y]", (event) => {
      const index = Number(event.target.dataset.y);
      commitChange(() => {
        state.current.get(parameter.name).y_axis[index] = event.target.value;
      }, `Updated ${parameter.name} Y-axis ${index}`);
    });
    wireInputs(table, "input[data-row]", (event) => {
      const row = Number(event.target.dataset.row);
      const column = Number(event.target.dataset.column);
      commitChange(() => {
        state.current.get(parameter.name).map_values[row][column] = event.target.value;
      }, `Updated ${parameter.name}[${row},${column}]`);
    });
    els.editorSlot.appendChild(table);
    appendMetadataEditor(parameter, original);
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

  if (parameter.kind === "list" || parameter.kind === "axis" || parameter.kind === "curve") {
    const currentLabels = parameter.kind === "curve"
      ? parameter.x_axis
      : parameter.kind === "axis"
        ? parameter.x_axis.map((_, index) => String(index))
        : parameter.values.map((_, index) => String(index));
    const currentValues = parameter.kind === "axis" ? parameter.x_axis : parameter.values;
    const originalLabels = parameter.kind === "curve"
      ? original.x_axis
      : parameter.kind === "axis"
        ? original.x_axis.map((_, index) => String(index))
        : original.values.map((_, index) => String(index));
    const originalValues = parameter.kind === "axis" ? original.x_axis : original.values;
    const diff = diffParameter(parameter, original);
    const chartSeries = diff.changed
      ? [
          { name: "Original", labels: originalLabels, values: originalValues, color: "#5f744c", dash: "3 2" },
          { name: "Tuned", labels: currentLabels, values: currentValues, color: "#9c4f24" },
        ]
      : [
          { name: "Current", labels: currentLabels, values: currentValues, color: "#9c4f24" },
        ];
    const chartMarkup = renderLineChart(chartSeries);
    els.visualHint.textContent = parameter.kind === "curve"
      ? "Original and tuned X-axis vs value curves"
      : parameter.kind === "axis"
        ? diff.changed ? "Original and tuned axis index vs axis value trends" : "Axis index vs axis value trend"
        : diff.changed ? "Original and tuned index vs value trends" : "Index vs value trend";
    els.visualSlot.innerHTML = `<div class="viz-wrapper">${chartMarkup}</div>`;
    return;
  }

  if (parameter.kind === "map") {
    els.visualHint.textContent = "3D surface generated from current map values";
    els.visualSlot.appendChild(renderSurface3D(parameter));
  }
}

function renderComparison(parameter) {
  const baseline = activeCompareBaseline(parameter.name);
  const usingExternalBaseline = state.comparePath && state.compareBaseline.has(parameter.name);

  if (!baseline) {
    els.compareSummary.textContent = "Parameter does not exist in the selected compare baseline";
    els.compareSlot.innerHTML = '<p class="muted">No matching parameter exists in the selected compare file.</p>';
    return;
  }

  const diff = diffParameter(parameter, baseline);
  els.compareSummary.textContent = diff.changed ? diff.notes.join(" · ") : "No changes";
  els.compareSlot.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "compare-grid";
  summary.innerHTML = `
    <div class="compare-pill">Baseline: ${escapeHtml(usingExternalBaseline ? state.comparePath : "Loaded snapshot")}</div>
    <div class="compare-pill">Changed items: ${diff.changedCells}</div>
  `;
  els.compareSlot.appendChild(summary);

  if (parameter.kind === "scalar") {
    const table = document.createElement("table");
    table.className = "compare-table";
    table.innerHTML = `
      <thead><tr><th>Field</th><th>Baseline</th><th>Current</th></tr></thead>
      <tbody><tr class="${parameter.value !== baseline.value ? "changed-cell" : ""}"><td>Value</td><td>${escapeHtml(baseline.value)}</td><td>${escapeHtml(parameter.value)}</td></tr></tbody>
    `;
    els.compareSlot.appendChild(table);
    appendMetadataComparison(parameter, baseline);
    return;
  }

  if (parameter.kind === "list") {
    const table = document.createElement("table");
    table.className = "compare-table";
    table.innerHTML = `
      <thead><tr><th>Index</th><th>Baseline</th><th>Current</th><th>Changed</th></tr></thead>
      <tbody>
        ${parameter.values
          .map((value, index) => `
            <tr class="${value !== baseline.values[index] ? "changed-cell" : ""}">
              <td>${index}</td>
              <td>${escapeHtml(baseline.values[index])}</td>
              <td>${escapeHtml(value)}</td>
              <td class="delta-cell">${value !== baseline.values[index] ? "Yes" : "No"}</td>
            </tr>`)
          .join("")}
      </tbody>
    `;
    els.compareSlot.appendChild(table);
    appendMetadataComparison(parameter, baseline);
    return;
  }

  if (parameter.kind === "axis") {
    const table = document.createElement("table");
    table.className = "compare-table";
    table.innerHTML = `
      <thead><tr><th>Index</th><th>Baseline</th><th>Current</th><th>Changed</th></tr></thead>
      <tbody>
        ${parameter.x_axis
          .map((value, index) => `
            <tr class="${value !== baseline.x_axis[index] ? "changed-cell" : ""}">
              <td>${index}</td>
              <td>${escapeHtml(baseline.x_axis[index])}</td>
              <td>${escapeHtml(value)}</td>
              <td class="delta-cell">${value !== baseline.x_axis[index] ? "Yes" : "No"}</td>
            </tr>`)
          .join("")}
      </tbody>
    `;
    els.compareSlot.appendChild(table);
    appendMetadataComparison(parameter, baseline);
    return;
  }

  if (parameter.kind === "curve") {
    const table = document.createElement("table");
    table.className = "compare-table";
    table.innerHTML = `
      <thead><tr><th>Index</th><th>Baseline</th><th>Current</th></tr></thead>
      <tbody>
        ${parameter.values
          .map((value, index) => {
            const previous = `${baseline.x_axis[index]} -> ${baseline.values[index]}`;
            const current = `${parameter.x_axis[index]} -> ${value}`;
            const changed = previous !== current ? "changed-cell" : "";
            return `<tr class="${changed}"><td>${index}</td><td>${escapeHtml(previous)}</td><td>${escapeHtml(current)}</td></tr>`;
          })
          .join("")}
      </tbody>
    `;
    els.compareSlot.appendChild(table);
    appendMetadataComparison(parameter, baseline);
    return;
  }

  if (parameter.kind === "map") {
    const table = document.createElement("table");
    table.className = "compare-table";
    const head = parameter.x_axis.map((value, columnIndex) => {
      const changed = value !== baseline.x_axis[columnIndex] ? "changed-cell" : "";
      return `<th class="${changed}">${escapeHtml(`${baseline.x_axis[columnIndex]} -> ${value}`)}</th>`;
    }).join("");
    const body = parameter.map_values.map((row, rowIndex) => {
      const yChanged = parameter.y_axis[rowIndex] !== baseline.y_axis[rowIndex] ? "changed-cell" : "";
      const cells = row.map((value, columnIndex) => {
        const previous = baseline.map_values[rowIndex][columnIndex];
        const changed = value !== previous ? "changed-cell" : "";
        return `<td class="${changed}">${escapeHtml(`${previous} -> ${value}`)}</td>`;
      }).join("");
      return `<tr><th class="${yChanged}">${escapeHtml(`${baseline.y_axis[rowIndex]} -> ${parameter.y_axis[rowIndex]}`)}</th>${cells}</tr>`;
    }).join("");
    table.innerHTML = `<thead><tr><th>Y \\ X</th>${head}</tr></thead><tbody>${body}</tbody>`;
    els.compareSlot.appendChild(table);
    appendMetadataComparison(parameter, baseline);
  }
}

function syncSelectedEditorInputs() {
  const parameter = state.current.get(state.selectedName);
  if (!parameter) {
    return;
  }

  if (parameter.kind === "scalar") {
    const input = els.editorSlot.querySelector("#scalar-input");
    if (input) {
      parameter.value = input.value;
    }
  }

  if (parameter.kind === "list") {
    els.editorSlot.querySelectorAll("input[data-index]").forEach((input) => {
      parameter.values[Number(input.dataset.index)] = input.value;
    });
  }

  if (parameter.kind === "axis") {
    els.editorSlot.querySelectorAll("input[data-axis]").forEach((input) => {
      parameter.x_axis[Number(input.dataset.axis)] = input.value;
    });
  }

  if (parameter.kind === "curve") {
    els.editorSlot.querySelectorAll("input[data-axis]").forEach((input) => {
      parameter.x_axis[Number(input.dataset.axis)] = input.value;
    });
    els.editorSlot.querySelectorAll("input[data-value]").forEach((input) => {
      parameter.values[Number(input.dataset.value)] = input.value;
    });
  }

  if (parameter.kind === "map") {
    els.editorSlot.querySelectorAll("input[data-x]").forEach((input) => {
      parameter.x_axis[Number(input.dataset.x)] = input.value;
    });
    els.editorSlot.querySelectorAll("input[data-y]").forEach((input) => {
      parameter.y_axis[Number(input.dataset.y)] = input.value;
    });
    els.editorSlot.querySelectorAll("input[data-row]").forEach((input) => {
      parameter.map_values[Number(input.dataset.row)][Number(input.dataset.column)] = input.value;
    });
  }

  els.editorSlot.querySelectorAll("input[data-metadata-index]").forEach((input) => {
    const item = parameter.metadata?.[Number(input.dataset.metadataIndex)];
    if (item) {
      item.value = input.value;
    }
  });
}

function renderSurface3D(parameter) {
  const numericRows = parameter.map_values.map((row) => row.map((value) => Number(value)));
  if (numericRows.some((row) => row.some(Number.isNaN))) {
    const fallback = document.createElement("p");
    fallback.className = "muted";
    fallback.textContent = "3D surface view is available only when every map cell is numeric.";
    return fallback;
  }

  const flat = numericRows.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const range = max - min || 1;
  const cols = numericRows[0]?.length || 0;
  const rows = numericRows.length;
  const wrapper = document.createElement("div");
  wrapper.className = "surface-view";
  wrapper.innerHTML = `
    <div class="surface-toolbar">
      <span class="surface-help">Drag to rotate · wheel to zoom</span>
      <div class="surface-controls">
        <button type="button" class="ghost-button surface-control" data-action="yaw-left" aria-label="Rotate left">Left</button>
        <button type="button" class="ghost-button surface-control" data-action="yaw-right" aria-label="Rotate right">Right</button>
        <button type="button" class="ghost-button surface-control" data-action="pitch-up" aria-label="Tilt up">Up</button>
        <button type="button" class="ghost-button surface-control" data-action="pitch-down" aria-label="Tilt down">Down</button>
        <button type="button" class="ghost-button surface-control" data-action="zoom-in" aria-label="Zoom in">+</button>
        <button type="button" class="ghost-button surface-control" data-action="zoom-out" aria-label="Zoom out">-</button>
        <button type="button" class="ghost-button surface-reset">Reset View</button>
      </div>
    </div>
    <div class="surface-stage">
      <div class="surface-canvas"></div>
    </div>
    <div class="surface-legend">
      <span class="surface-legend-label">Low ${escapeHtml(String(min))}</span>
      <div class="surface-legend-ramp"></div>
      <span class="surface-legend-label">High ${escapeHtml(String(max))}</span>
    </div>
  `;

  const stage = wrapper.querySelector(".surface-stage");
  const canvas = wrapper.querySelector(".surface-canvas");
  const resetButton = wrapper.querySelector(".surface-reset");
  const controlButtons = wrapper.querySelectorAll(".surface-control");

  const buildSurfaceMarkup = () => {
    const yaw = state.surfaceView.yaw;
    const pitch = state.surfaceView.pitch;
    const zoom = state.surfaceView.zoom;
    const spacingX = 1.8;
    const spacingY = 1.8;
    const heightScale = 4.2;
    const basePoints = [];
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;

    const rotatePoint = (x, y, z) => {
      const yawX = x * Math.cos(yaw) - y * Math.sin(yaw);
      const yawY = x * Math.sin(yaw) + y * Math.cos(yaw);
      const pitchY = yawY * Math.cos(pitch) - z * Math.sin(pitch);
      const pitchZ = yawY * Math.sin(pitch) + z * Math.cos(pitch);
      return { x: yawX, y: pitchY, z: pitchZ };
    };

    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      const currentRow = [];
      for (let colIndex = 0; colIndex < cols; colIndex += 1) {
        const normalized = (numericRows[rowIndex][colIndex] - min) / range;
        currentRow.push({
          rowIndex,
          colIndex,
          normalized,
          value: numericRows[rowIndex][colIndex],
          point: rotatePoint((colIndex - cx) * spacingX, (rowIndex - cy) * spacingY, normalized * heightScale),
        });
      }
      basePoints.push(currentRow);
    }

    const allPoints = basePoints.flat().map(({ point }) => point);
    const extentX = Math.max(...allPoints.map((point) => Math.abs(point.x))) || 1;
    const extentY = Math.max(...allPoints.map((point) => Math.abs(point.y))) || 1;
    const padding = 46;
    const width = 560;
    const height = 360;
    const scale = Math.min((width - padding * 2) / (extentX * 2 || 1), (height - padding * 2) / (extentY * 2 || 1)) * zoom;
    const centerX = width / 2;
    const centerY = height / 2 + 12;

    const projected = basePoints.map((row) => row.map((entry) => ({
      ...entry,
      screenX: centerX + entry.point.x * scale,
      screenY: centerY + entry.point.y * scale,
      depth: entry.point.z,
    })));

    const averageDepth = (points) => points.reduce((total, point) => total + point.depth, 0) / Math.max(points.length, 1);
    const xAxisRowIndex = projected
      .map((row, rowIndex) => ({ rowIndex, depth: averageDepth(row) }))
      .sort((left, right) => right.depth - left.depth)[0]?.rowIndex ?? Math.max(rows - 1, 0);
    const yAxisColumnIndex = Array.from({ length: cols }, (_, colIndex) => ({
      colIndex,
      depth: averageDepth(projected.map((row) => row[colIndex])),
    })).sort((left, right) => right.depth - left.depth)[0]?.colIndex ?? 0;

    const quads = [];
    for (let rowIndex = 0; rowIndex < rows - 1; rowIndex += 1) {
      for (let colIndex = 0; colIndex < cols - 1; colIndex += 1) {
        const p1 = projected[rowIndex][colIndex];
        const p2 = projected[rowIndex][colIndex + 1];
        const p3 = projected[rowIndex + 1][colIndex + 1];
        const p4 = projected[rowIndex + 1][colIndex];
        const avgValue = (p1.normalized + p2.normalized + p3.normalized + p4.normalized) / 4;
        const avgDepth = (p1.depth + p2.depth + p3.depth + p4.depth) / 4;
        quads.push({ points: [p1, p2, p3, p4], avgValue, avgDepth });
      }
    }
    quads.sort((left, right) => left.avgDepth - right.avgDepth);

    const polygons = quads.map(({ points, avgValue }) => {
      const hue = 24 + avgValue * 125;
      const light = 38 + avgValue * 18;
      const fill = `hsl(${hue}, 62%, ${light}%)`;
      const pointsAttr = points.map((point) => `${point.screenX.toFixed(1)},${point.screenY.toFixed(1)}`).join(" ");
      return `<polygon points="${pointsAttr}" fill="${fill}" stroke="rgba(46, 35, 25, 0.18)" stroke-width="1"></polygon>`;
    }).join("");

    const meshLines = [];
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      meshLines.push(`<polyline points="${projected[rowIndex].map((point) => `${point.screenX.toFixed(1)},${point.screenY.toFixed(1)}`).join(" ")}" fill="none" stroke="rgba(46, 35, 25, 0.22)" stroke-width="1"></polyline>`);
    }
    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      meshLines.push(`<polyline points="${projected.map((row) => row[colIndex]).map((point) => `${point.screenX.toFixed(1)},${point.screenY.toFixed(1)}`).join(" ")}" fill="none" stroke="rgba(46, 35, 25, 0.22)" stroke-width="1"></polyline>`);
    }

    const pointLabels = projected.flatMap((row) => row.map((point) => `
      <text x="${point.screenX.toFixed(1)}" y="${(point.screenY - 7).toFixed(1)}" text-anchor="middle" class="surface-value">${escapeHtml(String(point.value))}</text>
    `)).join("");

    const axisNormal = (anchor, neighbor, scaleFactor = 20) => {
      const dx = anchor.screenX - neighbor.screenX;
      const dy = anchor.screenY - neighbor.screenY;
      const length = Math.hypot(dx, dy) || 1;
      return {
        x: (dx / length) * scaleFactor,
        y: (dy / length) * scaleFactor,
      };
    };

    const xAxisPoints = projected[xAxisRowIndex];
    const xAxisNeighborRow = projected[Math.max(0, Math.min(rows - 1, xAxisRowIndex + (xAxisRowIndex > rows / 2 ? -1 : 1)))];
    const xAxisLabels = parameter.x_axis.map((label, colIndex) => {
      const anchor = xAxisPoints[colIndex];
      const neighbor = xAxisNeighborRow[colIndex] || anchor;
      const offset = axisNormal(anchor, neighbor, 18);
      return `<text x="${(anchor.screenX + offset.x).toFixed(1)}" y="${(anchor.screenY + offset.y).toFixed(1)}" text-anchor="middle" class="surface-axis-label">${escapeHtml(String(label))}</text>`;
    }).join("");

    const yAxisPoints = projected.map((row) => row[yAxisColumnIndex]);
    const yAxisNeighborColumnIndex = Math.max(0, Math.min(cols - 1, yAxisColumnIndex + (yAxisColumnIndex > cols / 2 ? -1 : 1)));
    const yAxisLabels = parameter.y_axis.map((label, rowIndex) => {
      const anchor = yAxisPoints[rowIndex];
      const neighbor = projected[rowIndex][yAxisNeighborColumnIndex] || anchor;
      const offset = axisNormal(anchor, neighbor, 24);
      return `<text x="${(anchor.screenX + offset.x).toFixed(1)}" y="${(anchor.screenY + offset.y + 4).toFixed(1)}" text-anchor="middle" class="surface-axis-label">${escapeHtml(String(label))}</text>`;
    }).join("");

    const xAxisLine = `<polyline points="${xAxisPoints.map((point) => `${point.screenX.toFixed(1)},${point.screenY.toFixed(1)}`).join(" ")}" fill="none" stroke="rgba(156, 79, 36, 0.72)" stroke-width="2"></polyline>`;
    const yAxisLine = `<polyline points="${yAxisPoints.map((point) => `${point.screenX.toFixed(1)},${point.screenY.toFixed(1)}`).join(" ")}" fill="none" stroke="rgba(95, 116, 76, 0.78)" stroke-width="2"></polyline>`;

    const xAxisStart = xAxisPoints[0];
    const xAxisEnd = xAxisPoints[xAxisPoints.length - 1];
    const xTitleOffset = axisNormal(xAxisEnd, xAxisStart, 26);
    const xAxisTitle = `
      <text
        x="${(xAxisEnd.screenX + xTitleOffset.x).toFixed(1)}"
        y="${(xAxisEnd.screenY + xTitleOffset.y).toFixed(1)}"
        text-anchor="start"
        class="surface-axis-title"
      >X axis</text>
    `;

    const yAxisStart = yAxisPoints[0];
    const yAxisEnd = yAxisPoints[yAxisPoints.length - 1];
    const yTitleOffset = axisNormal(yAxisEnd, yAxisStart, 28);
    const yAxisTitle = `
      <text
        x="${(yAxisEnd.screenX + yTitleOffset.x).toFixed(1)}"
        y="${(yAxisEnd.screenY + yTitleOffset.y).toFixed(1)}"
        text-anchor="middle"
        class="surface-axis-title"
      >Y axis</text>
    `;

    const gradientId = `surfaceBackdrop-${parameter.name.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}`;
    return `
      <svg class="surface-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(255,255,255,0.96)"></stop>
            <stop offset="100%" stop-color="rgba(236,226,210,0.72)"></stop>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${width}" height="${height}" rx="22" fill="url(#${gradientId})"></rect>
        ${polygons}
        ${meshLines.join("")}
        ${xAxisLine}
        ${yAxisLine}
        ${pointLabels}
        ${xAxisLabels}
        ${yAxisLabels}
        ${xAxisTitle}
        ${yAxisTitle}
      </svg>
    `;
  };

  const draw = () => {
    canvas.innerHTML = buildSurfaceMarkup();
  };

  const clampPitch = (value) => Math.max(0.38, Math.min(1.45, value));
  const clampZoom = (value) => Math.max(0.7, Math.min(1.75, value));

  let dragState = null;

  const stopDrag = () => {
    dragState = null;
    wrapper.classList.remove("surface-dragging");
  };

  const onPointerMove = (event) => {
    if (!dragState) {
      return;
    }
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    state.surfaceView.yaw = dragState.startYaw + dx * 0.012;
    state.surfaceView.pitch = clampPitch(dragState.startPitch + dy * 0.009);
    draw();
  };

  stage.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      startYaw: state.surfaceView.yaw,
      startPitch: state.surfaceView.pitch,
    };
    wrapper.classList.add("surface-dragging");
    stage.setPointerCapture?.(event.pointerId);
  });

  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", stopDrag);
  stage.addEventListener("pointercancel", stopDrag);
  stage.addEventListener("pointerleave", stopDrag);
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    state.surfaceView.zoom = clampZoom(state.surfaceView.zoom + delta);
    draw();
  }, { passive: false });

  controlButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const { action } = button.dataset;
      if (action === "yaw-left") {
        state.surfaceView.yaw -= 0.18;
      } else if (action === "yaw-right") {
        state.surfaceView.yaw += 0.18;
      } else if (action === "pitch-up") {
        state.surfaceView.pitch = clampPitch(state.surfaceView.pitch - 0.12);
      } else if (action === "pitch-down") {
        state.surfaceView.pitch = clampPitch(state.surfaceView.pitch + 0.12);
      } else if (action === "zoom-in") {
        state.surfaceView.zoom = clampZoom(state.surfaceView.zoom + 0.1);
      } else if (action === "zoom-out") {
        state.surfaceView.zoom = clampZoom(state.surfaceView.zoom - 0.1);
      }
      draw();
    });
  });

  resetButton.addEventListener("click", () => {
    state.surfaceView = { yaw: -0.8, pitch: 1.02, zoom: 1 };
    draw();
  });

  draw();
  return wrapper;
}

function renderLineChart(seriesList) {
  const series = seriesList.map((item) => ({
    ...item,
    numericValues: item.values.map((value) => Number(value)),
    numericLabels: item.labels.map((label) => Number(label)),
  }));
  const allYValues = series.flatMap((item) => item.numericValues);
  const allXLabels = series.flatMap((item) => item.numericLabels);
  const hasNumericValues = allYValues.length > 0 && series.every((item) => item.numericValues.every((value) => !Number.isNaN(value)));
  if (!hasNumericValues) {
    return '<p class="muted">Chart is available only when every value is numeric.</p>';
  }
  const useNumericX = allXLabels.length > 0 && series.every((item) => item.numericLabels.every((value) => !Number.isNaN(value)));

  const min = Math.min(...allYValues);
  const max = Math.max(...allYValues);
  const range = max - min || 1;
  const maxPointCount = Math.max(...series.map((item) => item.values.length), 1);
  const xMin = useNumericX ? Math.min(...allXLabels) : 0;
  const xMax = useNumericX ? Math.max(...allXLabels) : Math.max(maxPointCount - 1, 1);
  const xRange = xMax - xMin || 1;
  const chartLeft = 12;
  const chartRight = 94;
  const chartTop = 12;
  const chartBottom = 82;
  const tickCount = 5;
  const formatTick = (value) => {
    if (Math.abs(value) >= 1000 || Number.isInteger(value)) {
      return String(Math.round(value * 1000) / 1000).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
    }
    return value.toFixed(2).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  };

  const seriesPoints = series.map((item) => {
    const pointsData = item.numericValues.map((value, index) => {
      const xValue = useNumericX ? item.numericLabels[index] : index;
      const x = chartLeft + ((xValue - xMin) / xRange) * (chartRight - chartLeft);
      const y = chartBottom - ((value - min) / range) * (chartBottom - chartTop);
      return { x, y, value, label: item.labels[index], xValue };
    });
    return { ...item, pointsData };
  });

  const yTicks = Array.from({ length: tickCount }, (_, index) => {
    const ratio = index / Math.max(tickCount - 1, 1);
    const y = chartBottom - ratio * (chartBottom - chartTop);
    const value = min + ratio * range;
    return `
      <g>
        <line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="rgba(117, 98, 81, 0.14)" stroke-width="0.5"></line>
        <text x="${chartLeft - 2}" y="${y + 1.5}" text-anchor="end" font-size="3" fill="#756251">${escapeHtml(formatTick(value))}</text>
      </g>
    `;
  }).join("");

  const xTickPoints = seriesPoints[seriesPoints.length - 1]?.pointsData || [];
  const xTicks = xTickPoints.map(({ x, label }) => `
    <g>
      <line x1="${x}" y1="${chartBottom}" x2="${x}" y2="${chartBottom + 2.2}" stroke="rgba(117, 98, 81, 0.34)" stroke-width="0.45"></line>
      <text x="${x}" y="${chartBottom + 6.2}" text-anchor="middle" font-size="2.8" fill="#756251">${escapeHtml(String(label))}</text>
    </g>
  `).join("");

  const seriesMarkup = seriesPoints.map((item, seriesIndex) => {
    const points = item.pointsData.map(({ x, y }) => `${x},${y}`).join(" ");
    const dash = item.dash ? ` stroke-dasharray="${escapeHtml(item.dash)}"` : "";
    const dots = item.pointsData.map(({ x, y, value }) => `
      <circle cx="${x}" cy="${y}" r="1.4" fill="${escapeHtml(item.color)}"></circle>
      ${seriesIndex === seriesPoints.length - 1 ? `<text x="${x}" y="${y - 4.4}" text-anchor="middle" font-size="3" fill="#756251">${escapeHtml(formatTick(value))}</text>` : ""}
    `).join("");
    return `
      <polyline fill="none" stroke="${escapeHtml(item.color)}" stroke-width="0.47"${dash} points="${points}"></polyline>
      ${dots}
    `;
  }).join("");

  const legend = seriesPoints.length > 1
    ? `<div class="line-chart-legend">${seriesPoints.map((item) => `
        <span><i style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.name)}</span>
      `).join("")}</div>`
    : "";

  return `
    ${legend}
    <svg class="line-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="100" fill="transparent"></rect>
        ${yTicks}
        <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" stroke="rgba(117, 98, 81, 0.4)" stroke-width="0.6"></line>
        <line x1="${chartLeft}" y1="${chartTop}" x2="${chartLeft}" y2="${chartBottom}" stroke="rgba(117, 98, 81, 0.4)" stroke-width="0.6"></line>
        ${seriesMarkup}
        ${xTicks}
        <text x="${chartRight}" y="96" text-anchor="end" font-size="2.8" fill="#756251">X axis</text>
        <text x="2.8" y="${chartTop}" text-anchor="start" font-size="2.8" fill="#756251">Y axis</text>
      </svg>
  `;
}

function appendMetadataEditor(parameter, baseline) {
  const metadata = parameter.metadata || [];
  if (metadata.length) {
    const section = document.createElement("div");
    section.className = "metadata";
    section.innerHTML = `
      <div class="panel-header">
        <strong>Metadata</strong>
        <span class="muted">${metadata.length} field(s)</span>
      </div>
      <table class="compare-table">
        <thead><tr><th>Key</th><th>Value</th><th>Baseline</th></tr></thead>
        <tbody>
          ${metadata
            .map((item, index) => {
              const baselineValue = baseline.metadata?.[index]?.value || "";
              const changed = item.value !== baselineValue ? "changed-cell" : "";
              return `
                <tr class="${changed}">
                  <td>${escapeHtml(item.key)}</td>
                  <td><input data-metadata-index="${index}" type="text" value="${escapeHtml(item.value)}" /></td>
                  <td>${escapeHtml(baselineValue)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
    wireInputs(section, "input[data-metadata-index]", (event) => {
      const index = Number(event.target.dataset.metadataIndex);
      commitChange(() => {
        state.current.get(parameter.name).metadata[index].value = event.target.value;
      }, `Updated ${parameter.name} metadata ${metadata[index].key}`);
    });
    els.editorSlot.appendChild(section);
  }

  appendRawLines(parameter);
}

function appendMetadataComparison(parameter, baseline) {
  const metadata = parameter.metadata || [];
  const baselineMetadata = baseline.metadata || [];
  if (!metadata.length && !baselineMetadata.length) {
    return;
  }
  const length = Math.max(metadata.length, baselineMetadata.length);
  const table = document.createElement("table");
  table.className = "compare-table";
  table.innerHTML = `
    <thead><tr><th>Metadata</th><th>Baseline</th><th>Current</th></tr></thead>
    <tbody>
      ${Array.from({ length }, (_, index) => {
        const currentItem = metadata[index];
        const baselineItem = baselineMetadata[index];
        const label = currentItem?.key || baselineItem?.key || `Field ${index}`;
        const baselineValue = baselineItem?.value || "";
        const currentValue = currentItem?.value || "";
        const changed = label !== (baselineItem?.key || label) || baselineValue !== currentValue ? "changed-cell" : "";
        return `
          <tr class="${changed}">
            <td>${escapeHtml(label)}</td>
            <td>${escapeHtml(baselineValue)}</td>
            <td>${escapeHtml(currentValue)}</td>
          </tr>
        `;
      }).join("")}
    </tbody>
  `;
  els.compareSlot.appendChild(table);
}

function appendRawLines(parameter) {
  if (!parameter.raw_lines?.length) {
    return;
  }
  const box = document.createElement("div");
  box.className = "metadata";
  box.innerHTML = `<strong>Preserved Non-Editable Lines</strong>\n${escapeHtml(parameter.raw_lines.join("\n"))}`;
  els.editorSlot.appendChild(box);
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

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      if (currentRow.some((cell) => cell !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);
  if (currentRow.some((cell) => cell !== "")) {
    rows.push(currentRow);
  }
  return rows;
}

function makeCsvRows(mode = "all") {
  const rows = [];
  const headers = ["parameter", "kind", "field", "index", "row", "column", "key", "baseline_value", "value"];
  rows.push(headers);

  parameterNames().forEach((name) => {
    const current = state.current.get(name);
    const baseline = state.original.get(name);
    if (!current || !baseline) {
      return;
    }

    const pushRow = (field, { index = "", row = "", column = "", key = "", baselineValue = "", value = "" } = {}) => {
      if (mode === "changed" && String(baselineValue) === String(value)) {
        return;
      }
      rows.push([name, current.kind, field, index, row, column, key, baselineValue, value]);
    };

    if (current.kind === "scalar") {
      pushRow("value", { baselineValue: baseline.value, value: current.value });
    }

    if (current.kind === "list") {
      current.values.forEach((value, index) => {
        pushRow("values", { index, baselineValue: baseline.values[index], value });
      });
    }

    if (current.kind === "axis") {
      current.x_axis.forEach((value, index) => {
        pushRow("x_axis", { index, baselineValue: baseline.x_axis[index], value });
      });
    }

    if (current.kind === "curve") {
      current.x_axis.forEach((value, index) => {
        pushRow("x_axis", { index, baselineValue: baseline.x_axis[index], value });
      });
      current.values.forEach((value, index) => {
        pushRow("values", { index, baselineValue: baseline.values[index], value });
      });
    }

    if (current.kind === "map") {
      current.x_axis.forEach((value, index) => {
        pushRow("x_axis", { index, baselineValue: baseline.x_axis[index], value });
      });
      current.y_axis.forEach((value, index) => {
        pushRow("y_axis", { index, baselineValue: baseline.y_axis[index], value });
      });
      current.map_values.forEach((rowValues, rowIndex) => {
        rowValues.forEach((value, columnIndex) => {
          pushRow("map_values", {
            row: rowIndex,
            column: columnIndex,
            baselineValue: baseline.map_values[rowIndex][columnIndex],
            value,
          });
        });
      });
    }

    (current.metadata || []).forEach((item, index) => {
      pushRow("metadata", {
        index,
        key: item.key,
        baselineValue: baseline.metadata?.[index]?.value || "",
        value: item.value,
      });
    });
  });

  return rows;
}

function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function triggerCsvDownload(mode = "all") {
  if (!parameterNames().length) {
    showStatus("Load a DCM file before exporting CSV.", "error");
    return;
  }
  const rows = makeCsvRows(mode);
  if (rows.length === 1) {
    showStatus("No rows matched the requested export scope.", "info");
    return;
  }
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const suffix = mode === "changed" ? "changed" : "all";
  link.href = url;
  link.download = `dcm-editor-${suffix}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showStatus(`Exported ${rows.length - 1} CSV row(s).`, "success");
}

function triggerTextDownload(fileName, text, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseIntegerField(value, label) {
  if (value === "") {
    throw new Error(`${label} is required for this CSV row`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  return parsed;
}

function applyCsvRowToParameter(parameter, row) {
  const field = row.field;
  const value = row.value;

  if (field === "value") {
    if (parameter.kind !== "scalar") {
      throw new Error(`${parameter.name}: field "value" is only valid for scalar parameters`);
    }
    parameter.value = value;
    return;
  }

  if (field === "values") {
    const index = parseIntegerField(row.index, "index");
    if (!Array.isArray(parameter.values) || index < 0 || index >= parameter.values.length) {
      throw new Error(`${parameter.name}: values index ${index} is out of range`);
    }
    parameter.values[index] = value;
    return;
  }

  if (field === "x_axis") {
    const index = parseIntegerField(row.index, "index");
    if (!Array.isArray(parameter.x_axis) || index < 0 || index >= parameter.x_axis.length) {
      throw new Error(`${parameter.name}: x_axis index ${index} is out of range`);
    }
    parameter.x_axis[index] = value;
    return;
  }

  if (field === "y_axis") {
    const index = parseIntegerField(row.index, "index");
    if (!Array.isArray(parameter.y_axis) || index < 0 || index >= parameter.y_axis.length) {
      throw new Error(`${parameter.name}: y_axis index ${index} is out of range`);
    }
    parameter.y_axis[index] = value;
    return;
  }

  if (field === "map_values") {
    const rowIndex = parseIntegerField(row.row, "row");
    const columnIndex = parseIntegerField(row.column, "column");
    if (
      !Array.isArray(parameter.map_values)
      || rowIndex < 0
      || rowIndex >= parameter.map_values.length
      || columnIndex < 0
      || columnIndex >= parameter.map_values[rowIndex].length
    ) {
      throw new Error(`${parameter.name}: map_values[${rowIndex}][${columnIndex}] is out of range`);
    }
    parameter.map_values[rowIndex][columnIndex] = value;
    return;
  }

  if (field === "metadata") {
    const index = parseIntegerField(row.index, "index");
    if (!Array.isArray(parameter.metadata) || index < 0 || index >= parameter.metadata.length) {
      throw new Error(`${parameter.name}: metadata index ${index} is out of range`);
    }
    if (row.key && parameter.metadata[index].key !== row.key) {
      throw new Error(`${parameter.name}: metadata key mismatch at index ${index}`);
    }
    parameter.metadata[index].value = value;
    return;
  }

  throw new Error(`${parameter.name}: unsupported CSV field "${field}"`);
}

function importCsvText(text, fileName = "CSV") {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    showStatus(`${fileName} does not contain any data rows.`, "error");
    return;
  }

  const [header, ...dataRows] = rows;
  const headerIndex = Object.fromEntries(header.map((name, index) => [name, index]));
  const requiredHeaders = ["parameter", "kind", "field", "value"];
  for (const required of requiredHeaders) {
    if (!(required in headerIndex)) {
      showStatus(`${fileName} is missing required CSV column "${required}".`, "error");
      return;
    }
  }

  const parsedRows = dataRows.map((cells, rowOffset) => ({
    rowNumber: rowOffset + 2,
    parameter: cells[headerIndex.parameter] || "",
    kind: cells[headerIndex.kind] || "",
    field: cells[headerIndex.field] || "",
    index: cells[headerIndex.index] || "",
    row: cells[headerIndex.row] || "",
    column: cells[headerIndex.column] || "",
    key: cells[headerIndex.key] || "",
    value: cells[headerIndex.value] || "",
  }));

  const errors = [];
  const touchedParameters = new Set();

  commitChange(() => {
    parsedRows.forEach((row) => {
      try {
        if (!row.parameter) {
          throw new Error("parameter is empty");
        }
        const parameter = state.current.get(row.parameter);
        if (!parameter) {
          throw new Error(`unknown parameter "${row.parameter}"`);
        }
        if (row.kind && row.kind !== parameter.kind) {
          throw new Error(`kind mismatch: expected ${parameter.kind}, got ${row.kind}`);
        }
        applyCsvRowToParameter(parameter, row);
        touchedParameters.add(parameter.name);
      } catch (error) {
        errors.push(`Row ${row.rowNumber}: ${error.message}`);
      }
    });
  }, `Imported CSV changes for ${touchedParameters.size} parameter(s)`);

  if (errors.length) {
    showStatus(`Imported with ${errors.length} row error(s). First: ${errors[0]}`, "error");
    return;
  }

  if (!touchedParameters.size) {
    showStatus(`${fileName} did not update any parameters.`, "info");
    return;
  }

  const issues = collectValidationIssues();
  if (issues.length) {
    showStatus(`Imported ${parsedRows.length} row(s). Validation issues need review before save.`, "info");
    return;
  }
  showStatus(`Imported ${parsedRows.length} row(s) from ${fileName}.`, "success");
}

function makeDiffReport() {
  const compareLabel = baselineLabel();
  const lines = [
    "# DCM Diff Report",
    "",
    `- Current file: ${state.filePath || "None"}`,
    `- Baseline: ${compareLabel}`,
    `- Changed parameters: ${changedParameterCount()}`,
    `- Exported at: ${new Date().toISOString()}`,
    "",
  ];

  const changedNames = parameterNames().filter((name) => diffParameter(state.current.get(name), activeCompareBaseline(name)).changed);
  if (!changedNames.length) {
    lines.push("No parameter differences.");
    return lines.join("\n");
  }

  changedNames.forEach((name) => {
    const current = state.current.get(name);
    const baseline = activeCompareBaseline(name);
    const diff = diffParameter(current, baseline);

    lines.push(`## ${name}`);
    lines.push("");
    lines.push(`- Kind: ${current.kind}`);
    lines.push(`- Changed items: ${diff.changedCells}`);
    if (diff.notes.length) {
      lines.push(`- Notes: ${diff.notes.join("; ")}`);
    }
    lines.push("");

    if (current.kind === "scalar") {
      lines.push("| Field | Baseline | Current |");
      lines.push("| --- | --- | --- |");
      lines.push(`| value | ${baseline.value} | ${current.value} |`);
      lines.push("");
    }

    if (current.kind === "list") {
      lines.push("| Index | Baseline | Current |");
      lines.push("| --- | --- | --- |");
      current.values.forEach((value, index) => {
        if (value !== baseline.values[index]) {
          lines.push(`| ${index} | ${baseline.values[index]} | ${value} |`);
        }
      });
      lines.push("");
    }

    if (current.kind === "axis") {
      lines.push("| Index | Baseline Axis | Current Axis |");
      lines.push("| --- | --- | --- |");
      current.x_axis.forEach((value, index) => {
        if (value !== baseline.x_axis[index]) {
          lines.push(`| ${index} | ${baseline.x_axis[index]} | ${value} |`);
        }
      });
      lines.push("");
    }

    if (current.kind === "curve") {
      lines.push("| Field | Index | Baseline | Current |");
      lines.push("| --- | --- | --- | --- |");
      current.x_axis.forEach((value, index) => {
        if (value !== baseline.x_axis[index]) {
          lines.push(`| x_axis | ${index} | ${baseline.x_axis[index]} | ${value} |`);
        }
      });
      current.values.forEach((value, index) => {
        if (value !== baseline.values[index]) {
          lines.push(`| values | ${index} | ${baseline.values[index]} | ${value} |`);
        }
      });
      lines.push("");
    }

    if (current.kind === "map") {
      lines.push("| Field | Row | Column | Baseline | Current |");
      lines.push("| --- | --- | --- | --- | --- |");
      current.x_axis.forEach((value, index) => {
        if (value !== baseline.x_axis[index]) {
          lines.push(`| x_axis | - | ${index} | ${baseline.x_axis[index]} | ${value} |`);
        }
      });
      current.y_axis.forEach((value, index) => {
        if (value !== baseline.y_axis[index]) {
          lines.push(`| y_axis | ${index} | - | ${baseline.y_axis[index]} | ${value} |`);
        }
      });
      current.map_values.forEach((rowValues, rowIndex) => {
        rowValues.forEach((value, columnIndex) => {
          if (value !== baseline.map_values[rowIndex][columnIndex]) {
            lines.push(`| map_values | ${rowIndex} | ${columnIndex} | ${baseline.map_values[rowIndex][columnIndex]} | ${value} |`);
          }
        });
      });
      lines.push("");
    }

    (current.metadata || []).forEach((item, index) => {
      const baselineValue = baseline.metadata?.[index]?.value || "";
      if (item.value !== baselineValue) {
        if (!lines[lines.length - 1].startsWith("| Metadata")) {
          lines.push("| Metadata | Baseline | Current |");
          lines.push("| --- | --- | --- |");
        }
        lines.push(`| ${item.key} | ${baselineValue} | ${item.value} |`);
      }
    });
    lines.push("");
  });

  return lines.join("\n");
}

function exportDiffReport() {
  if (!parameterNames().length) {
    showStatus("Load a DCM file before exporting a diff report.", "error");
    return;
  }
  const report = makeDiffReport();
  triggerTextDownload("dcm-diff-report.md", report, "text/markdown;charset=utf-8");
  showStatus("Exported diff report.", "success");
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
  if (isDirty() && !window.confirm("Load a new DCM file and discard unsaved changes?")) {
    return;
  }

  try {
    clearStatus();
    const payload = await api("/api/load", {
      method: "POST",
      body: JSON.stringify({ path: targetPath }),
    });
    state.sourceText = "";
    setDocument(payload);
    showStatus(`Loaded ${payload.parameters.length} parameters from ${payload.path}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function loadDocumentFromText(file) {
  if (!file) {
    return;
  }
  if (isDirty() && !window.confirm("Load a new DCM file and discard unsaved changes?")) {
    return;
  }

  try {
    clearStatus();
    const text = await file.text();
    const payload = await api("/api/load-text", {
      method: "POST",
      body: JSON.stringify({
        display_name: file.name,
        text,
      }),
    });
    setDocumentFromUpload(payload, text);
    showStatus(`Loaded ${payload.parameters.length} parameters from ${file.name}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    els.dcmFileInput.value = "";
  }
}

async function runCompare() {
  const comparePath = els.comparePath.value.trim();
  if (!state.filePath || !comparePath) {
    showStatus("Load a DCM file and provide a compare file path first.", "error");
    return;
  }

  try {
    const payload = state.sourceMode === "upload"
      ? await api("/api/compare-text", {
          method: "POST",
          body: JSON.stringify({
            display_name: state.filePath,
            source_text: state.sourceText,
            compare_path: comparePath,
            parameters: collectParameters(),
          }),
        })
      : await api("/api/compare", {
          method: "POST",
          body: JSON.stringify({
            current_path: state.filePath,
            compare_path: comparePath,
            parameters: collectParameters(),
          }),
        });
    state.comparePath = payload.compare_path;
    state.compareBaseline = new Map(payload.parameters.map((parameter) => [parameter.name, deepClone(parameter)]));
    state.compareIssues = payload.validation_issues || [];
    els.comparePath.value = payload.compare_path;
    renderAll();
    showStatus(`Compared current editor state against ${payload.compare_path}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function saveDocument() {
  if (state.sourceMode === "upload") {
    return saveAsDocument();
  }
  return saveDocumentToPath(null);
}

async function saveDocumentToPath(outputPath = null) {
  syncSelectedEditorInputs();

  if (!state.filePath || (!parameterNames().length && !state.original.size)) {
    showStatus("Load a DCM file before saving.", "error");
    return;
  }

  const issues = collectValidationIssues();

  try {
    const payload = state.sourceMode === "upload"
      ? await api("/api/save-text", {
          method: "POST",
          body: JSON.stringify({
            display_name: state.filePath,
            source_text: state.sourceText,
            output_path: outputPath,
            parameters: collectParameters(),
          }),
        })
      : await api("/api/save", {
          method: "POST",
          body: JSON.stringify({
            path: state.filePath,
            output_path: outputPath,
            source_hash: state.sourceHash,
            parameters: collectParameters(),
          }),
        });
    state.filePath = payload.path;
    els.filePath.value = payload.path;
    state.sourceMode = payload.source_mode || "filesystem";
    state.sourceText = "";
    state.sourceHash = payload.source_hash;
    state.original = new Map(parameterNames().map((name) => [name, deepClone(state.current.get(name))]));
    state.documentIssues = payload.validation_issues || [];
    state.undoStack = [];
    state.redoStack = [];
    renderAll();
    const backupMessage = payload.backup_path ? ` Backup: ${payload.backup_path}` : "";
    const validationMessage = issues.length ? ` Ignored ${issues.length} validation warning(s).` : "";
    showStatus(`Saved ${payload.path}.${backupMessage}${validationMessage}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function saveAsDocument() {
  if (!state.filePath || !parameterNames().length) {
    showStatus("Load a DCM file before using Save As.", "error");
    return;
  }
  const suggestedPath = state.filePath.endsWith(".dcm")
    ? state.filePath.replace(/\.dcm$/i, "_copy.dcm")
    : `${state.filePath}_copy.dcm`;
  const outputPath = window.prompt("Save DCM as:", suggestedPath);
  if (!outputPath) {
    return;
  }
  await saveDocumentToPath(outputPath.trim());
}

function resetSelectedParameter() {
  if (!state.selectedName) {
    return;
  }
  commitChange(() => {
    state.current.set(state.selectedName, deepClone(state.original.get(state.selectedName)));
  }, `Reset ${state.selectedName} to the loaded snapshot`);
}

function normalizeParameterName(name) {
  return name.trim().replaceAll(/\s+/g, "_").replaceAll(/[^A-Za-z0-9_.-]/g, "_");
}

function createNewParameterPayload(name, kind) {
  const keywordByKind = {
    scalar: "FESTWERT",
    list: "FESTWERTEBLOCK",
    axis: "STUETZSTELLENVERTEILUNG",
    curve: "KENNLINIE",
    map: "KENNFELD",
  };
  const payload = {
    name,
    keyword: keywordByKind[kind],
    kind,
    header_suffix: "",
    metadata: [{ key: "LANGNAME", value: `"${name}"` }],
    raw_lines: [],
    line_range: { start: 0, end: 0 },
  };
  if (kind === "scalar") {
    payload.value = "0";
  } else if (kind === "list") {
    payload.values = ["0", "0", "0"];
  } else if (kind === "axis") {
    payload.x_axis = ["0", "1", "2"];
  } else if (kind === "curve") {
    payload.x_axis = ["0", "1", "2"];
    payload.values = ["0", "0", "0"];
  } else if (kind === "map") {
    payload.x_axis = ["0", "1"];
    payload.y_axis = ["0", "1"];
    payload.map_values = [["0", "0"], ["0", "0"]];
  }
  return payload;
}

function addParameter() {
  if (!state.filePath) {
    showStatus("Load a DCM file before adding a parameter.", "error");
    return;
  }
  const rawName = window.prompt("New parameter name:");
  if (!rawName) {
    return;
  }
  const name = normalizeParameterName(rawName);
  if (!name) {
    showStatus("Parameter name cannot be empty.", "error");
    return;
  }
  if (state.current.has(name) || state.original.has(name)) {
    showStatus(`Parameter ${name} already exists.`, "error");
    return;
  }
  const rawKind = window.prompt("Parameter kind: scalar, list, axis, curve, or map", "scalar");
  if (!rawKind) {
    return;
  }
  const kind = rawKind.trim().toLowerCase();
  if (!["scalar", "list", "axis", "curve", "map"].includes(kind)) {
    showStatus("Parameter kind must be scalar, list, axis, curve, or map.", "error");
    return;
  }

  commitChange(() => {
    state.current.set(name, createNewParameterPayload(name, kind));
    state.selectedName = name;
  }, `Added ${name}`);
}

function deleteSelectedParameter() {
  const name = state.selectedName;
  if (!name || !state.current.has(name)) {
    showStatus("Select a parameter before deleting.", "error");
    return;
  }
  if (!window.confirm(`Delete ${name} from the current DCM? This will remove it when you save.`)) {
    return;
  }

  const names = parameterNames();
  const index = names.indexOf(name);
  const nextName = names[index + 1] || names[index - 1] || null;
  commitChange(() => {
    state.current.delete(name);
    state.selectedName = nextName;
  }, `Deleted ${name}`);
}

function undoChange() {
  const snapshot = state.undoStack.pop();
  if (!snapshot) {
    return;
  }
  applyHistorySnapshot(snapshot, "undo");
  showStatus("Undid the last edit.", "info");
}

function redoChange() {
  const snapshot = state.redoStack.pop();
  if (!snapshot) {
    return;
  }
  applyHistorySnapshot(snapshot, "redo");
  showStatus("Reapplied the last undone edit.", "info");
}

async function handleCsvFileSelection(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    importCsvText(text, file.name);
  } catch (error) {
    showStatus(`Failed to read ${file.name}: ${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
}

async function handleDcmFileSelection(event) {
  const file = event.target.files?.[0];
  await loadDocumentFromText(file);
}

els.refreshFiles.addEventListener("click", loadFiles);
els.pickDcmFile.addEventListener("click", () => els.dcmFileInput.click());
els.sampleFile.addEventListener("click", loadSamplePath);
els.loadFile.addEventListener("click", () => loadDocument());
els.saveAsFile.addEventListener("click", saveAsDocument);
els.saveFile.addEventListener("click", saveDocument);
els.addParameter.addEventListener("click", addParameter);
els.deleteParameter.addEventListener("click", deleteSelectedParameter);
els.compareFile.addEventListener("click", runCompare);
els.clearCompare.addEventListener("click", () => {
  clearCompare(true);
  showStatus("Cleared the compare baseline.", "info");
});
els.undoChange.addEventListener("click", undoChange);
els.redoChange.addEventListener("click", redoChange);
els.importCsv.addEventListener("click", () => els.csvFileInput.click());
els.exportCsv.addEventListener("click", () => triggerCsvDownload("all"));
els.exportChangedCsv.addEventListener("click", () => triggerCsvDownload("changed"));
els.exportDiffReport.addEventListener("click", exportDiffReport);
els.csvFileInput.addEventListener("change", handleCsvFileSelection);
els.dcmFileInput.addEventListener("change", handleDcmFileSelection);
els.resetParameter.addEventListener("click", resetSelectedParameter);
els.parameterSearch.addEventListener("input", renderParameterList);
els.comparePath.addEventListener("input", renderButtons);

window.addEventListener("beforeunload", (event) => {
  if (!isDirty()) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
});

loadFiles();
loadSamplePath();
initializeSidebarWidth();
initializeDetailVisualWidth();
initializeDetailPaneHeight();
setupSidebarResizer();
setupDetailResizer();
setupDetailHeightResizer();
renderAll();
