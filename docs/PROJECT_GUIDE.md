# Seed Mind · Project guide

A deep explanation of how Seed Mind works, written for whoever picks it up next (a person
or Claude Code). It explains the *how* and the *why*. The other docs cover the rest:

| File | What it holds |
|------|---------------|
| `CLAUDE.md` | The short rules Claude Code loads automatically |
| `roadmap.txt` | Status, what's done, what's next (phases with checkboxes), changelog |
| `RULES.md` | The Bao ruleset as implemented, its sources, decisions D1–D13, the published game |
| `docs/PROJECT_GUIDE.md` | This file: domain primer, architecture, internals, recipes, pitfalls |
| `README.md` | What it is, the design concept and its references, measured numbers, how to run |

Read order for a new session: `roadmap.txt` → this guide → `RULES.md` → the code.

---

## 1. The product in one paragraph

Seed Mind is a browser app for **Bao la Kiswahili**, the four-row mancala of Zanzibar and
the Swahili coast. You play an AI called **Fundi** (nine calibrated levels) or a friend on the
same device (pass-and-play). A **coach light** rings the move a master would make, traces its
sowing path and explains it; **“Why not?”** prices any other move in kete. **Game review**
scores every move, draws the game as **growth rings**, finds the turning points with the
coach's whole line, and exports or shares games. The **board reader** straightens a photo of a
real board and counts the seeds. A first-run guide (**Mwongozo**) and a help drawer explain it
all. It is a static, offline-capable site (PWA) with no backend; the UI is in English and
Kiswahili (draft).

## 2. Bao primer (just enough to read the code)

- **Board:** 4 rows × 8 pits, 64 seeds (**kete**). Each player owns two rows: the **inner**
  (front) row facing the opponent, and the **outer** (back) row.
- **Nyumba:** the square "house" pit, the 5th inner pit from its owner's left. It has
  special powers while it holds 6+ kete. The two nyumba sit diagonally, not face to face.
- **Kichwa:** the two end pits of the inner row. Captured seeds always re-enter at a kichwa.
- **Kimbi:** the pit next to each kichwa.
- **Sowing:** lift a pit's seeds and drop one per pit around *your own 16 pits* (inner row,
  round the corner, outer row, back round). Clockwise or anticlockwise.
- **Relay:** if the last seed lands in an occupied pit, lift that pit and keep sowing.
  The turn ends when the last seed lands in an empty pit.
- **Capture:** the last seed lands in an occupied inner pit whose facing opponent pit is
  occupied. Take all the facing seeds and sow them from a kichwa. Captures are compulsory.
- **Namua** (stage 1): while you hold seeds in hand (22 at the start), each turn begins by
  placing one into an inner pit.
- **Mtaji** (stage 2): hands are empty, so each turn lifts a pit with 2+ seeds.
- A **mtaji turn** starts with a capture. A **takasa (takata)** turn captures nothing at all.
- **Safari:** in a capture turn that ends in your working nyumba, you may lift the house and
  go on sowing; it then loses its powers.
- **Taxing:** sowing only 2 seeds out of the nyumba, so it keeps its powers.
- **Takasia / mtaji moja:** a quiet move that leaves you exactly one capture blocks that
  threatened opponent pit for their next quiet turn.
- **Win:** the opponent's inner row is empty, or they have no legal move. Emptying your own
  inner row loses at once.

Full detail and sources: `RULES.md`.

## 3. Tech stack and why

| Choice | Why |
|--------|-----|
| Vite 5 + React 18 + TypeScript 5 (strict) | Fast dev server, static build, typed engine |
| Vitest | Same TS and module setup as the app; engine, vision and i18n tests run in Node |
| Playwright + axe-core | End-to-end tests against the production build, with accessibility checks |
| Web Workers for the engine | Search takes up to ~3 s and must never freeze the board or animation |
| Hash routing (`#/play`) | Works from any static host (GitHub Pages) with no server config |
| localStorage / sessionStorage | No backend; games, analyses and settings live in the browser |
| Plain CSS with tokens | One file, light/dark via custom properties; no CSS framework |
| `@fontsource` Gloock + Outfit | Self-hosted fonts, so the app works offline |
| Hand-written service worker (vite plugin) | Precaches the build; no PWA dependency |
| Web Audio | Seed sounds are synthesised; no audio files |

Runtime dependencies: `react`, `react-dom` and the two font packages. Everything else is build/test tooling.

## 4. Directory map

```
Seed Mind/
├─ index.html              Shell: manifest, icons, theme-color; loads src/main.tsx
├─ public/                 favicon.svg, PWA icons (npm run icons), manifest.webmanifest
├─ src/
│  ├─ main.tsx             React root (StrictMode), fonts, LangProvider, service worker
│  ├─ App.tsx              Header (nav, Help, sound, language, theme), routes, guide + help
│  ├─ engine/              PURE TypeScript: no DOM, no React (see §5)
│  ├─ vision/              PURE TypeScript: board-reader geometry and seed counting (§7.3)
│  ├─ i18n/sw.ts           Kiswahili dictionary (English text is the key)
│  ├─ ui/                  Shared React pieces and browser glue (see §7)
│  ├─ screens/             Overview, Play, Review, Reader, NotFound (see §8)
│  └─ styles/app.css       All styling and design tokens (see §9)
├─ e2e/                    Playwright tests (desktop + phone projects)
├─ scripts/                bench, match, tune, levels, vision-check, i18n-keys, shots, icons,
│                          check-base; search_v0.ts is the 0.2 engine kept for matches
├─ .github/workflows/      deploy.yml: test → build (BASE_PATH) → GitHub Pages
├─ RULES.md, roadmap.txt, README.md, CLAUDE.md, docs/ (this guide, screenshots/)
├─ vite.config.ts          React plugin, service-worker plugin, BASE_PATH, Vitest config
└─ playwright.config.ts    Builds and serves the app on :4173 for the e2e run
```

## 5. The engine (`src/engine/`)

Everything here is pure functions over plain data, so it can run in tests, in a worker or
on the main thread.

### 5.1 Data model (`types.ts`)

```ts
Position = {
  pits: [number[16], number[16]]   // per side, in THAT SIDE'S OWN FRAME (see 5.2)
  stock: [n, n]                    // seeds still in hand; namua while the mover's stock > 0
  nyumba: [bool, bool]             // house still owned (powers also need 6+ seeds, see houseWorks)
  toMove: 0 | 1                    // 0 = South (bottom of screen), 1 = North
  blocked?: number | null          // takasia: a pit of toMove it may not empty on a quiet turn
}
Move = { pit, dir: 1 | -1 | 0, kichwa: 0 | 7 | null, safari: boolean | null }
```

A `Move` describes the **whole turn**, including choices that only come up mid-turn
(which kichwa, whether to take safari). So a game is fully reproducible from
`start position + moves + ruleset`. `dir` is 0 only for a namua capture, where the placed
seed is not sown. `hash.ts` packs a Move into a small integer (`moveCode`, `moveFromCode`)
for the hash table, killer slots and share codes.

`MoveResult` carries the next position, an optional event trace (`SowEvent[]`: place,
lift, sow, capture, end), and facts the coach uses: kind, captures, seeds captured,
captured nyumba, safari, taxed, end pit, end reason.

### 5.2 The coordinate frame (the most important convention)

Each side's 16 pits are indexed **from that side's own seat**:

```
index 0..7   = inner row, owner's left → right   (0 = left kichwa, 4 = nyumba, 7 = right kichwa)
index 8..15  = outer row, owner's right → left
+1 around 0..15 = clockwise from the owner's seat
inner pit i faces the opponent's inner pit 7 - i
```

The screen is always drawn **from the viewer's seat** (the human sits at the bottom; in
pass-and-play the viewer is whoever is to move). `board.ts` converts; never hand-roll this:

- `cellAt(viewer, row, col)` → `[side, pit]` for screen row 0..3 (D, C, A, B) and column 0..7.
- `pitName(viewer, side, pit)` → "A5", "C4", "B1"… (A/B own inner/outer, C/D opponent).
- `moveNotation(move, namuaCapture, mover, viewer)` → "A6→", "C4×L". For the opponent's
  moves, arrows and L/R are flipped so they read correctly from the viewer's seat.

Donkers' notation (used for the published game) numbers holes 1–8 from each player's left
and gives the hand's direction; `goldenGames.ts → parseDonkers` maps it: front hole n is
pit n−1, back hole n is pit 16−n, and "L" is −1 on the front row but +1 on the back row.

### 5.3 Rules (`ruleset.ts`, `rules.ts`)

`RuleOptions` holds every rule the sources disagree on. Rulesets: `DONKERS` (Donkers' computer
rules; **the default for new games** since 0.3.1, via `NEW_GAME_RULESET`), `ZANZIBAR` (the
engine's fallback, `DEFAULT_RULES`, when a call passes no rules), and `V1` (the 0.1.0 rules,
kept so old saves replay).
The optional fields added in 0.3 (`takasiaHouse`, `namuaSingleKete`, `kichwaToBack`,
`safariMinSeeds`) default to the old behaviour, so `ZANZIBAR` and `V1` mean exactly what they
meant. Every engine function takes `rules` with a ZANZIBAR default. **Always pass the game's
own rules.**

**`simulate(pos, move, trace?, rules?)`** plays one full turn on copies of the arrays:

1. **Start.**
   - Namua: take a seed from stock and place it. If the pit faces seeds, capture.
     Otherwise takasa: lift the pit (or tax 2 from a working house) and sow.
   - Mtaji: lift the pit (or tax 2 from a working house) and sow. The turn is a capture
     turn only if this **first lap** ends on a capture spot and sowed ≤ 15 seeds.
2. **Loop** on the landing pit `p`:
   - empty before → end;
   - capture turn and `p` faces seeds → `capture()` (kichwa rules, D1/D2);
   - the nyumba: a capture turn needs the safari decision (`safariHouse()`, D13); a takasa
     turn stops in a working house (`myHouse()`);
   - a takasa turn landing on the blocked pit → stop;
   - otherwise relay. Past 160 sown seeds it records each state, and an exact repeat
     ends the turn as `'limit'` (never-ending, so illegal).
3. **End.** Build `next`. Under takasia, run `captureTargets()` on the result; if the mover
   now has exactly one target and it isn't exempt (D8, D8b), set `next.blocked`.

When a choice is needed but the move leaves it `null`, `simulate` returns
`{ need: 'kichwa' | 'safari' }` instead of a result.

**`legalMoves(pos, rules)`** lists the starting moves, then `expand()` simulates each one.
On a `Decision` it branches (kichwa 0/7, safari false/true) and drops never-ending moves.
It then applies the filters: compulsory capture, the namua house restriction (D4), the
single-kete restriction (D9), takasia blocking, the inner-row preference for quiet mtaji
turns, and `noKichwaSuicide` (D12). The result is `Candidate[] = { move, result }`.

**`status(pos, moves?, rules)`** checks, in order: the side that just moved has an empty
inner row (it loses); the side to move has an empty inner row; the side to move has no
legal move.

### 5.4 Search (`search.ts`, `hash.ts`)

- **`evaluate(pos, side, rules, weights)`** = material (all kete including hand, mine minus
  theirs) + `vulnerable` × (kete I could capture right now − kete they could capture), plus
  optional front-row and nyumba terms. `EVAL` is the tuned set:
  `{ inner: 0, houseBase: 0, housePerSeed: 0, vulnerable: 1 }`. `EVAL_V0` is the 0.2 set.
  Tuning (4 rounds, 60–100 games per candidate, `scripts/tune.ts`) found the vulnerable-kete
  term worth about +180 Elo, and the front-row and house bonuses slightly harmful once it is in.
- **`search(pos, { maxDepth, timeMs, rules, exactRoot?, quiescence?, weights? })`** is negamax
  alpha-beta with:
  - iterative deepening; each depth either completes or is thrown away on timeout;
  - a time check every 1024 nodes (throws `Timeout`);
  - a transposition table keyed by **`zobrist(pos)`** (two 32-bit Zobrist hashes folded
    into one 52-bit number; computed from scratch, which beats building a string key),
    storing the best move; capped at 1.5M entries;
  - move ordering: hash move, then captures by size (house captures first), then two
    **killer moves** per ply;
  - **exactRoot** (default true): full-window scores for every root move, which the coach,
    review and noisy levels need. Plain alpha-beta at the root (`exactRoot: false`) is used
    for noise-free levels and goes deeper;
  - optional **quiescence** (capture-only extension). Off by default: self-play showed the
    time is better spent on depth (q3 −0, q10 −380 Elo);
  - the **principal variation** (`pv`) recovered from the hash moves;
  - mate scores `±(1000 − ply)`.
- **`LEVELS`** (1–9): max depth, time budget and **noise** (a random ± spread in kete added to
  root scores). Calibrated with `scripts/levels.ts` (each level vs the next, 0.2× time):
  every level scores 5–40% against the one above it.

### 5.5 Coach (`coach.ts`)

- `advise(pos, opts, rules)` searches (depth 5, 700 ms), then `describe()`s the best move.
  It returns the light data (start pit, capture targets, first 10 sown pits), the **pv**, and
  **scores** for every legal move (which is what makes “Why not?” instant).
- `describe(pos, cand, viewer, rules)` builds the headline and the "why" sentences.
- `whyNot(pos, advice, cand, viewer, rules)` compares any candidate with the coach's pick:
  loss in kete, a verdict (`verdictFor`: best < 0.05 ≤ fine < 0.5 ≤ inaccuracy < 1.5 ≤ mistake
  < 4 ≤ blunder), a one-line summary and both explanations.
- `analysePly(pos, played, ply, opts, rules)` scores the played move against the best one and
  returns `loss`, `evalSouth`, `pv` and `depth`. Losses ≥ 100 are mate scores: show "decisive".

### 5.6 Games, records and the worker

- `game.ts`: `GameRecord { id, startedAt, level, human, ruleset?, mode?, start, moves,
  notation, result, imported?, clock? }`. `gameRules(g)` maps a missing ruleset to `'v1'`;
  `gameMode(g)` maps a missing mode to `'fundi'`. Results: `inner-empty`, `no-moves`,
  `resign`. `playerName`, `resultText` give the words.
- `record.ts`: `toJSON`, `toText` (tags + numbered moves from South's seat), `toShareCode`
  (base64url of a compact JSON with `moveCode`s), `parseGame(any)` (JSON, text, code or full
  link). Imports are replayed and **validated move by move** under their ruleset.
- `goldenGames.ts`: published games in Donkers' notation, `parseDonkers`, `replayDonkers`.
- `protocol.ts` / `engine.worker.ts`: `think`, `advise`, `analyse` (with optional depth/time
  per ply and `progress` messages). `EngineClient.restart()` terminates a running job.

## 6. How a turn flows through the app

```
Human clicks a pit (Board → Play.setSelected)
 → Play filters legalMoves(pos, rules) to that pit and shows one button per way to play it
   (each with “Why not?” once the coach's advice has arrived)
 → click → playMove(move)
     playTraced(...) gives the events
     animate(events): a display copy steps place/lift/sow/capture on timers, with a
       synthesised seed sound per event (sow speed scales so a whole turn takes ≤ ~4 s;
       Skip or S ends it at once; reduced motion skips straight to the end)
     append move + notation (+ thinking time to game.clock) to the GameRecord → localStorage
 → position changes → Fundi's effect sees toMove = Fundi (not in pass-and-play)
     engine('play').think(pos, level, rules)  [worker]
     waits so Fundi takes ≥ 450 ms, then playMove(reply)
 → the human's turn again → coach effect: engine('coach').advise(pos, rules)
     → Board draws the coach light; the side panel shows the headline and why
```

Game over: `status()` reports it (or the player resigns); Play stores `result`, archives the
game (last 25 kept, their cached analyses pruned) and offers "Review this game".

## 7. Shared UI (`src/ui/`)

### 7.1 Components

- **`Board.tsx`**: the carved board. Pickable pits are `<button>`s; read-only boards can take
  `onInspect`/`onActivate` (the Overview hero readout) and `inspected`. Classes: `.sel`,
  `.coach`, `.target`, `.lit`, `.you`, `.hot`, `.blocked`, `.insp`.
- **`GameRings.tsx`**: the growth-ring figure (see §9). One focusable `role="slider"`: arrows
  read rings, Enter opens one; hover reads too. `mini` renders the list thumbnails.
- **`CornerStage.tsx`**: photo + projected grid + four draggable, keyboard-movable corner
  marks; after counting, a count and (dashed if unsure) ring per pit.
- **`Tour.tsx`** (Mwongozo) + **`tourSteps.ts`**: veil with a cut-out (an SVG even-odd path;
  the hole isn't painted, so the target stays clickable), three growth rings around the
  target, a wooden tag with a notch, "n / N", a row of pits as the progress bar, Back / Next
  / Finish / ×, ←/→/Esc, focus moved into the tag and trapped, steps announced via aria-live.
  It navigates between routes and waits up to 4 s for each `[data-tour]` target; on phones
  (< 640 px) the tag docks to the top or bottom, away from the target. `TourInvite` is the
  one-time opt-in.
- **`Help.tsx`**: modal drawer (focus trap, Esc, focus returns to the opener) with tabs
  Guide, Rules (from the active ruleset's options), Words (glossary), Keys.
- **`shell.ts`**: `useShell()` → `openHelp(tab)`, `startTour('all' | 'screen')`.

### 7.2 Browser glue

- **`engineClient.ts`**: `engine('play' | 'coach' | 'review')` is one worker per job.
- **`storage.ts`**: every read/write is wrapped in try/catch. Keys: `seedmind.current`,
  `.games`, `.level`, `.coach`, `.theme`, `.ruleset`, `.sound`, `.clock`, `.lang`, `.guide`
  (`new | dismissed | done`), `.reviewDepth`, `.analysis.<gameId>` (versioned by
  `ANALYSIS_VERSION`; bump it when engine scores change meaning), and `seedmind.setup`
  (sessionStorage, reader → play hand-off, `{ pos, ruleset }`).
- **`sound.ts`**: Web Audio knocks (sow, lift, place, capture, end), rate-limited; muted
  state persisted. **`i18n.tsx`**: `useT()` → `t('English text', { vars })`.
  **`pwa.ts`**: registers `sw.js` in production builds. **`route.ts`**: the hash router.

### 7.3 Vision (`src/vision/`)

- `geometry.ts`: 4-point homography (DLT, Gaussian elimination), apply, invert.
  Board plane: columns 0..8 × rows 0..4 = the outer corners of the pit grid, as seen from the
  photographer's seat (row 0 = D, the far row).
- `count.ts`: `readBoard(img, corners)` rectifies each pit's disc (48 px cells, bilinear),
  thresholds bright grey pixels (Otsu over all pits, saturation < 0.38), self-calibrates one
  seed's area from the median of isolated blobs, and returns count + confidence per pit
  (< 0.6 = unsure). `findBoard(img)` guesses the corners from the largest dark region's
  extreme points, inset by the rim.
- `synth.ts`: renders realistic synthetic board photos (used by "Try a sample photo" and the
  accuracy tests).

## 8. Screens (`src/screens/`)

| Route | Screen | What it does |
|-------|--------|--------------|
| `#/` | Overview | Hero: tree-ring round, the opening, live coach light, a pit readout on hover/focus, click a pit to play; facts; how a move works; four ways in |
| `#/play` | Play | Board, hand strips (+ optional clock), move options with “Why not?”, coach panel, strength, record (click a ply to look back; ←/→/Home/End), take back, two-step resign, new-game panel (Fundi or pass-and-play, seat, rules, clock). `?new=<n>` forces a fresh mount |
| `#/review?id=` / `?g=<code>` | Review | Cached or fresh analysis (quick 250 ms/≤6 plies or deep 1.2 s per move) with a growing-rings loader, the rings hero + stats, advantage chart, turning points with the coach's line, board comparison, your games (mini rings), share/export/import. A shared code shows a "save to my games" banner |
| `#/reader` | Board reader | Camera / upload / sample photo → corner marks (auto-found) → count → count editor with unsure pits dashed, hand, side to move, rules, takasia pit, nyumba switches, 64-kete check, Analyse, Play on |
| anything else | NotFound | The empty-pit 404 |

**Play state machine:** `busy`: `idle | animating | thinking`; `thinkingFor` (`gameId:posKey`)
makes Fundi think once per position under StrictMode; `gameRef` lets late worker replies spot a
restart, take-back or resignation; advice is keyed by position; `view` (null = live) is the
ply being looked at.

**Review numbers:** a turning point is a subject move with `loss ≥ 1.5` (top 3 get cards, all
get scars); "matched the coach" means `loss < 0.5`; the chart is clamped to ±12 kete.

## 9. Design system ("Growth Rings")

- **Concept:** a carved hardwood Bao board and a cut section of the tree it came from.
  Grey **komwe** seeds sit in sunken pits. References and what each became: README.md.
- **Tokens:** at the top of `app.css` (`:root`, plus both dark blocks). The board and the
  guide's tags are wood in both themes. Ring tokens: `--rings-core`, `--rings-sap`,
  `--rings-late`; `--veil` for overlays; `--warn` only for "Confirm: resign" and errors.
- **One signal colour:** ochre (`--ochre`) means **the coach light only**: the suggested pit,
  its path, its target, the coach's pick, turning points and their fire scars. The guide uses
  cream-on-wood, never ochre. Takasia uses a wood-toned hatch.
- **Type:** Gloock (display) and Outfit Variable (UI), self-hosted, tabular numbers. No mono.
- **Signature pieces:** the carved slab, the tree-ring round, the raking coach light, the
  growth-rings review figure, the carved wooden guide tag with its seed-in-pit progress row.
- **Motion:** the coach light rakes, sowing animates seed by seed, the guide's rings breathe,
  review rings grow while analysing. Everything is off under `prefers-reduced-motion`.
- **Phone (≤ 640 px):** short nav labels, icon-only sound key, docked guide tag.

## 10. Testing

- `npm test` (Vitest, Node):
  - `rules.test.ts`, `rules.zanzibar.test.ts` (D1–D8, perft `[4, 14, 38, 124]` and random
    self-play invariants under all three rulesets, a real never-ending move);
  - `rules.donkers.test.ts`: the **Ramadhan v Kijumbe 1994** game replayed under all three
    rulesets (each ply matching exactly one legal turn), its "ends in nyumba" and "plays the
    house" annotations, and D3/D9/D12 under `donkers`;
  - `search.test.ts`, `record.test.ts` (moveCode/Zobrist, JSON/text/share round trips, PV,
    whyNot), `vision/count.test.ts` (homography, ≥ 90% exact on synthetic photos, outline
    finder), `i18n/sw.test.ts` (every `t()` string has Kiswahili; placeholders match).
- `npm run e2e` (Playwright, builds and serves the app on :4173 each run): hero readout,
  a full Play flow (move, Fundi's reply, why-not, look back, keyboard, take back, resign),
  pass-and-play, review rings + share link + import, reader sample count + analyse + play on,
  corner keyboard nudging, the guide (invite → tour across screens → Esc → never again; "Not
  now"), the help drawer (?, tabs, Esc, tour this screen), Kiswahili, 404, axe (no serious or
  critical WCAG 2.1 AA issues on any screen), offline reload via the service worker, and three
  phone tests (no sideways scroll, docked guide, tap to play).
- **Golden test style:** build a small position with `blank()`, comment the expected
  sowing, assert on `simulate`/`legalMoves`, name the decision (D#).
- **Mutation check:** after changing a rule, temporarily break it and confirm a test fails
  (done for the 6-seed rule, takasia, D9 and D12).
- **Screens:** `npm run build && npx vite preview --port 4173`, then `npm run shots` writes
  every screen and state (light, dark, phone) to `docs/screenshots/` and reports console
  errors and horizontal overflow.

## 11. Recipes

**Add or change a rule**
1. If the change would alter old games, add an optional field to `RuleOptions` (defaulting to
   the old behaviour) and a **new ruleset id**; never change what an existing id means.
2. Implement it in `rules.ts`.
3. Add a golden test and do the mutation check.
4. Update `RULES.md` (rule text and decisions table), the Help Rules tab if players need it,
   and the `roadmap.txt` checkbox.

**Change AI strength**
- Edit `LEVELS` in `search.ts`, then `npm run levels` (each level must score < 50% against
  the next). For evaluation changes: add candidates to `scripts/tune.ts`, run them in parallel
  (`npm run tune -- <name> 60 50`), adopt what wins clearly over 100 games, then confirm with
  `npm run match`. Bump `ANALYSIS_VERSION` in `storage.ts` so cached reviews are redone.

**Add UI text**
- Wrap it: `t('Plain English text')` (use ’ not \', so the key scanner sees it), add the
  Kiswahili to `src/i18n/sw.ts`; `npm test` fails until you do. Data-driven strings (tour,
  levels, rulesets) are covered by the test too.

**Add a guide step**
- Put `data-tour="name"` on the target, add a step to `TOUR` in `tourSteps.ts` (route, target,
  title, body), translate it, and update the step counts in `e2e/app.spec.ts`.

**Add a worker request**
- Add it to `WorkerRequest`/`WorkerResponse` in `protocol.ts`, handle it in
  `engine.worker.ts`, add a method to `EngineClient`. Pass `rules` along.

**Add a screen**
- Create `src/screens/X.tsx`, add a case in `App.tsx` and an entry in `NAV` (with a short
  label), use tokens, `Board`, `.card`, `.btn`, `.lbl`; add a tour step and an axe test.

**Deploy**
- Push to `main`: the workflow runs typecheck, unit and e2e tests, builds with
  `BASE_PATH=/<repo>/` and publishes to GitHub Pages. Locally: `npx vite-node
  scripts/check-base.ts <url>` smoke-tests a sub-path build (worker, service worker, fonts).

## 12. Pitfalls (each of these has bitten already or easily could)

1. **Mixing frames.** Pit indices are in the owner's frame. Display names and arrows are
   in the viewer's frame. Use `cellAt`, `pitName` and `moveNotation`.
2. **Forgetting `rules`.** A call without rules silently uses ZANZIBAR. For saved games,
   always use `gameRules(game)`.
3. **StrictMode double-invokes** state initialisers and effects in dev. That's why the
   reader hand-off uses `peekSetup()` plus `clearSetup()` after mount, and Fundi's turn
   uses the `thinkingFor` ref. Keep side effects out of `useState` initialisers.
4. **Old saves:** `ruleset`, `mode`, `clock` and `Position.blocked` may be missing. Treat a
   missing ruleset as `'v1'`, a missing mode as `'fundi'` and a missing `blocked` as `null`.
5. **Nyumba seats:** the nyumba are diagonal (my index 4 faces their index 3).
6. **Never-ending moves** are real (one is in the tests). Don't remove the cycle check or
   the 4000-seed backstop.
7. **Performance:** `legalMoves` fully simulates every candidate. Measure (`npm run bench`,
   `npm run match`) before adding per-node work; quiescence lost Elo for exactly this reason.
8. **Mate scores in losses:** a review loss ≥ 100 is a forced win/loss, not kete. Show
   "decisive".
9. **The path has a space** (`C:\dev\Seed Mind`): quote it in shell commands.
10. **Git Bash rewrites `/seed-mind/`** into a Windows path. Locally use
    `MSYS_NO_PATHCONV=1 BASE_PATH=/seed-mind/ npm run build`. CI (Linux) is fine.
11. **Stale preview servers:** a `vite preview` left running serves an old build.
    `playwright.config.ts` never reuses a server for that reason.
12. **E2E storage:** tests seed localStorage with an init script that runs once per tab
    (guarded by a sessionStorage flag), so reloads keep the app's own writes.
13. **Git:** DiorWachira is the only contributor. Never add Claude co-author or "Generated
    with" trailers. Commit or push only when asked.

## 13. Glossary

| Term | Meaning |
|------|---------|
| kete | seeds (64 in all) |
| shimo / mashimo | pit / pits |
| nyumba | the house: square pit, 5th inner pit from the owner's left |
| kichwa | an end pit of the inner row (left = clockwise start, right = anticlockwise) |
| kimbi | the pit next to a kichwa |
| namua | stage 1: placing seeds from hand |
| mtaji | stage 2 (hands empty); also a turn that starts with a capture |
| takasa / takata | a turn with no captures |
| takasia / mtaji moja | the rule blocking a lone threatened pit (D8) |
| safari | lifting the working nyumba to continue a capture turn |
| taxing (kutaxa) | sowing only 2 seeds from the working nyumba |
| endelea | Donkers' word for the relay sowing |
| mkononi | in hand |
| mwongozo | guide (the first-run tour) |
| fundi | master; also the AI's name |
| mwanafunzi, mchezaji, hodari, bingwa | pupil, player, skilled, champion (level names) |
| komwe | the grey bonduc-nut seeds traditionally used |
| ply | one player's turn; a "move" in the record is a pair of plies |
