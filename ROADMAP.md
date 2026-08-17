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
> Tested with three jsdom suites (76 checks total, no browser tool in this environment) — real-browser
> confirmation from the user pending for Goals specifically (to-do list already confirmed working live).
> Next: Projects Kanban.

- [x] **To-do list** on the cover page (add / complete / defer / delete; track defers so a 3+ pushed task flags as "stuck"). *(2026-08-16)*
- [x] **Goals** tab — tiered with separate subsections: long-term → mid-term (quarterly/monthly) → short-term (weekly, feeds daily to-dos). *(2026-08-16 — feeding daily to-dos not wired yet, by design; see note above.)*
- [x] **Quick capture** (V1) — always-focused input on the cover page; everything typed becomes a to-do. Never prompts for a category or date. *(2026-08-16)*
- [x] **Pressing issues band** — wired to the to-do source only for now (tasks deferred 3+ times). Must render empty gracefully. *(2026-08-16)*
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
