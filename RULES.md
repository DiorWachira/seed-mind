# Seed Mind ruleset: Bao la Kiswahili

`src/engine/rules.ts` implements these rules; the switchable choices live in
`src/engine/ruleset.ts`. Each decision (D#) has a hand-computed test in
`src/engine/rules.zanzibar.test.ts`. Older behaviour tests are in `rules.test.ts`.

## Sources (checked 2026-11-09)

All three readable sources are secondary transcriptions of Alexander de Voogt's
record of the Zanzibar masters' rules (1991–95):

| Key | Source | Notes |
|-----|--------|-------|
| RP | rulespal.com, "Bao rulebook" (based on de Voogt 1995) | Most complete prose rulebook |
| W | Wikipedia, "Bao (game)", and gambiter.com's Bao page (same de Voogt-based text) | Short |
| A | K.I.B.A. "Bao: sum-up of rules", revised by N. Vessella (abstractstrategygames.blogspot.com, 2011) | Most detailed; numbered sections; some broken cross-references |

These primary sources could not be reached and are **still to check**:
- de Voogt, *Limits of the Mind* (1995): the Scribd copy is truncated;
- Donkers & Uiterwijk, "Programming Bao" (2002): the archive copy is blocked;
- Kronenburg, Donkers & de Voogt, "Never-Ending Moves in Bao", *ICGA Journal* 29(2), 2006: abstract only;
- Rob Nierse's Game Cabinet rules: connection refused.

Board Game Arena's Bao help page describes a simplified game with no namua, so it was not used.

## Rulesets

| Id | Name | Use |
|----|------|-----|
| `zanzibar` | Zanzibar (de Voogt) | **Default** for new games |
| `v1` | Simplified (Seed Mind 0.1) | The 0.1.0 rules; kept so games saved by 0.1.0 (no `ruleset` field) replay exactly |

## Board and names

- 4 × 8 pits. Each player owns an inner (front) row and an outer (back) row.
- Code frame for each side: `0..7` is the inner row from the owner's left to right, and
  `8..15` is the outer row from right to left. `+1` is clockwise. Inner pit `i` faces the
  opponent's inner pit `7 - i`.
- **Nyumba** = inner index 4 (5th from the owner's left). The two nyumba sit diagonally.
  [RP, W, A]
- **Kichwa** = inner 0 (left, clockwise) and 7 (right, anticlockwise). [RP, W, A]
- **Kimbi** = inner 1 and 6 (the 2nd and 7th pits). [RP; W gives this as an alternative]
- Screen names come from the viewer's seat: A own inner, B own outer, C opponent inner,
  D opponent outer, columns 1–8 counted from the viewer's left.

## Setup

64 kete. Each side has 6 in the nyumba, 2 in each of the next two inner pits to its right,
and 22 in hand. [RP, W, A] South moves first by default.

## Namua (while the mover has kete in hand)

1. Put one kete from hand into a **non-empty inner pit**. [RP, W, A]
2. If that pit faces a non-empty opponent pit, it is a **capture turn**. Take every kete in
   the facing pit and sow them starting **in** a kichwa (see D1, D2). The placed pit itself
   is not sown. [RP, A]
3. Otherwise it is a **takasa** turn, with no captures all turn: lift the pit (with the
   placed kete) and sow it either way. [RP, W, A] A takasa may not start in the outer row. [A]
4. Captures are compulsory. [RP, W, A]

## Mtaji (once the mover's hand is empty)

1. Lift any own pit (inner or outer) holding **2 or more** kete and sow it either way. A
   single kete never starts a move. [RP, W, A]
2. If the last kete of this **first lap** lands in an occupied inner pit facing a non-empty
   opponent pit, it is a capture turn; otherwise it is takasa. [W, A]
3. A first sowing of **more than 15** kete is always takasa. [W, A]
4. Captures are compulsory. A takasa must start from the inner row if any inner pit holds
   2+ kete; otherwise the outer row may be used. [RP, W, A]

## Sowing (both stages)

After each sowing lands in pit `p`:
- `p` was empty: the turn ends. [RP, W, A]
- Capture turn, and `p` is inner with a non-empty facing pit: capture again (D1, D2).
- `p` is the mover's working nyumba (D3): a takasa turn ends there; a capture turn offers
  **stop** or **safari** (lift the whole house and go on, which ends its powers).
- `p` is the takasia-blocked pit on a takasa turn: the turn ends (D8).
- Otherwise relay: lift all of `p` and keep sowing in the same direction. [RP, W, A]

## Decisions

| # | Rule as implemented | Evidence | Status |
|---|---------------------|----------|--------|
| D1 | Captures in the kichwa or kimbi (inner 0, 1, 6, 7) re-enter from the **nearest kichwa** | RP "no choice … kichwa or kimbi"; A 1.4.5; W | **Confirmed.** All three sources produce the same behaviour |
| D2 | Free kichwa choice only for a capture with no sowing direction yet (a namua capture from a middle pit). Every later capture, and the first capture of a mtaji turn, keeps the current direction | RP summary; A 1.4.3, 1.6.1, 2.2.2, 3.4.1; W | **Confirmed** |
| D3 | The nyumba keeps its powers in **both stages**, but only while it holds **6 or more** kete (counting the kete that has just landed). It is lost when its whole content is sown (safari, or sowing it while under 6), when it is captured, or when it is emptied | RP "do not apply if fewer than six"; A 4.2.1.3; W (powers until first sown; no stage limit) | **Changed in Phase 1** (0.1 had namua only and no threshold). A 3.2 says ownership in mtaji ends at "the first harvest", which is unclear and not adopted. Option `nyumbaStages`, `nyumbaMinSeeds` |
| D3b | **Mtaji taxing:** a mtaji turn started from a working nyumba sows only 2 kete, and the house keeps its powers | W (mtaji taxing); A silent | Adopted from W. Option `mtajiTaxing`. W also lists variants (taxing only when no other move; safari compulsory), which are not implemented |
| D4 | Namua takasa may not start from a working nyumba unless it is the only filled inner pit; then it is **taxed** (put a kete in, sow 2) | RP "Only your nyumba remaining"; A 2.3.2 | **Confirmed** (now also needs 6+, per D3) |
| D5 | A never-ending sowing is illegal. It is detected exactly: once more than 160 kete have been sown, any repeat of the full in-turn state means a loop (with a 4000-kete backstop). If only never-ending moves remain, the player has no legal move and loses | A 1.5.6 (illegal; no finite move = loss); RP (no draws); the 2006 ICGA note confirms these moves exist | **Confirmed** (A); exact detection added in Phase 1. A real example is in the tests |
| D6 | A player with an empty inner row has lost, even with kete in hand | A 1.2.1; RP; W | **Confirmed** |
| D7 | The game ends as soon as an inner row is empty, **including your own**: emptying your own front row loses at once | A 1.2.1, 1.5.3.1, 3.3.2; W | **Changed in Phase 1** (0.1 only checked the side to move) |
| D8 | **Takasia / mtaji moja** (mtaji stage): after a takasa turn that leaves the mover exactly **one** capture, that threatened opponent pit is blocked for the opponent's next turn. If that turn is also takasa, it may not start from the blocked pit, and a relay landing on it stops there. Exemptions: the opponent's working nyumba, its only filled inner pit, or its only inner pit with 2+. If every takasa start is blocked, the block is waived | RP (mtaji moja, in the mtaji section); A 5.1, 5.1.1, 1.6.3 | **Added in Phase 1.** RP and A word this differently and A's text is garbled, so this is a best reading. Option `takasia` (`off` / `mtaji` / `always`) |
| D9 | *Not adopted:* A 2.3.3 bans starting a namua takasa from a single-kete pit when the house is lost and other pits hold 2+ | Only A, and its wording is unclear | Open |
| D10 | Stage is per player: you are in namua while **you** have kete in hand | A 3.1 says "global", but the hands empty together in normal play | Same result in normal games; differs only for positions entered in the board reader |
| D11 | Captured kete keep sowing round both your rows if there are enough of them | A, W (relay loop); RP "in your front row" is ambiguous | Open |

## Open questions to settle with a primary source

- D3: the exact moment the nyumba stops working in mtaji (first capture in A, versus first
  time its content is sown in W).
- D3b: whether mtaji taxing is optional, compulsory, or only allowed when there is no other move.
- D8: whether takasia also applies in namua, and whether it applies when the blocked side
  can capture.
- D9 and D11, above.
