/**
 * Game export and import: JSON (lossless), a readable text notation, and a compact share
 * code for links (#/review?g=<code>). Every format carries the ruleset, so a game always
 * replays under the rules it was played with.
 */
import { clonePosition, initialPosition, moveNotation, positionKey } from './board';
import { type GameMode, type GameRecord, gameMode, gameRules, newGame, playerName, replay, resultText } from './game';
import { moveCode, moveFromCode } from './hash';
import { legalMoves, status } from './rules';
import { RULESETS, type RulesetId } from './ruleset';
import type { Move, Position, Side } from './types';

const isStandardStart = (p: Position): boolean => positionKey(p) === positionKey(initialPosition());

/** Compact position text: "south pits;north pits;stock;nyumba;toMove;blocked". */
export function positionToText(p: Position): string {
  return [p.pits[0].join(','), p.pits[1].join(','), `${p.stock[0]},${p.stock[1]}`, `${+p.nyumba[0]}${+p.nyumba[1]}`, p.toMove, p.blocked ?? '-'].join(';');
}

export function positionFromText(s: string): Position {
  const [a, b, st, ny, tm, bl] = s.trim().split(';');
  const nums = (x: string) => x.split(',').map((v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 64) throw new Error('Bad pit count in position');
    return n;
  });
  const pa = nums(a);
  const pb = nums(b);
  const stock = nums(st);
  if (pa.length !== 16 || pb.length !== 16 || stock.length !== 2 || !/^[01]{2}$/.test(ny ?? '') || !/^[01]$/.test(tm ?? '')) throw new Error('Bad position text');
  return {
    pits: [pa, pb], stock: [stock[0], stock[1]], nyumba: [ny[0] === '1', ny[1] === '1'],
    toMove: Number(tm) as Side, blocked: bl === '-' || bl === undefined ? null : Number(bl),
  };
}

const rulesetOk = (r: unknown): r is RulesetId => RULESETS.some((x) => x.id === r);

/** Rebuilds notation and checks every move is legal. Throws on an illegal move. */
export function validated(g: GameRecord): GameRecord {
  const rules = gameRules(g);
  let p = clonePosition(g.start);
  const notation: string[] = [];
  for (const [k, m] of g.moves.entries()) {
    const c = legalMoves(p, rules).find((x) => moveCode(x.move) === moveCode(m));
    if (!c) throw new Error(`Move ${k + 1} is not legal under the ${g.ruleset ?? "v1"} rules`);
    notation.push(moveNotation(c.move, p.stock[p.toMove] > 0 && c.result.kind === 'capture', p.toMove, g.human));
    p = c.result.next;
  }
  const st = status(p, undefined, rules);
  const result = g.result ?? (st.over ? { winner: st.winner, reason: st.reason } : null);
  return { ...g, notation, result };
}

// ---------- JSON ----------

export function toJSON(g: GameRecord): string {
  return JSON.stringify({ format: 'seedmind-game', version: 1, game: g }, null, 2);
}

function fromJSON(text: string): GameRecord {
  const raw = JSON.parse(text) as { format?: string; game?: GameRecord } & Partial<GameRecord>;
  const g = (raw.format === 'seedmind-game' ? raw.game : raw) as GameRecord | undefined;
  if (!g || !Array.isArray(g.moves) || !g.start) throw new Error('This JSON is not a Seed Mind game');
  if (g.ruleset !== undefined && !rulesetOk(g.ruleset)) throw new Error(`Unknown ruleset "${String(g.ruleset)}"`);
  const base = newGame(Number(g.level) || 5, g.human === 1 ? 1 : 0, g.start, g.ruleset ?? 'v1', g.mode === 'local' ? 'local' : 'fundi');
  if (g.ruleset === undefined) delete base.ruleset;
  return validated({ ...base, id: typeof g.id === 'string' ? g.id : base.id, startedAt: g.startedAt ?? base.startedAt, moves: g.moves, result: g.result ?? null });
}

// ---------- text notation ----------

/** Readable record. Moves are written from South's seat (A/B = South's rows). */
export function toText(g: GameRecord): string {
  const ps = replay(g);
  const tags: [string, string][] = [
    ['Game', 'Bao la Kiswahili'],
    ['Ruleset', g.ruleset ?? 'v1'],
    ['Date', g.startedAt.slice(0, 10)],
    ['South', gameMode(g) === 'local' ? 'South' : playerName(g, 0) === 'You' ? 'Human' : `Fundi level ${g.level}`],
    ['North', gameMode(g) === 'local' ? 'North' : playerName(g, 1) === 'You' ? 'Human' : `Fundi level ${g.level}`],
    ['Mode', gameMode(g)],
    ['Start', isStandardStart(g.start) ? 'standard' : positionToText(g.start)],
    ['Result', g.result ? `${g.result.winner === 0 ? 'South' : 'North'} wins (${g.result.reason})` : '*'],
  ];
  const head = tags.map(([k, v]) => `[${k} "${v}"]`).join('\n');
  const toks: string[] = [];
  g.moves.forEach((m, k) => {
    const p = ps[k];
    const c = legalMoves(p, gameRules(g)).find((x) => moveCode(x.move) === moveCode(m));
    const note = moveNotation(m, p.stock[p.toMove] > 0 && c?.result.kind === 'capture', p.toMove, 0);
    if (k % 2 === 0) toks.push(`${k / 2 + 1}.`);
    toks.push(note);
  });
  const lines: string[] = [];
  let line = '';
  for (const t of toks) {
    if ((line + ' ' + t).length > 78) { lines.push(line.trim()); line = ''; }
    line += ' ' + t;
  }
  if (line.trim()) lines.push(line.trim());
  return `${head}\n\n${lines.join('\n')}\n`;
}

function fromText(text: string): GameRecord {
  const tags = new Map<string, string>();
  for (const m of text.matchAll(/\[(\w+)\s+"([^"]*)"\]/g)) tags.set(m[1], m[2]);
  const ruleset = tags.get('Ruleset') ?? 'zanzibar';
  if (!rulesetOk(ruleset)) throw new Error(`Unknown ruleset "${ruleset}"`);
  const startTag = tags.get('Start') ?? 'standard';
  const start = startTag === 'standard' ? initialPosition() : positionFromText(startTag);
  const mode: GameMode = tags.get('Mode') === 'local' ? 'local' : 'fundi';
  const human: Side = tags.get('North') === 'Human' && tags.get('South') !== 'Human' ? 1 : 0;
  const level = Number(/level (\d)/.exec(`${tags.get('South')} ${tags.get('North')}`)?.[1] ?? 5);
  const body = text.replace(/\[[^\]]*\]/g, ' ');
  const tokens = body.split(/\s+/).filter((t) => t && !/^\d+\.$/.test(t) && t !== '*');
  const g = newGame(level, human, start, ruleset, mode);
  const rules = gameRules(g);
  let p = clonePosition(start);
  const moves: Move[] = [];
  for (const [k, t] of tokens.entries()) {
    const want = t.replace(/->/g, '→').replace(/<-/g, '←').replace(/x/g, '×');
    const c = legalMoves(p, rules).find((x) => moveNotation(x.move, p.stock[p.toMove] > 0 && x.result.kind === 'capture', p.toMove, 0) === want);
    if (!c) throw new Error(`Move ${k + 1} ("${t}") is not legal here`);
    moves.push(c.move);
    p = c.result.next;
  }
  const d = tags.get('Date');
  return validated({ ...g, startedAt: d && /^\d{4}-\d\d-\d\d$/.test(d) ? `${d}T12:00:00.000Z` : g.startedAt, moves });
}

// ---------- share code ----------

const b64url = (s: string): string => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string): string => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function toShareCode(g: GameRecord): string {
  const compact = {
    v: 1,
    r: g.ruleset ?? 'v1',
    l: g.level,
    h: g.human,
    md: gameMode(g) === 'local' ? 1 : 0,
    d: g.startedAt.slice(0, 10),
    s: isStandardStart(g.start) ? undefined : positionToText(g.start),
    m: g.moves.map((m) => moveCode(m).toString(36)).join('.'),
  };
  return b64url(JSON.stringify(compact));
}

export function fromShareCode(code: string): GameRecord {
  let c: { v: number; r: string; l: number; h: number; md?: number; d?: string; s?: string; m: string };
  try { c = JSON.parse(unb64url(code.trim())); } catch { throw new Error('This share link is damaged or incomplete'); }
  if (c.v !== 1) throw new Error('This share link is from a newer version of Seed Mind');
  if (!rulesetOk(c.r)) throw new Error(`Unknown ruleset "${c.r}"`);
  const start = c.s ? positionFromText(c.s) : initialPosition();
  const g = newGame(Number(c.l) || 5, c.h === 1 ? 1 : 0, start, c.r, c.md === 1 ? 'local' : 'fundi');
  const moves = c.m ? c.m.split('.').map((x) => moveFromCode(parseInt(x, 36))) : [];
  return validated({ ...g, startedAt: c.d ? `${c.d}T12:00:00.000Z` : g.startedAt, moves });
}

/** Reads any supported format: JSON, text notation, a share code or a full share link. */
export function parseGame(input: string): GameRecord {
  const t = input.trim();
  if (!t) throw new Error('Nothing to import');
  let g: GameRecord;
  if (t.startsWith('{')) g = fromJSON(t);
  else if (t.startsWith('[') || /^\d+\.\s/.test(t)) g = fromText(t);
  else {
    const m = /[?&]g=([A-Za-z0-9_-]+)/.exec(t);
    g = fromShareCode(m ? m[1] : t);
  }
  return { ...g, imported: true };
}

export { resultText };
