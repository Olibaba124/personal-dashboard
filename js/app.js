// ============ Tab navigation ============
function initTabs(triggerSelector, panelPrefix, dataAttr) {
  const triggers = document.querySelectorAll(triggerSelector);
  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const target = trigger.getAttribute(dataAttr);

      triggers.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      trigger.classList.add("active");
      trigger.setAttribute("aria-selected", "true");

      document.querySelectorAll(`.${panelPrefix}`).forEach((panel) => {
        panel.classList.remove("active");
      });
      document.getElementById(target).classList.add("active");
    });
  });
}

// ============ Stock ticker (Phase 0: hardcoded watchlist, static numbers) ============
const WATCHLIST = [
  { symbol: "SPY", price: "641.23", delta: "+0.34%", up: true },
  { symbol: "QQQ", price: "572.88", delta: "+0.61%", up: true },
  { symbol: "AAPL", price: "231.10", delta: "-0.12%", up: false },
  { symbol: "NVDA", price: "178.44", delta: "+1.05%", up: true },
  { symbol: "VNQ", price: "88.02", delta: "-0.28%", up: false },
  { symbol: "BTC-USD", price: "112,340", delta: "+2.14%", up: true },
];

function renderTicker() {
  const track = document.getElementById("ticker-track");
  const items = WATCHLIST.map((item) => tickerItemHTML(item)).join("");
  // duplicate content so the scroll loop is seamless
  track.innerHTML = items + items;
}

function tickerItemHTML(item) {
  const deltaClass = item.up ? "ticker-delta--up" : "ticker-delta--down";
  const arrow = item.up ? "▲" : "▼";
  return `
    <span class="ticker-item">
      <span class="ticker-symbol">${item.symbol}</span>
      <span class="ticker-price">${item.price}</span>
      <span class="${deltaClass}">${arrow}${item.delta}</span>
    </span>
  `;
}

// ============ Greeting ============
function renderGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  document.getElementById("greeting-text").textContent = `${greeting}, Oliver`;
  document.getElementById("greeting-meta").textContent = dateStr;
}

// ============ To-do list ============
const DEFER_STUCK_THRESHOLD = 3;
let todos = [];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function fetchTodos() {
  const rowsEl = document.getElementById("todo-rows");
  const { data, error } = await supabaseClient
    .from("todos")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    rowsEl.innerHTML = `<div class="todo-empty">Couldn't load to-dos — ${escapeHtml(error.message)}</div>`;
    return;
  }

  todos = data;
  renderTodos();
  renderPressingBand();
}

function renderTodos() {
  const rowsEl = document.getElementById("todo-rows");
  const countEl = document.getElementById("todo-count");
  const completedCount = todos.filter((t) => t.completed).length;
  countEl.textContent = `TO-DO · ${completedCount}/${todos.length}`;

  if (todos.length === 0) {
    rowsEl.innerHTML = `<div class="todo-empty">No to-dos yet — type one into capture above.</div>`;
    return;
  }

  rowsEl.innerHTML = todos.map(todoRowHTML).join("");

  rowsEl.querySelectorAll(".todo-checkbox").forEach((el) => {
    el.addEventListener("change", () => toggleTodo(Number(el.dataset.id), el.checked));
  });
  rowsEl.querySelectorAll(".todo-defer").forEach((el) => {
    el.addEventListener("click", () => deferTodo(Number(el.dataset.id)));
  });
  rowsEl.querySelectorAll(".todo-delete").forEach((el) => {
    el.addEventListener("click", () => deleteTodo(Number(el.dataset.id)));
  });
}

function todoRowHTML(todo) {
  const rowClass = todo.completed ? "todo-row todo-row--completed" : "todo-row";
  const badge = todo.defer_count >= DEFER_STUCK_THRESHOLD ? `<span class="todo-badge">${todo.defer_count}×</span>` : "";
  return `
    <div class="${rowClass}">
      <input type="checkbox" class="todo-checkbox" data-id="${todo.id}" ${todo.completed ? "checked" : ""} />
      <span class="todo-text">${escapeHtml(todo.text)}</span>
      ${badge}
      <span class="todo-actions">
        <button class="todo-defer" data-id="${todo.id}" title="Defer">›</button>
        <button class="todo-delete" data-id="${todo.id}" title="Delete">×</button>
      </span>
    </div>
  `;
}

function renderPressingBand() {
  const band = document.getElementById("pressing-band");
  const header = document.getElementById("pressing-header");
  const items = document.getElementById("pressing-items");

  const stuck = todos.filter((t) => !t.completed && t.defer_count >= DEFER_STUCK_THRESHOLD);

  header.textContent = `Pressing — ${stuck.length} item${stuck.length === 1 ? "" : "s"}`;

  if (stuck.length === 0) {
    band.classList.add("pressing-band--empty");
    items.innerHTML = `<div class="pressing-empty">Nothing pressing.</div>`;
    return;
  }

  band.classList.remove("pressing-band--empty");
  items.innerHTML = stuck
    .map(
      (t) => `
      <div class="pressing-row">
        <span>${escapeHtml(t.text)}</span>
        <span class="pressing-row-reason">deferred ${t.defer_count}×</span>
      </div>
    `
    )
    .join("");
}

async function addTodo(text) {
  const { error } = await supabaseClient.from("todos").insert({ text });
  if (error) {
    console.error("Failed to add to-do:", error.message);
    return;
  }
  await fetchTodos();
}

async function toggleTodo(id, completed) {
  const { error } = await supabaseClient
    .from("todos")
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) {
    console.error("Failed to update to-do:", error.message);
    return;
  }
  await fetchTodos();
}

async function deferTodo(id) {
  const current = todos.find((t) => t.id === id);
  if (!current) return;
  const { error } = await supabaseClient
    .from("todos")
    .update({ defer_count: current.defer_count + 1 })
    .eq("id", id);
  if (error) {
    console.error("Failed to defer to-do:", error.message);
    return;
  }
  await fetchTodos();
}

async function deleteTodo(id) {
  const { error } = await supabaseClient
    .from("todos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Failed to delete to-do:", error.message);
    return;
  }
  await fetchTodos();
}

// ============ Quick capture (V1: everything typed becomes a to-do) ============
function initCapture() {
  const captureInput = document.getElementById("capture-input");
  const hint = document.getElementById("capture-hint");
  if (!captureInput) return;

  captureInput.focus();

  captureInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    const text = captureInput.value.trim();
    if (!text) return;

    captureInput.value = "";
    await addTodo(text);

    hint.textContent = "→ to-do";
    setTimeout(() => {
      hint.textContent = "";
    }, 1500);

    captureInput.focus();
  });
}

// ============ Entry point — called by auth.js once login succeeds ============
window.initDashboard = function initDashboard() {
  initTabs(".tab", "tab-panel", "data-tab");
  initTabs(".subtab", "subtab-panel", "data-subtab");
  renderTicker();
  renderGreeting();
  initCapture();
  fetchTodos();

  document.getElementById("todo-add-icon").addEventListener("click", () => {
    document.getElementById("capture-input").focus();
  });
};
