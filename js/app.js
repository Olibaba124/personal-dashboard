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
  countEl.textContent = `TO-DO · ${todos.length}`;

  if (todos.length === 0) {
    rowsEl.innerHTML = `<div class="todo-empty">No to-dos yet — type one into capture above.</div>`;
    return;
  }

  rowsEl.innerHTML = todos.map(todoRowHTML).join("");

  rowsEl.querySelectorAll(".todo-checkbox").forEach((el) => {
    el.addEventListener("change", () => {
      if (el.checked) completeTodo(Number(el.dataset.id), el);
    });
  });
  rowsEl.querySelectorAll(".todo-defer").forEach((el) => {
    el.addEventListener("click", () => deferTodo(Number(el.dataset.id)));
  });
}

function todoRowHTML(todo) {
  const badge = todo.defer_count >= DEFER_STUCK_THRESHOLD ? `<span class="todo-badge">${todo.defer_count}×</span>` : "";
  return `
    <div class="todo-row" data-id="${todo.id}">
      <input type="checkbox" class="todo-checkbox" data-id="${todo.id}" />
      <span class="todo-text">${escapeHtml(todo.text)}</span>
      ${badge}
      <span class="todo-actions">
        <button class="todo-defer" data-id="${todo.id}" title="Defer">›</button>
      </span>
    </div>
  `;
}

function renderPressingBand() {
  const band = document.getElementById("pressing-band");
  const header = document.getElementById("pressing-header");
  const items = document.getElementById("pressing-items");

  const stuck = todos.filter((t) => t.defer_count >= DEFER_STUCK_THRESHOLD);

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

const TODO_POP_DURATION_MS = 260;

// Checking a task off both completes it (so Performance can later read
// completions) and clears it from the list, with a pop animation first.
function completeTodo(id, checkboxEl) {
  const row = checkboxEl.closest(".todo-row");
  row.classList.add("todo-row--popping");

  setTimeout(async () => {
    const { error } = await supabaseClient
      .from("todos")
      .update({ completed: true, completed_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("Failed to complete to-do:", error.message);
      return;
    }
    await fetchTodos();
  }, TODO_POP_DURATION_MS);
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

// ============ Goals (Long-term / Mid-term / Short-term) ============
const GOAL_TIERS = ["long_term", "mid_term", "short_term"];
let goals = [];

async function fetchGoals() {
  const { data, error } = await supabaseClient
    .from("goals")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    GOAL_TIERS.forEach((tier) => {
      document.getElementById(`goals-rows-${tier}`).innerHTML =
        `<div class="goals-empty">Couldn't load goals — ${escapeHtml(error.message)}</div>`;
    });
    return;
  }

  goals = data;
  renderGoals();
}

function renderGoals() {
  GOAL_TIERS.forEach((tier) => {
    const rowsEl = document.getElementById(`goals-rows-${tier}`);
    const tierGoals = goals.filter((g) => g.tier === tier);

    if (tierGoals.length === 0) {
      rowsEl.innerHTML = `<div class="goals-empty">No goals yet.</div>`;
      return;
    }

    rowsEl.innerHTML = tierGoals.map(goalRowHTML).join("");

    rowsEl.querySelectorAll(".goal-checkbox").forEach((el) => {
      el.addEventListener("change", () => {
        if (el.checked) completeGoal(Number(el.dataset.id), el);
      });
    });
  });
}

function goalRowHTML(goal) {
  return `
    <div class="goal-row" data-id="${goal.id}">
      <input type="checkbox" class="goal-checkbox" data-id="${goal.id}" />
      <span class="goal-text">${escapeHtml(goal.text)}</span>
    </div>
  `;
}

async function addGoal(tier, text) {
  const { error } = await supabaseClient.from("goals").insert({ tier, text });
  if (error) {
    console.error("Failed to add goal:", error.message);
    return;
  }
  await fetchGoals();
}

function completeGoal(id, checkboxEl) {
  const row = checkboxEl.closest(".goal-row");
  row.classList.add("goal-row--popping");

  setTimeout(async () => {
    const { error } = await supabaseClient
      .from("goals")
      .update({ completed: true, completed_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("Failed to complete goal:", error.message);
      return;
    }
    await fetchGoals();
  }, TODO_POP_DURATION_MS);
}

function initGoalsTab() {
  document.querySelectorAll(".goals-input").forEach((input) => {
    input.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const text = input.value.trim();
      if (!text) return;

      input.value = "";
      await addGoal(input.dataset.tier, text);
      input.focus();
    });
  });
}

// ============ Projects (Kanban: Idea -> Started -> In Progress -> Complete) ============
const KANBAN_STATUSES = ["idea", "started", "in_progress", "complete"];
const KANBAN_STATUS_LABELS = {
  idea: "Idea",
  started: "Started",
  in_progress: "In Progress",
  complete: "Complete",
};
let projects = [];
let subtasksByProject = {};
const expandedProjectIds = new Set();

async function fetchProjects() {
  const { data: projectsData, error: projectsError } = await supabaseClient
    .from("projects")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (projectsError) {
    KANBAN_STATUSES.forEach((status) => {
      document.getElementById(`kanban-col-${status}`).innerHTML =
        `<p class="placeholder-copy">Couldn't load projects — ${escapeHtml(projectsError.message)}</p>`;
    });
    return;
  }

  const { data: subtasksData, error: subtasksError } = await supabaseClient
    .from("project_subtasks")
    .select("*")
    .order("created_at", { ascending: true });

  projects = projectsData;
  subtasksByProject = {};
  if (!subtasksError && subtasksData) {
    subtasksData.forEach((subtask) => {
      if (!subtasksByProject[subtask.project_id]) subtasksByProject[subtask.project_id] = [];
      subtasksByProject[subtask.project_id].push(subtask);
    });
  }

  renderKanban();
}

function renderKanban() {
  KANBAN_STATUSES.forEach((status) => {
    const colEl = document.getElementById(`kanban-col-${status}`);
    const colProjects = projects.filter((p) => p.status === status);
    colEl.innerHTML = colProjects.map(projectCardHTML).join("");
  });

  document.querySelectorAll(".kanban-card-header").forEach((el) => {
    el.addEventListener("click", () => toggleCardExpand(Number(el.dataset.id)));
  });
  document.querySelectorAll(".kanban-subtask-checkbox").forEach((el) => {
    el.addEventListener("change", () => toggleSubtask(Number(el.dataset.id), el.checked));
  });
  document.querySelectorAll(".kanban-subtask-delete").forEach((el) => {
    el.addEventListener("click", () => deleteSubtask(Number(el.dataset.id)));
  });
  document.querySelectorAll(".kanban-subtask-input").forEach((el) => {
    el.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const text = el.value.trim();
      if (!text) return;
      el.value = "";
      await addSubtask(Number(el.dataset.projectId), text);
    });
  });
  document.querySelectorAll(".kanban-status-select").forEach((el) => {
    el.addEventListener("change", () => updateProjectStatus(Number(el.dataset.id), el.value));
  });
  document.querySelectorAll(".kanban-card-delete").forEach((el) => {
    el.addEventListener("click", () => deleteProject(Number(el.dataset.id)));
  });
}

function projectCardHTML(project) {
  const subtasks = subtasksByProject[project.id] || [];
  const completedCount = subtasks.filter((s) => s.completed).length;
  const expanded = expandedProjectIds.has(project.id);

  return `
    <div class="kanban-card ${expanded ? "kanban-card--expanded" : ""}" data-id="${project.id}">
      <div class="kanban-card-header" data-id="${project.id}">
        <span class="kanban-card-chevron">›</span>
        <span class="kanban-card-title">${escapeHtml(project.title)}</span>
        <span class="kanban-card-subtask-count">${completedCount}/${subtasks.length}</span>
      </div>
      <div class="kanban-card-body">
        <div class="kanban-subtask-rows">
          ${subtasks.map(subtaskRowHTML).join("")}
        </div>
        <input type="text" class="kanban-subtask-input" data-project-id="${project.id}" placeholder="Add a subtask…" />
        <div class="kanban-card-footer">
          <select class="kanban-status-select" data-id="${project.id}">
            ${KANBAN_STATUSES.map(
              (s) => `<option value="${s}" ${s === project.status ? "selected" : ""}>${KANBAN_STATUS_LABELS[s]}</option>`
            ).join("")}
          </select>
          <button class="kanban-card-delete" data-id="${project.id}" title="Delete project">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function subtaskRowHTML(subtask) {
  const rowClass = subtask.completed ? "kanban-subtask-row kanban-subtask-row--completed" : "kanban-subtask-row";
  return `
    <div class="${rowClass}">
      <input type="checkbox" class="kanban-subtask-checkbox" data-id="${subtask.id}" ${subtask.completed ? "checked" : ""} />
      <span class="kanban-subtask-text">${escapeHtml(subtask.text)}</span>
      <button class="kanban-subtask-delete" data-id="${subtask.id}" title="Remove">×</button>
    </div>
  `;
}

function toggleCardExpand(id) {
  if (expandedProjectIds.has(id)) {
    expandedProjectIds.delete(id);
  } else {
    expandedProjectIds.add(id);
  }
  renderKanban();
}

async function addProject(status, title) {
  const { error } = await supabaseClient.from("projects").insert({ title, status });
  if (error) {
    console.error("Failed to add project:", error.message);
    return;
  }
  await fetchProjects();
}

async function updateProjectStatus(id, status) {
  const { error } = await supabaseClient.from("projects").update({ status }).eq("id", id);
  if (error) {
    console.error("Failed to move project:", error.message);
    return;
  }
  await fetchProjects();
}

async function deleteProject(id) {
  const { error } = await supabaseClient
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Failed to delete project:", error.message);
    return;
  }
  expandedProjectIds.delete(id);
  await fetchProjects();
}

async function addSubtask(projectId, text) {
  const { error } = await supabaseClient.from("project_subtasks").insert({ project_id: projectId, text });
  if (error) {
    console.error("Failed to add subtask:", error.message);
    return;
  }
  await fetchProjects();
}

async function toggleSubtask(id, completed) {
  const { error } = await supabaseClient.from("project_subtasks").update({ completed }).eq("id", id);
  if (error) {
    console.error("Failed to update subtask:", error.message);
    return;
  }
  await fetchProjects();
}

async function deleteSubtask(id) {
  const { error } = await supabaseClient.from("project_subtasks").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete subtask:", error.message);
    return;
  }
  await fetchProjects();
}

function initKanbanTab() {
  document.querySelectorAll(".kanban-input").forEach((input) => {
    input.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const text = input.value.trim();
      if (!text) return;

      input.value = "";
      await addProject(input.dataset.status, text);
      input.focus();
    });
  });
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
  initGoalsTab();
  fetchGoals();
  initKanbanTab();
  fetchProjects();

  document.getElementById("todo-add-icon").addEventListener("click", () => {
    document.getElementById("capture-input").focus();
  });
};
