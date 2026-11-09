import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clonePosition, initialPosition, moveNotation, other, pitName, positionKey } from '../engine/board';
import type { Advice } from '../engine/coach';
import { gameRules, newGame, replay, type GameRecord } from '../engine/game';
import { legalMoves, playTraced, status } from '../engine/rules';
import { RULESETS, type RulesetId } from '../engine/ruleset';
import { LEVELS, levelInfo } from '../engine/search';
import type { Candidate, Move, Position, Side, SowEvent } from '../engine/types';
import { Board, Heap } from '../ui/Board';
import { engine } from '../ui/engineClient';
import { prefersReducedMotion } from '../ui/route';
import { store } from '../ui/storage';

function startingGame(level: number): GameRecord {
  const setup = store.peekSetup();
  if (setup) return newGame(level, 0, setup, store.ruleset());
  const cur = store.currentGame();
  if (cur && !cur.result) return cur;
  return newGame(level, 0, initialPosition(), store.ruleset());
}

function optionLabel(pos: Position, c: Candidate): string {
  const namua = pos.stock[pos.toMove] > 0;
  const { move: m, result: r } = c;
  let s: string;
  if (namua && r.kind === 'capture') {
    s = 'Capture';
    if (m.kichwa !== null) s += `, re-sow from the ${m.kichwa === 0 ? 'left' : 'right'} kichwa`;
  } else {
    s = m.dir === 1 ? 'Sow clockwise →' : 'Sow anticlockwise ←';
    if (r.taxed) s += ' (tax two from the nyumba)';
  }
  if (m.safari === true) s += ', then safari from the nyumba';
  if (m.safari === false) s += ', stop in the nyumba';
  s += r.kind === 'capture' ? ` · takes ${r.captured}` : ' · no capture';
  return s;
}

const sameMove = (a: Move, b: Move) => a.pit === b.pit && a.dir === b.dir && a.kichwa === b.kichwa && a.safari === b.safari;

export function Play() {
  const [level, setLevel] = useState<number>(store.level());
  const [coachOn, setCoachOn] = useState<boolean>(store.coach());
  const [ruleset, setRuleset] = useState<RulesetId>(store.ruleset());
  const [game, setGame] = useState<GameRecord>(() => startingGame(store.level()));
  const rules = useMemo(() => gameRules(game), [game]);
  const positions = useMemo(() => replay(game), [game]);
  const pos = positions[positions.length - 1];
  const cands = useMemo(() => legalMoves(pos, rules), [pos, rules]);
  const st = useMemo(() => status(pos, cands, rules), [pos, cands, rules]);

  const [busy, setBusy] = useState<'idle' | 'animating' | 'thinking'>('idle');
  const [display, setDisplay] = useState<Position | null>(null);
  const [hot, setHot] = useState<[Side, number] | null>(null);
  const [hand, setHand] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [advice, setAdvice] = useState<{ key: string; a: Advice | null } | null>(null);
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const skip = useRef<() => void>(() => {});
  const gameRef = useRef(game);
  gameRef.current = game;

  const human = game.human;
  const fundi = other(human);
  const humanTurn = !st.over && pos.toMove === human && busy === 'idle';
  const key = positionKey(pos);

  useEffect(() => {
    store.clearSetup();
    return () => window.clearTimeout(timer.current);
  }, []);

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
    if (prefersReducedMotion()) { resolve(); return; }
    const d = clonePosition(start);
    const sows = events.filter((e) => e.t === 'sow').length;
    const sowMs = Math.max(22, Math.min(110, 4200 / Math.max(1, sows)));
    let h = 0;
    let k = 0;
    setBusy('animating');
    const finish = () => { window.clearTimeout(timer.current); setDisplay(null); setHot(null); setHand(0); resolve(); };
    skip.current = finish;
    const step = () => {
      if (k >= events.length) { finish(); return; }
      const e = events[k++];
      let wait = sowMs;
      if (e.t === 'place') { d.pits[e.side][e.pit]++; d.stock[e.side]--; wait = 280; }
      else if (e.t === 'lift') { d.pits[e.side][e.pit] -= e.n; h += e.n; wait = 230; }
      else if (e.t === 'sow') { d.pits[e.side][e.pit]++; h--; }
      else if (e.t === 'capture') { d.pits[e.side][e.pit] = 0; h += e.n; wait = 450; }
      else wait = 120;
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
    setSelected(null);
    setMessage('');
    await animate(before, tr.events);
    const label = moveNotation(move, before.stock[before.toMove] > 0 && tr.kind === 'capture', before.toMove, g.human);
    if (gameRef.current.id !== g.id || gameRef.current.moves.length !== g.moves.length) { setBusy('idle'); return; }
    setGame({ ...g, moves: [...g.moves, move], notation: [...g.notation, label] });
    setBusy('idle');
  }, [animate]);

  // Fundi's turn. thinkingFor makes this fire once per position (StrictMode-safe);
  // a reply for a game that has since changed (restart) is dropped.
  const thinkingFor = useRef<string | null>(null);
  useEffect(() => {
    if (st.over || pos.toMove !== fundi || busy !== 'idle') return;
    if (thinkingFor.current === key) return;
    thinkingFor.current = key;
    setBusy('thinking');
    const gid = game.id;
    const plies = game.moves.length;
    const started = Date.now();
    const stale = () => gameRef.current.id !== gid || gameRef.current.moves.length !== plies;
    engine('play').think(pos, level, rules).then((m) => {
      const wait = Math.max(0, 450 - (Date.now() - started));
      window.setTimeout(() => {
        if (stale()) return;
        if (m) void playMove(m); else setBusy('idle');
      }, wait);
    }).catch((e: Error) => { if (!stale()) { setMessage(`Engine error: ${e.message}`); setBusy('idle'); } });
  }, [key, st.over, busy, fundi, pos, level, game.id, game.moves.length, playMove, rules]);

  // Coach light for the human.
  useEffect(() => {
    if (!coachOn || !humanTurn || advice?.key === key) return;
    let live = true;
    engine('coach').advise(pos, rules).then((a) => { if (live) setAdvice({ key, a }); }).catch(() => {});
    return () => { live = false; };
  }, [key, coachOn, humanTurn, advice?.key, pos, rules]);

  const tip = coachOn && humanTurn && advice?.key === key ? advice.a : null;
  const options = selected === null ? [] : cands.filter((c) => c.move.pit === selected);
  const pickablePits = useMemo(() => new Set(cands.map((c) => c.move.pit)), [cands]);
  const shown = display ?? pos;
  const namua = pos.stock[pos.toMove] > 0;
  const L = levelInfo(level);

  const restart = (fundiFirst: boolean) => {
    window.clearTimeout(timer.current);
    skip.current();
    const start = initialPosition();
    if (fundiFirst) start.toMove = fundi;
    thinkingFor.current = null;
    setDisplay(null);
    setBusy('idle');
    setAdvice(null);
    setSelected(null);
    setGame(newGame(level, human, start, ruleset));
  };

  const takeBack = () => {
    const g = gameRef.current;
    if (busy !== 'idle' || g.moves.length === 0) return;
    const ps = replay(g);
    let n = g.moves.length;
    // Undo back to (and including) the human's last move.
    do { n--; } while (n > 0 && ps[n].toMove !== human);
    if (ps[n].toMove !== human) return;
    setGame({ ...g, moves: g.moves.slice(0, n), notation: g.notation.slice(0, n), result: null });
  };

  const pairs: { n: number; you: string; fundi: string }[] = [];
  {
    let row: { n: number; you: string; fundi: string } | null = null;
    positions.slice(0, -1).forEach((p, k) => {
      const byHuman = p.toMove === human;
      if (!row || (byHuman && row.you) || (!byHuman && row.fundi)) { row = { n: pairs.length + 1, you: '', fundi: '' }; pairs.push(row); }
      if (byHuman) row.you = game.notation[k]; else row.fundi = game.notation[k];
    });
  }

  let headline: string;
  if (st.over) headline = st.winner === human ? 'You won' : 'Fundi won';
  else if (busy === 'thinking') headline = 'Fundi is thinking…';
  else if (busy === 'animating') headline = pos.toMove === human ? 'Sowing…' : 'Fundi is sowing…';
  else headline = `Move ${Math.floor(game.moves.length / 2) + 1} · your turn`;

  const selHint = (() => {
    if (!humanTurn) return '';
    const tie = pos.blocked != null ? ` Takasia: you may not empty ${pitName(human, human, pos.blocked)} on a quiet turn.` : '';
    if (selected === null) return (namua
      ? 'Pick an inner pit (row A) to place a kete from your hand.'
      : 'Pick a pit with two or more kete to lift and sow.') + tie;
    return options.length === 1 ? 'One way to play this pit.' : `${options.length} ways to play this pit. Choose one.`;
  })();

  return (
    <div className="play">
      <section aria-label="Game" className="stack" style={{ gap: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 className="disp" style={{ fontSize: 'clamp(32px, 4vw, 44px)', lineHeight: 1.05 }} aria-live="polite">{headline}</h1>
          <p className="lbl">{st.over ? 'Game over' : namua ? 'Namua · placing from the hand' : 'Mtaji · sowing from the board'} · {RULESETS.find((r) => r.id === (game.ruleset ?? 'v1'))?.name}</p>
        </div>

        {st.over && (
          <div className="banner" role="status">
            <p style={{ fontSize: 17 }}>
              {st.winner === human ? 'Fundi' : 'You'} {st.reason === 'inner-empty' ? 'ran out of kete in the inner row.' : 'had no legal move left.'}
            </p>
            <div className="row">
              <a className="btn go" href={`#/review?id=${game.id}`}>Review this game</a>
              <button type="button" className="btn" onClick={() => restart(false)}>New game</button>
            </div>
          </div>
        )}

        <div className="strip">
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 17 }}>Fundi</span>
            <span className="muted" style={{ fontSize: 14 }}>{L.name} ({L.gloss}) · level {level}</span>
          </div>
          <div className="hand"><Heap n={shown.stock[fundi]} /><span className="num" style={{ fontSize: 15 }}><strong>{shown.stock[fundi]}</strong> mkononi (in hand)</span></div>
        </div>

        <Board
          pos={shown}
          viewer={human}
          label="Bao board. Rows from the top: D and C are Fundi's back and front rows, A and B are your front and back rows."
          onPick={humanTurn ? (i) => setSelected(i === selected ? null : i) : undefined}
          pickable={(i) => pickablePits.has(i)}
          selected={selected}
          coach={tip ? { start: tip.startPit, targets: tip.targets, path: tip.path } : null}
          hot={hot}
        />

        <div className="strip">
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 17 }}>Wewe (you)</span>
            <span className="muted" style={{ fontSize: 14 }}>Rows A (front) and B (back), columns 1–8 from your seat</span>
          </div>
          <div className="hand">
            {busy === 'animating' && hand > 0 && <span className="lbl num">{hand} in the sowing hand</span>}
            <Heap n={shown.stock[human]} /><span className="num" style={{ fontSize: 15 }}><strong>{shown.stock[human]}</strong> mkononi (in hand)</span>
          </div>
        </div>

        <div className="card stack" style={{ gap: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="stack" style={{ gap: 4 }}>
              <span className="lbl">Your move</span>
              <span style={{ fontSize: 19, fontWeight: 600 }}>
                {selected === null ? (humanTurn ? 'Choose a pit' : 'Waiting') : `${pitName(human, human, selected)} · ${pos.pits[human][selected]} kete`}
              </span>
              <span className="muted" style={{ fontSize: 15 }}>{selHint}</span>
            </div>
            <div className="row">
              {busy === 'animating' && <button type="button" className="btn small" onClick={() => skip.current()}>Skip animation</button>}
              <button type="button" className="btn small" onClick={takeBack} disabled={busy !== 'idle' || game.moves.length === 0}>Take back</button>
            </div>
          </div>
          {options.length > 0 && (
            <div className="options" role="group" aria-label="Ways to play this pit">
              {options.map((c, k) => {
                const isTip = !!tip && sameMove(tip.move, c.move);
                return (
                  <button key={k} type="button" className="btn" onClick={() => void playMove(c.move)} style={isTip ? { borderColor: 'var(--ochre)', boxShadow: '0 4px 0 var(--ochre)' } : undefined}>
                    {optionLabel(pos, c)}{isTip && <span className="lbl" style={{ color: 'var(--ochre-ink)', marginLeft: 'auto' }}>Coach’s pick</span>}
                  </button>
                );
              })}
            </div>
          )}
          {message && <p role="alert" style={{ color: 'var(--ink)' }}>{message}</p>}
        </div>
      </section>

      <aside aria-label="Coach and game record" className="stack" style={{ gap: 20 }}>
        <section className="card coach stack" aria-labelledby="coach-h" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="coach-h" className="lbl" style={{ color: 'var(--ochre-ink)' }}>Coach light</h2>
            <label className="switch">
              <input type="checkbox" checked={coachOn} onChange={(e) => { setCoachOn(e.target.checked); store.setCoach(e.target.checked); }} />
              Show on board
            </label>
          </div>
          {!coachOn && <p className="muted">The coach is off. Switch it on to see the move a fundi would make, and why.</p>}
          {coachOn && !humanTurn && !st.over && <p className="muted">The coach speaks on your turn.</p>}
          {coachOn && humanTurn && !tip && <p className="muted">Reading the board…</p>}
          {tip && (
            <>
              <p className="disp" style={{ fontSize: 24, lineHeight: 1.2 }}>{tip.headline}</p>
              <p className="muted" style={{ lineHeight: 1.55 }}>{tip.why}</p>
              <div className="row">
                <button type="button" className="btn small" onClick={() => setSelected(tip.move.pit)}>Select {pitName(human, human, tip.move.pit)} for me</button>
                <span className="lbl num">Searched {tip.depth} plies</span>
              </div>
            </>
          )}
        </section>

        <section className="card stack" style={{ gap: 8 }}>
          <label htmlFor="lvl" className="lbl">Fundi strength</label>
          <input id="lvl" type="range" min={1} max={9} step={1} value={level}
            onChange={(e) => { const v = Number(e.target.value); setLevel(v); store.setLevel(v); }} />
          <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 14 }}>
            <span>1 · {LEVELS[0].name} ({LEVELS[0].gloss})</span><span>9 · {LEVELS[8].name} ({LEVELS[8].gloss})</span>
          </div>
          <p style={{ fontSize: 15 }}>Level {level}: {L.note}.</p>
        </section>

        <section className="card stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="lbl">Game record</h2>
            <span className="lbl num">{game.moves.length} plies</span>
          </div>
          {pairs.length === 0 ? <p className="muted">No moves yet.</p> : (
            <div className="ledger-box">
              <table className="ledger num">
                <thead><tr><th scope="col">#</th><th scope="col">You</th><th scope="col">Fundi</th></tr></thead>
                <tbody>{pairs.map((r) => <tr key={r.n}><td>{r.n}</td><td>{r.you || '·'}</td><td>{r.fundi || '·'}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <label className="field">
            <span className="lbl">Rules for new games</span>
            <select value={ruleset} onChange={(e) => { const v = e.target.value as RulesetId; setRuleset(v); store.setRuleset(v); }}>
              {RULESETS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 14 }}>{RULESETS.find((r) => r.id === ruleset)?.note}</span>
          </label>
          <div className="row">
            <button type="button" className="btn small" onClick={() => restart(false)}>New game</button>
            <button type="button" className="btn small" onClick={() => restart(true)}>New game, Fundi starts</button>
          </div>
          {game.moves.length > 0 && <a href={`#/review?id=${game.id}`} className="linkish" style={{ display: 'inline-flex', alignItems: 'center' }}>Review this game so far</a>}
        </section>
      </aside>
    </div>
  );
}
