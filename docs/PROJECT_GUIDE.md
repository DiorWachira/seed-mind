# Seed Mind · Project guide

A deep explanation of how Seed Mind works, written for whoever picks it up next (a person
or Claude Code). It explains the *how* and the *why*. The other docs cover the rest:

| File | What it holds |
|------|---------------|
| `CLAUDE.md` | The short rules Claude Code loads automatically |
| `roadmap.txt` | Status, what's done, what's next (phases with checkboxes), changelog |
| `RULES.md` | The Bao ruleset as implemented, its sources, decisions D1–D11 |
| `docs/PROJECT_GUIDE.md` | This file: domain primer, architecture, internals, recipes, pitfalls |

Read order for a new session: `roadmap.txt` → this guide → `RULES.md` → the code.

---

## 1. The product in one paragraph

Seed Mind is a browser app for **Bao la Kiswahili**, the four-row mancala of Zanzibar and
the Swahili coast. You play against an AI called **Fundi** (nine strength levels). A
**coach light** rings the move a master would make, traces its sowing path and explains it
in plain words. **Game review** replays a finished game, scores every move against the
engine and picks out your **turning points**. The **board reader** lets you enter a position
from a real board (a camera photo for reference, counts by hand) and analyse it or play on
from it. It is a static site with no backend; everything runs in the browser.

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
| Vitest | Same TS and module setup as the app; engine tests run in Node |
| Web Workers for the engine | Search takes up to ~3 s and must never freeze the board or animation |
| Hash routing (`#/play`) | Works from any static host with no server config |
| localStorage / sessionStorage | No backend; games and settings live in the browser |
| Plain CSS with tokens | One file, light/dark via custom properties; no CSS framework |

Dependencies are deliberately minimal: `react` and `react-dom` at runtime, plus build/test tools.

## 4. Directory map

```
Seed Mind/
├─ index.html              Shell; loads Google Fonts (Gloock, Outfit) and src/main.tsx
├─ public/favicon.svg      Tree-ring + seeds icon
├─ src/
│  ├─ main.tsx             React root (StrictMode on)
│  ├─ App.tsx              Header/nav, theme picker, route → screen switch
│  ├─ engine/              PURE TypeScript: no DOM, no React (see §5)
│  ├─ ui/                  Shared React pieces and browser glue (see §7)
│  ├─ screens/             Overview, Play, Review, Reader (see §8)
│  └─ styles/app.css       All styling and design tokens (see §9)
├─ RULES.md, roadmap.txt, README.md, CLAUDE.md, docs/PROJECT_GUIDE.md
├─ vite.config.ts          React plugin, ES-module workers, Vitest config
└─ tsconfig.json           strict, noUnusedLocals/Parameters, DOM + WebWorker libs
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
seed is not sown.

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

The screen is always drawn **from the viewer's seat** (the human sits at the bottom).
`board.ts` converts between them; never hand-roll this:

- `cellAt(viewer, row, col)` → `[side, pit]` for screen row 0..3 (D, C, A, B) and column 0..7.
- `pitName(viewer, side, pit)` → "A5", "C4", "B1"… (A/B own inner/outer, C/D opponent).
- `moveNotation(move, namuaCapture, mover, viewer)` → "A6→", "C4×L". For the opponent's
  moves, arrows and L/R are flipped so they read correctly from the viewer's seat.

### 5.3 Rules (`ruleset.ts`, `rules.ts`)

`RuleOptions` holds every rule the sources disagree on. There are two rulesets:
`ZANZIBAR` (default) and `V1` (the 0.1.0 rules, kept so old saves replay). Every engine
function takes `rules` with a ZANZIBAR default. **Always pass the game's own rules.**

**`simulate(pos, move, trace?, rules?)`** plays one full turn on copies of the arrays:

1. **Start.**
   - Namua: take a seed from stock and place it. If the pit faces seeds, capture.
     Otherwise takasa: lift the pit (or tax 2 from a working house) and sow.
   - Mtaji: lift the pit (or tax 2 from a working house) and sow. The turn is a capture
     turn only if this **first lap** ends on a capture spot and sowed ≤ 15 seeds.
2. **Loop** on the landing pit `p`:
   - empty before → end;
   - capture turn and `p` faces seeds → `capture()` (kichwa rules, D1/D2);
   - working nyumba → a takasa turn stops; a capture turn needs the safari decision;
   - a takasa turn landing on the blocked pit → stop;
   - otherwise relay. Past 160 sown seeds it records each state, and an exact repeat
     ends the turn as `'limit'` (never-ending, so illegal).
3. **End.** Build `next`. Under takasia, run `captureTargets()` on the result; if the mover
   now has exactly one target and it isn't exempt, set `next.blocked`.

When a choice is needed but the move leaves it `null`, `simulate` returns
`{ need: 'kichwa' | 'safari' }` instead of a result.

**`legalMoves(pos, rules)`** lists the starting moves, then `expand()` simulates each one.
On a `Decision` it branches (kichwa 0/7, safari false/true) and drops never-ending moves.
It then applies the filters: compulsory capture, the namua house restriction, takasia
blocking, and the inner-row preference for quiet mtaji turns. The result is
`Candidate[] = { move, result }`, so callers get each move's outcome for free.

**`status(pos, moves?, rules)`** checks, in order: the side that just moved has an empty
inner row (it loses); the side to move has an empty inner row; the side to move has no
legal move.

**`playTraced(pos, move, rules)`** is `simulate` with the event trace, used for animation.
It throws if the move is not fully specified.

### 5.4 Search (`search.ts`)

- **`evaluate(pos, side, rules)`** = material (all kete including hand, mine minus theirs)
  + 0.12 × inner-row difference + a house bonus (1.5 + 0.05 × min(seeds, 12)) per working
  nyumba. The units are kete. It is hand-tuned; Phase 2 plans self-play tuning.
- **`search(pos, { maxDepth, timeMs, rules })`** is negamax alpha-beta with:
  - iterative deepening; each depth either completes or is thrown away on timeout;
  - a time check every 1024 nodes (throws `Timeout`);
  - a transposition table keyed by `positionKey()` (a string; Phase 2 plans Zobrist hashing);
  - captures first in move ordering;
  - full-window scores **at the root**, so every root move gets an exact score, which the
    coach and the review need;
  - mate scores `±(1000 − ply)`.
- **`LEVELS`** (1–9): each level is a max depth, a time budget and **noise** (a random
  ± spread in kete added to root scores before picking), so low levels make human-like
  mistakes. `chooseMove(pos, level, rules, rnd?)` applies it.

### 5.5 Coach (`coach.ts`)

- `advise(pos, opts, rules)` searches (depth 5, 700 ms), then `describe()`s the best move.
  It also returns the light data: the start pit, the pits it captures from, and the first
  10 sown pits.
- `describe(pos, cand, viewer, rules)` builds the headline and the "why" sentences: what
  the move takes, chained captures, the nyumba, takasia, and the opponent's best capture
  in reply.
- `analysePly(pos, played, ply, opts, rules)` scores the played move against the best one
  (depth 3, 400 ms) and gives `loss` (≥ 0) and `evalSouth`.

### 5.6 Games and the worker

- `game.ts`: `GameRecord { id, startedAt, level, human, ruleset?, start, moves, notation, result }`.
  `gameRules(g)` maps a missing `ruleset` to `'v1'`. `replay(g)` rebuilds every position.
- `protocol.ts` / `engine.worker.ts`: three requests, each carrying its `RuleOptions`:
  `think`, `advise`, `analyse` (which sends `progress` messages).

## 6. How a turn flows through the app

```
Human clicks a pit (Board → Play.setSelected)
 → Play filters legalMoves(pos, rules) to that pit and shows one button per way to play it
 → click → playMove(move)
     playTraced(...) gives the events
     animate(events): a display copy steps place/lift/sow/capture on timers
       (sow speed scales so a whole turn takes ≤ ~4 s; Skip ends it at once)
     append move + notation to the GameRecord → localStorage
 → position changes → Fundi's effect sees toMove = Fundi
     engine('play').think(pos, level, rules)  [worker]
     waits so Fundi takes ≥ 450 ms, then playMove(reply)
 → the human's turn again → coach effect: engine('coach').advise(pos, rules)
     → Board draws the coach light; the side panel shows the headline and why
```

Game over: `status()` reports it, Play stores `result`, archives the game (last 25 kept)
and offers "Review this game".

## 7. Shared UI (`src/ui/`)

- **`Board.tsx`**: the carved board. Props: `pos`, `viewer`, optional `onPick`/`pickable`
  (makes the viewer's pits real `<button>`s), `selected`, `coach` (start, targets, path →
  `.coach`, `.target`, `.lit` with staggered `animationDelay`), review marks
  (`youMark`, `coachMark`) and `hot` (the pit being sown). The takasia-blocked pit gets
  `.blocked`. Every pit has an aria-label like "A5 nyumba, 6 kete".
- **`engineClient.ts`**: `engine('play' | 'coach' | 'review')` is one worker per job, so a
  long review never delays Fundi. It wraps the workers in promises with sequence ids.
- **`storage.ts`**: every read/write is wrapped in try/catch. Keys:
  `seedmind.current`, `seedmind.games`, `seedmind.level`, `seedmind.coach`,
  `seedmind.theme`, `seedmind.ruleset` (localStorage), and `seedmind.setup`
  (sessionStorage, reader → play hand-off).
- **`route.ts`**: `useRoute()` parses `#/path?query`; `go(hash)`; `prefersReducedMotion()`.

## 8. Screens (`src/screens/`)

| Route | Screen | What it does |
|-------|--------|--------------|
| `#/` | Overview | Hero with a tree-ring round, the opening position and a live coach light; three "how a move works" cards |
| `#/play` | Play | The game: board, hand strips, move options, coach panel, strength slider, game record, ruleset picker, take back, new game. `#/play?new=<n>` forces a fresh mount (used by the reader) |
| `#/review?id=` | Review | Analyses a game in the review worker (with a progress bar), then shows a summary, an advantage chart, turning-point cards and a board comparing your move with the coach's |
| `#/reader` | Board reader | Camera (getUserMedia) → photo; a 4×8 count editor; hand, side-to-move and nyumba inputs; a 64-kete check; Analyse; Play on from here |

**Play state machine:**
- `busy`: `idle | animating | thinking`.
- `thinkingFor` (a ref holding the position key) makes Fundi think exactly once per
  position, even under StrictMode's double effects.
- `gameRef` lets late worker replies spot a restart and drop themselves.
- The advice is keyed by `positionKey`, so stale coach replies are ignored.

**Review numbers:** a turning point is a human move with `loss ≥ 1.5`; "matched the
coach" means `loss < 0.5`; the chart is clamped to ±12 kete.

## 9. Design system ("Growth Rings")

- **Concept:** a carved hardwood Bao board and a cut section of the tree it came from.
  Grey **komwe** seeds (bonduc nuts) sit in sunken pits.
- **Tokens:** at the top of `app.css`. Light is warm sand/wood; dark is set by
  `prefers-color-scheme` or `[data-theme="dark"]`. The board itself is wood in both themes.
- **One signal colour:** ochre (`--ochre`) means **the coach light only**: the suggested
  pit, its sowing path, its capture target, and turning points in review. Primary buttons
  use ink. Takasia uses a wood-toned hatch, never ochre.
- **Type:** Gloock (display) and Outfit (UI), with tabular numbers. No monospace font.
- **Signature pieces:** the carved slab with sunken pits, the tree-ring round, the
  raking-light sowing animation, inset "plates".
- **Motion:** the coach light rakes along the path. Sowing animates seed by seed.
  Everything has a reduced-motion fallback.
- **The original design** is on the "Seed Mind" Design canvas
  (https://claude.ai/artifact/Ve17A4hmGQg4woK1qBd6kg, private).
- **Dior's standing rule:** every project must look unlike the last, so keep this one's
  identity and don't import styles from older projects.

## 10. Testing

- `npm test` runs Vitest over `src/**/*.test.ts` (engine only; no browser tests yet):
  - `rules.test.ts`: the base rules, geometry, and random self-play invariants;
  - `rules.zanzibar.test.ts`: golden positions for D1–D8, perft `[4, 14, 38, 124]`,
    a real never-ending move, and invariants under both rulesets;
  - `search.test.ts`: search, levels, coach text, game replay, legacy replay.
- **Golden test style:** build a small position with `blank()`, comment the expected
  sowing pit by pit, then assert on `simulate`/`legalMoves`. Each test names its decision (D#).
- **Mutation check:** after changing a rule, temporarily break it and confirm a test
  fails. This was done for the 6-seed rule and takasia.
- **Manual check before "done":** `npm run dev`, play a move for each side, open Review,
  and try the reader's Analyse. Check light, dark and a 375 px width.

## 11. Recipes

**Add or change a rule**
1. If the change would alter old games, add a field to `RuleOptions` and a **new ruleset
   id**; never change what `V1` means.
2. Implement it in `rules.ts` (`simulate` for turn mechanics, `legalMoves` for which moves
   are allowed, `status` for game end).
3. Add a golden test in `rules.zanzibar.test.ts` and do the mutation check.
4. Update `RULES.md` (rule text and decisions table) and the `roadmap.txt` checkbox.
5. If players need to see it, add a coach sentence in `describe()` and a board cue in `Board.tsx`.

**Change AI strength**
- Edit `LEVELS` in `search.ts` (depth, time, noise). For real strength, see roadmap Phase 2.
  Run the time-budget test.

**Add a worker request**
- Add it to the `WorkerRequest`/`WorkerResponse` unions in `protocol.ts`, handle it in
  `engine.worker.ts`, and add a method to `EngineClient`. Pass `rules` along.

**Add a screen**
- Create `src/screens/X.tsx`, add a case in `App.tsx` and an entry in `NAV`. Use tokens,
  `Board`, `.card`, `.btn` and `.lbl`. Check 375 px width and dark mode.

**Change the look**
- Change tokens first (`:root` and both dark blocks in `app.css`), then components. Keep
  ochre exclusive to the coach light.

## 12. Pitfalls (each of these has bitten already or easily could)

1. **Mixing frames.** Pit indices are in the owner's frame. Display names and arrows are
   in the viewer's frame. Use `cellAt`, `pitName` and `moveNotation`.
2. **Forgetting `rules`.** A call without rules silently uses ZANZIBAR. For saved games,
   always use `gameRules(game)`.
3. **StrictMode double-invokes** state initialisers and effects in dev. That's why the
   reader hand-off uses `peekSetup()` plus `clearSetup()` after mount, and Fundi's turn
   uses the `thinkingFor` ref. Keep side effects out of `useState` initialisers.
4. **Old saves:** `GameRecord.ruleset` and `Position.blocked` may be missing. Treat a
   missing ruleset as `'v1'` and a missing `blocked` as `null`.
5. **Nyumba seats:** the nyumba are diagonal (my index 4 faces their index 3). Designs and
   tests that assume they face each other are wrong.
6. **Never-ending moves** are real (one is in the tests). Don't remove the cycle check or
   the 4000-seed backstop.
7. **Performance:** `legalMoves` fully simulates every candidate, and takasia adds a
   `captureTargets` scan after each quiet move. Measure before adding per-move work.
8. **The path has a space** (`C:\dev\Seed Mind`): quote it in shell commands.
9. **Fonts load from Google Fonts**, so offline use needs self-hosted fonts (roadmap Phase 6).
10. **Git:** DiorWachira is the only contributor. Never add Claude co-author or "Generated
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
| mkononi | in hand |
| fundi | master; also the AI's name |
| mwanafunzi, mchezaji, hodari, bingwa | pupil, player, skilled, champion (level names) |
| komwe | the grey bonduc-nut seeds traditionally used |
| ply | one player's turn; a "move" in the record is a pair of plies |
