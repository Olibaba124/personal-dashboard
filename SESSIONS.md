# Personal Dashboard — Session Prompts for Claude Code

> Paste one of these at the start of a session. Each is scoped small and ends by testing.
> `CLAUDE.md` (vision + architecture), `ROADMAP.md` (build order) and `DESIGN.md` (visual + interaction spec) live in the folder — Claude Code should read them first.
> After the concrete early sessions, use the **template at the bottom** for any later step.

---

## How to run a session (30-second version)
1. Open Claude Code in the project folder.
2. Paste the session prompt.
3. Let it work; answer only the decision questions it asks.
4. When it's done, ask it to **update `ROADMAP.md`** and confirm the step is tested.

---

## Phase 0 — Foundation

### Session 1 — Repo + front-end shell
```
Read CLAUDE.md, ROADMAP.md and DESIGN.md first — they hold the full vision, the security rules, and the visual spec.

This session, Phase 0: set up the project skeleton only. No real data, no secrets.

1. Initialize the project folder and a Git repo. Add a .gitignore that ignores env/secret files (.env etc.) from the start.
2. Build a static front-end shell suitable for GitHub Pages: a cover page plus five navigable tabs — Projects, Personal, Performance, Career, Academics. Personal should have sub-tab placeholders for Finance, Goals, Learning.
3. Apply the DESIGN.md design system exactly: dark mode, the semantic palette, monospace for all numerics and sans for all prose. Don't invent new colours or fonts.
4. Lay out the full cover page with placeholder content in every slot, in this order: tab bar, stock ticker, greeting + week score, quick capture, calendar strip, check-in banner, pressing issues band, then a two-column grid of news digest and to-do list, with the yesterday row at the bottom.
5. Make the ticker actually scroll with a hardcoded watchlist and static numbers — the real quote feed comes much later.
6. Keep it simple and use popular, well-documented tools.

The point of step 4 is that the page should already look finished even though nothing is wired up. Every slot is a dumb component that renders whatever it's handed, with a sensible placeholder state.

Work autonomously. Only stop to ask me when a decision genuinely needs my input. When you're done, tell me how to preview it locally and confirm the tabs navigate correctly, then update ROADMAP.md.
```

### Session 2 — Supabase + login wall
```
Read CLAUDE.md (especially section 3, Architecture & security) and ROADMAP.md first.

This session, Phase 0: stand up the back end and the login wall.

1. Set up the Supabase project (database + auth). Talk me through anything you need me to click on my side.
2. Implement authentication with Supabase Auth. Credentials must be handled server-side / hashed by Supabase — there must be NO password or secret anywhere in the front-end source.
3. Put the whole dashboard behind the login wall: a logged-out visitor sees only a login screen.

Never commit secrets; confirm .env is gitignored. Work autonomously and only ask me for decisions. When done, confirm login works and update ROADMAP.md.
```

### Session 3 — Wire the layers + verify security
```
Read CLAUDE.md and ROADMAP.md first.

This session, Phase 0: connect front end and back end and verify the security model.

1. Make the front-end shell request and receive data from Supabase only AFTER login succeeds.
2. Add a single simple test value in Supabase and display it in the shell to prove the flow works end to end.
3. Walk me through checking the security model: view the deployed page's source with me and confirm no data, keys, or passwords are exposed.

When it's solid, update ROADMAP.md and tell me Phase 0 is complete.
```

---

## Phase 1 — Core self-entered tabs

### Session 4 — To-do list (cover page)
```
Read CLAUDE.md and ROADMAP.md first.

Phase 1: build the to-do list on the cover page, plus quick capture and the pressing band. Data stored in Supabase. Follow DESIGN.md for all styling.

- Add / complete / defer / delete tasks.
- Track how often a task is deferred; flag any task pushed 3+ times as "stuck."
- Design the data so Performance can later read completions/defers/deletes (don't build that link yet — just make the data available).
- Quick capture (V1): the input at the top of the cover page is focused on page load; typing and pressing Enter creates a to-do, clears the field, flashes a confirmation, and keeps focus. It must NEVER open a modal or ask a follow-up question — no category prompt, no due-date picker. LLM routing comes in Phase 4.
- Pressing issues band: for now it only lists to-dos deferred 3+ times. It must render gracefully when there's nothing pressing.

Small steps, test at the end. Only ask me for decisions. Update ROADMAP.md when done.
```

### Session 5 — Goals tab
```
Read CLAUDE.md and ROADMAP.md first.

Phase 1: build the Goals tab with three separate subsections — Long-term (life goals), Mid-term (quarterly/monthly), Short-term (weekly). Data in Supabase.

Short-term goals should be structured so they can later feed my daily to-dos (don't wire that yet — just make it possible). Keep it clean and simple.

Test at the end, update ROADMAP.md.
```

### Session 6 — Projects tab (Kanban)
```
Read CLAUDE.md and ROADMAP.md first.

Phase 1: build the Projects tab as a Kanban board — columns Idea → Started → In Progress → Complete. Mirror the structure of my job tracker's Kanban so the component can be reused. Data in Supabase.

Each project card should be expandable to hold subtasks (manual for now; LLM-suggested subtasks come later). Test at the end, update ROADMAP.md.
```

---

## Phase 3 — Performance (cover-page pieces)

### Session 7 — Check-in banner, week score, yesterday row
```
Read CLAUDE.md, ROADMAP.md and DESIGN.md first.

Phase 3: wire up the three cover-page elements that depend on check-in data. Do them one at a time and test each before moving on.

1. Check-in banner. Shows ONLY if there's no check_ins row for today's date in my local timezone; hides once the check-in is complete. Key it off the Supabase row, not a browser flag, so completing it on my phone hides it on my laptop. Streak count comes from consecutive dates in the same table.
2. Week productivity score. 0–100 composite plus a 7-day bar strip. Weights: to-dos completed vs created 30%, jobs applied vs weekly target 25%, learning done 15%, check-in logged 15%, deferral penalty 15%. Do NOT include sleep, mood, drinking or exercise — that's deliberate. With fewer than 7 days of data it must display "collecting — N of 7 days" rather than a number.
3. Yesterday row. One monospace line: slept / mood / todos / applied / learning / exercise. Facts only, no encouragement or narrative.

Test at the end, update ROADMAP.md.
```

---

## Reusable template — any later session

```
Read CLAUDE.md, ROADMAP.md and DESIGN.md first.

This session we're working on: [ONE specific item from ROADMAP.md, e.g. "the Career tab — migrate the job tracker and add the networking module"].

Scope: keep it to this one item. Store any data in Supabase. Follow the architecture and security rules in CLAUDE.md — no secrets or real data in front-end code. Follow DESIGN.md for anything visual — don't invent new colours or fonts.

Work autonomously and only ask me when a decision needs my input. Build in small steps and test at the end. When it's working, update ROADMAP.md (tick this off, note what's next).

[Add any specifics or "here's what I decided about X" notes here.]
```

---

### Tips that make these go smoothly
- **One item per session.** Resist bundling — it's where things get messy.
- If Claude Code proposes a big change, ask it to **do the smallest version first**, then confirm before expanding.
- When you hit an **open decision** (brokerage, Plaid pricing, mobile), pause and talk it through with me before letting Claude Code build past it.
- End every session with **"update ROADMAP.md"** so the next session starts oriented.
