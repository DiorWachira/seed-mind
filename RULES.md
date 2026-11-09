# Seed Mind ruleset: Bao la Kiswahili

`src/engine/rules.ts` implements these rules; the switchable choices live in
`src/engine/ruleset.ts`. Each decision (D#) has a hand-computed test in
`src/engine/rules.zanzibar.test.ts` (D1–D8) or `src/engine/rules.donkers.test.ts` (D9, D12,
D13 and the published game). Older behaviour tests are in `rules.test.ts`.

## Sources (checked 2026-11-09)

All three readable sources are secondary transcriptions of Alexander de Voogt's
record of the Zanzibar masters' rules (1991–95):

| Key | Source | Notes |
|-----|--------|-------|
| RP | rulespal.com, "Bao rulebook" (based on de Voogt 1995) | Most complete prose rulebook |
| W | Wikipedia, "Bao (game)", and gambiter.com's Bao page (same de Voogt-based text) | Short |
| A | K.I.B.A. "Bao: sum-up of rules", revised by N. Vessella (abstractstrategygames.blogspot.com, 2011) | Most detailed; numbered sections; some broken cross-references |

Added 2026-11-09 (Seed Mind 0.3):

| Key | Source | Notes |
|-----|--------|-------|
| DK | J. Donkers, *Nosce Hostem* (PhD thesis, Universiteit Maastricht, 2003), **appendix C "Zanzibar Bao Rules for the Computer"**, pp. 163–168, "based on De Voogt's (1995) thesis"; [PDF](https://project.dke.maastrichtuniversity.nl/games/files/phd/Donkers_thesis.pdf) | Numbered rules (1.1–4.1c), a notation, and a **complete master game** (figure C.4: Ramadhan v Kijumbe, Zanzibar, 17-10-1994). The closest thing to a primary source we can read; it is written by de Voogt's later co-author and adapted for computer play |

Still not reached (**to check**):
- de Voogt, *Limits of the Mind* (1995): the Scribd copy is truncated;
- Donkers & Uiterwijk, "Programming Bao" (2002): the CiteSeerX copy was not fetched;
- Kronenburg, Donkers & de Voogt, "Never-Ending Moves in Bao", *ICGA Journal* 29(2), 2006: abstract only;
- Rob Nierse's Game Cabinet rules: connection refused.

Board Game Arena's Bao help page describes a simplified game with no namua, so it was not used.

## Rulesets

| Id | Name | Use |
|----|------|-----|
| `zanzibar` | Zanzibar (de Voogt) | The default for new games until 0.3.1; still offered, and still the engine's fallback when no rules are passed |
| `donkers` | Zanzibar, computer rules (Donkers) | **Default for new games since 0.3.1.** DK's computer rules: nyumba works in namua only, no mtaji taxing, D9 single-kete restriction, D12 no lone-kichwa suicide, D13 safari choice at any house size, any house exempt from takasia. Added in 0.3 |
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
| D3 | The nyumba keeps its powers in **both stages**, but only while it holds **6 or more** kete (counting the kete that has just landed). It is lost when its whole content is sown (safari, or sowing it while under 6), when it is captured, or when it is emptied | RP "do not apply if fewer than six"; A 4.2.1.3; W (powers until first sown; no stage limit) | **Changed in Phase 1** (0.1 had namua only and no threshold). A 3.2 says ownership in mtaji ends at "the first harvest". **DK 3.2 sides with A: no powers in mtaji** (see below), adopted in `donkers`. Option `nyumbaStages`, `nyumbaMinSeeds` |
| D3b | **Mtaji taxing:** a mtaji turn started from a working nyumba sows only 2 kete, and the house keeps its powers | W (mtaji taxing); A silent | Adopted from W. Option `mtajiTaxing`. W also lists variants (taxing only when no other move; safari compulsory), which are not implemented. **DK has no mtaji taxing** (`donkers`) |
| D4 | Namua takasa may not start from a working nyumba unless it is the only filled inner pit; then it is **taxed** (put a kete in, sow 2) | RP "Only your nyumba remaining"; A 2.3.2 | **Confirmed** (now also needs 6+, per D3) |
| D5 | A never-ending sowing is illegal. It is detected exactly: once more than 160 kete have been sown, any repeat of the full in-turn state means a loop (with a 4000-kete backstop). If only never-ending moves remain, the player has no legal move and loses | A 1.5.6 (illegal; no finite move = loss); RP (no draws); the 2006 ICGA note confirms these moves exist | **Confirmed** (A); exact detection added in Phase 1. A real example is in the tests |
| D6 | A player with an empty inner row has lost, even with kete in hand | A 1.2.1; RP; W | **Confirmed** |
| D7 | The game ends as soon as an inner row is empty, **including your own**: emptying your own front row loses at once | A 1.2.1, 1.5.3.1, 3.3.2; W | **Changed in Phase 1** (0.1 only checked the side to move) |
| D8 | **Takasia / mtaji moja** (mtaji stage): after a takasa turn that leaves the mover exactly **one** capture, that threatened opponent pit is blocked for the opponent's next turn. If that turn is also takasa, it may not start from the blocked pit, and a relay landing on it stops there. Exemptions: the opponent's working nyumba, its only filled inner pit, or its only inner pit with 2+. If every takasa start is blocked, the block is waived | RP (mtaji moja, in the mtaji section); A 5.1, 5.1.1, 1.6.3 | **Added in Phase 1.** RP and A word this differently and A's text is garbled, so this is a best reading. Option `takasia` (`off` / `mtaji` / `always`) |
| D8b | Which house is exempt from takasia: a *working* nyumba (`zanzibar`), or the nyumba pit always (`donkers`) | RP; DK 4.1a "if it is the house", 4.1c | Option `takasiaHouse` |
| D9 | A namua takasa may not start from a single-kete pit while another front pit holds 2+, **unless the house is still owned** (even under 6) | A 2.3.3; **DK 2.4c** (clear wording) | **Confirmed by DK.** Adopted in `donkers` (option `namuaSingleKete`); not in `zanzibar`, whose meaning is fixed |
| D10 | Stage is per player: you are in namua while **you** have kete in hand | A 3.1 says "global", but the hands empty together in normal play | Same result in normal games; differs only for positions entered in the board reader |
| D11 | Captured kete keep sowing round both your rows if there are enough of them | A, W (relay loop); DK 1.3/1.4 ("sowing them … at the own side", own two rows); RP "in your front row" is ambiguous | **Confirmed by DK** |
| D12 | A takasa from a lone kichwa (the only filled front pit) toward the back row: legal and loses at once (`zanzibar`, D7), or **illegal** (`donkers`) | DK 2.4a, 3.5b | Option `kichwaToBack`. Same outcome for a sensible player; matters for move lists and weak levels |
| D13 | In a capture turn that ends in the owned nyumba, the stop/safari choice: only while it holds 6+ (`zanzibar`), or **at any size** (`donkers`) | DK 2.5b(2) states no minimum for capture moves (6+ only for takasa) | Option `safariMinSeeds`; DK may simply omit the threshold |

### What DK says about D3, D3b and D8

- **D3 (nyumba in mtaji):** DK 2.5a/3.2: the house stays *owned* until the first capture in
  mtaji, but "the namua rules for the house (2.4b, 2.4c and 2.5b) do not apply anymore": no
  stop, no safari, no taxing in mtaji. This is A's "first harvest" reading, against W's. The
  `donkers` ruleset adopts it (`nyumbaStages: 'namua'`). Ownership after namua only matters for
  takasia, and `donkers` exempts the house pit always, so it is not tracked further.
- **D3b (mtaji taxing):** DK has no mtaji taxing (`mtajiTaxing: false` in `donkers`).
- **D8 (takasia):** DK 4.1: "(This can only happen in mtaji stage.)", and only when the
  opponent "also must takasa next move". Seed Mind's block only restricts takasa turns, so a
  side that can capture is never affected: the same behaviour.

## Published game

DK figure C.4, **Ramadhan v Kijumbe (Zanzibar, 17 October 1994, North wins, South resigns
after move 26)**, is in `src/engine/goldenGames.ts`. Every one of its 52 plies matches exactly
one legal turn of ours, with the same capture/takasa classification, under **all three**
rulesets; North's 12th move ends in the nyumba and North plays the house on move 15, as the
record says. So the game confirms the engine but does not decide between the readings: none
of its moves touch D3, D9, D12 or D13.

## Default ruleset (decided 2026-11-09, 0.3.1)

New games use **`donkers`**. DK is written directly from de Voogt 1995, so it is closer to the
masters' rules than the three secondary transcriptions behind `zanzibar`. Where those
transcriptions disagree, DK takes A's side on D3 (no nyumba powers in mtaji), while `zanzibar`
followed W alone; and D9 is in both A and DK. The weak point is D13 (DK may have left out the
6-kete minimum for the safari choice); it only matters in rare namua positions. Saved games keep
the ruleset they were played with, and a player's own choice in Play is kept.

## Open questions to settle with a primary source

- D13: whether DK's missing 6-kete threshold for the safari choice is deliberate.
- DK 1.2: "the game ends if the front row of a player is empty (**even during a move**)".
  Seed Mind only checks at the end of a turn. Not implemented in any ruleset yet.
- D3b variants in W (taxing only when there is no other move; safari compulsory).
- de Voogt 1995 itself, to compare with DK's computer adaptation.
