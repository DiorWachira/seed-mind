import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clonePosition, initialPosition, moveNotation, other, pitName, positionKey, sameMove } from '../engine/board';
import { whyNot, type Advice, type WhyNot } from '../engine/coach';
import { gameMode, gameRules, newGame, playerName, replay, resultText, seatName, type GameMode, type GameRecord } from '../engine/game';
import { moveCode } from '../engine/hash';
import { legalMoves, playTraced, status } from '../engine/rules';
import { RULESETS, type RulesetId } from '../engine/ruleset';
import { LEVELS, levelInfo } from '../engine/search';
import type { Candidate, Move, Position, Side, SowEvent } from '../engine/types';
import { Board, Heap } from '../ui/Board';
import { engine } from '../ui/engineClient';
import { useT, type T } from '../ui/i18n';
import { prefersReducedMotion } from '../ui/route';
import { useShell } from '../ui/shell';
import { sound } from '../ui/sound';
import { store } from '../ui/storage';

function startingGame(level: number): GameRecord {
  const setup = store.peekSetup();
  if (setup) {
    const pos = 'pos' in setup ? setup.pos : setup;
    const rs = 'pos' in setup && setup.ruleset ? setup.ruleset : store.ruleset();
    return newGame(level, 0, pos, rs);
  }
  const cur = store.currentGame();
  if (cur && !cur.result && !cur.imported) return cur;
  return newGame(level, 0, initialPosition(), store.ruleset());
}

function optionLabel(t: T, pos: Position, c: Candidate): string {
  const namua = pos.stock[pos.toMove] > 0;
  const { move: m, result: r } = c;
  let s: string;
  if (namua && r.kind === 'capture') {
    s = m.kichwa === null ? t('Capture') : m.kichwa === 0 ? t('Capture, re-sow from the left kichwa') : t('Capture, re-sow from the right kichwa');
  } else {
    s = m.dir === 1 ? t('Sow clockwise →') : t('Sow anticlockwise ←');
    if (r.taxed) s += ` ${t('(tax two from the nyumba)')}`;
  }
  if (m.safari === true) s += `, ${t('then safari from the nyumba')}`;
  if (m.safari === false) s += `, ${t('stop in the nyumba')}`;
  s += r.kind === 'capture' ? ` · ${t('takes {n}', { n: r.captured })}` : ` · ${t('no capture')}`;
  return s;
}

const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const overlayOpen = () => !!document.querySelector('.tour, .drawer-wrap');
const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
};

export function Play() {
  const t = useT();
  const { openHelp } = useShell();
  const [level, setLevel] = useState<number>(store.level());
  const [coachOn, setCoachOn] = useState<boolean>(store.coach());
  const [ruleset, setRuleset] = useState<RulesetId>(store.ruleset());
  const [mode, setMode] = useState<GameMode>('fundi');
  const [seat, setSeat] = useState<Side>(0);
  const [clockOn, setClockOn] = useState<boolean>(store.clock());
  const [game, setGame] = useState<GameRecord>(() => startingGame(store.level()));
  const rules = useMemo(() => gameRules(game), [game]);
  const positions = useMemo(() => replay(game), [game]);
  const pos = positions[positions.length - 1];
  const cands = useMemo(() => legalMoves(pos, rules), [pos, rules]);
  const st = useMemo(() => status(pos, cands, rules), [pos, cands, rules]);
  const local = gameMode(game) === 'local';
  const over = st.over || !!game.result;

  const [busy, setBusy] = useState<'idle' | 'animating' | 'thinking'>('idle');
  const [display, setDisplay] = useState<Position | null>(null);
  const [hot, setHot] = useState<[Side, number] | null>(null);
  const [hand, setHand] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [advice, setAdvice] = useState<{ key: string; a: Advice | null } | null>(null);
  const [why, setWhy] = useState<{ key: string; w: WhyNot } | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [message, setMessage] = useState('');
  const [, setTick] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const skip = useRef<() => void>(() => {});
  const gameRef = useRef(game);
  gameRef.current = game;
  const turnStart = useRef(Date.now());

  const human = game.human;
  const fundi = other(human);
  const viewer: Side = local ? pos.toMove : human;
  const mine = local || pos.toMove === human;
  const humanTurn = !over && view === null && mine && busy === 'idle';
  const key = positionKey(pos);

  useEffect(() => {
    store.clearSetup();
    return () => window.clearTimeout(timer.current);
  }, []);

  // A new position starts the mover's clock.
  useEffect(() => { turnStart.current = Date.now(); }, [key]);
  useEffect(() => {
    if (!clockOn || over) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [clockOn, over]);

  // Persist the game; archive it once it is over.
  useEffect(() => {
    if (st.over && !game.result) {
      const done = { ...game, result: { winner: st.winner, reason: st.reason } };
      setGame(done);
      store.archive(done);
      store.saveCurrent(done);
      return;
    }
    store.saveCurrent(game);
  }, [game, st]);

  const animate = useCallback((start: Position, events: SowEvent[]) => new Promise<void>((resolve) => {
    if (prefersReducedMotion()) {
      if (events.some((e) => e.t === 'capture')) sound.capture(); else sound.end();
      resolve();
      return;
    }
    const d = clonePosition(start);
    const sows = events.filter((e) => e.t === 'sow').length;
    const sowMs = Math.max(22, Math.min(110, 4200 / Math.max(1, sows)));
    let h = 0;
    let k = 0;
    setBusy('animating');
    const finish = () => { window.clearTimeout(timer.current); setDisplay(null); setHot(null); setHand(0); skip.current = () => {}; resolve(); };
    skip.current = finish;
    const step = () => {
      if (k >= events.length) { finish(); return; }
      const e = events[k++];
      let wait = sowMs;
      if (e.t === 'place') { d.pits[e.side][e.pit]++; d.stock[e.side]--; wait = 280; sound.place(); }
      else if (e.t === 'lift') { d.pits[e.side][e.pit] -= e.n; h += e.n; wait = 230; sound.lift(); }
      else if (e.t === 'sow') { d.pits[e.side][e.pit]++; h--; sound.sow(e.pit); }
      else if (e.t === 'capture') { d.pits[e.side][e.pit] = 0; h += e.n; wait = 450; sound.capture(); }
      else { wait = 120; sound.end(); }
      setDisplay(clonePosition(d));
      setHot([e.side, e.pit]);
      setHand(h);
      timer.current = window.setTimeout(step, wait);
    };
    step();
  }), []);

  const playMove = useCallback(async (move: Move) => {
    const g = gameRef.current;
    const ps = replay(g);
    const before = ps[ps.length - 1];
    const tr = playTraced(before, move, gameRules(g));
    const spent = Date.now() - turnStart.current;
    setSelected(null);
    setWhy(null);
    setMessage('');
    setView(null);
    await animate(before, tr.events);
    const label = moveNotation(move, before.stock[before.toMove] > 0 && tr.kind === 'capture', before.toMove, g.human);
    if (gameRef.current.id !== g.id || gameRef.current.moves.length !== g.moves.length) { setBusy('idle'); return; }
    const clock: [number, number] = [...(g.clock ?? [0, 0])] as [number, number];
    clock[before.toMove] += spent;
    setGame({ ...g, moves: [...g.moves, move], notation: [...g.notation, label], clock });
    setBusy('idle');
  }, [animate]);

  // Fundi's turn. thinkingFor makes this fire once per position (StrictMode-safe);
  // a reply for a game that has since changed (restart, take back) is dropped.
  const thinkingFor = useRef<string | null>(null);
  useEffect(() => {
    if (local || over || pos.toMove !== fundi || busy !== 'idle') return;
    if (thinkingFor.current === `${game.id}:${key}`) return;
    thinkingFor.current = `${game.id}:${key}`;
    setBusy('thinking');
    const gid = game.id;
    const plies = game.moves.length;
    const started = Date.now();
    const stale = () => gameRef.current.id !== gid || gameRef.current.moves.length !== plies || !!gameRef.current.result;
    engine('play').think(pos, level, rules).then((m) => {
      const wait = Math.max(0, 450 - (Date.now() - started));
      window.setTimeout(() => {
        if (stale()) { setBusy('idle'); return; }
        if (m) void playMove(m); else setBusy('idle');
      }, wait);
    }).catch((e: Error) => { if (!stale()) { setMessage(t('Engine error: {m}', { m: e.message })); setBusy('idle'); } });
  }, [key, over, busy, fundi, pos, level, game.id, game.moves.length, playMove, rules, local, t]);

  // Coach light for whoever is to move (the human, or either player in pass-and-play).
  useEffect(() => {
    if (!coachOn || !humanTurn || advice?.key === key) return;
    let live = true;
    engine('coach').advise(pos, rules).then((a) => { if (live) setAdvice({ key, a }); }).catch(() => {});
    return () => { live = false; };
  }, [key, coachOn, humanTurn, advice?.key, pos, rules]);

  const tip = coachOn && humanTurn && advice?.key === key ? advice.a : null;
  const options = selected === null || !humanTurn ? [] : cands.filter((c) => c.move.pit === selected);
  const pickablePits = useMemo(() => new Set(cands.map((c) => c.move.pit)), [cands]);
  const viewing = view !== null;
  const shown = display ?? (viewing ? positions[view] : pos);
  const namua = pos.stock[pos.toMove] > 0;
  const L = levelInfo(level);
  const whyNow = why?.key === key ? why.w : null;

  const restart = () => {
    window.clearTimeout(timer.current);
    skip.current();
    const start = initialPosition();
    thinkingFor.current = null;
    setDisplay(null);
    setBusy('idle');
    setAdvice(null);
    setSelected(null);
    setWhy(null);
    setView(null);
    setConfirmResign(false);
    setMessage('');
    setGame(newGame(level, mode === 'local' ? 0 : seat, start, ruleset, mode));
  };

  const takeBack = () => {
    const g = gameRef.current;
    if (busy !== 'idle' || g.moves.length === 0) return;
    const ps = replay(g);
    let n = g.moves.length;
    if (gameMode(g) === 'local') n--;
    else {
      // Undo back to (and including) the human's last move.
      do { n--; } while (n > 0 && ps[n].toMove !== human);
      if (ps[n].toMove !== human) return;
    }
    thinkingFor.current = null;
    setView(null);
    setSelected(null);
    setWhy(null);
    setGame({ ...g, moves: g.moves.slice(0, n), notation: g.notation.slice(0, n), result: null });
  };

  const resign = () => {
    if (!confirmResign) { setConfirmResign(true); return; }
    setConfirmResign(false);
    const loser = local ? pos.toMove : human;
    const done = { ...gameRef.current, result: { winner: other(loser), reason: 'resign' as const } };
    window.clearTimeout(timer.current);
    skip.current();
    setBusy('idle');
    setGame(done);
    store.archive(done);
  };

  const step = useCallback((to: 'back' | 'fwd' | 'first' | 'live') => {
    const len = gameRef.current.moves.length;
    if (len === 0) return;
    setSelected(null);
    setView((v) => {
      if (to === 'first') return 0;
      if (to === 'live') return null;
      if (to === 'back') return v === null ? len - 1 : Math.max(0, v - 1);
      if (v === null) return null;
      return v + 1 >= len ? null : v + 1;
    });
  }, []);

  // Keys: ← → Home End step through the record, S skips the animation, C toggles the coach.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || overlayOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); step('back'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step('fwd'); }
      else if (e.key === 'Home') { e.preventDefault(); step('first'); }
      else if (e.key === 'End') { e.preventDefault(); step('live'); }
      else if (e.key === 's' || e.key === 'S') skip.current();
      else if (e.key === 'c' || e.key === 'C') setCoachOn((c) => { store.setCoach(!c); return !c; });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  // Record table: columns in order of play.
  const first = game.start.toMove;
  const pairs: { n: number; cells: [number | null, number | null] }[] = [];
  positions.slice(0, -1).forEach((p, k) => {
    const col = p.toMove === first ? 0 : 1;
    let row = pairs[pairs.length - 1];
    if (!row || row.cells[col] !== null || (col === 0 && row.cells[1] !== null)) { row = { n: pairs.length + 1, cells: [null, null] }; pairs.push(row); }
    row.cells[col] = k;
  });

  const name = (s: Side) => t(playerName(game, s));
  let headline: string;
  if (game.result) {
    const w = game.result.winner;
    headline = local ? t('{seat} won', { seat: t(seatName(w)) }) : w === human ? t('You won') : t('Fundi won');
  } else if (st.over) headline = t('Game over');
  else if (busy === 'thinking') headline = t('Fundi is thinking…');
  else if (busy === 'animating') headline = local ? t('{seat} is sowing…', { seat: t(seatName(pos.toMove)) }) : pos.toMove === human ? t('Sowing…') : t('Fundi is sowing…');
  else if (viewing) headline = view === 0 ? t('Looking back · the start') : t('Looking back · after ply {k}', { k: view });
  else if (local) headline = t('Move {n} · {seat} to play', { n: Math.floor(game.moves.length / 2) + 1, seat: t(seatName(pos.toMove)) });
  else headline = t('Move {n} · your turn', { n: Math.floor(game.moves.length / 2) + 1 });

  const selHint = (() => {
    if (!humanTurn) return '';
    const tie = pos.blocked != null ? ` ${t('Takasia: you may not empty {pit} on a quiet turn.', { pit: pitName(viewer, pos.toMove, pos.blocked) })}` : '';
    if (selected === null) return (namua
      ? t('Pick an inner pit (row A) to place a kete from your hand.')
      : t('Pick a pit with two or more kete to lift and sow.')) + tie;
    return options.length === 1 ? t('One way to play this pit.') : t('{n} ways to play this pit. Choose one.', { n: options.length });
  })();

  const clockFor = (s: Side) => {
    const base = game.clock?.[s] ?? 0;
    return base + (!over && pos.toMove === s && view === null ? Date.now() - turnStart.current : 0);
  };
  const topSide = other(viewer);

  return (
    <div className="play">
      <section aria-label={t('Game')} className="stack" style={{ gap: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 className="disp play-h" aria-live="polite">{headline}</h1>
          <p className="lbl">{over ? t('Game over') : namua ? t('Namua · placing from the hand') : t('Mtaji · sowing from the board')} · {t(RULESETS.find((r) => r.id === (game.ruleset ?? 'v1'))?.name ?? '')}</p>
        </div>

        {game.result && (
          <div className="banner" role="status">
            <p style={{ fontSize: 17 }}>{t(resultText(game).split(' · ')[1] ?? '')}.</p>
            <div className="row">
              <a className="btn go" href={`#/review?id=${game.id}`}>{t('Review this game')}</a>
              <button type="button" className="btn" onClick={restart}>{t('New game')}</button>
            </div>
          </div>
        )}

        {viewing && (
          <div className="history-bar" role="group" aria-label={t('Step through the game')}>
            <span className="lbl">{t('Viewing an earlier position')}</span>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn small sq" onClick={() => step('first')} aria-label={t('First position')} disabled={view === 0}>⏮</button>
              <button type="button" className="btn small sq" onClick={() => step('back')} aria-label={t('Previous ply')} disabled={view === 0}>◀</button>
              <button type="button" className="btn small sq" onClick={() => step('fwd')} aria-label={t('Next ply')}>▶</button>
              <button type="button" className="btn small go" onClick={() => step('live')}>{t('Back to the game')}</button>
            </div>
          </div>
        )}

        <div className="strip">
          <div className="stack" style={{ gap: 2 }}>
            <span className="who">{name(topSide)}</span>
            <span className="muted" style={{ fontSize: 14 }}>
              {!local && topSide === fundi ? `${L.name} (${t(L.gloss)}) · ${t('level {n}', { n: level })}` : t('{seat} seat · rows C and D from here', { seat: t(seatName(topSide)) })}
            </span>
          </div>
          <div className="hand">
            {clockOn && <span className="clock num" aria-label={t('Time used')}>{fmtClock(clockFor(topSide))}</span>}
            <Heap n={shown.stock[topSide]} /><span className="num" style={{ fontSize: 15 }}><strong>{shown.stock[topSide]}</strong> {t('mkononi (in hand)')}</span>
          </div>
        </div>

        <div data-tour="play-board" className={`board-wrap${viewing ? ' past' : ''}`}>
          <Board
            pos={shown}
            viewer={viewer}
            label={t('Bao board. Rows from the top: D and C are the far side’s back and front rows, A and B are the near side’s front and back rows.')}
            onPick={humanTurn ? (i) => { setSelected(i === selected ? null : i); setWhy(null); } : undefined}
            pickable={(i) => pickablePits.has(i)}
            selected={selected}
            coach={tip && !viewing ? { start: tip.startPit, targets: tip.targets, path: tip.path } : null}
            hot={hot}
          />
        </div>

        <div className="strip" data-tour="play-hand">
          <div className="stack" style={{ gap: 2 }}>
            <span className="who">{local ? t(seatName(viewer)) : t('Wewe (you)')}</span>
            <span className="muted" style={{ fontSize: 14 }}>{t('Rows A (front) and B (back), columns 1–8 from your seat')}</span>
          </div>
          <div className="hand">
            {busy === 'animating' && hand > 0 && <span className="lbl num">{t('{n} in the sowing hand', { n: hand })}</span>}
            {clockOn && <span className="clock num" aria-label={t('Time used')}>{fmtClock(clockFor(viewer))}</span>}
            <Heap n={shown.stock[viewer]} /><span className="num" style={{ fontSize: 15 }}><strong>{shown.stock[viewer]}</strong> {t('mkononi (in hand)')}</span>
          </div>
        </div>

        <div className="card stack" style={{ gap: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="stack" style={{ gap: 4 }}>
              <span className="lbl">{t('Your move')}</span>
              <span style={{ fontSize: 19, fontWeight: 600 }}>
                {selected === null ? (humanTurn ? t('Choose a pit') : t('Waiting')) : `${pitName(viewer, pos.toMove, selected)} · ${t('{n} kete', { n: pos.pits[pos.toMove][selected] })}`}
              </span>
              <span className="muted" style={{ fontSize: 15 }}>{selHint}</span>
            </div>
            <div className="row">
              {busy === 'animating' && <button type="button" className="btn small" onClick={() => skip.current()} aria-keyshortcuts="S">{t('Skip animation')}</button>}
              <button type="button" className="btn small" onClick={takeBack} disabled={busy !== 'idle' || game.moves.length === 0}>{t('Take back')}</button>
              {!over && (
                <button type="button" className={`btn small${confirmResign ? ' warn' : ''}`} onClick={resign} onBlur={() => setConfirmResign(false)} disabled={busy === 'animating'}>
                  {confirmResign ? t('Confirm: resign') : t('Resign')}
                </button>
              )}
            </div>
          </div>
          {options.length > 0 && (
            <div className="options" role="group" aria-label={t('Ways to play this pit')}>
              {options.map((c) => {
                const isTip = !!tip && sameMove(tip.move, c.move);
                return (
                  <div key={moveCode(c.move)} className="opt">
                    <button type="button" className={`btn${isTip ? ' tip' : ''}`} onClick={() => void playMove(c.move)}>
                      {optionLabel(t, pos, c)}{isTip && <span className="lbl tip-tag">{t('Coach’s pick')}</span>}
                    </button>
                    {tip && (
                      <button type="button" className="btn small why" onClick={() => { const w = whyNot(pos, tip, c, viewer, rules); if (w) setWhy({ key, w }); }}
                        aria-label={t('Why not this move? {m}', { m: optionLabel(t, pos, c) })}>{t('Why not?')}</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {whyNow && (
            <div className={`whynot v-${whyNow.verdict}`} role="status">
              <p className="lbl">{t('Why not this move?')} · {t(whyNow.verdict)}</p>
              <p style={{ fontWeight: 600 }}>{whyNow.summary}</p>
              <p className="muted">{whyNow.chosen.headline} {whyNow.chosen.why}</p>
              {whyNow.verdict !== 'best' && <p><strong>{t('Coach')}:</strong> {whyNow.coach.headline} {whyNow.coach.why}</p>}
            </div>
          )}
          {message && <p role="alert">{message}</p>}
        </div>
      </section>

      <aside aria-label={t('Coach and game record')} className="stack" style={{ gap: 18 }}>
        <section className="card coach stack" aria-labelledby="coach-h" style={{ gap: 12 }} data-tour="play-coach">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="coach-h" className="lbl" style={{ color: 'var(--ochre-ink)' }}>{t('Coach light')}</h2>
            <label className="switch">
              <input type="checkbox" checked={coachOn} onChange={(e) => { setCoachOn(e.target.checked); store.setCoach(e.target.checked); }} aria-keyshortcuts="C" />
              {t('Show on board')}
            </label>
          </div>
          {!coachOn && <p className="muted">{t('The coach is off. Switch it on to see the move a fundi would make, and why.')}</p>}
          {coachOn && !humanTurn && !over && <p className="muted">{viewing ? t('Return to the game to hear the coach.') : t('The coach speaks on your turn.')}</p>}
          {coachOn && humanTurn && !tip && <p className="muted coach-wait">{t('Reading the board…')}</p>}
          {tip && (
            <>
              <p className="disp" style={{ fontSize: 24, lineHeight: 1.2 }}>{tip.headline}</p>
              <p className="muted" style={{ lineHeight: 1.55 }}>{tip.why}</p>
              <div className="row">
                <button type="button" className="btn small" onClick={() => setSelected(tip.move.pit)}>{t('Select {pit} for me', { pit: pitName(viewer, pos.toMove, tip.move.pit) })}</button>
                <span className="lbl num">{t('Searched {n} plies', { n: tip.depth })}</span>
              </div>
            </>
          )}
        </section>

        {!local && (
          <section className="card stack" style={{ gap: 8 }} data-tour="play-level">
            <label htmlFor="lvl" className="lbl">{t('Fundi strength')}</label>
            <input id="lvl" type="range" min={1} max={9} step={1} value={level}
              onChange={(e) => { const v = Number(e.target.value); setLevel(v); store.setLevel(v); }} />
            <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 14 }}>
              <span>1 · {LEVELS[0].name} ({t(LEVELS[0].gloss)})</span><span>9 · {LEVELS[8].name} ({t(LEVELS[8].gloss)})</span>
            </div>
            <p style={{ fontSize: 15 }}>{t('Level {n}', { n: level })} · {L.name}: {t(L.note)}.</p>
          </section>
        )}

        <section className="card stack" style={{ gap: 12 }} data-tour="play-record">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="lbl">{t('Game record')}</h2>
            <span className="lbl num">{t('{n} plies', { n: game.moves.length })}</span>
          </div>
          {pairs.length === 0 ? <p className="muted">{t('No moves yet. Select any ply here later to look back at the board.')}</p> : (
            <div className="ledger-box">
              <table className="ledger num">
                <thead><tr><th scope="col">#</th><th scope="col">{name(first)}</th><th scope="col">{name(other(first))}</th></tr></thead>
                <tbody>{pairs.map((r) => (
                  <tr key={r.n}>
                    <td>{r.n}</td>
                    {r.cells.map((k, j) => (
                      <td key={j}>{k === null ? '·' : (
                        <button type="button" className="ply" aria-pressed={view === k + 1} onClick={() => setView(k + 1 === game.moves.length ? null : k + 1)}
                          aria-label={t('Ply {k}: {m}. Show the board after it', { k: k + 1, m: game.notation[k] })}>{game.notation[k]}</button>
                      )}</td>
                    ))}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="row">
            {game.moves.length > 0 && <a href={`#/review?id=${game.id}`} className="linkish">{t('Review this game so far')}</a>}
            <button type="button" className="linkish" onClick={() => openHelp('rules')}>{t('Rules of this game')}</button>
          </div>
        </section>

        <section className="card stack" style={{ gap: 14 }} aria-labelledby="ng-h">
          <h2 id="ng-h" className="lbl">{t('New game')}</h2>
          <fieldset className="seg">
            <legend className="sr-only">{t('Opponent')}</legend>
            <label><input type="radio" name="mode" checked={mode === 'fundi'} onChange={() => setMode('fundi')} /><span>{t('Play Fundi')}</span></label>
            <label><input type="radio" name="mode" checked={mode === 'local'} onChange={() => setMode('local')} /><span>{t('Pass and play')}</span></label>
          </fieldset>
          {mode === 'fundi' ? (
            <fieldset className="seg">
              <legend className="sr-only">{t('Your seat')}</legend>
              <label><input type="radio" name="seat" checked={seat === 0} onChange={() => setSeat(0)} /><span>{t('South · you start')}</span></label>
              <label><input type="radio" name="seat" checked={seat === 1} onChange={() => setSeat(1)} /><span>{t('North · Fundi starts')}</span></label>
            </fieldset>
          ) : <p className="muted" style={{ fontSize: 14 }}>{t('Two players share this device. The board turns to face whoever is to move; South starts.')}</p>}
          <label className="field">
            <span className="lbl">{t('Rules')}</span>
            <select value={ruleset} onChange={(e) => { const v = e.target.value as RulesetId; setRuleset(v); store.setRuleset(v); }}>
              {RULESETS.map((r) => <option key={r.id} value={r.id}>{t(r.name)}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 14 }}>{t(RULESETS.find((r) => r.id === ruleset)?.note ?? '')}</span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={clockOn} onChange={(e) => { setClockOn(e.target.checked); store.setClock(e.target.checked); }} />
            {t('Show the move clock')}
          </label>
          <div><button type="button" className="btn go" onClick={restart}>{t('Start a new game')}</button></div>
        </section>
      </aside>
    </div>
  );
}
