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
      if (!el.checked) return;
      if (el.dataset.stepId) {
        completeProjectStepFromTodo(Number(el.dataset.stepId), el);
      } else {
        completeTodo(Number(el.dataset.id), el);
      }
    });
  });
  containerEl.querySelectorAll(".todo-defer").forEach((el) => {
    el.addEventListener("click", () => deferTodo(Number(el.dataset.id)));
  });
}

// Dated project steps (project_steps.target_date not null) are merged in here,
// read-only from the todos table's point of view — never copied into it. Checking
// one off updates the same project_steps row the project's detail panel reads.
function renderTodos() {
  const rowsEl = document.getElementById("todo-rows");
  const countEl = document.getElementById("todo-count");
  const openTodos = todos.filter((t) => t.deleted_at === null);
  const openSteps = datedProjectSteps.filter((s) => !s.done).map(stepToPseudoTodo);
  const merged = openTodos.concat(openSteps);
  countEl.textContent = `TO-DO · ${merged.length}`;
  renderTodoRowsInto(rowsEl, merged, "No to-dos yet — type one into capture above.");
}

function todoRowHTML(todo) {
  if (todo.isProjectStep) {
    return `
      <div class="todo-row" data-step-id="${todo.stepId}">
        <input type="checkbox" class="todo-checkbox" data-step-id="${todo.stepId}" />
        <span class="todo-text">${escapeHtml(todo.text)}</span>
        <span class="todo-project-tag">${escapeHtml(todo.projectName)}</span>
      </div>
    `;
  }

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
  const coldContacts = typeof careerContacts !== "undefined" ? careerContacts.filter(isColdContact) : [];
  const total = stuckTodos.length + stalledGoals.length + coldContacts.length;

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

  const contactRows = coldContacts.map(
    (c) => `
      <div class="pressing-row">
        <span>${escapeHtml(c.name)}</span>
        <span class="pressing-row-reason">cold ${daysSinceCalled(c)}d</span>
      </div>
    `
  );

  items.innerHTML = todoRows.concat(goalRows).concat(contactRows).join("");
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

// ============ Projects (Kanban: Idea -> Brainstorm -> In Progress -> Complete) ============
const PROJECT_STAGES = ["idea", "brainstorm", "progress", "done"];
const PROJECT_STAGE_LABELS = {
  idea: "Idea",
  brainstorm: "Brainstorm",
  progress: "In Progress",
  done: "Complete",
};
let projects = [];
let stepsByProject = {};
let filesByProject = {};
let datedProjectSteps = [];
let activeProjectId = null;

async function fetchProjects() {
  const errorEl = document.getElementById("projects-error");
  errorEl.classList.add("hidden");

  const { data: projectsData, error: projectsError } = await supabaseClient
    .from("projects")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (projectsError) {
    errorEl.textContent = "Couldn't reach your projects. Check your connection and reload.";
    errorEl.classList.remove("hidden");
    PROJECT_STAGES.forEach((stage) => {
      document.getElementById(`kanban-col-${stage}`).innerHTML = "";
    });
    return;
  }

  const { data: stepsData, error: stepsError } = await supabaseClient
    .from("project_steps")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  projects = projectsData;
  stepsByProject = {};
  if (!stepsError && stepsData) {
    stepsData.forEach((step) => {
      if (!stepsByProject[step.project_id]) stepsByProject[step.project_id] = [];
      stepsByProject[step.project_id].push(step);
    });
  }

  renderKanban();
  if (activeProjectId !== null) renderProjectPanel();
}

function renderKanban() {
  PROJECT_STAGES.forEach((stage) => {
    const colEl = document.getElementById(`kanban-col-${stage}`);
    const colProjects = projects.filter((p) => p.stage === stage);
    if (colProjects.length === 0) {
      const emptyMessage = stage === "idea" ? "Add your first idea" : "Nothing here yet";
      colEl.innerHTML = `<p class="kanban-empty">${emptyMessage}</p>`;
      return;
    }
    colEl.innerHTML = colProjects.map(projectCardHTML).join("");
  });

  document.querySelectorAll(".project-card").forEach((el) => {
    el.addEventListener("click", () => openProjectPanel(Number(el.dataset.id)));
    // Cards are recreated on every render, so drag listeners are (re-)bound
    // here; the column drop targets themselves are stable and wired once in
    // initKanbanTab() instead.
    el.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", el.dataset.id);
      event.dataTransfer.effectAllowed = "move";
      el.classList.add("project-card--dragging");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("project-card--dragging");
    });
  });
}

// One component with a variant flag — Idea/Brainstorm render the pill only;
// In Progress/Complete add the thin completion bar. An empty bar on a
// no-steps-yet idea would read as failure, so ideas never get one.
function projectCardHTML(project) {
  const steps = stepsByProject[project.id] || [];
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const showProgress = project.stage === "progress" || project.stage === "done";
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return `
    <div class="project-card ${showProgress ? "project-card--with-progress" : ""}" data-id="${project.id}" draggable="true">
      <div class="project-card-top">
        <span class="project-card-dot project-card-dot--${project.stage}"></span>
        <span class="project-card-name">${escapeHtml(project.name)}</span>
      </div>
      <div class="project-card-meta">${total === 0 ? "no steps" : `${done} of ${total} steps`}</div>
      ${
        showProgress
          ? `<div class="project-card-bar"><div class="project-card-bar-fill project-card-bar-fill--${project.stage}" style="width: ${pct}%"></div></div>`
          : ""
      }
    </div>
  `;
}

async function addProject(name) {
  const ideaPositions = projects.filter((p) => p.stage === "idea").map((p) => p.position);
  const nextPosition = ideaPositions.length ? Math.max(...ideaPositions) + 1 : 0;
  const { error } = await supabaseClient.from("projects").insert({ name, stage: "idea", position: nextPosition });
  if (error) {
    console.error("Failed to add project:", error.message);
    return;
  }
  await fetchProjects();
}

function initKanbanTab() {
  const input = document.getElementById("project-add-input");
  if (input) {
    input.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const text = input.value.trim();
      if (!text) return;

      input.value = "";
      await addProject(text);
      input.focus();
    });
  }

  // Column drop targets — cards move between stages either by dragging here
  // or via the stage pills in the detail panel; both call moveProjectStage()
  // so there's one source of truth for what "moving a project" does. These
  // column elements are stable across renders (only their contents get
  // rewritten), so they're wired once here rather than on every renderKanban().
  PROJECT_STAGES.forEach((stage) => {
    const colEl = document.getElementById(`kanban-col-${stage}`);
    colEl.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      colEl.classList.add("kanban-card-list--drag-over");
    });
    colEl.addEventListener("dragleave", (event) => {
      if (!colEl.contains(event.relatedTarget)) colEl.classList.remove("kanban-card-list--drag-over");
    });
    colEl.addEventListener("drop", (event) => {
      event.preventDefault();
      colEl.classList.remove("kanban-card-list--drag-over");
      const id = Number(event.dataTransfer.getData("text/plain"));
      const project = projects.find((p) => p.id === id);
      if (!project || project.stage === stage) return;
      moveProjectStage(id, stage);
    });
  });
}

// ---- Detail panel ----

function openProjectPanel(id) {
  activeProjectId = id;
  clearFilesError();
  renderProjectPanel();
  fetchProjectFiles(id);
  document.getElementById("project-panel-scrim").classList.add("project-panel-scrim--open");
  document.getElementById("project-panel").classList.add("project-panel--open");
}

function closeProjectPanel() {
  activeProjectId = null;
  closeFilePreview();
  document.getElementById("project-panel-scrim").classList.remove("project-panel-scrim--open");
  document.getElementById("project-panel").classList.remove("project-panel--open");
}

function renderProjectPanel() {
  const project = projects.find((p) => p.id === activeProjectId);
  if (!project) return;

  document.getElementById("project-panel-title").textContent = project.name;

  const pillsEl = document.getElementById("project-panel-stages");
  pillsEl.innerHTML = PROJECT_STAGES.map(
    (stage) => `
      <button
        class="stage-pill stage-pill--${stage} ${stage === project.stage ? "stage-pill--active" : ""}"
        data-stage="${stage}"
      >${PROJECT_STAGE_LABELS[stage]}</button>
    `
  ).join("");
  pillsEl.querySelectorAll(".stage-pill").forEach((el) => {
    el.addEventListener("click", () => moveProjectStage(project.id, el.dataset.stage));
  });

  document.getElementById("project-panel-notes").value = project.notes || "";

  renderProjectSteps(project.id);
}

async function moveProjectStage(id, stage) {
  const { error } = await supabaseClient
    .from("projects")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("Failed to move project:", error.message);
    return;
  }
  await fetchProjects();
}

async function deleteProject(id) {
  const files = filesByProject[id] || [];
  if (files.length) {
    await supabaseClient.storage.from("project-files").remove(files.map((f) => f.storage_path));
  }
  const { error } = await supabaseClient.from("projects").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete project:", error.message);
    return;
  }
  closeProjectPanel();
  await fetchProjects();
}

let notesSaveTimeout = null;

async function saveProjectNotes(projectId, notes) {
  if (projectId === null) return;
  const { error } = await supabaseClient
    .from("projects")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) {
    console.error("Failed to save notes:", error.message);
    return;
  }
  const project = projects.find((p) => p.id === projectId);
  if (project) project.notes = notes;
}

// ---- Steps ----

// A custom MM/DD/YY picker instead of the native date input — that one let a
// half-typed year commit as garbage (e.g. "0202") with no way to constrain what
// its native popup showed. Three plain selects give full control over the year
// range (2026-2035, two digits, never "25") and the day list is always bounded
// to the selected month, so an invalid date can't be built in the first place.
const STEP_DATE_YEAR_START = 2026;
const STEP_DATE_YEAR_COUNT = 10;

function daysInMonth(month, fullYear) {
  return new Date(fullYear, month, 0).getDate();
}

function parseStepTargetDate(targetDate) {
  if (!targetDate) return { month: "", day: "", year: "" };
  const [y, m, d] = targetDate.split("-");
  return { month: m, day: d, year: y.slice(2) };
}

function renderProjectSteps(projectId) {
  const steps = (stepsByProject[projectId] || [])
    .slice()
    .sort((a, b) => a.position - b.position || new Date(a.created_at) - new Date(b.created_at));
  const done = steps.filter((s) => s.done).length;

  document.getElementById("project-panel-meta").textContent =
    steps.length === 0 ? "No steps yet" : `${done} of ${steps.length} steps done`;

  const rowsEl = document.getElementById("project-panel-steps");
  rowsEl.innerHTML = steps.map(stepRowHTML).join("");

  rowsEl.querySelectorAll(".step-checkbox").forEach((el) => {
    el.addEventListener("change", () => toggleStep(Number(el.dataset.id), el.checked));
  });
  rowsEl.querySelectorAll(".step-date-part").forEach((el) => {
    el.addEventListener("change", () => {
      const id = Number(el.dataset.id);
      const groupEl = el.closest(".step-date");
      const month = groupEl.querySelector(".step-date-month").value;
      const day = groupEl.querySelector(".step-date-day").value;
      const year = groupEl.querySelector(".step-date-year").value;

      if (!month || !day || !year) {
        // Only persist a clear if this step actually had a date already —
        // otherwise this is just a mid-selection (month picked, day/year not
        // yet) and saving+re-rendering now would wipe the pick the user just
        // made, since the row only knows about what's actually been saved.
        const step = steps.find((s) => s.id === id);
        if (step && step.target_date) setStepTargetDate(id, null);
        return;
      }

      const fullYear = 2000 + Number(year);
      const clampedDay = Math.min(Number(day), daysInMonth(Number(month), fullYear));
      setStepTargetDate(id, `${fullYear}-${month}-${String(clampedDay).padStart(2, "0")}`);
    });
  });
  rowsEl.querySelectorAll(".step-delete").forEach((el) => {
    el.addEventListener("click", () => deleteStep(Number(el.dataset.id)));
  });
}

function stepRowHTML(step) {
  const { month, day, year } = parseStepTargetDate(step.target_date);
  const dayCount = month && year ? daysInMonth(Number(month), 2000 + Number(year)) : 31;

  const monthOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"))
    .map((m) => `<option value="${m}" ${m === month ? "selected" : ""}>${m}</option>`)
    .join("");
  const dayOptions = Array.from({ length: dayCount }, (_, i) => String(i + 1).padStart(2, "0"))
    .map((d) => `<option value="${d}" ${d === day ? "selected" : ""}>${d}</option>`)
    .join("");
  const yearOptions = Array.from({ length: STEP_DATE_YEAR_COUNT }, (_, i) => String(STEP_DATE_YEAR_START + i).slice(2))
    .map((yy) => `<option value="${yy}" ${yy === year ? "selected" : ""}>${yy}</option>`)
    .join("");

  return `
    <div class="step-row ${step.done ? "step-row--done" : ""}">
      <input type="checkbox" class="step-checkbox" data-id="${step.id}" ${step.done ? "checked" : ""} />
      <span class="step-text">${escapeHtml(step.text)}</span>
      <span class="step-date">
        <select class="step-date-part step-date-month" data-id="${step.id}">
          <option value="">MM</option>
          ${monthOptions}
        </select>
        <select class="step-date-part step-date-day" data-id="${step.id}">
          <option value="">DD</option>
          ${dayOptions}
        </select>
        <select class="step-date-part step-date-year" data-id="${step.id}">
          <option value="">YY</option>
          ${yearOptions}
        </select>
      </span>
      <button class="step-delete" data-id="${step.id}" title="Remove">×</button>
    </div>
  `;
}

async function addStep(projectId, text) {
  const positions = (stepsByProject[projectId] || []).map((s) => s.position);
  const nextPosition = positions.length ? Math.max(...positions) + 1 : 0;
  const { error } = await supabaseClient
    .from("project_steps")
    .insert({ project_id: projectId, text, position: nextPosition });
  if (error) {
    console.error("Failed to add step:", error.message);
    return;
  }
  await fetchProjects();
  await fetchDatedProjectSteps();
}

async function toggleStep(id, done) {
  const { error } = await supabaseClient.from("project_steps").update({ done }).eq("id", id);
  if (error) {
    console.error("Failed to update step:", error.message);
    return;
  }
  await fetchProjects();
  await fetchDatedProjectSteps();
}

async function setStepTargetDate(id, targetDate) {
  const { error } = await supabaseClient.from("project_steps").update({ target_date: targetDate }).eq("id", id);
  if (error) {
    console.error("Failed to set step date:", error.message);
    return;
  }
  await fetchProjects();
  await fetchDatedProjectSteps();
}

async function deleteStep(id) {
  const { error } = await supabaseClient.from("project_steps").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete step:", error.message);
    return;
  }
  await fetchProjects();
  await fetchDatedProjectSteps();
}

// ---- Dated steps merged into the cover-page to-do list (read-only merge; the
// to-dos table is never touched — see renderTodos()) ----

async function fetchDatedProjectSteps() {
  const { data, error } = await supabaseClient
    .from("project_steps")
    .select("*, projects(name)")
    .not("target_date", "is", null)
    .order("target_date", { ascending: true });

  if (error) {
    console.error("Failed to load dated project steps:", error.message);
    datedProjectSteps = [];
  } else {
    datedProjectSteps = data;
  }
  renderTodos();
}

function stepToPseudoTodo(step) {
  return {
    isProjectStep: true,
    stepId: step.id,
    text: step.text,
    projectName: step.projects ? step.projects.name : "",
  };
}

function completeProjectStepFromTodo(id, checkboxEl) {
  const row = checkboxEl.closest(".todo-row");
  row.classList.add("todo-row--popping");

  setTimeout(async () => {
    const { error } = await supabaseClient.from("project_steps").update({ done: true }).eq("id", id);
    if (error) {
      console.error("Failed to complete step:", error.message);
      return;
    }
    await fetchProjects();
    await fetchDatedProjectSteps();
  }, TODO_POP_DURATION_MS);
}

// ---- Files (private bucket, signed URLs only — never a public bucket URL) ----

const PREVIEWABLE_IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
const PREVIEWABLE_PDF_EXT = ["pdf"];

function fileExtension(filename) {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
}

function showFilesError(message) {
  const el = document.getElementById("project-files-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function clearFilesError() {
  document.getElementById("project-files-error").classList.add("hidden");
}

async function fetchProjectFiles(projectId) {
  const { data, error } = await supabaseClient
    .from("project_files")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    showFilesError(`Couldn't load files — ${error.message}`);
    filesByProject[projectId] = [];
  } else {
    filesByProject[projectId] = data;
  }
  renderProjectFiles(projectId);
}

function renderProjectFiles(projectId) {
  const listEl = document.getElementById("project-panel-files");
  const files = filesByProject[projectId] || [];

  if (files.length === 0) {
    listEl.innerHTML = `<p class="project-files-empty">No files yet</p>`;
  } else {
    listEl.innerHTML = files.map(fileRowHTML).join("");
  }

  listEl.querySelectorAll(".file-download").forEach((el) => {
    el.addEventListener("click", () => openFilePreview(el.dataset.path, el.dataset.filename));
  });
  listEl.querySelectorAll(".file-delete").forEach((el) => {
    el.addEventListener("click", () => deleteFile(Number(el.dataset.id), el.dataset.path));
  });
}

function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileRowHTML(file) {
  return `
    <div class="file-row">
      <button class="file-download" data-path="${escapeHtml(file.storage_path)}" data-filename="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</button>
      <span class="file-size">${formatBytes(file.size_bytes)}</span>
      <button class="file-delete" data-id="${file.id}" data-path="${escapeHtml(file.storage_path)}" title="Delete">×</button>
    </div>
  `;
}

async function uploadProjectFile(projectId, file) {
  clearFilesError();
  const path = `${projectId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabaseClient.storage.from("project-files").upload(path, file);
  if (uploadError) {
    showFilesError(`Couldn't upload "${file.name}" — ${uploadError.message}`);
    return;
  }
  const { error: insertError } = await supabaseClient
    .from("project_files")
    .insert({ project_id: projectId, storage_path: path, filename: file.name, size_bytes: file.size });
  if (insertError) {
    showFilesError(`Uploaded but couldn't record "${file.name}" — ${insertError.message}`);
    return;
  }
  await fetchProjectFiles(projectId);
}

// ---- Preview modal: images render inline, PDFs render in an iframe, anything
// else falls back to an "Open in new tab" link — all reached through a fresh
// signed URL, never a public bucket URL. ----

async function openFilePreview(path, filename) {
  clearFilesError();
  const { data, error } = await supabaseClient.storage.from("project-files").createSignedUrl(path, 120);
  if (error) {
    showFilesError(`Couldn't open "${filename}" — ${error.message}`);
    return;
  }
  renderFilePreview(filename, data.signedUrl);
}

function renderFilePreview(filename, url) {
  const ext = fileExtension(filename);
  let bodyHTML;
  if (PREVIEWABLE_IMAGE_EXT.includes(ext)) {
    bodyHTML = `<img class="file-preview-image" src="${url}" alt="${escapeHtml(filename)}" />`;
  } else if (PREVIEWABLE_PDF_EXT.includes(ext)) {
    bodyHTML = `<iframe class="file-preview-frame" src="${url}" title="${escapeHtml(filename)}"></iframe>`;
  } else {
    bodyHTML = `
      <div class="file-preview-fallback">
        <p>No inline preview for this file type.</p>
        <a class="file-preview-open-link" href="${url}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml(filename)}</a>
      </div>
    `;
  }

  document.getElementById("file-preview-title").textContent = filename;
  document.getElementById("file-preview-open-link").href = url;
  document.getElementById("file-preview-body").innerHTML = bodyHTML;
  document.getElementById("file-preview-scrim").classList.add("file-preview-scrim--open");
  document.getElementById("file-preview-modal").classList.add("file-preview-modal--open");
}

function isFilePreviewOpen() {
  return document.getElementById("file-preview-modal").classList.contains("file-preview-modal--open");
}

function closeFilePreview() {
  document.getElementById("file-preview-scrim").classList.remove("file-preview-scrim--open");
  document.getElementById("file-preview-modal").classList.remove("file-preview-modal--open");
  document.getElementById("file-preview-body").innerHTML = "";
}

async function deleteFile(id, path) {
  clearFilesError();
  const { error: storageError } = await supabaseClient.storage.from("project-files").remove([path]);
  if (storageError) {
    showFilesError(`Couldn't delete the file — ${storageError.message}`);
    return;
  }
  const { error } = await supabaseClient.from("project_files").delete().eq("id", id);
  if (error) {
    showFilesError(`Couldn't delete the file — ${error.message}`);
    return;
  }
  await fetchProjectFiles(activeProjectId);
}

function initProjectPanel() {
  document.getElementById("project-panel-scrim").addEventListener("click", closeProjectPanel);
  document.getElementById("project-panel-close").addEventListener("click", closeProjectPanel);
  document.getElementById("project-panel-delete").addEventListener("click", () => {
    if (activeProjectId !== null && window.confirm("Delete this project? This can't be undone.")) {
      deleteProject(activeProjectId);
    }
  });

  document.getElementById("file-preview-scrim").addEventListener("click", closeFilePreview);
  document.getElementById("file-preview-close").addEventListener("click", closeFilePreview);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (isFilePreviewOpen()) {
      closeFilePreview();
    } else if (activeProjectId !== null) {
      closeProjectPanel();
    }
  });

  const notesEl = document.getElementById("project-panel-notes");
  notesEl.addEventListener("blur", () => {
    clearTimeout(notesSaveTimeout);
    const projectId = activeProjectId;
    const value = notesEl.value;
    notesSaveTimeout = setTimeout(() => saveProjectNotes(projectId, value), 400);
  });

  const stepInput = document.getElementById("project-panel-step-input");
  stepInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    const text = stepInput.value.trim();
    if (!text || activeProjectId === null) return;
    stepInput.value = "";
    await addStep(activeProjectId, text);
  });

  document.getElementById("project-panel-file-input").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file || activeProjectId === null) return;
    await uploadProjectFile(activeProjectId, file);
    event.target.value = "";
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
  initTabs(".career-subtab", "career-subtab-panel", "data-career-subtab");
  renderTicker();
  renderGreeting();
  initCapture();
  fetchTodos();
  initGoalsTab();
  fetchGoals();
  initKanbanTab();
  initProjectPanel();
  fetchProjects();
  fetchDatedProjectSteps();
  if (typeof initCareerTab === "function") {
    initCareerTab();
    fetchCareerJobs();
    fetchCareerContacts();
  }

  document.getElementById("todo-add-icon").addEventListener("click", () => {
    document.getElementById("capture-input").focus();
  });
};
