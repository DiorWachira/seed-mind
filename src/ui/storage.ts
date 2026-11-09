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
};

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
function safe<T>(f: () => T): T | null {
  try { return f(); } catch { return null; }
}

export const store = {
  currentGame: () => read<GameRecord | null>(K.current, null),
  saveCurrent: (g: GameRecord | null) => write(K.current, g),
  games: () => read<GameRecord[]>(K.games, []),
  archive(g: GameRecord) {
    const all = read<GameRecord[]>(K.games, []).filter((x) => x.id !== g.id);
    all.unshift(g);
    write(K.games, all.slice(0, 25));
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
  theme: () => read<'auto' | 'light' | 'dark'>(K.theme, 'auto'),
  setTheme: (t: 'auto' | 'light' | 'dark') => write(K.theme, t),
  /** A position handed from the board reader to the play screen. Read is pure (StrictMode-safe); clear after mount. */
  peekSetup: () => read<Position | null>(K.setup, null, safe(() => sessionStorage)),
  clearSetup() { try { safe(() => sessionStorage)?.removeItem(K.setup); } catch { /* ignore */ } },
  putSetup: (p: Position) => write(K.setup, p, safe(() => sessionStorage)),
};
