import type { PlyAnalysis } from '../engine/coach';
import type { GameRecord } from '../engine/game';
import type { RulesetId } from '../engine/ruleset';
import type { Position } from '../engine/types';

const K = {
  current: 'seedmind.current',
  games: 'seedmind.games',
  level: 'seedmind.level',
  coach: 'seedmind.coach',
  theme: 'seedmind.theme',
  setup: 'seedmind.setup',
  ruleset: 'seedmind.ruleset',
  sound: 'seedmind.sound',
  clock: 'seedmind.clock',
  lang: 'seedmind.lang',
  guide: 'seedmind.guide',
  depth: 'seedmind.reviewDepth',
  analysis: 'seedmind.analysis.',
};

export type Theme = 'auto' | 'light' | 'dark';
export type Lang = 'en' | 'sw';
export type ReviewDepth = 'quick' | 'deep';
/** 'new' = never seen; 'dismissed' = said "not now"; 'done' = finished or closed the tour. */
export type GuideState = 'new' | 'dismissed' | 'done';

function safe<T>(f: () => T): T | null {
  try { return f(); } catch { return null; }
}
function read<T>(key: string, fallback: T, store: Storage | null = safe(() => localStorage)): T {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown, store: Storage | null = safe(() => localStorage)): void {
  try { store?.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: ignore */ }
}
function remove(key: string, store: Storage | null = safe(() => localStorage)): void {
  try { store?.removeItem(key); } catch { /* ignore */ }
}

export interface CachedAnalysis {
  version: number;
  moves: number;
  ruleset: string;
  depth: ReviewDepth;
  plies: PlyAnalysis[];
}
/** Bump when the engine's scores change meaning, so old cached reviews are recomputed. */
export const ANALYSIS_VERSION = 2;

export const store = {
  currentGame: () => read<GameRecord | null>(K.current, null),
  saveCurrent: (g: GameRecord | null) => write(K.current, g),
  games: () => read<GameRecord[]>(K.games, []),
  archive(g: GameRecord) {
    const all = read<GameRecord[]>(K.games, []).filter((x) => x.id !== g.id);
    all.unshift(g);
    const kept = all.slice(0, 25);
    for (const x of all.slice(25)) remove(K.analysis + x.id);
    write(K.games, kept);
  },
  game(id: string): GameRecord | null {
    const cur = read<GameRecord | null>(K.current, null);
    if (cur?.id === id) return cur;
    return read<GameRecord[]>(K.games, []).find((g) => g.id === id) ?? null;
  },
  level: () => read<number>(K.level, 5),
  setLevel: (n: number) => write(K.level, n),
  coach: () => read<boolean>(K.coach, true),
  setCoach: (b: boolean) => write(K.coach, b),
  ruleset: () => read<RulesetId>(K.ruleset, 'zanzibar'),
  setRuleset: (r: RulesetId) => write(K.ruleset, r),
  theme: () => read<Theme>(K.theme, 'auto'),
  setTheme: (t: Theme) => write(K.theme, t),
  sound: () => read<boolean>(K.sound, true),
  setSound: (b: boolean) => write(K.sound, b),
  clock: () => read<boolean>(K.clock, false),
  setClock: (b: boolean) => write(K.clock, b),
  lang: () => read<Lang>(K.lang, 'en'),
  setLang: (l: Lang) => write(K.lang, l),
  guide: () => read<GuideState>(K.guide, 'new'),
  setGuide: (g: GuideState) => write(K.guide, g),
  reviewDepth: () => read<ReviewDepth>(K.depth, 'quick'),
  setReviewDepth: (d: ReviewDepth) => write(K.depth, d),
  analysis(id: string, moves: number, ruleset: string, depth: ReviewDepth): PlyAnalysis[] | null {
    const c = read<CachedAnalysis | null>(K.analysis + id, null);
    if (!c || c.version !== ANALYSIS_VERSION || c.moves !== moves || c.ruleset !== ruleset) return null;
    // A deep analysis also serves a quick request.
    if (depth === 'deep' && c.depth !== 'deep') return null;
    return c.plies;
  },
  /** Any cached analysis for a game (for sparklines), regardless of depth. */
  anyAnalysis(id: string): PlyAnalysis[] | null {
    const c = read<CachedAnalysis | null>(K.analysis + id, null);
    return c && c.version === ANALYSIS_VERSION ? c.plies : null;
  },
  saveAnalysis(id: string, a: Omit<CachedAnalysis, 'version'>) {
    write(K.analysis + id, { version: ANALYSIS_VERSION, ...a });
  },
  /** A position handed from the board reader to the play screen. Read is pure (StrictMode-safe); clear after mount. */
  peekSetup: () => read<{ pos: Position; ruleset?: RulesetId } | Position | null>(K.setup, null, safe(() => sessionStorage)),
  clearSetup() { remove(K.setup, safe(() => sessionStorage)); },
  putSetup: (pos: Position, ruleset: RulesetId) => write(K.setup, { pos, ruleset }, safe(() => sessionStorage)),
};
