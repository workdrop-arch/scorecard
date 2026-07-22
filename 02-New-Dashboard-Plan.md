# New Trip Dashboard — Build Plan (Carleton Place Cup Edition)

Companion to `01-Current-Dashboard-Analysis.md`. That document is the spec of what exists; this document is the spec of what to build next. Read the analysis doc first — everything below assumes its terminology (tabs, chevron rows, badge system, data model, etc.).

## Decisions log

Resolved while scoping this plan — treat these as settled unless something changes:

| Decision | Answer |
|---|---|
| Hosting | Keep **GitHub Pages** for the static site (dashboard/admin/golfer pages), same as the old file. |
| Backend/data store | **Firebase** (Firestore + Auth). Called directly from client-side JS on GitHub Pages — no server needed. |
| Round lineup (Carleton Place Cup + Ryder Cup rounds) | **Admin-configurable, not fixed.** Round count/format isn't decided up front — the admin adds/edits/removes days and rounds through the Admin Portal at any time, same as the old workflow of hand-editing the data. See §5.2. |
| Roster/teams | **Editable anytime** through the Admin Portal — not locked once the trip starts. |
| Round-score entry mode (golfer portal) | **Summary entry first** (one final score submitted at the end of a round). Hole-by-hole is an explicit future stretch goal, not part of the initial build. |
| Side bet visibility | **Public** — visible to everyone on the dashboard, same as the rest of the scoreboard. |
| Defending-champion badge | **Omit for now** — this is year one of the Carleton Place Cup, so there's no prior champion to seed. The admin form should still have the field (so a future year can set it), it just starts empty/unused. |

Still open (need real values before data entry can start, not architecture decisions): trip dates/location(s) per day, Ryder Cup team names, initial roster (players/teams/captains), side-action pot structure per round. See §2.2.

---

## 1. Goal in one paragraph

Recreate the exact look, feel, and tab structure of the Boyne 2026 scoreboard for a new golf trip, keeping the **Ryder Cup** tab as-is conceptually, renaming the **Boyne Cup** tab to the **Carleton Place Cup** (same mechanics — FedEx-style points race + strokes-based individual championship — just a new name/course/roster), and keeping **Side Action** and **Schedule/Weather** tabs as-is conceptually. On top of that, add two new input surfaces that don't exist today: an **Admin Portal** (full control over every field) and a **Golfer Portal** (lightweight, on-course, mobile-first scoring + side-bet entry). Because those two new surfaces require *live, multi-person, real-time writes*, this is the one part of the project that can't just be "copy the old file" — see §3.

---

## 2. What carries over unchanged

Everything in Analysis §3 (design system), §4.3 (chevron visualization), §7 (badge system logic), §9.1 (weather fallback cascade), and §11 (interactivity) should be reused as-is or near-as-is:

- Full CSS design system: color tokens, Oswald/Inter fonts, card/pill/badge component patterns, the 600px responsive breakpoint.
- Four-tab structure, sticky tab bar, same tab-switch mechanism.
- Chevron SVG match visualization, unchanged.
- Champion / rookie / belt badge system and its resilient name-canonicalization approach — unchanged logic, just re-seeded with the new roster.
- Weather tab's 3-source fallback cascade (forecast → 3-yr historical average → hardcoded climatology) — unchanged code, just new lat/lon per course and new trip dates.
- Handicap Trends sortable/filterable table — unchanged.
- Host-divider, bed-pick-order, mathematical-clinch-detection, belt-holder-by-most-recent-round logic — unchanged, all of it is generic over the data, not hardcoded to Boyne specifically.

### 2.1 Rename checklist (Boyne Cup → Carleton Place Cup)

Everywhere the old file says "Boyne Cup" as the *competition name* (tab label, intro heading, champion banner label, legend text, `boyneCup` object comments), rename to **Carleton Place Cup**. Do **not** rename "Boyne" where it refers to the *trip itself* if the new trip is not at Boyne — that's a separate find-and-replace (trip name, hero title, dates, course names, coordinates). Treat these as two independent rename passes:

1. Competition rename: `boyne-intro`, `.boyne-intro h2` text, `champ-banner` label text ("2026 Boyne Cup Champion" → "20XX Carleton Place Cup Champion"), badge titles (`title="2026 Boyne Cup Champion"` → `title="20XX Carleton Place Cup Champion"`), the `boyneCup` JS variable/comments (fine to keep the *variable name* `boyneCup` internally if you want to minimize code churn — just rename the user-facing strings — or rename to `carletonPlaceCup` throughout for clarity; recommend the latter for a clean start).
2. Trip rename: hero title/dates, tab bar still says "Ryder Cup" (generic, keep), course names, `WEATHER_DAYS` lat/lon, `SCHEDULE_BY_DATE`, team names/captains, roster.

### 2.2 New trip content still needed from the user (data-entry-time, not build-time)

Round lineup, roster, and the defending-champion badge are **not** on this list anymore — see the Decisions log (all admin-configurable / resolved). What's left is real-world content, and none of it blocks building the app:

- **Not needed to build.** The dashboard, Admin Portal, and Golfer Portal all get built and tested against placeholder/seed data (a few dummy players, a fake round or two) — same as developing any normal app. Nothing below has to be known up front.
- **Needed once, later, through the Admin Portal itself** — typed in by whoever's organizing the trip, whenever the real details are finalized (e.g. the week before departure), not handed to a developer mid-build:
  - Trip dates, location(s)/course(s) for each day (need lat/lon per venue for weather).
  - Team names for the Ryder Cup side (kept format, new names — "Stiff Shaft Swingers"/"Gaylord Gooners" were presumably location/joke-based).
  - Initial roster (who's on each team, who's captain, who's a rookie) — entered once via the Admin Portal; editable anytime after.
  - Side-action pot structure per round (skins pot size, CTP payout, whether every round has skins/CTP/LD).

In short: build-time and data-entry-time are decoupled by design. The app should be fully functional and demo-able with fake data before any of the above is real.

---

## 3. The architecture problem: static file → live multi-user input

The existing file has **zero persistence** by design (Analysis §11) — it's edited by hand and re-shared. That's fine for a single organizer typing scores from Squabbit screenshots after the fact. It is **not** compatible with the new requirement: golfers entering their own scores and side bets *on the course, on their phones, in real time*, and an admin editing from elsewhere, with everyone's dashboard reflecting it live.

This means the new build is not "the same file plus two more HTML files" — it needs an actual backend data store that all three surfaces (public dashboard, admin portal, golfer portal) read from and write to.

### 3.1 Decided approach: Firebase (Firestore + Auth), hosted on GitHub Pages

- **GitHub Pages stays the host** for the static site — same as today. Firebase and Supabase are both "backend-as-a-service": the dashboard/admin/golfer pages remain plain HTML/CSS/JS files on Pages, and they talk to Firestore directly from client-side JS. No server of your own to stand up or run; GitHub Pages can't execute server code, but it doesn't need to — Firebase's SDK does the network calls from the browser.
- **Firestore** — realtime NoSQL document DB. Any client (dashboard, admin, golfer page) can subscribe to a collection and get pushed updates the instant another client writes — exactly the "golfer submits a score on hole 14, everyone's dashboard updates within a second" behavior this needs.
- **Firebase Auth** — handles both auth tiers cheaply:
  - Admin: single privileged account (email/password or a shared admin passcode gated behind a custom claim).
  - Golfers: either anonymous auth + a per-player PIN/passcode they enter once (simplest, no email required, works well for a golf-trip group chat context), or lightweight per-player accounts if you want per-golfer audit trail on who submitted what.
- **Cost**: free tier comfortably covers a ~16-person trip's read/write volume for a few days. No server to run or maintain.
- **Why this over alternatives**: no backend code to write/host (Cloud Functions optional, not required for CRUD), realtime listeners are built in (no need to hand-roll polling), and it plugs directly into the existing plain-JS/no-framework style of the current file — you can keep writing vanilla JS, just swap "read from a hardcoded const" for "read from a Firestore `onSnapshot` listener."

*(Considered and passed on: Supabase — equally valid, more SQL-flavored, no strong reason to prefer it here. Google Sheets as datastore — simplest mental model but no realtime push and clunkier writes from the golfer/admin forms. Custom server — would need its own host since GitHub Pages can't run it; more ops than this project needs.)*

### 3.2 Resulting shape of the project

```
/public-dashboard/     — the read-only scoreboard (today's file, but data-driven from Firestore instead of hardcoded consts) — deployed to GitHub Pages
/admin/                — admin portal (auth-gated) — deployed to GitHub Pages
/golfer/               — golfer input portal (lightweight auth-gated) — deployed to GitHub Pages
Firestore collections  — single shared source of truth for all three, hosted on Firebase, not GitHub
```

All three surfaces should share the same design system (CSS variables, fonts, component classes) so the admin/golfer forms feel like part of the same product, not a bolted-on generic form builder.

One GitHub Pages-specific note: Firebase client config (project ID, API key, etc.) ends up visible in the shipped JS, same as any client-side Firebase app — this is normal and expected (Firebase security relies on Firestore security rules, not on hiding the config), but the Firestore security rules need to be written deliberately (e.g. "anyone can read, only authenticated admin can write to teams/rounds/matches, authenticated golfers can only write their own roundResults/sideBets docs") since there's no server layer to enforce access control instead.

---

## 4. Data model changes (static consts → Firestore collections)

Direct translation of Analysis §10, one collection per top-level const, plus one brand-new collection for side bets:

| Old JS const | New Firestore collection | Notes |
|---|---|---|
| `data` (teams + days/rounds/matches) | `teams`, `rounds`, `matches` | Split so admin can edit a match's score without rewriting the whole nested tree; `matches` reference their parent `round` by ID |
| `fedex.players` | `players` | Also the canonical roster document (name, team, rookie flag, captain flag) — single source of truth other collections reference by playerId instead of by "First Last" string matching |
| `handicaps` | field on each `players/{id}` doc, or subcollection `players/{id}/handicapHistory` if you want an arbitrary number of checkpoints instead of exactly jan/may/live | Recommend subcollection — more future-proof, still easy to render the same 3-column trend table by querying the 2–3 most recent entries |
| `rounds[].results` (per-round net leaderboard) | `roundResults` collection, one doc per (round, player) | Enables a golfer to submit *their own* result as a single doc write instead of admin rewriting an array |
| `boyneCup` | `carletonPlaceCup` (single doc or its own small collection if it also needs a `roundResults`-style breakdown) | |
| `sideAction[]` (ctps/longDrive/skins per round) | `sideAction` collection (one doc per round, same shape) or split into `ctpResults`, `longDriveResults`, `skinsResults` if golfers should be able to self-report a CTP win without touching the whole round doc | Recommend splitting — matches how golfers will actually submit ("I won CTP on 6") |
| **NEW** side bets | `sideBets` collection | See §6 — did not exist in the old file at all |
| `ROOKIES_2026`, `DEFENDING_CHAMP_NAME` | fields on `players` docs / a `settings` doc | |
| `WEATHER_DAYS`, `SCHEDULE_BY_DATE` | `tripDays` collection (date, course, lat/lon, schedule array) — this one can stay closer to static config since it doesn't change during the trip; low priority for admin-editability vs. everything else | |

The **public dashboard's render functions** (`renderRyder`, `renderBoyne`→`renderCarletonPlace`, `renderSide`, `renderWeather`) stay almost line-for-line identical — they currently take a JS object and produce HTML strings; the only change is *where that JS object comes from* (a Firestore snapshot listener assembling the same shape, instead of a hardcoded literal). This is the key insight that keeps this from being a full rewrite: **decouple data-shape-in-memory from data-source**, keep every render function as pure `(data) => html`.

---

## 5. Admin Portal

**Purpose:** one person (the organizer/captain) can edit *anything* on the dashboard from a phone or laptop, replacing "hand-editing the HTML file and re-sharing it."

**Access:** gated behind Firebase Auth, single admin role (or a short list of trusted co-admins — e.g. both captains). Not linkable/discoverable from the public dashboard.

**Structure:** tabs mirroring the dashboard's own tabs, plus a Roster/Settings tab:

1. **Roster & Settings**
   - Add/edit/remove players (name, team, captain flag, rookie flag) **at any time**, not just at trip setup — decided editable-anytime rather than locked once the trip starts.
   - Set team names.
   - Set trip metadata: hero title, date range, tab-bar labels if ever renamed again.
   - Defending-champion name field exists but starts empty for year one (see Decisions log) — leave blank, no badge renders. A future year's admin sets this once there's a first Carleton Place Cup champion.
2. **Ryder Cup**
   - Add/edit/remove a day (day #, session, course) — no fixed day/round count; this is exactly how "we don't know how many rounds yet" gets handled, the admin builds the schedule out as it's finalized and can keep adjusting it during the trip.
   - Add/edit/remove a round within a day (format name, detail text, points available, status: upcoming/live/final, live-hole text).
   - Add/edit a match within a round: assign players to red/blue, mark team-format vs individual, enter/adjust redPts/bluePts.
   - All point/status edits should immediately recompute and be reflected on the public dashboard (this is exactly what Firestore realtime listeners give you for free — no "publish" button needed, though a "preview vs. live" flag is worth considering, see §7.
3. **Carleton Place Cup**
   - Manage the list of FedEx-eligible rounds and each one's net-score results per player (this can also be admin-*reviewed* golfer-submitted data rather than hand-typed — see §6).
   - Toggle `showLeaderboard`.
   - Set/override the championship winner (tie-break override, mirroring the old `winner` field).
   - Manage handicap checkpoints per player (add a new snapshot at any time — Jan/May/Live becomes "any number of dated checkpoints," admin picks which show in the 3-column trend view or the UI just always shows the 3 most recent).
4. **Side Action**
   - Per round: set the pot/detail text, CTP holes (hole #, yardage, par), long-drive hole, and either hand-enter winners or **approve/edit golfer-submitted claims** (recommended — see §6, this avoids the "10 people claim they won the same skin" problem).
5. **Schedule / Weather**
   - Edit each trip day's date, course, lat/lon, and the itinerary rows (time, icon, label, detail, kind: tee/draft/plain).

**Form UX notes:**
- Every numeric/score field should validate sanely (no negative skins counts, points can't exceed a round's `pointsAvail`, etc.) but the admin should always be able to override/force-save for edge cases (playoffs, disputes) — don't over-lock the UI.
- Prefer inline edit-in-place on tables that mirror the public dashboard's own table components, over generic modal forms — reinforces "this is what you're about to publish," reduces admin error.
- Show a small "last edited by / at" timestamp per record for accountability given multiple people might have admin access.

---

## 6. Golfer Portal

**Purpose:** any golfer, from their own phone, mid-round or right after, can (a) submit their own round score, and (b) create/settle side bets with other golfers on the fly — no waiting for an admin to transcribe anything.

**Access:** lightweight auth — recommend each golfer picks their name from a roster dropdown + a short trip-wide passcode (shared once at trip kickoff) rather than full email/password signup. Low friction is the whole point; this is used standing on a tee box.

### 6.1 Round score entry

- Golfer selects the current/relevant round (default to whichever round is marked `status: live` or the most recent `upcoming`→now one, so they don't have to hunt).
- **Decided: summary entry for the initial build** — golfer submits just the final gross score (or net directly) once at the end of the round. Matches how the *old* file's data was actually populated (from a post-round Squabbit screenshot), and is far lower friction than hole-by-hole on a phone mid-round. Hole-by-hole (18/9 individual inputs, running total, net auto-computed from handicap, potential future auto-skins-detection) is explicitly deferred to a later phase, not part of the first build.
- Submission writes to `roundResults` (one doc per player per round) — the public leaderboard should ideally show entries **pending admin approval** as visually distinct (e.g. slightly dimmed / "pending" tag) from admin-confirmed final results, so one mistyped score doesn't instantly corrupt the public standings. This mirrors the CTP/skins approval flow below.

### 6.2 Side bet entry (new feature, no prior art in the old file)

This is the one genuinely new game type. Suggested minimal schema for `sideBets`:

```
{
  id,
  roundId,               // which round/day this bet is tied to (or null for a trip-long bet)
  type,                  // "press" | "nassau" | "prop" | "skin-side-bet" | "custom"
  description,           // free text, e.g. "Closest to pin on 14, $10, loser buys a beer"
  stake,                 // dollar amount (or non-cash stake as free text)
  createdBy,             // playerId
  participants: [playerId, ...],
  status,                // "open" | "settled" | "void"
  winnerId,              // null until settled
  createdAt, settledAt
}
```

Flow:
1. Golfer taps "New side bet," picks opponent(s) from the roster, enters a description and stake, submits — status `open`.
2. Either participant (or admin) can mark it settled and declare a winner once the bet resolves.
3. **Decided: public** — every side bet is visible to everyone on the dashboard, same as the rest of the scoreboard, no private/participants-only mode in the initial build. Surface it as a lightweight "Side Bets" summary in the existing Side Action tab (new card type per round), reusing the `.side-card`/`.side-row` component patterns already in the design system, rather than inventing new visual language or a 5th tab.
4. Keep it deliberately loose/free-text (`description`, `type` as a short list but with "custom" always available) rather than trying to model every possible golf side-bet structurally (presses, nassaus, skins-on-skins, etc. vary too much trip to trip to hard-code).

### 6.3 CTP / Long Drive self-report

Same pattern as round scores: golfer taps the relevant round, taps "I won CTP on hole 6" or "I won Long Drive," it goes in as a pending claim, admin (or a "first submission wins, second submission is rejected/flagged" rule) resolves conflicts. Simpler than modeling verification workflows — for a friend-group trip, a lightweight honor-system-plus-admin-override is almost certainly the right level of rigor, not a dispute/arbitration system.

---

## 7. Suggested build order

1. Stand up Firestore + Auth (Firebase project, no Firebase Hosting needed since GitHub Pages serves the site); define the collections in §4.
2. Port the **public dashboard** first: same visual output as today, but sourced from Firestore instead of hardcoded consts. Seed Firestore with the Carleton Place roster/schedule/rounds as placeholder data to develop against. This alone gets you back to parity with the old file, just live-data-backed.
3. Build the **Admin Portal**, starting with Roster/Settings + Ryder Cup match editing (highest-value, most frequently edited during the actual trip).
4. Build the **Golfer Portal**, starting with round-score summary entry (§6.1's simpler mode) before hole-by-hole or side bets.
5. Add side bets (§6.2) and CTP/Long Drive self-report (§6.3) last — genuinely new features, lowest risk to build iteratively once the core loop (golfer submits → admin approves → dashboard updates live) is proven with round scores.
6. Decide on and implement the "pending vs. confirmed" visual treatment on the public dashboard before opening golfer input to the whole group, so one bad submission can't visibly break the shared scoreboard mid-round.

---

## 8. Explicit non-goals / things not to over-build

- Don't build a full authentication/account system with password resets, profile pages, etc. — this is a friend-group golf trip tool, roster-dropdown + shared passcode is appropriate.
- Don't try to structurally model every conceivable side-bet type — keep it free text + a short type enum.
- Don't build hole-by-hole live scoring with GPS/course-mapping unless explicitly asked — that's a materially bigger project (real course data, hole-by-hole handicap allocation, etc.) than "let golfers submit their score on the fly."
- Don't add a notifications/push system — realtime Firestore listeners already make the dashboard update live; that's sufficient without also building push notifications.
- Keep the zero-dependency, hand-editable spirit of the CSS/render-function layer intact — the value of the old file's architecture (readable, single-owner-editable, no framework lock-in) should survive the move to a live backend, only the data *source* should change.
