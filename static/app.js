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

async function loadStoresInto(selectEl, includeAllOption, labelAll, endpoint = "/api/stores") {
  const stores = await api(endpoint);
  if (endpoint === "/api/stores?for=submit") state.submitStores = stores;
  else state.stores = stores;
  selectEl.querySelectorAll("option:not([data-keep])").forEach((o) => o.remove());
  if (includeAllOption) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = labelAll;
    opt.dataset.keep = "1";
    selectEl.appendChild(opt);
  }
  stores.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    selectEl.appendChild(opt);
  });
}

async function refreshAllStoreSelects() {
  await loadStoresInto(document.getElementById("f-store"), false, "", "/api/stores?for=submit");
  await loadStoresInto(document.getElementById("h-store"), true, t("filter_store_all"));
  await loadStoresInto(document.getElementById("a-store"), true, t("filter_store_range_all"));
}

async function refreshEmployeeDatalist() {
  const employees = await api("/api/employees");
  const dl = document.getElementById("employee-list");
  dl.innerHTML = employees.map((e) => `<option value="${e}">`).join("");
  const evaluators = await api("/api/evaluators");
  const dl2 = document.getElementById("evaluator-list");
  dl2.innerHTML = evaluators.map((e) => `<option value="${e}">`).join("");

  const hSel = document.getElementById("h-employee");
  hSel.innerHTML = `<option value="">${t("filter_employee_all")}</option>` + employees.map((e) => `<option value="${e}">${e}</option>`).join("");
  const aSel = document.getElementById("a-employee");
  aSel.innerHTML = `<option value="">${t("select_employee_placeholder")}</option>` + employees.map((e) => `<option value="${e}">${e}</option>`).join("");
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

function resetScoreForm() {
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
  updateTotals();
}

async function handleSubmit(e) {
  e.preventDefault();
  const msg = document.getElementById("submit-msg");
  msg.textContent = "";
  msg.className = "submit-msg";

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
  panel.innerHTML = html;
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
  const roleKey = { store_manager: "role_store_manager", rm: "role_rm", admin: "role_admin" }[state.user.role] || "";
  const roleLabel = roleKey ? t(roleKey) : "";
  const scopeName = state.user.role === "rm" ? state.user.region_name : state.user.home_store_name;
  const scopePart = scopeName ? ` · ${scopeName}` : "";
  document.getElementById("user-label").textContent = `${t("logged_in_as")}${state.user.name}（${roleLabel}${scopePart}）`;
  document.getElementById("btn-add-store").hidden = state.user.role !== "admin";
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

  const names = await api("/api/users/names");
  document.getElementById("login-name").innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join("");

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
