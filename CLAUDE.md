# Personal Dashboard — Project Context

> **Claude Code: read this file fully at the start of every session before doing anything.**
> It is the single source of truth for what this project is, how it's built, and how I like to work.
> When something material changes (a decision made, a phase completed), update this file and `ROADMAP.md`.
> **`DESIGN.md` holds the visual + interaction spec** (palette, typography, component behaviour). Read it before building any UI.

---

## 1. What this is

This project is a **personal dashboard** — a web application that brings my entire life into one place. It's hosted on **GitHub Pages** with a secure **Supabase** back end, and it's organized into **five tabs** — Projects, Personal, Performance, Career, and Academics — plus a **daily cover page**.

The primary goal is **consolidation**: pulling data that currently lives scattered across tools (Canvas, my job tracker, my finances) into a single command center, so I can focus on applying to jobs, managing school, and building toward my goals without juggling apps.

The dashboard is **primarily forward-looking** — an active daily driver that tells me what to work on and surfaces the updates I need each day. The **one exception is the Performance tab**, which is reflective: it shows how I've been doing over time through tracked metrics. The cover page and the Performance tab bookend the experience — one points forward to today's actions, the other looks back at my patterns.

---

## 2. How to work with me

- I'm a **low-code builder.** I'm using Claude Code to do the heavy lifting.
- **Work autonomously and handle as much of the coding as possible.** Keep me focused on decisions, direction, and reviewing what's built — not on learning every technical detail.
- **Explain only when a decision needs my input.** Don't narrate routine code. I'll ask if I want to go deeper on something.
- **Work in small, testable steps.** Prefer "add a table that shows my goals, then confirm it works" over "build the whole tab at once." Catch issues early.
- Keep the **whole project in one folder** you can see end to end.
- At the end of each session, **update `ROADMAP.md`** (tick off what's done, note what's next) so future sessions always know the state.

---

## 3. Architecture & security — non-negotiable

This is the most important part of the project. I will be putting **sensitive personal information** into this (bank data, portfolio positions, health/daily logs). It must **never** be publicly accessible, even though the front end is hosted on public GitHub Pages.

**The two-layer model:**
- **Front end (public shell)** — the dashboard UI, hosted on GitHub Pages. Anyone can load the page and view its source. That is fine, because the front end holds **no data and no secrets** on its own. It's an empty shell until an authenticated user pulls data.
- **Back end (private vault)** — Supabase. Holds all data, all secret API keys, and the real authentication. Only hands data over **after** the user logs in and is verified.

**Hard rules — do not break these:**
1. **Never** put API keys, tokens, passwords, or real personal data in front-end code or anything committed to the public repo.
2. All secrets live **server-side** (Supabase / environment variables), never shipped to the browser.
3. Authentication is handled by **Supabase Auth** — credentials stored hashed, server-side. There must be **no password or secret anywhere in the front-end source** (this is the flaw in my old job tracker, where the password was client-side and visible in source — do not repeat it).
4. The front end only ever receives **finished, non-sensitive data** after auth succeeds. A stranger viewing source sees only the request being made — never the password or the data.
5. Set up a **`.gitignore`** for env/secret files from the very first session. Never commit `.env`.

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Front-end hosting | **GitHub Pages** | Static, public. UI shell only. |
| Back end (DB, auth, secrets) | **Supabase** | Free tier is expected to comfortably cover a single-user dashboard. Well-documented, works well with Claude Code. |
| Bank connection (later) | **Plaid** | For the budget tracker. Verify current pricing at build time — this is one spot real cost could appear. |
| Brokerage/portfolio API (later) | **TBD** | Chosen based on API friendliness. Candidates to research: Alpaca, Tradier. No existing brokerage account — decide at finance-build time. |
| Mobile app (deferred) | **Capacitor** | Wraps the existing web app into a real iPhone app with proper notifications. Requires an Apple Developer account (~$99/yr, verify) for reliable push + permanent install. Deferred to the end. |
| Build tool | **Claude Code** | Prefer popular, well-documented libraries so Claude Code makes fewer mistakes. |

*All pricing figures above are approximate and should be re-verified at build time — they change.*

---

## 5. The product — cover page & five tabs

### Cover page (daily landing / morning brief)
The first thing I see each day; orients the whole day. Its job is to answer **"what do I do now"** in under ten seconds — every addition taxes that. Laid out forward-looking at the top, backward-looking at the bottom. Full visual spec in `DESIGN.md`.

- **Stock ticker** — a scrolling marquee of a **hardcoded watchlist** (not my positions — those live in Finance). Quotes fetched by a Supabase Edge Function, key server-side; polling every 30–60s is enough to feel live.
- **Week score** — a 0–100 productivity composite plus a 7-day bar strip. Scores **actions I chose** (to-dos cleared, jobs applied, learning done, check-in logged, minus a deferral penalty). **Deliberately excludes sleep, mood, drinking, exercise** — those are descriptive inputs on Performance, not things to be graded on. Must show a "collecting — N of 7 days" state before a week of data exists.
- **Quick capture** — one always-focused input at the top. Type, hit enter, it's filed. **It must never ask a follow-up question** — no category prompt, no date picker. V1 sends everything to the to-do list; later an LLM routes it to to-do / notes / projects / learning based on what I wrote.
- **Calendar strip** — today's events in one horizontal row, colour-coded by source (class / career / deadline), with **computed free blocks** at the end so I can see where work fits. Leans on the Canvas integration.
- **Daily check-in prompt** — a banner that appears only if I haven't checked in today, and disappears once I have. Keyed off the Supabase row for today's date (not a browser flag) so it syncs across devices.
- **Pressing issues flag** — a red band of derived urgencies: near deadlines, contacts gone cold, and any to-do deferred 3+ times. Nothing manually maintained. Renders empty gracefully — empty should feel like a reward.
- **News summary** — LLM-generated, three tagged one-liners (real estate, AI, my markets) rather than a paragraph.
- **To-do list** — central and always visible. It **feeds the Performance tab's metrics**, tracking what I complete, defer, or delete over time (deferring the same task 3+ times flags it as "stuck").
- **Yesterday row** — one monospace line: slept / mood / todos / applied / learning / exercise. Honest, not encouraging — no narrative, no praise. If it starts feeling like nagging, drop fields rather than soften it.

*Deliberately kept off: a full calendar grid, portfolio value or net worth (seeing it every morning pollutes the check-in data), anything social.*

### Performance tab (the reflective one)
The data engine of the whole system. Two halves — input and output.

**Daily check-in (input).** Must feel effortless — under 30 seconds, mostly taps and sliders:
- Hours slept (number)
- Did you drink / smoke / exercise (toggles)
- Water intake (taps)
- Mood / energy rating (1–5 slider)
- Optional daily note (low pressure; skipping is fine)

**Auto-pulled (no manual entry).** These fill themselves from other tabs:
- Learning done? (from Learning)
- To-dos cleared? (from cover-page to-do list)
- Jobs applied? (from Career)
- Screen time, deferred/pushed tasks

**Weekly synopsis.** Once a week I spend ~5 minutes free-writing how the week went. An LLM analyzes it **alongside the hard numbers** and produces a weekly report — the numbers say *what* happened, the synopsis says *why*.

**Output (visualizations).** Weekly and monthly rollups, streaks/momentum indicator, trends. Later: a **correlation view** that spots patterns automatically (e.g., "mood dipped the weeks you slept under six hours").

### Personal tab
Three sub-tabs: **Finance, Goals, Learning.** *(Fitness was removed — it's folded into Performance via the daily check-in.)*

- **Finance** — two pillars:
  - *Live portfolio tracker* — pulls positions via a brokerage API; daily P&L, position values, allocation. Keys live server-side in Supabase.
  - *Budget tracker* — connects to my bank via **Plaid** (bank credentials never touch my site); auto-pulls and categorizes transactions, shows weekly/monthly spend against a budget I set. Later: an insights layer that flags where I overspend.
  - *This is the hardest tab (sensitive data + external APIs) — build it last.*
- **Goals** — **containers, not lines of text.** Each goal holds the tier below it: a long-term goal holds mid-term milestones, a mid-term milestone holds short-term weekly actions, and a short-term goal holds the to-dos it's linked to. Sub-tabs stay Long-term / Mid-term / Short-term (plus a stubbed Roadmap timeline view for later).
  - **Progress is always derived, never typed in.** It's completed direct children over total direct children (or completed linked to-dos, for a short-term goal). A goal with nothing under it yet reads "not broken down yet" — never a fabricated 0%.
  - **Milestones carry a soft target month, not a hard deadline.** It's informational only — a missed month just reads "was Oct," never red, never "overdue." The point is honest information, not a manufactured deadline.
  - A short-term goal may optionally attach to a milestone, but an unattached one is just as valid and displays normally — no "orphan" treatment.
  - Marking a goal done or dropped is a manual decision (a status control), separate from progress — hitting 100% doesn't auto-complete anything.
  - **Goals deliberately do not feed the week score** — same reasoning as sleep and mood: they're something to reflect on, not something to be graded on daily.
- **Learning** — three things in one:
  - *Skill scheduler* — I seed topics/skills I want to grow; an LLM breaks them into bite-sized daily suggestions and sequences them into a schedule. Completing daily learning auto-pulls into Performance.
  - *Content library* — I drop in articles, PDFs, links, podcasts; the LLM digests them (summary + key takeaways) and slots them into the daily schedule ("here's a 10-minute read for today").
  - *Notes / knowledge base* — captures what I learn each day. Over time it becomes a personal second brain that Claude can interface with — so Claude understands what I already know, and I can query my own notes later ("what did I learn about residual land analysis?").

### Career tab
- My existing **job tracker** (with its **Kanban** application-status board) plus a **networking** module for contacts and follow-ups.

### Academics tab
- Kept lean (I'm almost done with school). A **calendar view** for assignments and grades, leaning on a **Canvas** integration. No GPA calculators or reading lists for now.

### Projects tab
- A **Kanban** board: **Idea → Brainstorm → In Progress → Complete.** Only the Idea column has an add
  input; new projects always start there. Cards move between stages either by dragging them to
  another column or via the stage pills inside the detail panel — both call the same move logic.
- Clicking a card opens a right-side **detail panel**: stage pills, a plain autosaving notes
  textarea, a step checklist (checkbox + text, each step can carry an optional target date), and
  file attachments (private Supabase Storage bucket, signed URLs only — never a public bucket URL).
  A disabled "Ask Claude about this project" slot is stubbed for Phase 4.
- Steps carrying a target date also surface in the cover-page to-do list, tagged with the project
  name — read as a second source at query time and merged on read, never copied into `todos`.
  Checking one off in either place updates the same `project_steps` row.
- **LLM-suggested steps** (drop in "build a trading app" → it breaks out "pull the API," "build the
  UI," etc.) are Phase 4 work, sharing a breakdown component with Goals milestones.

---

## 6. Open decisions — ask me, don't assume

- **Brokerage choice** — deferred. Pick based on API friendliness (research Alpaca, Tradier, others at finance-build time).
- **Plaid pricing** — verify current cost when the budget tracker gets built.
- **Mobile hosting + notifications** — deferred to the very end. Likely Capacitor + Apple Developer account. Not a blocker for the web build.

---

## 7. Working conventions for Claude Code

- Keep everything in **one project folder**.
- **Small steps, test as you go.**
- **Follow `DESIGN.md` for all UI work** — dark mode, the semantic palette, mono-for-numbers/sans-for-prose rule. Don't invent new colours or fonts.
- **Build data-dependent UI slots early as dumb components with placeholder states**, then swap the real source in at its phase. The cover page should look finished from session one.
- You can talk directly to Supabase to set up the database — make the back-end setup conversational for me.
- **Never commit secrets.** `.gitignore` env files from session one.
- At the end of every session, **update `ROADMAP.md`**.
