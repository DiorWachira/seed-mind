# Seed Mind

Bao la Kiswahili engine and coach (Vite + React + TypeScript).

- Start here: read `roadmap.txt` (status and next work), then `docs/PROJECT_GUIDE.md` (how everything works, recipes, pitfalls), then `RULES.md` (the ruleset spec).
- Checks: `npm test`, `npm run typecheck`, `npm run e2e`, `npm run build`. Quote the path; it has a space.
- Live: https://diorwachira.github.io/seed-mind/ (GitHub Pages; pushing to `main` deploys after tests pass).
- Any rules change updates rules.ts (or a new RuleOptions switch), RULES.md and a test together. Never change what an existing ruleset id means.
- Always pass the game's rules (`gameRules(game)`) to engine calls.
- Pit indices are in the owner's frame (0..7 inner left→right, 8..15 outer right→left); use `pitName`/`cellAt`/`moveNotation` for anything shown on screen.
- Ochre is reserved for the coach light.
- After finishing work, update the status, checkboxes and changelog in `roadmap.txt`.
- Git: DiorWachira is the only contributor; no Claude trailers; commit only when asked.
