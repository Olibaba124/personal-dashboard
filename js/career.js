// ============ Career (Review / Shortlist / Pipeline / Networking) ============
// Ported from the standalone job-tracker app (github.com/Olibaba124/job-tracker).
// The old front end read/wrote data/jobs.json + data/network.json straight from
// the browser via a GitHub PAT stored in localStorage, gated by a client-side
// password check — exactly the flaw CLAUDE.md flags from this same project.
// Everything here instead goes through Supabase (career_jobs / career_contacts /
// career_tombstones), gated by the dashboard's existing Supabase Auth wall — no
// separate login, no token, no secret anywhere in this file.

const FIT_SCORE_THRESHOLD = 40;
const CAREER_PIPELINE_STAGES = ["applied", "heard_back", "interviewing", "offer"];
const CAREER_ALL_STAGES = [...CAREER_PIPELINE_STAGES, "rejected"];
const CAREER_STAGE_LABELS = {
  applied: "Applied",
  heard_back: "Heard back",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};
const COLD_CONTACT_DAYS = 21;

let careerJobs = [];
let careerContacts = [];
let activeCareerJobId = null;
let activeContactId = null;

// ============ Fetch ============
async function fetchCareerJobs() {
  const errorEl = document.getElementById("career-jobs-error");
  errorEl.classList.add("hidden");

  const { data, error } = await supabaseClient.from("career_jobs").select("*");
  if (error) {
    errorEl.textContent = "Couldn't reach your job pipeline. Check your connection and reload.";
    errorEl.classList.remove("hidden");
    return;
  }

  careerJobs = data;
  renderReview();
  renderShortlist();
  renderCareerKanban();
  if (activeCareerJobId !== null) renderCareerJobPanel();
  if (typeof renderPressingBand === "function") renderPressingBand();
}

async function fetchCareerContacts() {
  const { data, error } = await supabaseClient.from("career_contacts").select("*");
  if (error) {
    console.error("Failed to load contacts:", error.message);
    return;
  }
  careerContacts = data;
  renderNetworking();
  if (activeContactId !== null) renderContactPanel();
  if (typeof renderPressingBand === "function") renderPressingBand();
}

// ============ Helpers ============
function formatSalary(job) {
  if (!job.salary_min && !job.salary_max) return null;
  const fmt = (n) => "$" + Math.round(n / 1000) + "k";
  if (job.salary_min && job.salary_max && Math.round(job.salary_min) !== Math.round(job.salary_max)) {
    return `${fmt(job.salary_min)}–${fmt(job.salary_max)}`;
  }
  return fmt(job.salary_min || job.salary_max);
}

// The cross-source dedup identity: normalized company|title. MUST match
// automation/scripts/scan.py's dedup_key() normalization exactly — this is
// what career_tombstones (kind='key') uses to stop a *different* source from
// re-adding a role deleted via another source.
function careerDedupKey(job) {
  const clean = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  return `${clean(job.company)}|${clean(job.title)}`;
}

function daysSinceApplied(job) {
  const ref = job.applied_on || job.date_found;
  if (!ref) return 0;
  const ms = Date.now() - new Date(ref + "T00:00:00").getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function daysSinceCalled(contact) {
  if (!contact.called_on) return null;
  const ms = Date.now() - new Date(contact.called_on + "T00:00:00").getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function isColdContact(contact) {
  if (!contact.called_on) return false;
  const days = daysSinceCalled(contact);
  return days !== null && days >= COLD_CONTACT_DAYS;
}

function careerSearchTerm() {
  const el = document.getElementById("career-search");
  return el ? el.value.trim().toLowerCase() : "";
}

function jobMatchesSearch(job, term) {
  if (!term) return true;
  const hay = `${job.company || ""} ${job.title || ""} ${job.description || ""} ${job.location || ""}`.toLowerCase();
  return hay.includes(term);
}

function contactMatchesSearch(contact, term) {
  if (!term) return true;
  const hay = `${contact.name || ""} ${contact.company || ""}`.toLowerCase();
  return hay.includes(term);
}

function getReviewJobs() {
  const term = careerSearchTerm();
  return careerJobs
    .filter((j) => j.status === "new" && !(j.fit_score != null && j.fit_score < FIT_SCORE_THRESHOLD))
    .filter((j) => jobMatchesSearch(j, term))
    .sort((a, b) => {
      // fit_score desc; null sinks to bottom. fit_score is never shown to the
      // user — it only drives ordering and the review threshold.
      const sa = a.fit_score != null ? a.fit_score : -1;
      const sb = b.fit_score != null ? b.fit_score : -1;
      if (sb !== sa) return sb - sa;
      return (b.date_found || "").localeCompare(a.date_found || "");
    });
}

function getShortlistJobs() {
  const term = careerSearchTerm();
  return careerJobs
    .filter((j) => j.status === "shortlisted")
    .filter((j) => jobMatchesSearch(j, term))
    .sort((a, b) => (b.date_found || "").localeCompare(a.date_found || ""));
}

function getPipelineJobs() {
  const term = careerSearchTerm();
  return careerJobs.filter((j) => CAREER_PIPELINE_STAGES.includes(j.status)).filter((j) => jobMatchesSearch(j, term));
}

function careerJobMode(job) {
  if (job.status === "shortlisted") return "shortlist";
  if (CAREER_PIPELINE_STAGES.includes(job.status)) return "pipeline";
  return "review";
}

// ============ Review / Shortlist card feeds ============
function careerCardMetaHTML(job) {
  const parts = [job.company, job.location, formatSalary(job)].filter(Boolean);
  return escapeHtml(parts.join(" · "));
}

function reviewCardHTML(job) {
  return `
    <div class="career-card" data-id="${job.id}">
      <div class="career-card-body">
        <div class="career-card-title">${escapeHtml(job.title || "—")}</div>
        <div class="career-card-meta">${careerCardMetaHTML(job)}</div>
      </div>
      <div class="career-quick-actions">
        <button class="career-quick-action career-quick-action--yes" data-action="shortlist" title="Shortlist">✓</button>
        <button class="career-quick-action career-quick-action--no" data-action="delete" title="Delete">✕</button>
      </div>
    </div>
  `;
}

function shortlistCardHTML(job) {
  const tailoringHTML = job.tailored_on
    ? `<div class="career-tailoring-links">📄 Resume · ✉ Cover letter ready</div>`
    : `<div class="career-tailoring-pill">Tailoring… ready after next run</div>`;
  return `
    <div class="career-card" data-id="${job.id}">
      <div class="career-card-body">
        <div class="career-card-title">${escapeHtml(job.title || "—")}</div>
        <div class="career-card-meta">${careerCardMetaHTML(job)}</div>
        ${tailoringHTML}
      </div>
    </div>
  `;
}

function renderReview() {
  const feed = document.getElementById("career-review-feed");
  const empty = document.getElementById("career-review-empty");
  const jobs = getReviewJobs();
  feed.innerHTML = jobs.map(reviewCardHTML).join("");
  empty.classList.toggle("hidden", jobs.length > 0);

  feed.querySelectorAll(".career-quick-action").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = btn.closest(".career-card").dataset.id;
      if (btn.dataset.action === "shortlist") shortlistCareerJob(id);
      else deleteCareerJob(id);
    });
  });
  feed.querySelectorAll(".career-card").forEach((card) => {
    card.addEventListener("click", () => openCareerJobPanel(card.dataset.id));
  });
}

function renderShortlist() {
  const feed = document.getElementById("career-shortlist-feed");
  const empty = document.getElementById("career-shortlist-empty");
  const jobs = getShortlistJobs();
  feed.innerHTML = jobs.map(shortlistCardHTML).join("");
  empty.classList.toggle("hidden", jobs.length > 0);

  feed.querySelectorAll(".career-card").forEach((card) => {
    card.addEventListener("click", () => openCareerJobPanel(card.dataset.id));
  });
}

// ============ Pipeline (kanban) ============
function careerKanbanCardHTML(job) {
  const days = daysSinceApplied(job);
  return `
    <div class="project-card" data-id="${job.id}" draggable="true">
      <div class="project-card-top">
        <span class="career-kanban-dot career-kanban-dot--${job.status}"></span>
        <span class="project-card-name">${escapeHtml(job.title || "—")}</span>
      </div>
      <div class="project-card-meta">${escapeHtml(job.company || "—")} · ${days}d</div>
    </div>
  `;
}

function renderCareerKanban() {
  const pipelineJobs = getPipelineJobs();
  CAREER_PIPELINE_STAGES.forEach((stage) => {
    const colEl = document.getElementById(`career-col-${stage}`);
    const colJobs = pipelineJobs
      .filter((j) => j.status === stage)
      .sort((a, b) => (b.applied_on || b.date_found || "").localeCompare(a.applied_on || a.date_found || ""));
    if (colJobs.length === 0) {
      colEl.innerHTML = `<p class="kanban-empty">Nothing here yet</p>`;
      return;
    }
    colEl.innerHTML = colJobs.map(careerKanbanCardHTML).join("");
  });

  document.querySelectorAll("#career-pipeline .project-card").forEach((el) => {
    el.addEventListener("click", () => openCareerJobPanel(el.dataset.id));
    el.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", el.dataset.id);
      event.dataTransfer.effectAllowed = "move";
      el.classList.add("project-card--dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("project-card--dragging"));
  });
}

function initCareerKanban() {
  document.getElementById("career-add-applied-btn").addEventListener("click", openAddAppliedModal);

  CAREER_PIPELINE_STAGES.forEach((stage) => {
    const colEl = document.getElementById(`career-col-${stage}`);
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
      const id = event.dataTransfer.getData("text/plain");
      const job = careerJobs.find((j) => j.id === id);
      if (!job || job.status === stage) return;
      moveCareerJobStage(id, stage);
    });
  });
}

// ============ Job detail panel ============
function openCareerJobPanel(id) {
  activeCareerJobId = id;
  renderCareerJobPanel();
  document.getElementById("career-job-panel-scrim").classList.add("project-panel-scrim--open");
  document.getElementById("career-job-panel").classList.add("project-panel--open");
}

function closeCareerJobPanel() {
  activeCareerJobId = null;
  document.getElementById("career-job-panel-scrim").classList.remove("project-panel-scrim--open");
  document.getElementById("career-job-panel").classList.remove("project-panel--open");
}

function renderCareerJobPanel() {
  const job = careerJobs.find((j) => j.id === activeCareerJobId);
  if (!job) return;
  const mode = careerJobMode(job);

  document.getElementById("career-job-panel-title").textContent = job.title || "—";
  document.getElementById("career-job-panel-meta").textContent = [job.company, job.location].filter(Boolean).join(" · ");

  const linkEl = document.getElementById("career-job-panel-link");
  linkEl.href = job.url || "#";
  linkEl.classList.toggle("hidden", !job.url);

  const stagesEl = document.getElementById("career-job-panel-stages");
  if (mode === "pipeline") {
    stagesEl.classList.remove("hidden");
    stagesEl.innerHTML = CAREER_ALL_STAGES.map(
      (stage) => `
        <button class="stage-pill stage-pill--${stage} ${stage === job.status ? "stage-pill--active" : ""}" data-stage="${stage}">${CAREER_STAGE_LABELS[stage]}</button>
      `
    ).join("");
    stagesEl.querySelectorAll(".stage-pill").forEach((el) => {
      el.addEventListener("click", () => moveCareerJobStage(job.id, el.dataset.stage));
    });
  } else {
    stagesEl.classList.add("hidden");
    stagesEl.innerHTML = "";
  }

  const summaryEl = document.getElementById("career-job-panel-summary");
  if (mode !== "pipeline" && job.summary) {
    summaryEl.textContent = job.summary;
    summaryEl.classList.remove("hidden");
  } else {
    summaryEl.classList.add("hidden");
  }

  const descSection = document.getElementById("career-job-panel-desc-section");
  if (mode === "pipeline") {
    descSection.classList.add("hidden");
  } else {
    descSection.classList.remove("hidden");
    document.getElementById("career-job-panel-desc").textContent = job.description || "";
  }

  renderCareerJobMaterials(job, mode);
  renderCareerJobNotes(job, mode);
  renderCareerJobActions(job, mode);
}

function renderCareerJobMaterials(job, mode) {
  const el = document.getElementById("career-job-panel-materials");
  if (mode !== "shortlist" && mode !== "pipeline") {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");

  if (!job.tailored_on) {
    el.innerHTML = `<span class="career-tailoring-pill">Tailoring… ready after next run</span>`;
    return;
  }

  el.innerHTML = ["resume", "cover_letter"]
    .map((kind) => {
      const label = kind === "resume" ? "📄 Resume" : "✉ Cover letter";
      const text = kind === "resume" ? job.resume_md : job.cover_letter_md;
      return `
        <div class="career-material-block">
          <div class="career-material-row">
            <button class="career-material-toggle" type="button" data-kind="${kind}">${label}</button>
            <button class="career-material-copy" type="button" data-kind="${kind}">Copy</button>
          </div>
          <pre class="career-material-text hidden" id="career-material-${kind}">${escapeHtml(text || "")}</pre>
        </div>
      `;
    })
    .join("");

  el.querySelectorAll(".career-material-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(`career-material-${btn.dataset.kind}`).classList.toggle("hidden");
    });
  });
  el.querySelectorAll(".career-material-copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.dataset.kind === "resume" ? job.resume_md : job.cover_letter_md;
      try {
        await navigator.clipboard.writeText(text || "");
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 1200);
      } catch (e) {
        console.error("Copy failed:", e);
      }
    });
  });
}

// Shared by the job panel and the contact panel — renders a `{date, text}`
// notes array (newest first) into any container element.
function renderCareerNotesList(listEl, notes) {
  listEl.innerHTML = [...(notes || [])]
    .reverse()
    .map((n) => `<div class="career-notes-entry"><span class="career-notes-entry-date">${escapeHtml(n.date)}</span><span class="career-notes-entry-text">${escapeHtml(n.text)}</span></div>`)
    .join("");
}

function renderCareerJobNotes(job, mode) {
  const section = document.getElementById("career-job-panel-notes-section");
  if (mode !== "pipeline") {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  renderCareerNotesList(document.getElementById("career-job-panel-notes-list"), job.notes || []);
  document.getElementById("career-job-panel-notes-input").value = "";
}

function renderCareerJobActions(job, mode) {
  const el = document.getElementById("career-job-panel-actions");
  el.innerHTML = "";

  if (mode === "review") {
    el.innerHTML = `
      <button class="career-action-btn career-action-btn--success" id="career-job-action-shortlist">✓ Shortlist</button>
      <button class="career-action-btn career-action-btn--danger" id="career-job-action-delete">✕ Delete</button>
    `;
    document.getElementById("career-job-action-shortlist").addEventListener("click", () => shortlistCareerJob(job.id));
    document.getElementById("career-job-action-delete").addEventListener("click", () => deleteCareerJob(job.id));
    return;
  }

  if (mode === "shortlist") {
    el.innerHTML = `
      <button class="career-action-btn career-action-btn--primary" id="career-job-action-applied">Applied</button>
      <button class="career-action-btn career-action-btn--danger" id="career-job-action-delete">Delete</button>
    `;
    document.getElementById("career-job-action-applied").addEventListener("click", () => markCareerJobApplied(job.id));
    document.getElementById("career-job-action-delete").addEventListener("click", () => deleteCareerJob(job.id));
    return;
  }

  el.innerHTML = `<button class="career-action-btn career-action-btn--danger" id="career-job-action-delete">Delete</button>`;
  document.getElementById("career-job-action-delete").addEventListener("click", () => deleteCareerJob(job.id));
}

// ============ Job mutations ============
async function shortlistCareerJob(id) {
  const { error } = await supabaseClient.from("career_jobs").update({ status: "shortlisted", starred: true }).eq("id", id);
  if (error) {
    console.error("Failed to shortlist job:", error.message);
    return;
  }
  closeCareerJobPanel();
  await fetchCareerJobs();
}

async function markCareerJobApplied(id) {
  const job = careerJobs.find((j) => j.id === id);
  const patch = { status: "applied" };
  if (job && !job.applied_on) patch.applied_on = new Date().toISOString().slice(0, 10);
  const { error } = await supabaseClient.from("career_jobs").update(patch).eq("id", id);
  if (error) {
    console.error("Failed to mark job applied:", error.message);
    return;
  }
  closeCareerJobPanel();
  await fetchCareerJobs();
}

async function moveCareerJobStage(id, stage) {
  const patch = { status: stage };
  const job = careerJobs.find((j) => j.id === id);
  if (stage === "applied" && job && !job.applied_on) patch.applied_on = new Date().toISOString().slice(0, 10);
  const { error } = await supabaseClient.from("career_jobs").update(patch).eq("id", id);
  if (error) {
    console.error("Failed to move job:", error.message);
    return;
  }
  await fetchCareerJobs();
}

async function deleteCareerJob(id) {
  const job = careerJobs.find((j) => j.id === id);
  if (!job) return;
  const label = job.title ? `"${job.title}"` : "this job";
  if (!window.confirm(`Permanently delete ${label}? This can't be undone.`)) return;

  // Captured before the row is gone — the dedup_key lets a *different* source
  // (e.g. Greenhouse) that later finds the same role stay suppressed too.
  const key = careerDedupKey(job);

  const { error } = await supabaseClient.from("career_jobs").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete job:", error.message);
    return;
  }
  await supabaseClient
    .from("career_tombstones")
    .upsert([{ kind: "id", value: id }, { kind: "key", value: key }], { onConflict: "kind,value", ignoreDuplicates: true });

  closeCareerJobPanel();
  await fetchCareerJobs();
}

async function addCareerJobNote() {
  const input = document.getElementById("career-job-panel-notes-input");
  const text = input.value.trim();
  if (!text || activeCareerJobId === null) return;
  const job = careerJobs.find((j) => j.id === activeCareerJobId);
  if (!job) return;
  const notes = [...(job.notes || []), { date: new Date().toISOString().slice(0, 10), text }];
  const { error } = await supabaseClient.from("career_jobs").update({ notes }).eq("id", job.id);
  if (error) {
    console.error("Failed to add note:", error.message);
    return;
  }
  input.value = "";
  await fetchCareerJobs();
}

// ============ Add applied job (manual) ============
function openAddAppliedModal() {
  document.getElementById("career-add-applied-title").value = "";
  document.getElementById("career-add-applied-company").value = "";
  document.getElementById("career-add-applied-url").value = "";
  document.getElementById("career-add-applied-note").value = "";
  document.getElementById("career-add-applied-save").disabled = true;
  openCareerModal("career-add-applied-modal");
}

function updateAddAppliedSaveState() {
  const title = document.getElementById("career-add-applied-title").value.trim();
  const company = document.getElementById("career-add-applied-company").value.trim();
  document.getElementById("career-add-applied-save").disabled = !(title && company);
}

async function saveAddAppliedJob() {
  const title = document.getElementById("career-add-applied-title").value.trim();
  const company = document.getElementById("career-add-applied-company").value.trim();
  const url = document.getElementById("career-add-applied-url").value.trim();
  const note = document.getElementById("career-add-applied-note").value.trim();
  if (!title || !company) return;

  const today = new Date().toISOString().slice(0, 10);
  const job = {
    id: "manual-" + crypto.randomUUID(),
    company,
    title,
    url: url || null,
    source: "manual",
    date_found: today,
    last_seen: today,
    status: "applied",
    applied_on: today,
    notes: note ? [{ date: today, text: note }] : [],
  };
  const { error } = await supabaseClient.from("career_jobs").insert(job);
  if (error) {
    console.error("Failed to add applied job:", error.message);
    return;
  }
  closeCareerModal();
  await fetchCareerJobs();
}

// ============ Networking ============
function findContact(id) {
  return careerContacts.find((c) => c.id === id);
}

function contactCardHTML(contact) {
  const days = daysSinceCalled(contact);
  const referralCount = (contact.referrals || []).length;
  const metaParts = [
    contact.company,
    days != null ? `called ${days}d ago` : null,
    referralCount ? `${referralCount} referral${referralCount !== 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return `
    <div class="career-card" data-id="${contact.id}">
      <div class="career-card-body">
        <div class="career-card-title">${escapeHtml(contact.name || "—")}</div>
        <div class="career-card-meta">${escapeHtml(metaParts.join(" · "))}</div>
      </div>
    </div>
  `;
}

function renderNetworking() {
  const feed = document.getElementById("career-contacts-feed");
  const empty = document.getElementById("career-contacts-empty");
  const term = careerSearchTerm();
  const visible = [...careerContacts]
    .filter((c) => contactMatchesSearch(c, term))
    .sort((a, b) => (b.called_on || "").localeCompare(a.called_on || ""));

  feed.innerHTML = visible.map(contactCardHTML).join("");
  empty.classList.toggle("hidden", visible.length > 0);

  feed.querySelectorAll(".career-card").forEach((card) => {
    card.addEventListener("click", () => openContactPanel(card.dataset.id));
  });
}

function openContactPanel(id) {
  activeContactId = id;
  renderContactPanel();
  document.getElementById("career-contact-panel-scrim").classList.add("project-panel-scrim--open");
  document.getElementById("career-contact-panel").classList.add("project-panel--open");
}

function closeContactPanel() {
  activeContactId = null;
  document.getElementById("career-contact-panel-scrim").classList.remove("project-panel-scrim--open");
  document.getElementById("career-contact-panel").classList.remove("project-panel--open");
}

function renderContactPanel() {
  const contact = findContact(activeContactId);
  if (!contact) return;

  document.getElementById("career-contact-panel-title").textContent = contact.name || "—";

  const referredByEl = document.getElementById("career-contact-panel-referred-by");
  const referrer = contact.referred_by ? findContact(contact.referred_by) : null;
  if (referrer) {
    referredByEl.textContent = `Referred by ${referrer.name}`;
    referredByEl.classList.remove("hidden");
    referredByEl.onclick = () => openContactPanel(referrer.id);
  } else {
    referredByEl.classList.add("hidden");
    referredByEl.onclick = null;
  }

  document.getElementById("career-contact-panel-name").value = contact.name || "";
  document.getElementById("career-contact-panel-company").value = contact.company || "";
  document.getElementById("career-contact-panel-called-on").value = contact.called_on || "";

  renderCareerNotesList(document.getElementById("career-contact-panel-notes-list"), contact.notes || []);
  document.getElementById("career-contact-panel-notes-input").value = "";

  renderReferralList(contact);
  document.getElementById("career-referral-name-input").value = "";
  document.getElementById("career-referral-company-input").value = "";
  document.getElementById("career-referral-called-on-input").value = "";
}

function referralRowHTML(ref) {
  const promoteHTML = ref.promoted_to_contact_id
    ? `<button class="career-referral-promoted" type="button" data-promoted-id="${ref.promoted_to_contact_id}">→ now a contact</button>`
    : `<button class="career-referral-promote" type="button" data-id="${ref.id}">Promote</button>`;
  return `
    <div class="career-referral-entry" data-id="${ref.id}">
      <input type="text" class="career-field-input career-referral-name" value="${escapeHtml(ref.name || "")}" placeholder="Name" />
      <input type="text" class="career-field-input career-referral-company" value="${escapeHtml(ref.company || "")}" placeholder="Company" />
      <input type="date" class="career-field-input career-referral-called-on" value="${ref.called_on || ""}" />
      ${promoteHTML}
      <button class="career-referral-delete" type="button" data-id="${ref.id}" aria-label="Delete referral">✕</button>
    </div>
  `;
}

function renderReferralList(contact) {
  const listEl = document.getElementById("career-referral-list");
  listEl.innerHTML = (contact.referrals || []).map(referralRowHTML).join("");

  listEl.querySelectorAll(".career-referral-entry").forEach((row) => {
    const id = row.dataset.id;
    row.querySelector(".career-referral-name").addEventListener("change", (e) => updateReferralField(contact.id, id, "name", e.target.value.trim()));
    row.querySelector(".career-referral-company").addEventListener("change", (e) => updateReferralField(contact.id, id, "company", e.target.value.trim()));
    row.querySelector(".career-referral-called-on").addEventListener("change", (e) => updateReferralField(contact.id, id, "called_on", e.target.value || null));
  });
  listEl.querySelectorAll(".career-referral-promote").forEach((btn) => {
    btn.addEventListener("click", () => promoteReferral(contact.id, btn.dataset.id));
  });
  listEl.querySelectorAll(".career-referral-promoted").forEach((btn) => {
    btn.addEventListener("click", () => openContactPanel(btn.dataset.promotedId));
  });
  listEl.querySelectorAll(".career-referral-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteReferral(contact.id, btn.dataset.id));
  });
}

// ============ Contact mutations ============
async function updateContactField(field, value) {
  if (activeContactId === null) return;
  const { error } = await supabaseClient.from("career_contacts").update({ [field]: value }).eq("id", activeContactId);
  if (error) {
    console.error("Failed to update contact:", error.message);
    return;
  }
  await fetchCareerContacts();
}

async function addContactNote() {
  const input = document.getElementById("career-contact-panel-notes-input");
  const text = input.value.trim();
  if (!text || activeContactId === null) return;
  const contact = findContact(activeContactId);
  if (!contact) return;
  const notes = [...(contact.notes || []), { date: new Date().toISOString().slice(0, 10), text }];
  const { error } = await supabaseClient.from("career_contacts").update({ notes }).eq("id", contact.id);
  if (error) {
    console.error("Failed to add contact note:", error.message);
    return;
  }
  input.value = "";
  await fetchCareerContacts();
}

async function updateReferralField(contactId, referralId, field, value) {
  const contact = findContact(contactId);
  if (!contact) return;
  const referrals = (contact.referrals || []).map((r) => (r.id === referralId ? { ...r, [field]: value } : r));
  const { error } = await supabaseClient.from("career_contacts").update({ referrals }).eq("id", contactId);
  if (error) {
    console.error("Failed to update referral:", error.message);
    return;
  }
  await fetchCareerContacts();
}

async function addReferral() {
  if (activeContactId === null) return;
  const contact = findContact(activeContactId);
  if (!contact) return;
  const name = document.getElementById("career-referral-name-input").value.trim();
  if (!name) return;
  const company = document.getElementById("career-referral-company-input").value.trim();
  const calledOn = document.getElementById("career-referral-called-on-input").value || null;

  const referrals = [
    ...(contact.referrals || []),
    { id: crypto.randomUUID(), name, company, called_on: calledOn, notes: [], promoted_to_contact_id: null },
  ];
  const { error } = await supabaseClient.from("career_contacts").update({ referrals }).eq("id", contact.id);
  if (error) {
    console.error("Failed to add referral:", error.message);
    return;
  }
  await fetchCareerContacts();
}

async function deleteReferral(contactId, referralId) {
  const contact = findContact(contactId);
  if (!contact) return;
  if (!window.confirm("Delete this referral?")) return;
  const referrals = (contact.referrals || []).filter((r) => r.id !== referralId);
  const { error } = await supabaseClient.from("career_contacts").update({ referrals }).eq("id", contactId);
  if (error) {
    console.error("Failed to delete referral:", error.message);
    return;
  }
  await fetchCareerContacts();
}

async function promoteReferral(contactId, referralId) {
  const contact = findContact(contactId);
  const ref = (contact && contact.referrals || []).find((r) => r.id === referralId);
  if (!contact || !ref || ref.promoted_to_contact_id) return;

  const { data: newContact, error: insertError } = await supabaseClient
    .from("career_contacts")
    .insert({
      name: ref.name,
      company: ref.company || null,
      called_on: ref.called_on || null,
      notes: ref.notes || [],
      referred_by: contact.id,
    })
    .select()
    .single();
  if (insertError) {
    console.error("Failed to promote referral:", insertError.message);
    return;
  }

  const referrals = contact.referrals.map((r) => (r.id === referralId ? { ...r, promoted_to_contact_id: newContact.id } : r));
  const { error: updateError } = await supabaseClient.from("career_contacts").update({ referrals }).eq("id", contact.id);
  if (updateError) {
    console.error("Failed to link promoted referral:", updateError.message);
  }
  await fetchCareerContacts();
}

async function deleteContact(id) {
  const contact = findContact(id);
  if (!contact) return;
  const label = contact.name ? `"${contact.name}"` : "this contact";
  if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
  const { error } = await supabaseClient.from("career_contacts").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete contact:", error.message);
    return;
  }
  closeContactPanel();
  await fetchCareerContacts();
}

// ============ Add contact modal ============
function openAddContactModal() {
  document.getElementById("career-add-contact-name").value = "";
  document.getElementById("career-add-contact-company").value = "";
  document.getElementById("career-add-contact-called-on").value = "";
  document.getElementById("career-add-contact-save").disabled = true;
  openCareerModal("career-add-contact-modal");
}

function updateAddContactSaveState() {
  const name = document.getElementById("career-add-contact-name").value.trim();
  document.getElementById("career-add-contact-save").disabled = !name;
}

async function saveAddContact() {
  const name = document.getElementById("career-add-contact-name").value.trim();
  if (!name) return;
  const company = document.getElementById("career-add-contact-company").value.trim();
  const calledOn = document.getElementById("career-add-contact-called-on").value || null;

  const { error } = await supabaseClient.from("career_contacts").insert({ name, company: company || null, called_on: calledOn });
  if (error) {
    console.error("Failed to add contact:", error.message);
    return;
  }
  closeCareerModal();
  await fetchCareerContacts();
}

// ============ Generic small modal (add applied job / add contact) ============
let openCareerModalId = null;

function openCareerModal(id) {
  openCareerModalId = id;
  document.getElementById("career-modal-scrim").classList.remove("hidden");
  document.getElementById(id).classList.remove("hidden");
}

function closeCareerModal() {
  if (openCareerModalId) document.getElementById(openCareerModalId).classList.add("hidden");
  openCareerModalId = null;
  document.getElementById("career-modal-scrim").classList.add("hidden");
}

// ============ Init ============
function initCareerTab() {
  initCareerKanban();

  document.getElementById("career-search").addEventListener("input", () => {
    renderReview();
    renderShortlist();
    renderCareerKanban();
    renderNetworking();
  });

  // Job panel
  document.getElementById("career-job-panel-scrim").addEventListener("click", closeCareerJobPanel);
  document.getElementById("career-job-panel-close").addEventListener("click", closeCareerJobPanel);
  document.getElementById("career-job-panel-delete").addEventListener("click", () => {
    if (activeCareerJobId !== null) deleteCareerJob(activeCareerJobId);
  });
  document.getElementById("career-job-panel-notes-add").addEventListener("click", addCareerJobNote);
  document.getElementById("career-job-panel-notes-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addCareerJobNote();
  });

  // Contact panel
  document.getElementById("career-contact-panel-scrim").addEventListener("click", closeContactPanel);
  document.getElementById("career-contact-panel-close").addEventListener("click", closeContactPanel);
  document.getElementById("career-contact-panel-delete").addEventListener("click", () => {
    if (activeContactId !== null) deleteContact(activeContactId);
  });
  document.getElementById("career-contact-panel-name").addEventListener("change", (e) => updateContactField("name", e.target.value.trim()));
  document.getElementById("career-contact-panel-company").addEventListener("change", (e) => updateContactField("company", e.target.value.trim() || null));
  document.getElementById("career-contact-panel-called-on").addEventListener("change", (e) => updateContactField("called_on", e.target.value || null));
  document.getElementById("career-contact-panel-notes-add").addEventListener("click", addContactNote);
  document.getElementById("career-contact-panel-notes-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addContactNote();
  });
  document.getElementById("career-referral-add-btn").addEventListener("click", addReferral);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (openCareerModalId) closeCareerModal();
    else if (activeContactId !== null) closeContactPanel();
    else if (activeCareerJobId !== null) closeCareerJobPanel();
  });

  // Networking add-contact
  document.getElementById("career-add-contact-btn").addEventListener("click", openAddContactModal);

  // Modals
  document.getElementById("career-modal-scrim").addEventListener("click", closeCareerModal);
  document.getElementById("career-add-applied-cancel").addEventListener("click", closeCareerModal);
  document.getElementById("career-add-applied-save").addEventListener("click", saveAddAppliedJob);
  ["career-add-applied-title", "career-add-applied-company"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateAddAppliedSaveState);
  });
  document.getElementById("career-add-contact-cancel").addEventListener("click", closeCareerModal);
  document.getElementById("career-add-contact-save").addEventListener("click", saveAddContact);
  document.getElementById("career-add-contact-name").addEventListener("input", updateAddContactSaveState);
}
