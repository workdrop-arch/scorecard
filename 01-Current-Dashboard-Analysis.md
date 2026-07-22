# Boyne 2026 Scoreboard — Full Dashboard Analysis

Source file: `Boyne 2026 — Scoreboard.htm` (single file, ~4,442 lines, ~220 KB)

This document is an exact, exhaustive breakdown of the existing dashboard so it can be used as a reference/spec when building the next one.

---

## 1. What this file actually is

A **single self-contained HTML file** — no build step, no framework, no npm/node, no server, no database.

- One `<style>` block (~1,000 lines of hand-written CSS, no preprocessor)
- One `<body>` that is almost entirely empty at load — just a hero banner + a tab bar + four empty `<div id="view-...">` containers
- One `<script>` block (~1,750 lines) that:
  1. Declares **all trip data as plain JavaScript object/array literals** (hardcoded, not fetched)
  2. Has **render functions** that turn that data into HTML strings and inject them via `.innerHTML`
  3. Calls `renderAll()` once on load, plus on window `resize`
  4. Fetches **live/historical weather** from the free Open-Meteo API (the only network call in the whole page)

External dependencies (only two, both CDN, no install):
- Google Fonts: `Oswald` (headings/numbers) + `Inter` (body text)
- Open-Meteo REST API (`api.open-meteo.com`, `archive-api.open-meteo.com`) — no API key required

**Workflow implied by code comments:** this file is manually edited by an organizer after each round. Comments throughout say things like *"Update `total` ... from Squabbit screenshots after each eligible round"* and *"After each round, flip status to 'final' and fill `results`..."*. Squabbit is referenced as the external scoring app source-of-truth; someone manually transcribes numbers into this file and re-saves/re-shares it.

---

## 2. Page skeleton (DOM structure)

```
<body>
  .hero                          — title + event name banner
  .tabs-wrap (sticky)            — 4 tab buttons
    #view-ryder   .view.active   — Ryder Cup tab (populated by renderRyder())
    #view-boyne   .view          — Boyne Cup tab (populated by renderBoyne())
    #view-side    .view          — Side Action tab (populated by renderSide())
    #view-weather .view          — Schedule/Weather tab (populated by renderWeather())
  <script>  all data + render logic
</body>
```

Only one `.view` has `class="active"` (`display:block`) at a time; the rest are `display:none`. Switching tabs is pure CSS class toggling, no routing.

---

## 3. Visual design system

### 3.1 Color palette (CSS custom properties on `:root`)

| Variable | Hex | Use |
|---|---|---|
| `--red` | `#c41e3a` | Team Red primary |
| `--red-dark` | `#9a1830` | Team Red gradient/shadow end |
| `--red-light` | `#e8344f` | Team Red text/accents |
| `--blue` | `#003da5` | Team Blue primary |
| `--blue-dark` | `#002d7a` | Team Blue gradient/shadow end |
| `--blue-light` | `#1a5fd4` | Team Blue text/accents |
| `--gold` | `#d4a843` | Accent — winners, "to win" markers, champion badges, section labels |
| `--bg` | `#0a0e14` | Page background (near-black navy) |
| `--bg-card` | `#131a24` | Card background |
| `--bg-card-2` | `#182230` | Table header background (one step lighter than card) |
| `--text` | `#e8edf3` | Primary text (off-white) |
| `--text-muted` | `#7a8ba3` | Secondary/label text (slate blue-gray) |
| `--border` | `#1e2d3d` | All hairline borders |

Dark theme only — no light mode, no theme toggle. Semantic status colors used inline (not tokenized): `#4ade80` (green — "live" pulse, handicap improved), `#e8805a` (orange/red — handicap worsened, weather error).

### 3.2 Typography

- **Oswald** (condensed, bold, uppercase-heavy) — every heading, number, label, badge, table header, button. Weights used: 400/500/600/700.
- **Inter** — body copy only (player rosters in small chevron text, sponsor lines, schedule detail text).
- Near-universal use of `text-transform: uppercase` + `letter-spacing` (0.03em–0.3em) on labels — this is the dominant "sports broadcast" visual signature of the whole design.
- Font sizes are very small overall (0.5rem–0.85rem for most UI chrome) except for a few deliberately massive numerals: hero title (3rem), main score (4.5rem desktop / 3rem mobile), triad temp (2.4–3.6rem).

### 3.3 Layout

- Max content width: **900px**, centered, with 1.5rem side padding on desktop.
- Everything is single-column/stacked; no sidebar, no multi-column desktop layout (aside from the 2-column bed-selection grid and 4-column weather-meta grid).
- One global responsive breakpoint: **`@media (max-width: 600px)`**, which shrinks font sizes, tightens padding, and switches a couple of grids from multi-column to 1–2 columns.
- Border radius convention: large pill/rounded shapes for primary chrome (`.master-bar` = 36px, fully pill), 8–12px for cards, 3–10px for small badges/pills.

### 3.4 Reusable component patterns

- **Card**: `background: var(--bg-card); border: 1px solid var(--border); border-radius: 8–10px;` — used for match cards, side-action cards, weather cards, handicap table, bed block.
- **Section label**: small Oswald caps label in gold or muted, `letter-spacing: 0.1–0.18em` — used as a consistent "eyebrow" heading pattern everywhere (day headers, side-section labels, hcp controls label, weather schedule title).
- **Badge pill**: small rounded-rect chip, bold, tight padding — used identically (in 3 color variants) for champion / rookie / belt-holder tags, and again (gold) for point-value badges on match cards.
- **Team dot**: 8px colored circle before a player name in tables, cheap way to show team affiliation in dense lists without repeating full color blocks.
- **Dashed row divider**: `border-top: 1px dashed rgba(255,255,255,0.05)` between repeating rows (skins, side-action, bed picks) — visually distinct from solid card borders, signals "same category, different item."

---

## 4. Tab 1 — Ryder Cup

The primary/default tab. Team match-play format, 48 points total, first to 24.5 wins.

### 4.1 Header stack (rendered every time, top to bottom)
1. **`.main-score`** — huge team names + huge point totals side by side with an en-dash separator. Font size responsive (4.5rem → 3rem below 600px).
2. **`.master-bar`** — a single 72px-tall pill-shaped horizontal stacked bar:
   - Red fill grows from the left, Blue fill grows from the right, proportional to `points / 48`.
   - A **gold vertical "win line"** fixed at the exact 50% mark (24.5/48) with a "24.5 TO WIN" label above it — this is the clinch threshold, not the midpoint of current score.
   - The empty middle "remaining points" zone is filled with a subtle diagonal hash pattern (`repeating-linear-gradient`).
   - Each fill segment shows its own point total as text, but only if the segment is wide enough (`>5%`) to avoid text overflow.
3. **`.status-strip`** — 4-up row: *Red Needs / Decided (x / 48) / Remaining / Blue Needs*.
4. **`.projection`** banner — one auto-computed sentence, color-coded to whichever team it favors (or gold if tied):
   - "`{Team} lead by {N} — {N} pts remaining`"
   - "All square — {N} pts remaining"
   - "`{Team} have won the Ryder Cup!`" (once a team hits 24.5)
   - "`{Team} have clinched the Ryder Cup!`" — a **mathematical clinch check**: fires as soon as the opponent's remaining possible points can no longer reach 24.5, even before that team literally reaches 24.5 itself. This is the single cleverest bit of logic in the file.

### 4.2 Match list (chronological, grouped by day)

Data is a flat array of "day entries" (`data.days`), each with `day` (1–4), `session` (AM/PM), `course`, and one or more `rounds`. Each **round** = one format/game (e.g. "Irish Rumble") worth a fixed number of points, containing one or more **matches** (individual pairings/team clashes that split that round's points).

For each day entry:
- **`.day-header`**: "Day N • AM/PM" + horizontal rule + course name, right-aligned.
- **`.match-card`** per round:
  - Header row: format name + gold "N PTS" pill badge, right-aligned status ("Final" / pulsing green "● Live — {hole}" / "Upcoming").
  - One-line format description (`.match-detail`) — e.g. "8v8 • Escalating count • 18 holes".
  - One **chevron row** per match (see 4.3).
  - Cards for `status: "upcoming"` rounds are rendered at 50% opacity (`.upcoming`).
- **Host divider** (`.host-divider-bar`): appears once, after the *last* entry of a day, only once that day is fully final and the next day hasn't started. States the losing team's name as host for the next night with a 🏠 emoji and the day's point split. If the day's points tied, shows "Coin flip for host" instead. This encodes an actual house rule (losing side hosts/cooks).

### 4.3 Chevron match visualization

The signature visual element of the whole dashboard. Each individual match is a horizontal bar (height varies 48–92px depending on player count — team-roster matches are tallest) containing:

- An **SVG background** with a chevron/arrow shape pointing toward the winning side:
  - Red win → red gradient shape's tip extends rightward to x=77 (occupying ~77% of width).
  - Blue win → mirror, blue tip extends leftward to x=23.
  - Halved → flat 50/50 vertical split, no arrow (visually "muted," a tie doesn't get a dramatic point).
  - Colors are linear gradients (`--red-dark → --red`, `--blue → --blue-dark`), each `<svg>` gets unique gradient IDs to avoid collisions when many matches render on one page.
- **Player names**, absolutely positioned over the SVG: red team left-aligned on the left, blue team right-aligned on the right. Multi-player matches stack names vertically.
- For 8v8 team-format rounds (Irish Rumble, Worst Ball), instead of listing 8 names it shows just "Swingers"/"Gooners" plus a compact roster block (2 names per line, bulleted) in smaller muted text.
- **Center overlay**: match label (e.g. "Match 3", "Jacks/Queens/Kings/Aces" for the blind-draw round), the score as `red : blue` in large Oswald numerals, and an outcome tag ("RED WIN" / "BLUE WIN" / "HALVED"), or "TBD"/"IN PLAY" placeholders for non-final matches.
- A pulsing green "● LIVE" tag appears top-center for in-progress matches.
- Player names get the **badge system** (§7) appended/prepended depending on team side, at the small badge size.

---

## 5. Tab 2 — Boyne Cup (FedEx-style points race)

Intro copy: "FedEx points across 5 eligible rounds • Best 3 of 5 count • Determines starting strokes for the championship." This tab is an individual (not team) competition layered on top of the same 5 rounds, culminating in a 6th "championship" round (the Boyne Cup itself) where strokes earned here are applied.

Render order, top to bottom:

1. **Champion banner** (`.champ-banner`) — gold-tinted card, only shown once the championship round is marked final. Shows winner's full name (large) and the course it was won on.
2. **Championship round leaderboard** — same compact table component as round leaderboards (below), just for the `boyneCup` round specifically, labeled "Boyne Cup."
3. **FedEx points table** (`.fedex-table`, full/non-compact variant) — all 16 players ranked by cumulative FedEx total, descending. Columns: `# | Player | Total | Strokes`.
   - Rank handles ties (`T2`, `T4`, etc.) using a shared rank-with-ties algorithm (`rankNetResults`/manual tie logic — same net score = same rank, next rank skips accordingly).
   - "Strokes" column shows the **starting-strokes handicap for the championship round**, derived purely from FedEx rank: 1st = −3, 2nd–3rd = −2, 4th–6th = −1, 7th–16th = even (`E`). Before any rounds are final, this column shows an em-dash placeholder and there's a `fedex.showLeaderboard` flag to hide the whole leaderboard until round 1 is done (shows a "Standings open after Round 1" placeholder card instead).
4. **Legend box** (`.fedex-legend`) — plain-language explanation of scoring (net-finish-position points table, 1st=75 down to 16th=46, ties split), the best-3-of-5 rule, and the strokes table again.
5. **"Round-by-round net leaderboards"** — one compact table per eligible round (Irish Rumble, Lone Ranger, Blind Pairs, Worst Ball, 1v1 Matchplay), in chronological order, each showing that round's individual net-score ranking (not points). Rounds not yet played render as a dimmed "Upcoming" placeholder card instead of a table.
6. **Bed pick order** (`.bed-block`) — appears directly under the Irish Rumble round leaderboard only. A real logistics feature: within each team, players are ranked by their Irish Rumble net score, and lowest net picks their bunk/bed first. Two-column layout (one column per team) on desktop, stacks to one column under 600px.
7. **Handicap Trends** section (`.hcp-section`) — see §6.

All player names throughout this tab carry the badge system (§7) at the appropriate size.

---

## 6. Handicap Trends (inside the Boyne Cup tab)

A captain's-draft-prep tool: tracks each player's handicap at three checkpoints — **Jan 2026** (baseline), **May 2026** (going-in-to-the-trip snapshot), and **Live** (updated during the trip as rounds finalize).

- Intro line explains the color convention: green ▼ = handicap improved (went down), red/orange ▲ = handicap rose.
- **Team filter pills** (All / Red / Blue) — clicking re-renders just this section via a delegated `document`-level click listener (`data-hcp-filter` attribute), so it survives re-renders.
- **Sortable columns** — clicking any of Player / Jan 2026 / May 2026 / Live header toggles sort by that column; clicking the same column again flips ascending/descending (caret ▲/▼ shown in the active header). Implemented with `data-hcp-sort` attributes and the same delegated listener.
- Table layout is `table-layout: fixed` with explicit pixel widths per column so it doesn't reflow oddly as sort changes name lengths; mobile breakpoint further tightens column widths so long names ("L. Vandenbosch") still fit one line.
- Trend arrow + colored value is computed per-cell by comparing to the *previous* checkpoint (May vs Jan, Live vs May) — not a fixed color, it's genuinely diffed at render time.
- All client-side; state (`hcpSortKey`, `hcpSortDir`, `hcpFilter`) lives in plain JS variables, not persisted (resets on page reload).

---

## 7. Badge system (cross-cutting, appears in Ryder + Boyne tabs)

Three badge types, computed dynamically from data (not hand-placed per name):

| Badge | Trigger | Style |
|---|---|---|
| `champ-badge` | Player's canonical name equals the **current Boyne Cup winner** (`★ '26`) or the hardcoded `DEFENDING_CHAMP_NAME` from the prior year (`★ '25`) | Gold background, dark text |
| `rookie-badge` | Name is present in the `ROOKIES_2026` Set (players on their first-ever Boyne trip) | Muted outline pill, "Rookie" |
| `belt-badge` | Name equals the **most recent Long Drive winner** across any *final* side-action round (walks `sideAction` backwards to find the latest) — a literal "belt" that changes hands round to round | Gold/bronze gradient, 🥋 LD |

A player can carry multiple badges simultaneously (e.g. Corey Joosten is both 2026 champion and a rookie).

**Name matching is resilient by design**: `PLAYER_LOOKUP` builds a lowercase lookup table mapping every common form of a name — `"kyle elliott"`, `"k. elliott"`, `"k.elliott"`, and bare last name (only if unique across the roster — duplicate last names like the two Versolattos/Grimshaws/Joostens/Churchills correctly resolve to `null` and are excluded) — back to the one canonical `"First Last"` string. `canonicalName()` and `nameBadgesFromAny()` use this so badges attach correctly no matter which shorthand form appears in a given data structure.

Badges have three size variants (`badge-sm` for chevron names, `badge-xs` for tight rosters, default/`md` for table rows) and a `left-side` modifier that flips the margin so badges can sit before a name (used when the blue/Gooners team is right-aligned and reads more naturally with the badge first).

---

## 8. Tab 3 — Side Action

Intro: "Closest-to-pin • Long Drive • Skins • By round." One card per FedEx-eligible round (5 of the 6 rounds — the 6-6-6 team format has no side action; the championship Boyne Cup round does).

Each `.side-card` has up to three sub-sections, each independently omitted if not applicable to that round:

1. **Closest to Pin** — one row per CTP hole (usually 2 par-3s per round), showing hole #, yardage, par, the winning player (or *TBD* in italics if unresolved) with badges, an optional sponsor line in italics, and a fixed **$20** payout tag.
2. **Long Drive** — same row pattern, one entry, no fixed payout shown (some rounds show yardage/distance instead, e.g. "226 yards"). Some rounds have no long-drive hole at all (`ldHole: null`, e.g. the 9-hole Worst Ball round) and the section is skipped entirely.
3. **Skins** — a small header/rows table (`Player | Skins | Payout`) sorted by whoever's already in the data (not auto-sorted by the renderer). If a round explicitly has no skins game (`noSkins: true`, the 1v1 Matchplay round), the whole section is omitted. If the round is upcoming, shows "TBD"; if final with zero winners, shows "No skins won (carryover or pot retained)."

Card header shows format name, right-aligned status (Final in gold / ● Live / Upcoming), and a one-line detail summarizing the pot ("Skins pot $220 • 2 CTPs • 1 Long Drive").

---

## 9. Tab 4 — Schedule / Weather

Labeled "Schedule" in the tab bar but functionally the weather tab; the daily itinerary is nested *inside* each weather day-card rather than being a separate view.

### 9.1 Weather data sourcing (3-tier fallback cascade, per day)

For each of the 4 trip days (each with its own lat/lon — the trip moves between 3 different resort properties):

1. **Forecast** (`api.open-meteo.com/v1/forecast`) — used only if the day is ≤16 days out (Open-Meteo's forecast horizon). Hourly temp, apparent temp, wind speed/direction, precip probability/amount, weather code; daily sunrise/sunset. Timezone pinned to `America/Detroit`.
2. **Archive/historical average** (`archive-api.open-meteo.com/v1/archive`) — if forecast unavailable or fails, fetches the *same calendar date* for the previous 3 years and averages them (`wxAverageData`): scalar averages for temp/wind/precip, a proper **circular mean** for wind direction (via sin/cos, not naive averaging — correctly handles wraparound near 0°/360°), feels-like temperature re-derived via the Canadian wind-chill formula (`wxFeelsLike`, only applied when T≤10°C and wind>4.8km/h), and weather code inferred from precip+cloud cover since archive doesn't reliably return one.
3. **Climatology fallback** (fully hardcoded, always succeeds) — a hand-authored 24-hour diurnal curve for mid-May northern Michigan (NOAA 30-year normals), used only if both live calls fail (e.g. offline).

All 4 days load in parallel (`Promise.all`), cached in memory (`weatherCache`) after first load so tab-switching doesn't re-fetch. A visible source badge on each card reads "Forecast" (gold) or "Historical data" (muted) so viewers know data quality. An intro line at the top of the tab summarizes overall freshness ("Live forecast from Open-Meteo · N days until Day 1", or a mixed/historical-only variant).

### 9.2 Weather card layout, per day

- Header: day number + weekday + location, course name, source badge.
- **Condition line**: icon (emoji, mapped from WMO weather code) + text description (Clear/Partly cloudy/Rain/Snow/Thunderstorm/etc.), centered.
- **Triad display**: three time-of-day snapshots — 9a / midday-HIGH / 3p by default, or an explicit override (`triadHours`) for Day 1 which instead shows 1p / HIGH / 7p (later tee time that day). The middle "HIGH" slot is visually dominant (larger icon + larger temp, ~1.5–2× the size of the flanking slots) since that's the number golfers actually care about — explicitly documented as "peak temp during golf hours (9a–9p), not the 24-hour max," which may legitimately read lower than a phone's default weather app on a day with a cold front.
- **Meta grid** (4 columns desktop, 2 on mobile): feels-like temp, wind (speed + compass direction, with a rotated arrow glyph), precip chance, sunrise/sunset.
- **Nested schedule block** — the day's full itinerary pulled from `SCHEDULE_BY_DATE`, rendered as a vertical timeline: time / icon / label+detail per row. Rows are visually plain by default, but **tee-off rows** (`kind: 'tee'`) and **draft rows** (`kind: 'draft'`) get promoted to their own bordered/padded rounded-rect treatment so the two things people actually need to not miss (tee times, team drafts) stand out from breakfast/lunch/driving logistics.

---

## 10. Full data model (as currently hardcoded in `<script>`)

```js
data = {
  red:  { name, captain },
  blue: { name, captain },
  days: [
    { day, session, course, rounds: [
      { format, id, detail, pointsAvail, status: "final"|"live"|"upcoming", liveHole?, matches: [
        { label, red: [[first,last],...], blue: [[first,last],...],
          isTeam?, redRoster?: ["F. Last",...], blueRoster?,
          redPts, bluePts }
      ]}
    ]}
  ]
}

fedex = { showLeaderboard: bool, players: [{ first, last, team, total }] }

handicaps = { "First Last": { jan, may, live } }   // one entry per player

rounds = [   // per-round NET leaderboards (individual net score, not points)
  { id, format, day, session, course, status, results: [
    { first, last, team, net }
  ]}
]

boyneCup = { id:"bc", format, day, session, course, status, results: [...], winner? }  // winner overrides auto-derivation on ties

sideAction = [
  { id, day, session, format, course, detail, status, noSkins?,
    ctpHoles: [{ hole, yds, par }],
    ldHole: { hole, yds?, par? } | null,
    ctps:   [{ hole, player, sponsor? }],
    longDrive: { player, yds?, dist? } | null,
    skins:  [{ player, count, payout }]
  }
]

ROOKIES_2026 = Set("First Last", ...)
DEFENDING_CHAMP_NAME = "First Last"

WEATHER_DAYS = [{ date, dayNum, dayName, location, course, lat, lon, triadHours? }]
SCHEDULE_BY_DATE = { "YYYY-MM-DD": [{ time, icon, label, detail, kind? }] }
```

### 10.1 Roster reference (2026 trip)

**Stiff Shaft Swingers (Red)** — captain Luke Vandenbosch: Kyle Elliott, Nick Grimshaw, Alex Churchill*, Jesse Joosten*, Justin Vere*, William Churchill, Corey Joosten*†, Luke Vandenbosch

**Gaylord Gooners (Blue)** — captain Ryan Versolatto: Steve Rioux*, Ryan Versolatto‡, Tyler Barnwell, Ryan Dixon, Josh MacDonald, Andrew Versolatto, Mike Grimshaw, Jeff Hogg

`*` = 2026 rookie · `†` = 2026 Boyne Cup champion · `‡` = 2025 defending champion. Belt (longest-drive) holder changes round to round; final belt-holder of record in this file is Nick Grimshaw.

**Final Ryder Cup result:** Gaylord Gooners (Blue) 31.5 – Stiff Shaft Swingers (Red) 16.5. **2026 Boyne Cup champion:** Corey Joosten.

---

## 11. Interactivity summary (everything that isn't static)

| Interaction | Mechanism |
|---|---|
| Tab switching | Click listener toggles `.active` class on button + matching `.view`; scrolls to top |
| Handicap team filter | Delegated click on `[data-hcp-filter]`, re-renders only the hcp section |
| Handicap column sort | Delegated click on `[data-hcp-sort]`, toggles asc/desc if same column, re-renders only the hcp section |
| Weather load | Fires once per page load (cached after), async, shows a loading state, falls back gracefully through 3 data sources, never hard-fails |
| Resize | `window.resize` triggers a full `renderAll()` — used specifically so the giant Ryder Cup score numerals can switch between desktop/mobile font sizes at runtime (not just via CSS) |

There is **no persistence** anywhere (no localStorage, no cookies, no backend) — every render is derived fresh from the hardcoded JS constants on each load. Editing the dashboard means editing this file's source and re-deploying/re-sharing it.

---

## 12. What this design nails (worth preserving)

- Extremely strong, consistent visual identity (Oswald caps + red/blue/gold on near-black) that reads instantly as "sports broadcast scoreboard," not a generic admin table.
- The chevron/arrow match visualization communicates win/loss/margin at a glance without needing to read numbers.
- Real house-rule logic is encoded, not just displayed: mathematical clinch detection, host-swap-on-loss, bed-pick-order-by-net-score, belt-holder-by-most-recent-round. These aren't cosmetic — they're the actual outcome of "what should the page say right now given these house rules."
- Graceful degradation everywhere: missing weather data, unplayed rounds, unresolved CTPs/skins, and tied ranks/winners all have an explicit, designed-for empty/placeholder state rather than breaking or showing nothing.
- Zero dependencies, zero build step, opens by double-clicking the file. Extremely portable, but also the reason it can't currently support live multi-user input (see companion plan doc).
