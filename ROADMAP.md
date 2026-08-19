# Personal Dashboard — Build Roadmap

> Build order, as a checklist. Tick items off as they're completed and note anything relevant for the next session.
> **Guiding principle:** structure first → login → simple self-entered tabs → tricky connected ones. Easiest-data-first.
> Full detail on every feature lives in `CLAUDE.md`; the visual + interaction spec lives in `DESIGN.md`.
>
> **Cover-page principle:** build every data-dependent slot early as a dumb component with a placeholder state, then swap in the real source at its phase. The page should look finished from Phase 0.

---

## Phase 0 — Foundation
*Get the skeleton and the vault standing before any real features.*

> **Phase 0 complete (2026-08-16).** Repo: github.com/Olibaba124/personal-dashboard. Live:
> https://olibaba124.github.io/personal-dashboard/. Supabase project `altnaaajgygspiekmhtn`, GitHub
> integration connected but inert (no `supabase/migrations` folder; free plan doesn't support preview
> branching anyway). Public sign-ups disabled, single manually-created account, real login confirmed
> working end-to-end by the user. Cover page fetches a real row from a throwaway `ping` table
> (RLS: authenticated-only) after login and renders it — proves the full pipe, not just the auth gate.
> Source-code security check passed: only the public URL + publishable key ship client-side, no
> `service_role` key, no password, no real data yet. The `ping` table/UI line is temporary — remove
> both once Phase 1's real to-do list replaces it. RLS pattern going forward: `to authenticated` is
> sufficient for every future table (single-user app, no sign-ups) — no per-row ownership column
> needed. Next: Phase 1, Session 4 — the to-do list + quick capture V1 + pressing band.

- [x] Create the project folder + GitHub repo, add `.gitignore` (ignore env/secret files). *(folder: `~/Desktop/personal-dashboard`; repo: github.com/Olibaba124/personal-dashboard)*
- [x] Build the **front-end shell**: cover page + five tab layout (Projects, Personal, Performance, Career, Academics), plain HTML/CSS/JS, no build step. No data yet — just navigable structure. *(2026-08-14)*
- [x] Apply the **`DESIGN.md` design system**: dark mode, semantic palette, mono-for-numbers / sans-for-prose. *(2026-08-14)*
- [x] Lay out the **cover page slots** with placeholder content (ticker, week score, capture, calendar strip, check-in banner, pressing band, news, to-dos, yesterday row). *(2026-08-14)*
- [x] **Stock ticker** — scrolling marquee of a hardcoded watchlist, static placeholder numbers for now. *(2026-08-14)*
- [x] Push to GitHub + enable Pages. *(2026-08-16 — live at https://olibaba124.github.io/personal-dashboard/)*
- [x] Create the **Supabase** project (database + auth). *(2026-08-16 — project `altnaaajgygspiekmhtn`)*
- [x] Build the **login wall** (Supabase Auth). Confirm no secrets/passwords exist anywhere in front-end source. *(2026-08-16 — built + jsdom-tested against a mocked client; real-account test still pending, see note above. Confirmed: only the public URL + anon key are in source, no password/secret.)*
- [x] **Wire the two layers together:** logging in lets the shell request and receive data from Supabase; a logged-out visitor sees only a login wall / empty shell. *(2026-08-16 — cover page fetches a real row from a `ping` table, gated by RLS to authenticated users only, and renders it after login. Confirmed live.)*
- [x] Sanity check the security model end to end (view page source — confirm no data or keys are exposed). *(2026-08-16 — verified: only the public URL + publishable key in source, no `service_role` key, no password value, no real personal data yet.)*

## Phase 1 — Core self-entered tabs (quick wins → make it usable)
*Pure type-it-in-yourself data. No external APIs. Gets the dashboard genuinely useful fast.*

> **Session note (2026-08-16):** To-do list, quick capture V1, and the pressing band are live —
> the first Phase 1 feature and the first real (non-placeholder) data table. Schema: `public.todos`
> (`text`, `completed`, `completed_at`, `defer_count`, `deleted_at` for soft delete, `created_at`),
> RLS `to authenticated` for select/insert/update (same single-user pattern as `ping` before it — no
> per-row ownership needed). The old `ping` test table and its cover-page line are gone.
>
> **Interaction change (user request, 2026-08-16):** checking a to-do off now completes *and* clears
> it in one motion (pop animation), replacing the earlier separate delete (×) button — there is no
> longer a way to discard a task without it counting as completed. To-do header simplified from
> "completed/total" to a plain open-task count as a result.
>
> **Goals tab is live too**, same day: `public.goals` with a single `tier` column
> (`long_term` / `mid_term` / `short_term`) rather than three tables, so a later session can wire
> short-term goals into daily to-dos without a schema change. Same check-to-clear interaction as
> to-dos, for consistency. Not yet wired to anything else — that's explicitly future work.
>
> **Projects tab is live too**, same day: `public.projects` (with a `status` column driving the four
> Kanban columns) plus `public.project_subtasks` (checklist items inside each card, hard-deleted on
> removal since Performance never needs to look back on them — everything else in this app
> soft-deletes). Cards move between columns via a status `<select>`, mirroring how the job tracker's
> Kanban opens a detail view and changes stage from a dropdown rather than drag-and-drop — checked the
> job tracker's `docs/app.js` directly before building this, since the plan is to reuse this component
> when Career migrates the job tracker in Phase 2. Cards expand in place (no modal) to reveal subtasks.
> LLM-suggested subtasks are explicitly future work, not built yet.
>
> **Phase 1 initially complete 2026-08-16.** Tested with four jsdom suites (102 checks, no browser
> tool in this environment) — real-browser confirmation from the user pending for Goals and Projects
> specifically (to-do list already confirmed working live).
>
> **Session 6 correction & Projects rebuild (2026-08-18):** the `public.projects` /
> `public.project_subtasks` schema described above was never actually applied to the database —
> every column in the live tab was rendering `Could not find the table 'public.projects' in the
> schema cache`. Rebuilt end-to-end against a revised spec: `public.projects` (`name`, `stage`
> — `idea`/`brainstorm`/`progress`/`done`, replacing `started` with `brainstorm`, `notes`,
> `position`), `public.project_steps` (a separate table rather than a JSON column, specifically so a
> later Performance session can read step completions the same way it reads to-dos — that link is
> deliberately not wired yet), and `public.project_files` (filename/size, backed by a private
> Storage bucket, downloads only ever go through short-lived signed URLs, never a public bucket
> URL). RLS on all three kept the established `to authenticated` pattern with no `user_id` column —
> confirmed with the user first, since this session's own draft spec called for
> `user_id = auth.uid()`, which would have diverged from every other table in the app (same kind of
> spec-vs-codebase conflict as the Goals retool).
>
> The board is now Idea → Brainstorm → In Progress → Complete; only Idea has an add input, and
> projects move forward from a right-side **detail panel** instead of a status dropdown — stage
> pills (click to move + re-render the board), a single autosaving (on blur, debounced) notes
> textarea, a step checklist where each step can carry an optional inline target date, a file list
> with upload/delete through signed URLs, and a disabled "Ask Claude about this project" slot stubbed
> for Phase 4. Cards are one component with a variant flag rather than two: Idea/Brainstorm render a
> compact stage-dot pill, In Progress/Complete render the same card plus a thin completion bar
> (ideas never get a bar — empty reads as failure). A query-level failure shows one line above the
> board rather than a message per column. Dated steps merge into the cover-page to-do list on read,
> tagged with their project name, and are never copied into `todos` — checking one off from either
> place updates the same `project_steps` row.
>
> Tested with a new jsdom suite (46 checks): empty-state copy per column, add/move/delete, step
> add/complete/date-set with the meta line recomputing each time, the to-do-list merge round-trip
> (appears tagged when dated + open, disappears when done, `todos` table never touched, completing
> from either surface updates the same row), file upload/list/download/delete against a mocked
> Storage API, and the single-line query-failure banner with no raw Postgres text leaking through.
> Real-browser confirmation from the user still pending.
>
> **Projects follow-up fixes (2026-08-18, same day):** real-browser testing surfaced two issues.
> First, the native date input let a half-typed year commit as garbage (`07/21/0202`, later found
> live in the database as `0029-08-21` on a test step and cleared) — replaced entirely with a custom
> MM/DD/YY picker (three mono selects) so the year range is fully controlled (2026-2035, always two
> digits, `25` never offered) instead of relying on native browser validation. Second pass on that
> same picker caught a bug before shipping: saving on every partial pick (month alone, say) meant the
> very next re-render pulled from the still-null persisted date and wiped the selection, so a date
> could never actually be built up one field at a time — fixed by only persisting once all three
> parts are set (or clearing when a previously-dated step loses one). Second, files weren't confirmed
> working end-to-end (schema/RLS/bucket all checked out, but zero rows existed in `project_files` or
> `storage.objects`, and upload/delete failures only ever logged to the console) — added a visible
> inline error line in the Files section, and replaced "click a file to download" with a **preview
> modal** (images inline, PDFs in an iframe, other types fall back to an "Open in new tab" link),
> still reached only through a fresh signed URL. jsdom suite grew to 59 checks, including a
> revert-and-confirm pass on both the mid-selection bug and the year-range regression to make sure
> they were real fixes and not vacuous assertions. Real-browser confirmation from the user is still
> the open item — this session could check schema, RLS, and logic, but not click through the actual
> upload/preview flow in a browser.
>
> **Drag-and-drop added (2026-08-18, same day):** user request explicitly reversed the earlier "no
> drag-and-drop, movement only through the panel" decision. Cards are now natively draggable between
> columns; dropping calls the same `moveProjectStage()` the stage pills already used, so there's one
> move path, not two. Dropping into the card's current column is a no-op. jsdom has no
> DragEvent/DataTransfer implementation, so drag was tested by shimming a fake `dataTransfer` object
> onto a plain `Event` before dispatch — suite grew to 67 checks, drag coverage included in the
> revert-and-confirm pass.
>
> **Goals retooled into a container hierarchy (2026-08-17)**, replacing the flat three-list version
> above. Long-term goals hold mid-term milestones, mid-term milestones hold short-term ones, short-term
> goals hold linked to-dos (`todos.goal_id`, nullable FK). Progress is always derived from
> children/linked to-dos — never a stored percentage. Milestones carry a soft `target_month` (never
> renders "overdue," a missed one just reads "was Oct"). Marking a goal done/dropped is a manual
> status control, separate from derived progress. `last_movement_at` propagates up the parent chain
> when a linked to-do completes or a goal's status changes; the pressing band now also flags goals
> stalled 21+ days. A disabled-but-clickable Roadmap sub-tab is stubbed (timeline view, not built).
> Migration kept the existing `long_term`/`mid_term`/`short_term` tier values and skipped a `user_id`
> column — both confirmed with the user first, since the retool spec's own schema draft disagreed
> with itself and with the rest of the codebase's RLS-to-authenticated-only pattern on those two
> points. Tested with a rewritten Goals jsdom suite (39 checks: full add-milestone-pull-complete flow,
> three-level movement propagation, manual status control, pressing-band merge) plus the three
> existing suites re-verified (128 checks total). Full component spec: `DESIGN.md` §6.
>
> **Phase 1 complete.** Next: Phase 2 — migrate the job tracker into Career, add the Academics Canvas
> integration, and the cover-page calendar strip.

- [x] **To-do list** on the cover page (add / complete / defer / delete; track defers so a 3+ pushed task flags as "stuck"). *(2026-08-16)*
- [x] **Goals** tab — container hierarchy: long-term goals hold mid-term milestones, mid-term milestones hold short-term ones, short-term goals hold linked to-dos. Progress always derived, never typed in; milestones carry a soft (non-punitive) target month. *(2026-08-16 flat version, retooled into containers 2026-08-17 — see note above and `DESIGN.md` §6.)*
- [x] **Quick capture** (V1) — always-focused input on the cover page; everything typed becomes a to-do. Never prompts for a category or date. *(2026-08-16)*
- [x] **Pressing issues band** — wired to the to-do source (3+ deferred) and, as of the Goals retool, stalled goals (21+ days no movement). Must render empty gracefully. *(2026-08-16; extended 2026-08-17)*
- [x] **Projects** tab — Kanban (Idea → Brainstorm → In Progress → Complete) with a right-side detail panel (stage pills, autosaving notes, step checklist with optional per-step target dates, file attachments via signed URLs). *(2026-08-16 shipped the UI shell only — the schema was never actually applied. Rebuilt end-to-end 2026-08-18: tables + RLS + private Storage bucket, board, detail panel, files, and the to-do-list merge for dated steps — see Session 6 note above. Manual steps only; LLM-suggested steps are Phase 4+ work.)*

## Phase 2 — Existing & adjacent tabs
*Bring in work I already have plus one integration.*

- [ ] **Career** tab — migrate the job tracker (with its Kanban) into the dashboard; add the networking module.
- [ ] **Academics** tab — calendar view of assignments + grades via **Canvas** integration.
- [ ] **Calendar strip** on the cover page — today's events colour-coded by source, with computed free blocks.
- [ ] Extend the **pressing band** to pull Canvas deadlines and cold Career contacts.

## Phase 3 — Performance engine
*The reflective heartbeat. Input is quick; output grows richer over time.*

- [ ] **Daily check-in** (input): hours slept, drink/smoke/exercise toggles, water, mood/energy slider, optional note. Under 30 seconds.
- [ ] **Auto-pulls** wired in: learning done, to-dos cleared, jobs applied, deferred tasks (and screen time if feasible).
- [ ] **Check-in prompt** renders on the cover page and hides once today's `check_ins` row exists (keyed off the Supabase row + local date, not a browser flag, so it syncs across devices).
- [ ] **Week productivity score** — 0–100 composite + 7-day bars on the cover page. Weights: to-dos 30 / jobs applied 25 / learning 15 / check-in logged 15 / deferral penalty 15. **Excludes sleep, mood, drink, exercise by design.** Shows "collecting — N of 7 days" until a full week exists.
- [ ] **Yesterday row** on the cover page — one monospace line of the previous day's facts.
- [ ] **Visualizations**: weekly/monthly rollups, streaks/momentum.
- [ ] **Goals Roadmap view** (timeline) and **Cascade view** (tree) — the two Goals visualizations stubbed in Phase 1's retool (`goals-tier-roadmap` sub-tab currently a "coming soon" placeholder). Same reflective spirit as the rollups above, specific to the goals hierarchy.
- [ ] **Weekly synopsis** (~5-min free-write) → LLM analyzes it with the numbers → weekly report.
- [ ] **Correlation view** (once a few weeks of data exist): auto-spot best/worst weeks and what they had in common.
- [ ] **Goal-linked vs unattached to-do completions** — now that `todos.goal_id` exists, Performance can distinguish to-dos done in service of a goal from ad-hoc ones. Not wired into any score or view yet.

## Phase 4 — Learning hub
*Skill scheduler + content library + knowledge base.*

- [ ] **Notes / knowledge base** section (the second brain Claude can interface with).
- [ ] **Topic seeding** + LLM daily bites and scheduling. Completing daily learning auto-pulls into Performance.
- [ ] **File ingestion**: drop in articles/PDFs/links → LLM summary + takeaways → slotted into the daily schedule.
- [ ] **Quick capture V2** — LLM routing: task → to-dos, URL → content library, fact → notes, "idea:" → Projects. Still never asks a follow-up question. (Optional V3: `t:` `n:` `p:` `l:` prefix overrides.)
- [ ] **LLM breakdown — shared component**: Goals milestones (drop in a goal, get suggested milestones) and Projects Kanban subtasks (drop in a project, get suggested subtasks) share one breakdown component, built once here since this is the first phase LLM infrastructure exists.

## Phase 5 — Cover-page intelligence
*The LLM-generated morning brief.*

- [ ] **News digest** tuned to my interests (real estate, AI, my markets).
- [ ] **Market summary** — draws on the portfolio connection (so this lands with / after Finance).
- [ ] **Live ticker data** — swap the placeholder watchlist numbers for a real quote feed via a Supabase Edge Function (key server-side). Polling every 30–60s; websockets only if polling feels stale.

## Phase 6 — Finance (hardest — last)
*Sensitive data + external APIs. Design carefully.*

- [ ] **Decide the brokerage** (API friendliness — research Alpaca, Tradier, others).
- [ ] **Portfolio tracker** — pull positions via brokerage API; daily P&L, allocation. Keys server-side only.
- [ ] **Budget tracker** — connect the bank via **Plaid** (verify pricing first); auto-categorize spend, track weekly/monthly against budget.
- [ ] **Insights layer** — flag overspending patterns.

## Phase 7 — Mobile app & notifications *(deferred)*
*Only after the web dashboard is solid.*

- [ ] Decide hosting route (Capacitor recommended for a real-app feel + reliable notifications).
- [ ] Apple Developer account (~$99/yr — verify) for permanent install + push.
- [ ] Stripped-down companion: cover page (brief + to-dos) + daily survey. Survey writes to the same Supabase vault.
- [ ] Morning notification to prompt the daily check-in.

---

### Open decisions to resolve at their phase
- Brokerage choice (Phase 6) — API friendliness is the top criterion.
- Plaid pricing (Phase 6) — verify before building the budget tracker.
- Mobile hosting + notifications (Phase 7).
- Quote API for the ticker (Phase 6, or earlier if convenient) — Finnhub / Alpaca free tiers are candidates.
- Whether to revisit a squared display font for tabs + greeting (see `DESIGN.md` §1) — reverted for now.
