# Personal Dashboard — Design Spec

> Visual and interaction spec for the dashboard. Currently covers the **cover page** in full detail;
> other tabs inherit the same system.
> `CLAUDE.md` holds the vision and security rules. `ROADMAP.md` holds build order. This file holds *what it looks like and how it behaves*.

---

## 1. Design direction

**Minimalist, clean, techy.** Dark mode is the default and only theme for now.

Three rules that produce the feel:
- **Monospace for anything numeric** — ticker prices, dates, counts, times, streaks, the "3×" defer badge, the yesterday row. **Sans for all prose** — news sentences, to-do text, labels. That contrast alone reads "terminal" without neon or glow effects.
- **Hairline borders (0.5px) and generous dark surfaces** rather than heavy cards or drop shadows.
- **Color is semantic, never decorative.** Green = good/positive/complete. Red = pressing/negative. Amber = warning/stuck/at-risk. Blue = informational accent (category labels, class events). Nothing is colored just to look nice.

### Palette

| Token | Hex | Use |
|---|---|---|
| Page background | `#0e0f11` | Behind everything |
| Card surface | `#141619` | News, to-do, calendar strip, capture bar |
| Raised surface | `#1b1d20` | Active tab pill |
| Border | `#26282c` | Hairline dividers, card edges |
| Text primary | `#e8e8e6` | Headings, key values |
| Text body | `#dcdcda` | News sentences, to-do items |
| Text secondary | `#8b8d91` | Inactive tabs, meta lines |
| Text muted | `#6d6f73` | Section labels, icons |
| Text disabled | `#5a5c60` | Completed to-dos, hints |
| Success | `#5DCAA5` text / `#1D9E75` fill | Score, positive ticks, streaks |
| Danger | `#F09595` / `#E24B4A` text, `#1d1214` bg, `#5a2f2f` border | Pressing band, negative ticks |
| Warning | `#EF9F27` / `#BA7517` | Stuck tasks, deadlines, mid mood |
| Accent | `#85B7EB` / `#378ADD` | News category labels, class events |
| Check-in green bg | `#122019`, border `#2f5a4c` | Check-in banner |

### Typography

Body/UI is the **system sans stack**. Numerics use the **system mono stack**.

A squared geometric display font (Orbitron / Chakra Petch / Saira style) was trialled for tabs and the greeting and **reverted for now**. If revisited later, the hard constraint is: **display font only for the wordmark, tab labels, section labels, and the greeting — never for to-do text, news sentences, or anything at body size.** Those faces are built for logos, are wide (long labels like "PERFORMANCE" eat horizontal space), and their lowercase is hard to read small.

---

## 2. Cover page layout — top to bottom

Ordering is deliberate: **forward-looking at the top, backward-looking at the bottom**, mirroring how the cover page and Performance tab bookend the system. Everything down through the check-in banner should fit one screen.

1. **Tab bar** — wordmark + 6 tabs (Today, Projects, Personal, Performance, Career, Academics). Active tab is a filled pill.
2. **Stock ticker** — scrolling marquee, full width, hairline border above and below.
3. **Greeting + week score** — greeting and meta line left, score and 7-day bars right.
4. **Quick capture** — single always-focused input.
5. **Calendar strip** — today's events as a horizontal row.
6. **Daily check-in banner** — conditional; disappears once done.
7. **Pressing issues band** — conditional; full width, red.
8. **Two-column grid** — News digest (wider, ~1.15fr) | To-do list (~1fr).
9. **Yesterday row** — single monospace line above the bottom edge.

---

## 3. Component specs

### 3.1 Stock ticker

**Contents:** a **hardcoded watchlist**, not portfolio positions. Actual holdings live on the Finance tab. Seeing net worth every morning changes your mood in ways that pollute the check-in data — deliberately kept off this page.

**Data:** quote API called from a **Supabase Edge Function**, never from the browser. API key stays server-side per the security rules in `CLAUDE.md`. Two viable approaches:
- **Polling (recommended)** — edge function fetches every 30–60s, front end refreshes. Free tiers (Finnhub, Alpaca) cover this. Cheap, simple, looks live.
- **Websocket stream** — true tick-by-tick. More complexity, only worth it if polling feels stale.

**Behavior:** continuous horizontal scroll via `translateX`, content duplicated so the loop is seamless. Each entry is `TICKER price ▲/▼pct` — ticker in secondary grey, price in primary, delta green or red.

**Placeholder state:** ships in Phase 0/1 with static hardcoded numbers so the layout is real from day one; the data source swaps in later.

### 3.2 Week score

A single 0–100 composite plus a 7-bar strip for the last seven days (green = good day, amber = mid, dark grey = not yet happened).

**Starting formula:**

| Component | Weight |
|---|---|
| To-dos completed vs. created | 30% |
| Jobs applied vs. weekly target | 25% |
| Daily learning completed | 15% |
| Check-in logged (streak) | 15% |
| Deferral penalty (anything pushed 3+ times) | 15% |

**Deliberately excluded: sleep, mood, drinking, exercise.** Those are *inputs* you observe on the Performance tab, not things to be scored on. A score that punishes you for sleeping badly turns the dashboard into a guilt machine and you stop opening it. **The score measures actions you chose; the physical stuff stays descriptive.**

**Cold-start state:** with under 7 days of data it must read `collecting — 3 of 7 days`, not a fabricated number.

**Build note:** the score is Phase 3 (Performance engine) logic but displays here. Build the cover-page slot in Phase 1 as a dumb component that renders whatever number it's handed, with a placeholder state.

### 3.3 Quick capture

**Purpose.** Thoughts arrive at the wrong moment. If capturing one takes navigating to a tab, choosing a list, and picking a category, it won't happen — it goes into a phone notes app and dies. Capture exists so friction at the moment of capture is zero.

**The one inviolable rule: capture must never ask a follow-up question.** No "which project?" modal, no due-date picker, no category prompt. If the system can't tell where something goes, it defaults to a to-do and gets sorted later. The moment capture requires a decision, it stops getting used.

**Behavior:** input is **already focused on page load**. Type, press Enter, the field clears and the hint flashes a confirmation of where it went. Focus stays in the field.

**V1 — Phase 1 (build this):** everything typed becomes a to-do on the cover-page list, timestamped, uncategorized. One Supabase insert. Useful on day one, ~20 lines.

**V2 — Phase 4 (once LLM pieces exist):** a single LLM call returns a type + cleaned payload and routes it:

| Input | Destination |
|---|---|
| "email the Hines recruiter friday" | To-do, due Friday |
| A URL | Learning content library, queued for digest |
| "residual land value = GDV minus costs minus profit" | Notes / knowledge base |
| "idea: dashboard for tracking deal comps" | Projects Kanban, Idea column |

**V3 — optional, only if V2 misroutes annoyingly:** prefix escape hatches — `t:` task, `n:` note, `p:` project, `l:` learning.

### 3.4 Calendar strip

One horizontal row of today's events. Left cap shows the day label and event count; events follow as small blocks with a 2px colored left border; the right end shows **computed free blocks** (`free 10–13 · 16–23`).

**Color coding by source:** blue = class/academic (Canvas), green = career (interviews, calls, networking follow-ups), amber = deadline.

The free-blocks readout is derived, not entered, and is arguably the most useful element — it tells you where the work actually fits. **Depends on the Canvas integration (Phase 2).** Renders with placeholder events before that.

### 3.5 Daily check-in banner

Green banner with icon, title, `30 seconds · N-day streak`, and a Start button.

**Visibility:** shows only if **no `check_ins` row exists for today's date in the user's local timezone**. Once the check-in is completed the banner disappears for the rest of the day.

**Critically: this must key off the Supabase row, not a browser flag** — so completing it on the phone at 7am means the laptop already knows at 9am. Streak count is derived from consecutive dates in the same table.

### 3.6 Pressing issues band

Full-width red band above the main grid, header `Pressing — N items`, then rows of `label ......... short reason`.

**Entirely derived data — nothing is manually maintained here.** Three sources:
- Assignment/exam deadlines within a threshold (Canvas)
- Networking contacts gone cold past a threshold (Career tab)
- Any to-do deferred 3+ times ("stuck")

**It must render empty gracefully, and empty should feel like a reward** — not an awkward blank card.

### 3.7 News digest

Three items, each a small colored category label (REAL ESTATE / AI / MARKETS) above a **single sentence**. Divided by hairlines. Refresh icon top right.

Three tagged one-liners rather than a prose paragraph: easier for the LLM to generate consistently, easier to skim half-awake. Categories tuned to real estate, AI, and followed markets. Phase 5.

### 3.8 To-do list

Header shows `TO-DO · completed/total` and a `+` affordance. Rows are checkbox + text; completed rows are struck through and dimmed. A task deferred 3+ times carries a small amber `3×` badge (and simultaneously appears in the pressing band).

Supports add / complete / defer / delete. Data structured so Performance can later read completions, defers, and deletes.

### 3.9 Yesterday row

A single monospace line above the bottom edge:

`YESTERDAY   slept 6.2h   mood 3/5   todos 4/7   applied 2   learning ✓   exercise ✗`

**Honest, not encouraging.** One glance, no narrative, no nudge, no praise. The red ✗ is deliberate. If it ever starts feeling like nagging, **the fix is dropping fields, not softening colors.** Closes the loop between check-in and consequence. Cheap to build once check-in data exists.

---

## 4. Explicitly excluded from the cover page

The cover page's job is to answer **"what do I do now"** in under ten seconds. Every addition taxes that. Kept off deliberately:

- Weather beyond the one-line summary in the meta row
- A full calendar grid (the strip is enough; detail lives in Academics)
- **Portfolio value or net worth** (Finance tab only — see 3.1)
- Anything social

---

## 5. Build-order implications

The cover page spans phases, so build every data-dependent slot as a **dumb component with a placeholder state in Phase 0/1**, then swap the data source in later. This way Session 1 already produces something that looks like the real thing.

| Element | Layout lands | Real data lands |
|---|---|---|
| Tab bar | Phase 0 | Phase 0 |
| Ticker | Phase 0 (static numbers) | Phase 6-ish (quote API) |
| Quick capture | Phase 1 (V1, → to-do) | Phase 4 (LLM routing) |
| To-do list | Phase 1 | Phase 1 |
| Week score | Phase 1 (placeholder slot) | Phase 3 |
| Check-in banner | Phase 1 (layout) | Phase 3 |
| Calendar strip | Phase 1 (placeholder events) | Phase 2 (Canvas) |
| Pressing band | Phase 1 (to-do source only) | Phase 2 (+ Canvas, Career) — extended again in Phase 1's Goals retool to include stalled goals |
| Yesterday row | Phase 3 | Phase 3 |
| News digest | Phase 1 (placeholder) | Phase 5 |

---

## 6. Goals tab component spec

Goals moved from a flat checklist to a self-referencing container hierarchy (Phase 1 retool). Long-term goals hold mid-term milestones, mid-term milestones hold short-term ones, and short-term goals hold linked to-dos. Everything below follows the same three rules from §1: mono for every numeric (percentages, counts, months, day-counts), sans for titles, 0.5px hairlines, semantic colour only.

### 6.1 List row (default view)

One row per **active** goal in the current tier (Long-term / Mid-term / Short-term sub-tabs, plus a disabled-but-clickable Roadmap stub — see §6.6). A goal that's a milestone under a parent still shows here too, in its own tier's flat list — it isn't hidden just because it's attached; only the parent's expanded detail additionally shows it nested.

Each row: title, a 4px derived progress bar beneath it, and a right-aligned mono block.

- **Progress bar and block, normal state:** bar width = completed direct children ÷ total direct children (or completed ÷ total linked to-dos, for a short-term goal). Block shows `N%` over `N of M`.
- **No children yet:** bar is empty, block reads `not broken down yet` in muted text — never a fabricated `0%`. Progress is always computed, never a manual field.
- **Stalled** (no movement in 21 days, status still active): the percentage renders in **amber**, with `stalled Nd` in place of the child count. Amber only — a stalled goal is a warning, not a failure. This is the same "no red" restraint as target months (§6.3): the dashboard flags, it doesn't punish.

A chevron expands the row in place — no modal, no navigation away.

### 6.2 Expanded detail — long-term / mid-term

Shows a **Milestones** section: direct children (one tier down) as blocks in a grid, up to 4 per row, wrapping automatically past that. Below the grid, an inline add-milestone input (text + a month picker for the optional target month).

Zero children: the grid is replaced by a single "break this down" line — the add-milestone input **is** the empty state, not a separate blank panel.

### 6.3 Milestone block

2px coloured left border, **square corners** — the one place in this app a border is single-sided and doesn't get the usual full radius, since a rounded corner on only one side reads as a mistake, not a style. Title + a mono meta line underneath.

| State | Border | Meta line |
|---|---|---|
| Done | Green | `done · Jun` (month it was completed) |
| In progress (has its own children/linked to-dos, some progress) | Blue | `6 of 10 · now` |
| Not started (active, no progress yet) | Muted | target month if set (`Oct`), else blank |
| Dropped | Muted + title struck through | same as not-started |

**The target month is never a deadline.** It's a soft signal, informational only:
- Future or unset: renders plainly (`Oct`) or blank.
- Past and not done: renders `was Oct` — past tense, neutral, no colour change, no "overdue" language anywhere.

**Why:** a hard deadline that turns red when missed trains you to stop looking at the goal, the same way a guilt-inducing score trains you to stop opening the dashboard (§3.2). Honest information beats manufactured urgency — the missed month is a fact, not a failure state. This is the same design instinct as the yesterday row's "honest, not encouraging, no narrative" rule (§3.9), applied to time instead of behaviour.

### 6.4 Expanded detail — short-term ("This week")

Short-term goals have no goals-tier children — their "children" are linked to-dos. This section reuses the **exact same checkbox-row component** as the cover-page to-do list (§3.8), including the amber 3× defer badge — not a fork, the same rendering function pointed at a filtered list.

Below the rows: a **Pull into this week** button — creates a to-do pre-linked to this goal. When there are no linked to-dos yet, this button is the empty state itself; there's no separate "nothing here" panel to dismiss first.

### 6.5 Footer (all tiers)

One mono meta line, same restraint as the yesterday row: `4 wks ahead · moved 2d ago`, then a small status control (Active / Done / Dropped).

- **Pace** compares completed-milestone count against elapsed share of the span from the goal's creation to its furthest child's target month. Omitted entirely if no target months exist anywhere below it — never guessed.
- **Status is manual**, deliberately separate from the derived progress bar. Hitting 100% doesn't auto-complete a goal; marking it done or dropped is always a decision, not a side effect.
- Completing a linked to-do, or changing a goal's status, bumps `last_movement_at` up the whole parent chain — this is what stalled detection (§6.1) reads.

### 6.6 Roadmap tab (stub)

A fourth, visually dimmed sub-tab next to Long-term / Mid-term / Short-term. Still clickable — shows a "coming soon" placeholder, same pattern as the Career/Academics/Performance placeholder panels. The timeline view itself isn't built yet (see `ROADMAP.md`); the slot is deliberately visible so the eventual feature has a home instead of appearing from nowhere.

### 6.7 Empty states

Both the list and the expanded detail must render gracefully with zero data, same standard as the pressing band (§3.6): a tier with no goals shows plain "No goals yet" text, not a broken layout.
