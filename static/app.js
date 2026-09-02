const state = {
  rubric: null,
  stores: [],
  categoryChart: null,
  trendChart: null,
  lang: "zh-TW",
  ui: {},
  gradeLabels: {},
  languages: [],
};

const CATEGORY_ORDER = ["CREATE", "CONNECT", "CONVERT", "CONFIRM", "CONTINUE"];
const CATEGORY_COLORS = {
  CREATE: "#a8823c",
  CONNECT: "#13233c",
  CONVERT: "#4b6043",
  CONFIRM: "#8a4b32",
  CONTINUE: "#8c6239",
};

const ERROR_CODE_KEY = {
  store_name_required: "err_store_name_required",
  missing_fields: "err_missing_fields",
  no_items: "err_no_items",
  invalid_login: "login_error",
};

function t(key) {
  return state.ui[key] || key;
}

function gradeLabel(code) {
  return state.gradeLabels[code] || code;
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401 && err.code === "login_required") showLogin();
    const translated = err.code && ERROR_CODE_KEY[err.code] ? t(ERROR_CODE_KEY[err.code]) : null;
    throw new Error(translated || err.error || t("err_generic"));
  }
  return res.json();
}

function withLang(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}lang=${encodeURIComponent(state.lang)}`;
}

// ---------- Language ----------
function getStoredLang() {
  return localStorage.getItem("lang") || "zh-TW";
}

async function loadI18n() {
  const data = await api(`/api/i18n?lang=${encodeURIComponent(state.lang)}`);
  state.ui = data.ui;
  state.gradeLabels = data.gradeLabels;
  state.languages = data.languages;
}

function applyStaticTranslations() {
  document.documentElement.lang = state.lang;
  document.title = t("brand_title");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

function setupLangSwitcher(btnId, menuId) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  if (!btn || !menu) return;
  menu.innerHTML = "";
  state.languages.forEach((l) => {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = l.native_name;
    if (l.code === state.lang) item.classList.add("active");
    item.addEventListener("click", () => {
      localStorage.setItem("lang", l.code);
      location.reload();
    });
    menu.appendChild(item);
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", () => {
    menu.hidden = true;
  });
}

// ---------- Navigation ----------
function setupNav() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
      if (btn.dataset.view === "history") loadHistory();
      if (btn.dataset.view === "analytics") refreshAnalytics();
    });
  });
}

// ---------- Score form ----------
function renderFeelings() {
  const container = document.getElementById("feelings-options");
  container.innerHTML = "";
  state.rubric.overallFeelings.forEach((f) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = f;
    input.name = "feeling";
    label.appendChild(input);
    label.appendChild(document.createTextNode(f));
    container.appendChild(label);
  });
}

function renderCategories() {
  const container = document.getElementById("categories-container");
  container.innerHTML = "";
  state.rubric.categories.forEach((cat) => {
    const block = document.createElement("div");
    block.className = "card category-block";
    block.dataset.category = cat.key;

    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `<div><h3 style="display:inline">${cat.name}<span class="subtitle">${cat.subtitle}</span></h3></div>
      <div class="category-header-right">
        <label class="na-toggle"><input type="checkbox" class="na-checkbox" data-na="${cat.key}"> ${t("na_toggle_label")}</label>
        <div class="category-subtotal" data-subtotal="${cat.key}">0 / ${cat.items.reduce((s, i) => s + i.max, 0)}</div>
      </div>`;
    block.appendChild(header);

    cat.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `
        <input type="checkbox" data-item="${item.id}" data-max="${item.max}" data-category="${cat.key}">
        <div class="item-text">${item.text}</div>
        <div class="item-max">${t("pts_unit").replace("{n}", item.max)}</div>
        <input type="text" class="item-feedback" data-feedback="${item.id}" placeholder="${t("item_feedback_placeholder")}">
      `;
      block.appendChild(row);
    });
    container.appendChild(block);
  });

  const summary = document.createElement("div");
  summary.className = "sticky-summary";
  summary.innerHTML = `<div>${t("th_total")}：<span class="score" id="live-total">0</span> / <span id="live-max">${state.rubric.totalMaxScore}</span>
    <span class="grade" id="live-grade">${t("live_grade_default")}</span></div>
    <button type="submit" class="btn-primary btn-submit">${t("btn_submit")}</button>`;
  container.appendChild(summary);

  container.addEventListener("change", (e) => {
    if (e.target.matches("input[type=checkbox][data-item]")) updateTotals();
    if (e.target.matches(".na-checkbox")) toggleCategoryExcluded(e.target.dataset.na, e.target.checked);
  });
  updateTotals();
}

function toggleCategoryExcluded(catKey, excluded) {
  const block = document.querySelector(`.category-block[data-category="${catKey}"]`);
  if (!block) return;
  block.classList.toggle("excluded", excluded);
  block.querySelectorAll('input[type=checkbox][data-item], input.item-feedback').forEach((el) => {
    el.disabled = excluded;
    if (excluded && el.type === "checkbox") el.checked = false;
  });
  updateTotals();
}

function updateTotals() {
  let grandTotal = 0;
  let grandMax = 0;
  CATEGORY_ORDER.forEach((catKey) => {
    const block = document.querySelector(`.category-block[data-category="${catKey}"]`);
    const excluded = block && block.classList.contains("excluded");
    const boxes = document.querySelectorAll(`input[data-category="${catKey}"]`);
    let sub = 0;
    let max = 0;
    boxes.forEach((b) => {
      max += Number(b.dataset.max);
      if (b.checked) sub += Number(b.dataset.max);
    });
    const el = document.querySelector(`[data-subtotal="${catKey}"]`);
    if (el) el.textContent = excluded ? t("na_short") : `${sub} / ${max}`;
    if (!excluded) {
      grandTotal += sub;
      grandMax += max;
    }
  });
  document.getElementById("live-total").textContent = grandTotal;
  document.getElementById("live-max").textContent = grandMax;
  const gradeEl = document.getElementById("live-grade");
  const pct = grandMax > 0 ? (grandTotal / grandMax) * 100 : 0;
  let code = "growing";
  if (grandMax > 0 && pct >= 90) code = "excellent";
  else if (grandMax > 0 && pct >= 85) code = "pass";
  gradeEl.textContent = gradeLabel(code);
  gradeEl.className = `grade grade-${code}`;
}

const REGION_ORDER = ["北一區", "北二區", "中區", "南區"];

function sortRegionKeys(keys) {
  return keys.sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a);
    const ib = REGION_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function renderStoreOptions(selectEl, stores, includeAllOption, labelAll, regionFilter) {
  const prevValue = selectEl.value;
  selectEl.innerHTML = "";
  if (includeAllOption) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = labelAll;
    selectEl.appendChild(opt);
  }

  const filtered = regionFilter ? stores.filter((s) => (s.region_name || "") === regionFilter) : stores;
  const regions = new Set(filtered.map((s) => s.region_name).filter(Boolean));
  if (regions.size > 1) {
    const byRegion = new Map();
    filtered.forEach((s) => {
      const key = s.region_name || "";
      if (!byRegion.has(key)) byRegion.set(key, []);
      byRegion.get(key).push(s);
    });
    sortRegionKeys(Array.from(byRegion.keys()))
      .forEach((region) => {
        const group = document.createElement("optgroup");
        group.label = region || "（未分區）";
        byRegion.get(region).forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.id;
          opt.textContent = s.name;
          group.appendChild(opt);
        });
        selectEl.appendChild(group);
      });
  } else {
    filtered.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      selectEl.appendChild(opt);
    });
  }

  if (prevValue && filtered.some((s) => String(s.id) === prevValue)) selectEl.value = prevValue;
  selectEl.dispatchEvent(new Event("change"));
}

function renderRegionFilter(regionSelectEl, stores) {
  const prevValue = regionSelectEl.value;
  const regions = sortRegionKeys(Array.from(new Set(stores.map((s) => s.region_name).filter(Boolean))));
  regionSelectEl.innerHTML = `<option value="">${t("region_all")}</option>` +
    regions.map((r) => `<option value="${r}">${r}</option>`).join("");
  if (prevValue && regions.includes(prevValue)) regionSelectEl.value = prevValue;
}

async function loadStoresInto(selectEl, includeAllOption, labelAll, endpoint = "/api/stores") {
  const stores = await api(endpoint);
  if (endpoint === "/api/stores?for=submit") state.submitStores = stores;
  else state.stores = stores;
  selectEl._storesData = stores;

  const regionSelectEl = document.getElementById(`${selectEl.id}-region`);
  if (regionSelectEl) {
    renderRegionFilter(regionSelectEl, stores);
    if (!regionSelectEl.dataset.wired) {
      regionSelectEl.addEventListener("change", () => {
        renderStoreOptions(selectEl, selectEl._storesData || [], includeAllOption, labelAll, regionSelectEl.value);
      });
      regionSelectEl.dataset.wired = "1";
    }
    renderStoreOptions(selectEl, stores, includeAllOption, labelAll, regionSelectEl.value);
  } else {
    renderStoreOptions(selectEl, stores, includeAllOption, labelAll, "");
  }
}

async function refreshAllStoreSelects() {
  await loadStoresInto(document.getElementById("f-store"), false, "", "/api/stores?for=submit");
  await loadStoresInto(document.getElementById("h-store"), true, t("filter_store_all"));
  await loadStoresInto(document.getElementById("a-store"), true, t("filter_store_range_all"));
}

async function refreshEmployeeDatalist() {
  const employees = await api("/api/employees");
  const hSel = document.getElementById("h-employee");
  hSel.innerHTML = `<option value="">${t("filter_employee_all")}</option>` + employees.map((e) => `<option value="${e}">${e}</option>`).join("");
  const aSel = document.getElementById("a-employee");
  aSel.innerHTML = `<option value="">${t("select_employee_placeholder")}</option>` + employees.map((e) => `<option value="${e}">${e}</option>`).join("");
}

async function loadStoreEmployees(storeId) {
  const empSel = document.getElementById("f-employee");
  const evalSel = document.getElementById("f-evaluator");
  const prevEmpValue = empSel.value;
  const prevEvalValue = evalSel.value;
  if (!storeId) {
    empSel.innerHTML = "";
    evalSel.innerHTML = "";
    state.storeEmployees = [];
    return;
  }
  const [list, sicNames] = await Promise.all([
    api(`/api/store-employees?store_id=${storeId}`),
    api(`/api/stores/${storeId}/sic`),
  ]);
  state.storeEmployees = list;

  empSel.innerHTML = `<option value="">${t("placeholder_employee")}</option>` +
    list.map((e) => `<option value="${e.name}">${e.name}</option>`).join("");
  if (prevEmpValue && list.some((e) => e.name === prevEmpValue)) empSel.value = prevEmpValue;
  else empSel.value = "";

  // 觀察人：預設代入該店的 SIC（店經理／Supervisor 帳號），若本人是店經理身份
  // 且就是其中之一則優先選自己；管理員/RM 等非店經理帳號不會自動加入自己
  // （例如巡店時要記錄自己為觀察人，用「＋新增觀察人」手動加入）。也可從
  // 門店員工名單挑選/新增其他人（例如借用帳號登入的 SSA）。
  const selfName = state.user.name;
  const selfIsStoreManager = state.user.role === "store_manager";
  const seen = new Set();
  let evalOptions = `<option value="">${t("placeholder_evaluator")}</option>`;
  sicNames.forEach((n) => {
    if (seen.has(n)) return;
    seen.add(n);
    evalOptions += `<option value="${n}">${n}</option>`;
  });
  if (selfIsStoreManager && !seen.has(selfName)) {
    seen.add(selfName);
    evalOptions += `<option value="${selfName}">${selfName}</option>`;
  }
  list.forEach((e) => {
    if (seen.has(e.name)) return;
    seen.add(e.name);
    evalOptions += `<option value="${e.name}">${e.name}</option>`;
  });
  evalSel.innerHTML = evalOptions;

  let defaultEval = "";
  if (sicNames.includes(selfName)) defaultEval = selfName;
  else if (sicNames.length) defaultEval = sicNames[0];
  else if (selfIsStoreManager) defaultEval = selfName;

  if (prevEvalValue && seen.has(prevEvalValue)) {
    evalSel.value = prevEvalValue;
  } else {
    evalSel.value = defaultEval;
  }
}

function toggleNewEmployeeRow(show) {
  document.getElementById("new-employee-row").hidden = !show;
  document.getElementById("btn-add-employee").hidden = show;
  document.getElementById("btn-remove-employee").hidden = show;
  if (show) document.getElementById("new-employee-name").focus();
  else document.getElementById("new-employee-name").value = "";
}

async function handleConfirmAddEmployee() {
  const name = document.getElementById("new-employee-name").value.trim();
  const storeId = document.getElementById("f-store").value;
  if (!name || !storeId) return;
  await api("/api/store-employees", { method: "POST", body: JSON.stringify({ store_id: storeId, name }) });
  await loadStoreEmployees(storeId);
  document.getElementById("f-employee").value = name;
  toggleNewEmployeeRow(false);
}

async function handleRemoveEmployee() {
  const sel = document.getElementById("f-employee");
  const name = sel.value;
  if (!name) return;
  const entry = (state.storeEmployees || []).find((e) => e.name === name);
  if (!entry) return;
  if (!confirm(`${t("confirm_remove_employee")}${name}？`)) return;
  await api(`/api/store-employees/${entry.id}`, { method: "DELETE" });
  await loadStoreEmployees(document.getElementById("f-store").value);
}

function toggleNewEvaluatorRow(show) {
  document.getElementById("new-evaluator-row").hidden = !show;
  document.getElementById("btn-add-evaluator").hidden = show;
  document.getElementById("btn-remove-evaluator").hidden = show;
  if (show) document.getElementById("new-evaluator-name").focus();
  else document.getElementById("new-evaluator-name").value = "";
}

async function handleConfirmAddEvaluator() {
  const name = document.getElementById("new-evaluator-name").value.trim();
  const storeId = document.getElementById("f-store").value;
  if (!name || !storeId) return;
  await api("/api/store-employees", { method: "POST", body: JSON.stringify({ store_id: storeId, name }) });
  await loadStoreEmployees(storeId);
  document.getElementById("f-evaluator").value = name;
  toggleNewEvaluatorRow(false);
}

async function handleRemoveEvaluator() {
  const sel = document.getElementById("f-evaluator");
  const name = sel.value;
  if (!name || name === state.user.name) return;
  const entry = (state.storeEmployees || []).find((e) => e.name === name);
  if (!entry) return;
  if (!confirm(`${t("confirm_remove_evaluator")}${name}？`)) return;
  await api(`/api/store-employees/${entry.id}`, { method: "DELETE" });
  await loadStoreEmployees(document.getElementById("f-store").value);
}

function toggleNewStoreRow(show) {
  document.getElementById("new-store-row").hidden = !show;
  document.getElementById("btn-add-store").hidden = show;
  if (show) document.getElementById("new-store-name").focus();
  else document.getElementById("new-store-name").value = "";
}

async function handleConfirmAddStore() {
  const name = document.getElementById("new-store-name").value.trim();
  if (!name) return;
  await api("/api/stores", { method: "POST", body: JSON.stringify({ name }) });
  await refreshAllStoreSelects();
  document.getElementById("f-store").value = state.submitStores.find((s) => s.name === name)?.id || "";
  await loadStoreEmployees(document.getElementById("f-store").value);
  toggleNewStoreRow(false);
}

function collectItems() {
  const items = {};
  document.querySelectorAll(".category-block:not(.excluded) input[type=checkbox][data-item]").forEach((box) => {
    const id = box.dataset.item;
    const feedbackEl = document.querySelector(`[data-feedback="${id}"]`);
    items[id] = { checked: box.checked, feedback: feedbackEl ? feedbackEl.value : "" };
  });
  return items;
}

async function resetScoreForm() {
  document.querySelectorAll('#categories-container input[type=checkbox]').forEach((b) => {
    b.checked = false;
    b.disabled = false;
  });
  document.querySelectorAll('#categories-container input.item-feedback').forEach((b) => {
    b.value = "";
    b.disabled = false;
  });
  document.querySelectorAll('.category-block.excluded').forEach((b) => b.classList.remove("excluded"));
  document.querySelectorAll('#feelings-options input').forEach((b) => (b.checked = false));
  document.getElementById("f-overall-feedback").value = "";
  document.getElementById("f-employee").value = "";
  await loadStoreEmployees(document.getElementById("f-store").value);
  updateTotals();
}

// ---------- Score card image export ----------
const FONT_SANS = "'PingFang TC', 'Microsoft JhengHei', 'Helvetica Neue', Arial, sans-serif";
const FONT_SERIF = "Georgia, 'Noto Serif TC', 'PMingLiU', serif";
const GRADE_COLORS = { excellent: "#4b6043", pass: "#8a7346", growing: "#8a4b32" };

function wrapCanvasText(ctx, text, maxWidth) {
  const tokens = String(text).match(/[A-Za-z0-9.,%:;()\/\-']+|./gs) || [];
  const lines = [];
  let cur = "";
  for (const tok of tokens) {
    const test = cur + tok;
    if (cur && ctx.measureText(test).width > maxWidth) {
      lines.push(cur);
      cur = tok;
    } else {
      cur = test;
    }
  }
  lines.push(cur);
  return lines;
}

function renderScoreCardLayout(ctx, d, draw) {
  const W = 900;
  const PAD = 36;
  const contentW = W - PAD * 2;
  let y = PAD;

  const grouped = {};
  (d.items || []).forEach((it) => {
    grouped[it.category] = grouped[it.category] || [];
    grouped[it.category].push(it);
  });

  if (draw) {
    ctx.fillStyle = "#faf7f2";
    ctx.fillRect(0, 0, W, ctx.canvas.height);
    ctx.fillStyle = "#13233c";
    ctx.fillRect(0, 0, W, 8);
  }

  ctx.font = `600 13px ${FONT_SERIF}`;
  ctx.fillStyle = "#8a7346";
  if (draw) ctx.fillText("RALPH LAUREN", PAD, y + 30);
  y += 32;

  ctx.font = `700 26px ${FONT_SERIF}`;
  ctx.fillStyle = "#13233c";
  if (draw) ctx.fillText("5C Role Play 評分紀錄", PAD, y + 20);
  y += 44;

  ctx.font = `14px ${FONT_SANS}`;
  ctx.fillStyle = "#444";
  const metaLine = `${d.eval_date}　${d.store_name}　${d.employee_name}`;
  if (draw) ctx.fillText(metaLine, PAD, y + 14);
  y += 22;
  const metaLine2 = `Role Play 觀察人：${d.evaluator_name}`;
  if (draw) ctx.fillText(metaLine2, PAD, y + 14);
  y += 36;

  ctx.font = `700 32px ${FONT_SERIF}`;
  ctx.fillStyle = "#13233c";
  const scoreText = `${d.total_score} / ${d.max_score}`;
  if (draw) ctx.fillText(scoreText, PAD, y + 26);
  const scoreW = ctx.measureText(scoreText).width;

  ctx.font = `600 16px ${FONT_SANS}`;
  ctx.fillStyle = GRADE_COLORS[d.grade] || "#8a7346";
  if (draw) ctx.fillText(gradeLabel(d.grade), PAD + scoreW + 16, y + 22);
  y += 48;

  if (d.overall_feelings && d.overall_feelings.length) {
    ctx.font = `13px ${FONT_SANS}`;
    ctx.fillStyle = "#666";
    const feelLines = wrapCanvasText(ctx, `${t("detail_feelings_label")}${d.overall_feelings.join("、")}`, contentW);
    feelLines.forEach((line) => {
      if (draw) ctx.fillText(line, PAD, y + 12);
      y += 20;
    });
  }
  y += 8;

  if (draw) {
    ctx.strokeStyle = "#d8cdb8";
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
  }
  y += 20;

  CATEGORY_ORDER.forEach((cat) => {
    const items = grouped[cat] || [];
    if (!items.length) return;
    const catName = state.rubric.categories.find((c) => c.key === cat)?.name || cat;

    if (draw) {
      ctx.fillStyle = CATEGORY_COLORS[cat] || "#13233c";
      ctx.fillRect(PAD, y, 4, 22);
    }
    ctx.font = `700 16px ${FONT_SANS}`;
    ctx.fillStyle = "#13233c";
    if (draw) ctx.fillText(catName, PAD + 12, y + 16);
    y += 32;

    items.forEach((it) => {
      const rubricItem = state.rubric.categories.find((c) => c.key === cat)?.items.find((i) => i.id === it.item_id);
      const text = rubricItem ? rubricItem.text : it.item_id;
      const checked = it.actual_score > 0;

      ctx.font = `14px ${FONT_SANS}`;
      const scoreLabel = `${it.actual_score}/${it.max_score}`;
      const scoreLabelW = ctx.measureText(scoreLabel).width;
      const itemTextW = contentW - 24 - scoreLabelW - 12;
      const lines = wrapCanvasText(ctx, text, itemTextW);

      if (draw) {
        ctx.fillStyle = checked ? "#4b6043" : "#b7b0a3";
        ctx.fillText(checked ? "✓" : "－", PAD, y + 12);
        ctx.fillStyle = "#222";
      }
      lines.forEach((line, i) => {
        if (draw) ctx.fillText(line, PAD + 20, y + 12 + i * 20);
      });
      if (draw) {
        ctx.fillStyle = "#666";
        ctx.font = `13px ${FONT_SANS}`;
        ctx.textAlign = "right";
        ctx.fillText(scoreLabel, W - PAD, y + 12);
        ctx.textAlign = "left";
      }
      y += Math.max(20, lines.length * 20);

      if (it.feedback) {
        ctx.font = `italic 13px ${FONT_SANS}`;
        const fbLines = wrapCanvasText(ctx, `→ ${it.feedback}`, contentW - 20);
        fbLines.forEach((line) => {
          if (draw) {
            ctx.fillStyle = "#8a7346";
            ctx.fillText(line, PAD + 20, y + 10);
          }
          y += 18;
        });
      }
      y += 6;
    });
    y += 10;
  });

  if (d.overall_feedback) {
    y += 4;
    if (draw) {
      ctx.strokeStyle = "#d8cdb8";
      ctx.beginPath();
      ctx.moveTo(PAD, y);
      ctx.lineTo(W - PAD, y);
      ctx.stroke();
    }
    y += 20;
    ctx.font = `700 14px ${FONT_SANS}`;
    ctx.fillStyle = "#13233c";
    if (draw) ctx.fillText(t("field_overall_feedback"), PAD, y + 12);
    y += 24;
    ctx.font = `14px ${FONT_SANS}`;
    ctx.fillStyle = "#333";
    const fbLines = wrapCanvasText(ctx, d.overall_feedback, contentW);
    fbLines.forEach((line) => {
      if (draw) ctx.fillText(line, PAD, y + 12);
      y += 20;
    });
  }

  y += 30;
  return y;
}

function renderScoreCardImage(d) {
  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = 900;
  measureCanvas.height = 10;
  const measureCtx = measureCanvas.getContext("2d");
  const totalHeight = Math.ceil(renderScoreCardLayout(measureCtx, d, false));

  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d");
  renderScoreCardLayout(ctx, d, true);
  return canvas;
}

function downloadCanvasAsImage(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

function safeFilenamePart(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, "_");
}

async function exportEvaluationImage(evaluationId) {
  const d = await api(`/api/evaluations/${evaluationId}`);
  const canvas = renderScoreCardImage(d);
  const filename = `5C_${safeFilenamePart(d.eval_date)}_${safeFilenamePart(d.store_name)}_${safeFilenamePart(d.employee_name)}.png`;
  downloadCanvasAsImage(canvas, filename);
}

async function handleSubmit(e) {
  e.preventDefault();
  const msg = document.getElementById("submit-msg");
  const exportBtn = document.getElementById("btn-export-image");
  msg.textContent = "";
  msg.className = "submit-msg";
  exportBtn.hidden = true;

  const payload = {
    eval_date: document.getElementById("f-date").value,
    store_id: document.getElementById("f-store").value,
    employee_name: document.getElementById("f-employee").value.trim(),
    evaluator_name: document.getElementById("f-evaluator").value.trim(),
    overall_feelings: Array.from(document.querySelectorAll('input[name=feeling]:checked')).map((c) => c.value),
    overall_feedback: document.getElementById("f-overall-feedback").value,
    items: collectItems(),
  };

  try {
    const result = await api("/api/evaluations", { method: "POST", body: JSON.stringify(payload) });
    msg.textContent = `${t("msg_saved_prefix")} ${result.total_score} / ${result.max_score}${t("msg_saved_grade")}${gradeLabel(result.grade)}`;
    msg.className = "submit-msg success";
    exportBtn.hidden = false;
    exportBtn.onclick = () => exportEvaluationImage(result.id);
    resetScoreForm();
    refreshEmployeeDatalist();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "submit-msg error";
  }
}

// ---------- History ----------
async function loadHistory() {
  const params = new URLSearchParams();
  const storeId = document.getElementById("h-store").value;
  const employee = document.getElementById("h-employee").value;
  const dateFrom = document.getElementById("h-date-from").value;
  const dateTo = document.getElementById("h-date-to").value;
  if (storeId) params.set("store_id", storeId);
  if (employee) params.set("employee_name", employee);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);

  const rows = await api(`/api/evaluations?${params.toString()}`);
  const tbody = document.querySelector("#history-table tbody");
  tbody.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.innerHTML = `<td>${r.eval_date}</td><td>${r.store_name}</td><td>${r.employee_name}</td><td>${r.evaluator_name}</td>
      <td>${r.total_score} / ${r.max_score}</td><td><span class="pill pill-${r.grade}">${gradeLabel(r.grade)}</span></td><td>${t("view_detail_link")}</td>`;
    tr.addEventListener("click", () => showHistoryDetail(r.id));
    tbody.appendChild(tr);
  });
  document.getElementById("history-detail").hidden = true;
}

async function showHistoryDetail(id) {
  const d = await api(`/api/evaluations/${id}`);
  const panel = document.getElementById("history-detail");
  panel.hidden = false;
  const grouped = {};
  d.items.forEach((it) => {
    grouped[it.category] = grouped[it.category] || [];
    grouped[it.category].push(it);
  });
  let html = `<h4>${d.eval_date} · ${d.store_name} · ${d.employee_name}（${t("detail_evaluator_label")}${d.evaluator_name}）</h4>
    <p>${t("detail_total_label")}<strong>${d.total_score} / ${d.max_score}</strong>${t("detail_grade_label")}<span class="pill pill-${d.grade}">${gradeLabel(d.grade)}</span></p>
    <p>${t("detail_feelings_label")}${d.overall_feelings.join("、") || t("detail_feelings_none")}</p>`;
  if (d.overall_feedback) html += `<p>${t("detail_feedback_label")}${d.overall_feedback}</p>`;

  CATEGORY_ORDER.forEach((cat) => {
    const items = grouped[cat] || [];
    if (!items.length) return;
    const catName = state.rubric.categories.find((c) => c.key === cat)?.name || cat;
    html += `<h4>${catName}</h4>`;
    items.forEach((it) => {
      const rubricItem = state.rubric.categories.find((c) => c.key === cat)?.items.find((i) => i.id === it.item_id);
      const text = rubricItem ? rubricItem.text : it.item_id;
      html += `<div class="detail-item"><div class="txt">${text}${it.feedback ? `<br><em>${t("detail_item_feedback_label")}${it.feedback}</em>` : ""}</div><div class="sc">${it.actual_score} / ${it.max_score}</div></div>`;
    });
  });
  html += `<button type="button" id="btn-export-detail-image" class="btn-ghost">${t("btn_export_image")}</button>`;
  panel.innerHTML = html;
  document.getElementById("btn-export-detail-image").addEventListener("click", () => exportEvaluationImage(id));
}

// ---------- Analytics ----------
async function refreshAnalytics() {
  await renderCategoryChart();
  await renderItemBreakdown();
}

async function renderCategoryChart() {
  const storeId = document.getElementById("a-store").value;
  const params = new URLSearchParams();
  if (storeId) params.set("store_id", storeId);
  const data = await api(withLang(`/api/analytics/category-breakdown?${params.toString()}`));

  const ctx = document.getElementById("chart-category");
  if (state.categoryChart) state.categoryChart.destroy();
  state.categoryChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map((d) => d.name),
      datasets: [
        {
          label: t("th_pct"),
          data: data.map((d) => d.pct ?? 0),
          backgroundColor: data.map((d) => CATEGORY_COLORS[d.category]),
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { min: 0, max: 100 } },
      plugins: { legend: { display: false } },
    },
  });

  const withScores = data.filter((d) => d.pct !== null);
  const bestEl = document.getElementById("highlight-best");
  const worstEl = document.getElementById("highlight-worst");
  if (withScores.length) {
    const best = withScores.reduce((a, b) => (b.pct > a.pct ? b : a));
    const worst = withScores.reduce((a, b) => (b.pct < a.pct ? b : a));
    bestEl.textContent = `${best.name} · ${best.pct}%`;
    worstEl.textContent = `${worst.name} · ${worst.pct}%`;
  } else {
    bestEl.textContent = "－";
    worstEl.textContent = "－";
  }
}

async function renderItemBreakdown() {
  const storeId = document.getElementById("a-store").value;
  const params = new URLSearchParams();
  if (storeId) params.set("store_id", storeId);
  const data = await api(withLang(`/api/analytics/item-breakdown?${params.toString()}`));
  const scored = data.filter((d) => d.pct !== null);

  const fillTable = (selector, rows) => {
    const tbody = document.querySelector(`${selector} tbody`);
    tbody.innerHTML = "";
    rows.forEach((d) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${d.category}</td><td>${d.text}</td><td>${d.pct ?? "-"}%</td><td>${d.n}</td>`;
      tbody.appendChild(tr);
    });
  };

  fillTable("#weak-items-table", scored.slice(0, 10));
  fillTable("#strong-items-table", scored.slice(-10).reverse());
}

async function renderEmployeeTrend() {
  const employee = document.getElementById("a-employee").value;
  const chartCanvas = document.getElementById("chart-employee-trend");
  const tbody = document.querySelector("#employee-trend-table tbody");
  tbody.innerHTML = "";
  if (state.trendChart) state.trendChart.destroy();
  if (!employee) return;

  const trend = await api(`/api/analytics/employee-trend?employee_name=${encodeURIComponent(employee)}`);

  state.trendChart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels: trend.map((row) => row.eval_date),
      datasets: [
        {
          label: t("th_total"),
          data: trend.map((row) => row.total_score),
          borderColor: "#0f2a4a",
          backgroundColor: "#0f2a4a",
          tension: 0.2,
        },
        ...CATEGORY_ORDER.map((cat) => ({
          label: cat,
          data: trend.map((row) => row.categories[cat] ?? null),
          borderColor: CATEGORY_COLORS[cat],
          backgroundColor: CATEGORY_COLORS[cat],
          tension: 0.2,
          hidden: true,
        })),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100 } },
    },
  });

  trend.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.eval_date}</td><td>${row.total_score}</td><td><span class="pill pill-${row.grade}">${gradeLabel(row.grade)}</span></td>` +
      CATEGORY_ORDER.map((c) => `<td>${row.categories[c] ?? "-"}%</td>`).join("");
    tbody.appendChild(tr);
  });
}

// ---------- Auth ----------
function showLogin() {
  document.getElementById("login-screen").hidden = false;
  document.getElementById("app-shell").hidden = true;
}

function renderUserLabel() {
  const roleKey = { store_manager: "role_store_manager", rm: "role_rm", admin: "role_admin", viewer: "role_viewer" }[state.user.role] || "";
  const roleLabel = roleKey ? t(roleKey) : "";
  let scopeName = "";
  if (state.user.role === "rm") {
    scopeName = state.user.region_name || "";
  } else if (state.user.role === "store_manager") {
    const stores = state.user.stores || [];
    scopeName = stores.length > 1 ? stores.map((s) => s.name).join("、") : state.user.home_store_name || "";
  }
  const scopePart = scopeName ? ` · ${scopeName}` : "";
  document.getElementById("user-label").textContent = `${t("logged_in_as")}${state.user.name}（${roleLabel}${scopePart}）`;
  document.getElementById("btn-add-store").hidden = state.user.role !== "admin";
}

function renderLoginNameOptions(directory, filterKey) {
  const groups = new Map(); // label -> [names]
  const regionOrder = ["北一區", "北二區", "中區", "南區"];

  const pushTo = (label, name) => {
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(name);
  };

  directory.forEach((u) => {
    let category;
    if (u.role === "admin" || u.role === "viewer") category = "ADMIN";
    else if (u.role === "rm") category = "RM";
    else category = u.region_name || "";
    if (filterKey && category !== filterKey) return;

    if (u.role === "admin" || u.role === "viewer") {
      pushTo(t("role_admin"), u.name);
    } else if (u.role === "rm") {
      pushTo("RM", u.name);
    } else {
      const region = u.region_name || "";
      const sub = u.title_group === "Supervisor" ? "Supervisor" : "Store Manager";
      pushTo(`${region}・${sub}`, u.name);
    }
  });

  const orderedLabels = [];
  regionOrder.forEach((r) => {
    orderedLabels.push(`${r}・Store Manager`, `${r}・Supervisor`);
  });
  orderedLabels.push("RM", t("role_admin"));
  // catch any region not in the known order (e.g. newly added ones)
  Array.from(groups.keys()).forEach((label) => {
    if (!orderedLabels.includes(label)) orderedLabels.push(label);
  });

  const sel = document.getElementById("login-name");
  sel.innerHTML = orderedLabels
    .filter((label) => groups.has(label))
    .map((label) => {
      const opts = groups.get(label).sort((a, b) => a.localeCompare(b)).map((n) => `<option value="${n}">${n}</option>`).join("");
      return `<optgroup label="${label}">${opts}</optgroup>`;
    })
    .join("");
}

async function populateLoginNames() {
  const directory = await api("/api/users/directory");
  const regionOrder = ["北一區", "北二區", "中區", "南區"];

  const categories = new Set();
  directory.forEach((u) => {
    if (u.role === "admin" || u.role === "viewer") categories.add("ADMIN");
    else if (u.role === "rm") categories.add("RM");
    else categories.add(u.region_name || "");
  });

  const filterSel = document.getElementById("login-name-region");
  const filterOptions = [];
  regionOrder.forEach((r) => {
    if (categories.has(r)) filterOptions.push([r, r]);
  });
  if (categories.has("RM")) filterOptions.push(["RM", "RM"]);
  if (categories.has("ADMIN")) filterOptions.push(["ADMIN", t("role_admin")]);
  filterSel.innerHTML = `<option value="">${t("region_all")}</option>` +
    filterOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");

  renderLoginNameOptions(directory, filterSel.value);
  if (!filterSel.dataset.wired) {
    filterSel.addEventListener("change", () => renderLoginNameOptions(directory, filterSel.value));
    filterSel.dataset.wired = "1";
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  const name = document.getElementById("login-name").value;
  const pin = document.getElementById("login-pin").value;
  try {
    const user = await api("/api/login", { method: "POST", body: JSON.stringify({ name, pin }) });
    document.getElementById("login-pin").value = "";
    await enterApp(user);
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function handleLogout() {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  location.reload();
}

async function enterApp(user) {
  state.user = user;
  document.getElementById("login-screen").hidden = true;
  document.getElementById("app-shell").hidden = false;
  renderUserLabel();
  if (!state.booted) {
    state.booted = true;
    setupNav();
    state.rubric = await api(withLang("/api/rubric"));
    renderFeelings();
    renderCategories();
    document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);
    document.getElementById("btn-add-store").addEventListener("click", () => toggleNewStoreRow(true));
    document.getElementById("btn-cancel-store").addEventListener("click", () => toggleNewStoreRow(false));
    document.getElementById("btn-confirm-store").addEventListener("click", handleConfirmAddStore);
    document.getElementById("f-store").addEventListener("change", (e) => loadStoreEmployees(e.target.value));
    document.getElementById("btn-add-employee").addEventListener("click", () => toggleNewEmployeeRow(true));
    document.getElementById("btn-cancel-employee").addEventListener("click", () => toggleNewEmployeeRow(false));
    document.getElementById("btn-confirm-employee").addEventListener("click", handleConfirmAddEmployee);
    document.getElementById("btn-remove-employee").addEventListener("click", handleRemoveEmployee);
    document.getElementById("btn-add-evaluator").addEventListener("click", () => toggleNewEvaluatorRow(true));
    document.getElementById("btn-cancel-evaluator").addEventListener("click", () => toggleNewEvaluatorRow(false));
    document.getElementById("btn-confirm-evaluator").addEventListener("click", handleConfirmAddEvaluator);
    document.getElementById("btn-remove-evaluator").addEventListener("click", handleRemoveEvaluator);
    document.getElementById("score-form").addEventListener("submit", handleSubmit);
    document.getElementById("btn-filter-history").addEventListener("click", loadHistory);
    document.getElementById("btn-refresh-analytics").addEventListener("click", refreshAnalytics);
    document.getElementById("a-employee").addEventListener("change", renderEmployeeTrend);
  }
  // Scope-dependent data: always refresh on (re)entry in case a different user just logged in.
  await refreshAllStoreSelects();
  await refreshEmployeeDatalist();
  renderUserLabel();
}

// ---------- Init ----------
async function init() {
  state.lang = getStoredLang();
  await loadI18n();
  applyStaticTranslations();
  setupLangSwitcher("btn-lang", "lang-menu");
  setupLangSwitcher("btn-lang-login", "lang-menu-login");

  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("btn-logout").addEventListener("click", handleLogout);

  await populateLoginNames();

  const user = await api("/api/me").catch(() => null);
  if (user) {
    await enterApp(user);
  } else {
    showLogin();
  }
}

init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
