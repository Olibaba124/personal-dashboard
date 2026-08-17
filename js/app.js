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
  // No deleted_at filter here — goal progress on short-term goals needs to count
  // completed (soft-deleted) to-dos too, not just open ones. Display-time filtering
  // happens in renderTodos() / renderTodoRowsInto() instead.
  const { data, error } = await supabaseClient.from("todos").select("*").order("created_at", { ascending: true });

  if (error) {
    rowsEl.innerHTML = `<div class="todo-empty">Couldn't load to-dos — ${escapeHtml(error.message)}</div>`;
    return;
  }

  todos = data;
  renderTodos();
  renderPressingBand();
  if (typeof renderGoals === "function") renderGoals();
}

// Shared row renderer — used by the cover-page to-do list AND a goal's "this week"
// section, so both stay wired identically instead of forking the component.
function renderTodoRowsInto(containerEl, todoList, emptyMessage) {
  if (todoList.length === 0) {
    containerEl.innerHTML = `<div class="todo-empty">${emptyMessage}</div>`;
    return;
  }

  containerEl.innerHTML = todoList.map(todoRowHTML).join("");

  containerEl.querySelectorAll(".todo-checkbox").forEach((el) => {
    el.addEventListener("change", () => {
      if (el.checked) completeTodo(Number(el.dataset.id), el);
    });
  });
  containerEl.querySelectorAll(".todo-defer").forEach((el) => {
    el.addEventListener("click", () => deferTodo(Number(el.dataset.id)));
  });
}

function renderTodos() {
  const rowsEl = document.getElementById("todo-rows");
  const countEl = document.getElementById("todo-count");
  const openTodos = todos.filter((t) => t.deleted_at === null);
  countEl.textContent = `TO-DO · ${openTodos.length}`;
  renderTodoRowsInto(rowsEl, openTodos, "No to-dos yet — type one into capture above.");
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

  const stuckTodos = todos.filter((t) => t.deleted_at === null && t.defer_count >= DEFER_STUCK_THRESHOLD);
  const stalledGoals = typeof goals !== "undefined" ? goals.filter(isStalled) : [];
  const total = stuckTodos.length + stalledGoals.length;

  header.textContent = `Pressing — ${total} item${total === 1 ? "" : "s"}`;

  if (total === 0) {
    band.classList.add("pressing-band--empty");
    items.innerHTML = `<div class="pressing-empty">Nothing pressing.</div>`;
    return;
  }

  band.classList.remove("pressing-band--empty");

  const todoRows = stuckTodos.map(
    (t) => `
      <div class="pressing-row">
        <span>${escapeHtml(t.text)}</span>
        <span class="pressing-row-reason">deferred ${t.defer_count}×</span>
      </div>
    `
  );
  const goalRows = stalledGoals.map(
    (g) => `
      <div class="pressing-row">
        <span>${escapeHtml(g.title)}</span>
        <span class="pressing-row-reason">stalled ${stalledDays(g)}d</span>
      </div>
    `
  );

  items.innerHTML = todoRows.concat(goalRows).join("");
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
  const todo = todos.find((t) => t.id === id);
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
    if (todo && todo.goal_id) {
      await bumpMovement(todo.goal_id);
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

// ============ Goals (containers: long -> mid -> short -> linked to-dos) ============
const GOAL_TIERS = ["long_term", "mid_term", "short_term"];
// Each tier's children are automatically the next tier down; short-term's "children"
// are linked to-dos instead, so it has no further goal tier below it.
const NEXT_GOAL_TIER = { long_term: "mid_term", mid_term: "short_term" };
const STALLED_DAYS = 21;
let goals = [];
const expandedGoalIds = new Set();

async function fetchGoals() {
  const { data, error } = await supabaseClient.from("goals").select("*").order("created_at", { ascending: true });

  if (error) {
    GOAL_TIERS.forEach((tier) => {
      document.getElementById(`goals-rows-${tier}`).innerHTML =
        `<div class="goals-empty">Couldn't load goals — ${escapeHtml(error.message)}</div>`;
    });
    return;
  }

  goals = data;
  renderGoals();
  renderPressingBand();
}

// ---- Derived values: computed on every render, never stored ----

function goalChildren(goalId) {
  return goals.filter((g) => g.parent_id === goalId);
}

function goalLinkedTodos(goalId) {
  return todos.filter((t) => t.goal_id === goalId);
}

// Progress = completed direct children / total direct children (long/mid), or
// completed / total linked to-dos, counting every to-do ever linked, not just open
// ones (short). No children at all -> null, rendered as "not broken down yet".
function goalProgress(goal) {
  if (goal.tier === "short_term") {
    const linked = goalLinkedTodos(goal.id);
    if (linked.length === 0) return null;
    const done = linked.filter((t) => t.completed).length;
    return { done, total: linked.length, fraction: done / linked.length };
  }

  const children = goalChildren(goal.id);
  if (children.length === 0) return null;
  const done = children.filter((c) => c.status === "done").length;
  return { done, total: children.length, fraction: done / children.length };
}

function isStalled(goal) {
  return goal.status === "active" && stalledDays(goal) >= STALLED_DAYS;
}

function stalledDays(goal) {
  const lastMs = new Date(goal.last_movement_at).getTime();
  return Math.floor((Date.now() - lastMs) / (1000 * 60 * 60 * 24));
}

function formatMonthShort(dateStr) {
  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: "short" });
}

// Pace compares completed-milestone count against elapsed share of the span from
// created_at to the furthest child target_month. No target months anywhere -> null,
// omit pace entirely rather than guessing.
function goalPace(goal) {
  const targets = goalChildren(goal.id)
    .map((c) => c.target_month)
    .filter(Boolean);
  if (targets.length === 0) return null;

  const furthest = targets.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
  const created = new Date(goal.created_at);
  const spanMs = new Date(furthest) - created;
  if (spanMs <= 0) return null;

  const spanWeeks = spanMs / (1000 * 60 * 60 * 24 * 7);
  const elapsedWeeks = (Date.now() - created) / (1000 * 60 * 60 * 24 * 7);
  const expectedFraction = elapsedWeeks / spanWeeks;

  const progress = goalProgress(goal);
  const actualFraction = progress ? progress.fraction : 0;
  const deltaWeeks = (actualFraction - expectedFraction) * spanWeeks;

  if (Math.abs(deltaWeeks) < 0.5) return "on pace";
  const rounded = Math.round(Math.abs(deltaWeeks));
  return deltaWeeks > 0 ? `${rounded} wks ahead` : `${rounded} wks behind`;
}

function milestoneColorClass(child) {
  if (child.status === "dropped") return "milestone-block--dropped";
  if (child.status === "done") return "milestone-block--done";
  const progress = goalProgress(child);
  if (progress && progress.fraction > 0) return "milestone-block--progress";
  return "milestone-block--not-started";
}

// Never renders "overdue" or turns red — a missed target month just reads "was Oct".
function milestoneMetaLine(child) {
  if (child.status === "done") {
    const monthSrc = child.completed_at || child.target_month;
    return monthSrc ? `done · ${formatMonthShort(monthSrc)}` : "done";
  }

  const progress = goalProgress(child);
  if (progress) {
    return `${progress.done} of ${progress.total} · now`;
  }

  if (child.target_month) {
    const target = new Date(`${child.target_month}T00:00:00`);
    const now = new Date();
    const isPast = target < new Date(now.getFullYear(), now.getMonth(), 1);
    const monthLabel = formatMonthShort(child.target_month);
    return isPast ? `was ${monthLabel}` : monthLabel;
  }

  return "";
}

function getAncestorChain(goalId) {
  const chain = [goalId];
  let current = goals.find((g) => g.id === goalId);
  while (current && current.parent_id) {
    chain.push(current.parent_id);
    current = goals.find((g) => g.id === current.parent_id);
  }
  return chain;
}

async function bumpMovement(goalId) {
  const ids = getAncestorChain(goalId);
  const { error } = await supabaseClient
    .from("goals")
    .update({ last_movement_at: new Date().toISOString() })
    .in("id", ids);
  if (error) {
    console.error("Failed to bump goal movement:", error.message);
  }
}

// ---- Rendering ----

function renderGoals() {
  GOAL_TIERS.forEach((tier) => {
    const rowsEl = document.getElementById(`goals-rows-${tier}`);
    const tierGoals = goals.filter((g) => g.tier === tier && g.status === "active");

    if (tierGoals.length === 0) {
      rowsEl.innerHTML = `<div class="goals-empty">No goals yet.</div>`;
      return;
    }

    rowsEl.innerHTML = tierGoals.map(goalListRowHTML).join("");
  });

  wireGoalListeners();
}

function goalListRowHTML(goal) {
  const progress = goalProgress(goal);
  const stalled = isStalled(goal);
  const expanded = expandedGoalIds.has(goal.id);
  const barWidth = progress ? Math.round(progress.fraction * 100) : 0;
  const barFillClass = progress ? "goal-progress-bar-fill" : "goal-progress-bar-fill goal-progress-bar-fill--empty";

  let rightBlock;
  if (stalled) {
    rightBlock = `
      <div class="goal-right-block goal-right-block--stalled">
        <div class="goal-right-pct">${barWidth}%</div>
        <div class="goal-right-sub">stalled ${stalledDays(goal)}d</div>
      </div>
    `;
  } else if (progress) {
    rightBlock = `
      <div class="goal-right-block">
        <div class="goal-right-pct">${barWidth}%</div>
        <div class="goal-right-sub">${progress.done} of ${progress.total}</div>
      </div>
    `;
  } else {
    rightBlock = `
      <div class="goal-right-block">
        <div class="goal-right-sub goal-right-sub--muted">not broken down yet</div>
      </div>
    `;
  }

  return `
    <div class="goal-list-row ${expanded ? "goal-list-row--expanded" : ""}" data-id="${goal.id}">
      <div class="goal-list-row-header" data-id="${goal.id}">
        <span class="goal-list-chevron">›</span>
        <div class="goal-list-main">
          <div class="goal-list-title">${escapeHtml(goal.title)}</div>
          <div class="goal-progress-bar"><div class="${barFillClass}" style="width:${barWidth}%"></div></div>
        </div>
        ${rightBlock}
      </div>
      <div class="goal-list-row-body">
        ${goalDetailHTML(goal)}
      </div>
    </div>
  `;
}

function goalDetailHTML(goal) {
  return goal.tier === "short_term" ? goalDetailShortTermHTML(goal) : goalDetailContainerHTML(goal);
}

function goalDetailContainerHTML(goal) {
  const children = goalChildren(goal.id);
  const milestonesHTML =
    children.length === 0
      ? `<p class="goals-empty">Not broken down yet — add a milestone below.</p>`
      : `<div class="milestone-grid">${children.map(milestoneBlockHTML).join("")}</div>`;

  return `
    <div class="goal-detail-section">
      <div class="goal-detail-label">Milestones</div>
      ${milestonesHTML}
      <div class="goal-add-milestone">
        <input type="text" class="goal-milestone-input" data-parent-id="${goal.id}" placeholder="Add a milestone…" />
        <input type="month" class="goal-milestone-month" data-parent-id="${goal.id}" />
      </div>
    </div>
    ${goalFooterHTML(goal)}
  `;
}

function milestoneBlockHTML(child) {
  return `
    <div class="milestone-block ${milestoneColorClass(child)}">
      <div class="milestone-block-title">${escapeHtml(child.title)}</div>
      <div class="milestone-block-meta">${milestoneMetaLine(child)}</div>
    </div>
  `;
}

function goalDetailShortTermHTML(goal) {
  return `
    <div class="goal-detail-section">
      <div class="goal-detail-label">This week</div>
      <div class="goal-thisweek-rows" data-goal-id="${goal.id}"></div>
      <button class="goal-pull-button" data-id="${goal.id}">Pull into this week</button>
    </div>
    ${goalFooterHTML(goal)}
  `;
}

function goalFooterHTML(goal) {
  const pace = goalPace(goal);
  const parts = [];
  if (pace) parts.push(pace);
  parts.push(`moved ${stalledDays(goal)}d ago`);

  return `
    <div class="goal-footer">
      <span class="goal-footer-meta">${parts.join(" · ")}</span>
      <select class="goal-status-select" data-id="${goal.id}">
        <option value="active" ${goal.status === "active" ? "selected" : ""}>Active</option>
        <option value="done" ${goal.status === "done" ? "selected" : ""}>Done</option>
        <option value="dropped" ${goal.status === "dropped" ? "selected" : ""}>Dropped</option>
      </select>
    </div>
  `;
}

function wireGoalListeners() {
  document.querySelectorAll(".goal-list-row-header").forEach((el) => {
    el.addEventListener("click", () => toggleGoalExpand(Number(el.dataset.id)));
  });
  document.querySelectorAll(".goal-milestone-input").forEach((el) => {
    el.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const title = el.value.trim();
      if (!title) return;

      const monthInput = document.querySelector(`.goal-milestone-month[data-parent-id="${el.dataset.parentId}"]`);
      const targetMonth = monthInput && monthInput.value ? `${monthInput.value}-01` : null;

      el.value = "";
      if (monthInput) monthInput.value = "";
      await addMilestone(Number(el.dataset.parentId), title, targetMonth);
    });
  });
  document.querySelectorAll(".goal-pull-button").forEach((el) => {
    el.addEventListener("click", () => pullIntoThisWeek(Number(el.dataset.id)));
  });
  document.querySelectorAll(".goal-status-select").forEach((el) => {
    el.addEventListener("change", () => updateGoalStatus(Number(el.dataset.id), el.value));
  });
  document.querySelectorAll(".goal-thisweek-rows").forEach((el) => {
    const goalId = Number(el.dataset.goalId);
    const linked = goalLinkedTodos(goalId).filter((t) => t.deleted_at === null);
    renderTodoRowsInto(el, linked, "No to-dos linked yet.");
  });
}

function toggleGoalExpand(id) {
  if (expandedGoalIds.has(id)) {
    expandedGoalIds.delete(id);
  } else {
    expandedGoalIds.add(id);
  }
  renderGoals();
}

// ---- Writes ----

async function addGoal(tier, title) {
  const { error } = await supabaseClient.from("goals").insert({ tier, title, parent_id: null });
  if (error) {
    console.error("Failed to add goal:", error.message);
    return;
  }
  await fetchGoals();
}

async function addMilestone(parentId, title, targetMonth) {
  const parent = goals.find((g) => g.id === parentId);
  if (!parent || !NEXT_GOAL_TIER[parent.tier]) return;

  const { error } = await supabaseClient.from("goals").insert({
    tier: NEXT_GOAL_TIER[parent.tier],
    title,
    parent_id: parentId,
    target_month: targetMonth,
  });
  if (error) {
    console.error("Failed to add milestone:", error.message);
    return;
  }
  await bumpMovement(parentId);
  await fetchGoals();
}

async function updateGoalStatus(id, status) {
  const patch = { status };
  if (status === "done") {
    patch.completed_at = new Date().toISOString();
  }
  const { error } = await supabaseClient.from("goals").update(patch).eq("id", id);
  if (error) {
    console.error("Failed to update goal status:", error.message);
    return;
  }
  await bumpMovement(id);
  await fetchGoals();
}

// The only new write path into the to-do list this session — creates a to-do
// pre-linked to a short-term goal via goal_id.
async function pullIntoThisWeek(goalId) {
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) return;

  const { error } = await supabaseClient.from("todos").insert({ text: goal.title, goal_id: goalId });
  if (error) {
    console.error("Failed to pull into this week:", error.message);
    return;
  }
  await fetchTodos();
}

function initGoalsTab() {
  document.querySelectorAll(".goals-input").forEach((input) => {
    input.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const title = input.value.trim();
      if (!title) return;

      input.value = "";
      await addGoal(input.dataset.tier, title);
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
  initTabs(".goals-subtab", "goals-subtab-panel", "data-goals-subtab");
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
