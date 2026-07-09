const state = {
  rubric: null,
  stores: [],
  categoryChart: null,
  trendChart: null,
};

const CATEGORY_ORDER = ["CREATE", "CONNECT", "CONVERT", "CONFIRM", "CONTINUE"];
const CATEGORY_COLORS = {
  CREATE: "#b08b3f",
  CONNECT: "#1c3f6e",
  CONVERT: "#2e7d32",
  CONFIRM: "#8e44ad",
  CONTINUE: "#c0392b",
};

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "請求失敗");
  }
  return res.json();
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
      <div class="category-subtotal" data-subtotal="${cat.key}">0 / ${cat.items.reduce((s, i) => s + i.max, 0)}</div>`;
    block.appendChild(header);

    cat.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `
        <input type="checkbox" data-item="${item.id}" data-max="${item.max}" data-category="${cat.key}">
        <div class="item-text">${item.text}</div>
        <div class="item-max">${item.max} 分</div>
        <input type="text" class="item-feedback" data-feedback="${item.id}" placeholder="針對此項的反饋（可選）">
      `;
      block.appendChild(row);
    });
    container.appendChild(block);
  });

  const summary = document.createElement("div");
  summary.className = "sticky-summary";
  summary.innerHTML = `<div>總分：<span class="score" id="live-total">0</span> / ${state.rubric.totalMaxScore}
    <span class="grade" id="live-grade">未評分</span></div>
    <button type="submit" class="btn-primary btn-submit">提交評分</button>`;
  container.appendChild(summary);

  container.addEventListener("change", (e) => {
    if (e.target.matches("input[type=checkbox][data-item]")) updateTotals();
  });
  updateTotals();
}

function updateTotals() {
  let grandTotal = 0;
  CATEGORY_ORDER.forEach((catKey) => {
    const boxes = document.querySelectorAll(`input[data-category="${catKey}"]`);
    let sub = 0;
    let max = 0;
    boxes.forEach((b) => {
      max += Number(b.dataset.max);
      if (b.checked) sub += Number(b.dataset.max);
    });
    grandTotal += sub;
    const el = document.querySelector(`[data-subtotal="${catKey}"]`);
    if (el) el.textContent = `${sub} / ${max}`;
  });
  document.getElementById("live-total").textContent = grandTotal;
  const gradeEl = document.getElementById("live-grade");
  let grade = "不合格";
  if (grandTotal >= 90) grade = "優秀";
  else if (grandTotal >= 85) grade = "合格";
  gradeEl.textContent = grade;
  gradeEl.className = `grade grade-${grade}`;
}

async function loadStoresInto(selectEl, includeAllOption, labelAll) {
  const stores = await api("/api/stores");
  state.stores = stores;
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
  await loadStoresInto(document.getElementById("f-store"), false, "");
  await loadStoresInto(document.getElementById("h-store"), true, "全部門店");
  await loadStoresInto(document.getElementById("a-store"), true, "全店鋪（全部門店）");
}

async function refreshEmployeeDatalist() {
  const employees = await api("/api/employees");
  const dl = document.getElementById("employee-list");
  dl.innerHTML = employees.map((e) => `<option value="${e}">`).join("");
  const evaluators = await api("/api/evaluators");
  const dl2 = document.getElementById("evaluator-list");
  dl2.innerHTML = evaluators.map((e) => `<option value="${e}">`).join("");

  const hSel = document.getElementById("h-employee");
  hSel.innerHTML = '<option value="">全部員工</option>' + employees.map((e) => `<option value="${e}">${e}</option>`).join("");
  const aSel = document.getElementById("a-employee");
  aSel.innerHTML = '<option value="">請選擇員工</option>' + employees.map((e) => `<option value="${e}">${e}</option>`).join("");
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
  document.getElementById("f-store").value = state.stores.find((s) => s.name === name)?.id || "";
  toggleNewStoreRow(false);
}

function collectItems() {
  const items = {};
  document.querySelectorAll("input[type=checkbox][data-item]").forEach((box) => {
    const id = box.dataset.item;
    const feedbackEl = document.querySelector(`[data-feedback="${id}"]`);
    items[id] = { checked: box.checked, feedback: feedbackEl ? feedbackEl.value : "" };
  });
  return items;
}

function resetScoreForm() {
  document.querySelectorAll('#categories-container input[type=checkbox]').forEach((b) => (b.checked = false));
  document.querySelectorAll('#categories-container input.item-feedback').forEach((b) => (b.value = ""));
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
    msg.textContent = `已儲存！總分 ${result.total_score} / 100，評級：${result.grade}`;
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
      <td>${r.total_score} / ${r.max_score}</td><td><span class="pill pill-${r.grade}">${r.grade}</span></td><td>檢視 ›</td>`;
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
  let html = `<h4>${d.eval_date} · ${d.store_name} · ${d.employee_name}（考核人：${d.evaluator_name}）</h4>
    <p>總分：<strong>${d.total_score} / ${d.max_score}</strong> ｜ 評級：<span class="pill pill-${d.grade}">${d.grade}</span></p>
    <p>總體感受：${d.overall_feelings.join("、") || "無"}</p>`;
  if (d.overall_feedback) html += `<p>整體反饋：${d.overall_feedback}</p>`;

  CATEGORY_ORDER.forEach((cat) => {
    const items = grouped[cat] || [];
    if (!items.length) return;
    const catName = state.rubric.categories.find((c) => c.key === cat)?.name || cat;
    html += `<h4>${catName}</h4>`;
    items.forEach((it) => {
      const rubricItem = state.rubric.categories.find((c) => c.key === cat)?.items.find((i) => i.id === it.item_id);
      const text = rubricItem ? rubricItem.text : it.item_id;
      html += `<div class="detail-item"><div class="txt">${text}${it.feedback ? `<br><em>反饋：${it.feedback}</em>` : ""}</div><div class="sc">${it.actual_score} / ${it.max_score}</div></div>`;
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
  const data = await api(`/api/analytics/category-breakdown?${params.toString()}`);

  const ctx = document.getElementById("chart-category");
  if (state.categoryChart) state.categoryChart.destroy();
  state.categoryChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map((d) => d.name),
      datasets: [
        {
          label: "達成率 (%)",
          data: data.map((d) => d.pct ?? 0),
          backgroundColor: data.map((d) => CATEGORY_COLORS[d.category]),
        },
      ],
    },
    options: {
      indexAxis: "y",
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
    bestEl.textContent = "尚無資料";
    worstEl.textContent = "尚無資料";
  }
}

async function renderItemBreakdown() {
  const storeId = document.getElementById("a-store").value;
  const params = new URLSearchParams();
  if (storeId) params.set("store_id", storeId);
  const data = await api(`/api/analytics/item-breakdown?${params.toString()}`);
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
      labels: trend.map((t) => t.eval_date),
      datasets: [
        {
          label: "總分",
          data: trend.map((t) => t.total_score),
          borderColor: "#0f2a4a",
          backgroundColor: "#0f2a4a",
          tension: 0.2,
        },
        ...CATEGORY_ORDER.map((cat) => ({
          label: cat,
          data: trend.map((t) => t.categories[cat] ?? null),
          borderColor: CATEGORY_COLORS[cat],
          backgroundColor: CATEGORY_COLORS[cat],
          tension: 0.2,
          hidden: true,
        })),
      ],
    },
    options: { scales: { y: { min: 0, max: 100 } } },
  });

  trend.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${t.eval_date}</td><td>${t.total_score}</td><td><span class="pill pill-${t.grade}">${t.grade}</span></td>` +
      CATEGORY_ORDER.map((c) => `<td>${t.categories[c] ?? "-"}%</td>`).join("");
    tbody.appendChild(tr);
  });
}

// ---------- Init ----------
async function init() {
  setupNav();
  state.rubric = await api("/api/rubric");
  renderFeelings();
  renderCategories();
  await refreshAllStoreSelects();
  await refreshEmployeeDatalist();

  document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("btn-add-store").addEventListener("click", () => toggleNewStoreRow(true));
  document.getElementById("btn-cancel-store").addEventListener("click", () => toggleNewStoreRow(false));
  document.getElementById("btn-confirm-store").addEventListener("click", handleConfirmAddStore);
  document.getElementById("score-form").addEventListener("submit", handleSubmit);
  document.getElementById("btn-filter-history").addEventListener("click", loadHistory);
  document.getElementById("btn-refresh-analytics").addEventListener("click", refreshAnalytics);
  document.getElementById("a-employee").addEventListener("change", renderEmployeeTrend);
}

init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
