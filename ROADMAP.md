# Personal Dashboard — Build Roadmap

> Build order, as a checklist. Tick items off as they're completed and note anything relevant for the next session.
> **Guiding principle:** structure first → login → simple self-entered tabs → tricky connected ones. Easiest-data-first.
> Full detail on every feature lives in `CLAUDE.md`; the visual + interaction spec lives in `DESIGN.md`.
>
> **Cover-page principle:** build every data-dependent slot early as a dumb component with a placeholder state, then swap in the real source at its phase. The page should look finished from Phase 0.

---

## Phase 0 — Foundation
*Get the skeleton and the vault standing before any real features.*

> **Session note (2026-08-14):** Skeleton built and committed locally at `~/Desktop/personal-dashboard`
> (plain HTML/CSS/JS, no build tool — matches the job-tracker stack). Neither `brew` nor `gh` were
> installed on this machine, so the GitHub repo hasn't been created/pushed yet. Next session: install
> Homebrew + `gh auth login` (interactive, needs the user's own terminal), then create+push the repo
> and enable Pages, before moving on to Supabase + the login wall.

- [x] Create the project folder + local Git repo, add `.gitignore` (ignore env/secret files). *(2026-08-14 — folder is `~/Desktop/personal-dashboard`; GitHub remote not yet created, see note below.)*
- [x] Build the **front-end shell**: cover page + five tab layout (Projects, Personal, Performance, Career, Academics), plain HTML/CSS/JS, no build step. No data yet — just navigable structure. *(2026-08-14)*
- [x] Apply the **`DESIGN.md` design system**: dark mode, semantic palette, mono-for-numbers / sans-for-prose. *(2026-08-14)*
- [x] Lay out the **cover page slots** with placeholder content (ticker, week score, capture, calendar strip, check-in banner, pressing band, news, to-dos, yesterday row). *(2026-08-14)*
- [x] **Stock ticker** — scrolling marquee of a hardcoded watchlist, static placeholder numbers for now. *(2026-08-14)*
- [ ] Push the local repo to a **GitHub repo** and enable Pages. *(Blocked on `gh` CLI — see note below.)*
- [ ] Create the **Supabase** project (database + auth).
- [ ] Build the **login wall** (Supabase Auth). Confirm no secrets/passwords exist anywhere in front-end source.
- [ ] **Wire the two layers together:** logging in lets the shell request and receive data from Supabase; a logged-out visitor sees only a login wall / empty shell.
- [ ] Sanity check the security model end to end (view page source — confirm no data or keys are exposed).

## Phase 1 — Core self-entered tabs (quick wins → make it usable)
*Pure type-it-in-yourself data. No external APIs. Gets the dashboard genuinely useful fast.*

- [ ] **To-do list** on the cover page (add / complete / defer / delete; track defers so a 3+ pushed task flags as "stuck").
- [ ] **Goals** tab — tiered with separate subsections: long-term → mid-term (quarterly/monthly) → short-term (weekly, feeds daily to-dos).
- [ ] **Quick capture** (V1) — always-focused input on the cover page; everything typed becomes a to-do. Never prompts for a category or date.
- [ ] **Pressing issues band** — wired to the to-do source only for now (tasks deferred 3+ times). Must render empty gracefully.
- [ ] **Projects** tab — Kanban (Idea → Started → In Progress → Complete) with expandable cards.

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
- [ ] **Weekly synopsis** (~5-min free-write) → LLM analyzes it with the numbers → weekly report.
- [ ] **Correlation view** (once a few weeks of data exist): auto-spot best/worst weeks and what they had in common.

## Phase 4 — Learning hub
*Skill scheduler + content library + knowledge base.*

- [ ] **Notes / knowledge base** section (the second brain Claude can interface with).
- [ ] **Topic seeding** + LLM daily bites and scheduling. Completing daily learning auto-pulls into Performance.
- [ ] **File ingestion**: drop in articles/PDFs/links → LLM summary + takeaways → slotted into the daily schedule.
- [ ] **Quick capture V2** — LLM routing: task → to-dos, URL → content library, fact → notes, "idea:" → Projects. Still never asks a follow-up question. (Optional V3: `t:` `n:` `p:` `l:` prefix overrides.)

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
