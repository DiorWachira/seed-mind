import { useEffect, useMemo, useState } from 'react';
import { moveNotation, sameMove } from '../engine/board';
import { describe, type PlyAnalysis } from '../engine/coach';
import { gameRules, replay, type GameRecord } from '../engine/game';
import { legalMoves } from '../engine/rules';
import { WIN } from '../engine/search';
import { Board } from '../ui/Board';
import { engine } from '../ui/engineClient';
import { store } from '../ui/storage';

const TURN_LOSS = 1.5;
const CLAMP = 12;

function pickGame(id: string | null): GameRecord | null {
  if (id) return store.game(id);
  const cur = store.currentGame();
  if (cur && cur.moves.length > 0) return cur;
  return store.games()[0] ?? null;
}

export function Review({ id }: { id: string | null }) {
  const game = useMemo(() => pickGame(id), [id]);
  const positions = useMemo(() => (game ? replay(game) : []), [game]);
  const [plies, setPlies] = useState<PlyAnalysis[] | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [sel, setSel] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!game || game.moves.length === 0) return;
    let live = true;
    setPlies(null);
    engine('review').analyse(positions.slice(0, -1), game.moves, gameRules(game), (d, t) => live && setProgress([d, t]))
      .then((p) => { if (live) setPlies(p); })
      .catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [game, positions]);

  if (!game || game.moves.length === 0) {
    return (
      <div className="stack" style={{ gap: 18, maxWidth: 640 }}>
        <p className="lbl">Game review</p>
        <h1 className="disp" style={{ fontSize: 48, lineHeight: 1.05 }}>No game to review yet.</h1>
        <p className="muted" style={{ fontSize: 18, lineHeight: 1.55 }}>Play a game against Fundi and it will be kept here, with every move scored against the coach.</p>
        <div><a className="btn go" href="#/play">Play a game</a></div>
      </div>
    );
  }

  const human = game.human;
  const rules = gameRules(game);
  const games = store.games();

  if (!plies) {
    const [d, t] = progress;
    return (
      <div className="stack" style={{ gap: 18, maxWidth: 640 }}>
        <p className="lbl">Game review · {game.moves.length} plies</p>
        <h1 className="disp" style={{ fontSize: 44, lineHeight: 1.05 }}>Reading your game…</h1>
        <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={t || game.moves.length} aria-valuenow={d} aria-label="Analysis progress"><i style={{ width: `${t ? (d / t) * 100 : 0}%` }} /></div>
        <p className="muted num">{d} of {t || game.moves.length} moves scored</p>
        {error && <p role="alert">Analysis failed: {error}</p>}
      </div>
    );
  }

  const persp = human === 0 ? 1 : -1;
  const evals = plies.map((p) => Math.max(-CLAMP, Math.min(CLAMP, p.evalSouth * persp)));
  const humanPlies = plies.filter((p) => p.mover === human);
  const matched = humanPlies.filter((p) => p.loss < 0.5).length;
  const turning = humanPlies.filter((p) => p.loss >= TURN_LOSS).sort((a, b) => b.loss - a.loss).slice(0, 3).sort((a, b) => a.ply - b.ply);
  const turnSet = new Set(turning.map((t) => t.ply));
  let peak = 0;
  let peakAt = 0;
  evals.forEach((v, k) => { if (v > peak) { peak = v; peakAt = k; } });
  const current = sel ?? turning[0]?.ply ?? 0;
  const pa = plies[current];
  const pos = positions[current];
  const cands = legalMoves(pos, rules);
  const playedC = cands.find((c) => sameMove(c.move, game.moves[current]));
  const bestC = cands.find((c) => sameMove(c.move, pa.best));
  const byHuman = pa.mover === human;
  const played = playedC ? describe(pos, playedC, human, rules) : null;
  const best = bestC ? describe(pos, bestC, human, rules) : null;
  const note = (c: typeof playedC) => (c ? moveNotation(c.move, pos.stock[pos.toMove] > 0 && c.result.kind === 'capture', pos.toMove, human) : '·');
  const fmt = (v: number) => (Math.abs(v) >= WIN - 100 ? 'decisive' : Math.abs(v).toFixed(1));
  const result = game.result ? (game.result.winner === human ? 'You won' : 'Fundi won') : 'In progress';

  return (
    <div className="stack" style={{ gap: 32 }}>
      <div className="stack" style={{ gap: 10 }}>
        <p className="lbl">Review · you vs Fundi level {game.level} · {game.moves.length} plies</p>
        <h1 className="disp" style={{ fontSize: 'clamp(34px, 4.6vw, 56px)', lineHeight: 1.04, maxWidth: '18em' }}>
          {turning.length === 0 ? 'A clean game. You stayed close to the coach throughout.' : `${turning.length} turning point${turning.length > 1 ? 's' : ''} decided this game.`}
        </h1>
        {games.length > 1 && (
          <label className="field" style={{ maxWidth: 360 }}>
            <span className="lbl">Other games</span>
            <select value={game.id} onChange={(e) => { window.location.hash = `#/review?id=${e.target.value}`; }}>
              {games.map((g) => <option key={g.id} value={g.id}>{new Date(g.startedAt).toLocaleString()} · level {g.level} · {g.result ? (g.result.winner === g.human ? 'won' : 'lost') : 'unfinished'}</option>)}
            </select>
          </label>
        )}
      </div>

      <section className="stats" aria-label="Game summary">
        <div className="stat"><span className="lbl">Result</span><span className="disp" style={{ fontSize: 32 }}>{result}</span></div>
        <div className="stat"><span className="lbl">Matched the coach</span><span className="disp num" style={{ fontSize: 32 }}>{matched} of {humanPlies.length}</span><span className="muted" style={{ fontSize: 15 }}>Within half a kete of the best move</span></div>
        <div className="stat"><span className="lbl">Turning points</span><span className="disp num" style={{ fontSize: 32 }}>{turning.length}</span><span className="muted" style={{ fontSize: 15 }}>Your moves that cost {TURN_LOSS} kete or more</span></div>
        <div className="stat"><span className="lbl">Peak lead</span><span className="disp num" style={{ fontSize: 32 }}>{peak > 0 ? `+${peak.toFixed(1)}` : '—'}</span>{peak > 0 && <span className="muted" style={{ fontSize: 15 }}>After ply {peakAt + 1}</span>}</div>
      </section>

      <section className="card stack" aria-labelledby="tl-h" style={{ gap: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 id="tl-h" className="disp" style={{ fontSize: 28 }}>Who was ahead, ply by ply</h2>
          <div className="key" aria-hidden="true">
            <span><i className="sw" style={{ background: 'var(--ink)' }} />You ahead</span>
            <span><i className="sw" style={{ background: 'var(--down)' }} />Fundi ahead</span>
            <span><i className="sw" style={{ background: 'var(--ochre)', transform: 'rotate(45deg)' }} />Turning point</span>
          </div>
        </div>
        <div className="chartbox">
          <div className="chart" role="group" aria-label="Advantage after each ply, in kete. Select a ply to inspect it.">
            {evals.map((v, k) => (
              <button key={k} type="button" className="mv" aria-pressed={k === current} onClick={() => setSel(k)}
                aria-label={`Ply ${k + 1}, ${plies[k].mover === human ? 'your move' : 'Fundi'}: ${v >= 0 ? 'you' : 'Fundi'} ahead by ${Math.abs(v).toFixed(1)}${turnSet.has(k) ? ', turning point' : ''}`}>
                <span className="half top"><span className="up" style={{ height: `${v > 0 ? (v / CLAMP) * 100 : 0}%` }} /></span>
                <span className="half bot"><span className="dn" style={{ height: `${v < 0 ? (-v / CLAMP) * 100 : 0}%` }} /></span>
                {turnSet.has(k) && <span className="scar" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
        <p role="status" className="num" style={{ fontSize: 16 }}>
          <strong>Ply {current + 1}</strong> · {byHuman ? 'your move' : 'Fundi'} · {evals[current] >= 0 ? 'you ahead' : 'Fundi ahead'} by {fmt(evals[current])} kete
          {byHuman && pa.loss >= 0.5 ? ` · cost ${pa.loss.toFixed(1)} against the coach` : byHuman ? ' · matched the coach' : ''}
        </p>
      </section>

      {turning.length > 0 && (
        <section className="stack" aria-labelledby="tp-h" style={{ gap: 18 }}>
          <h2 id="tp-h" className="disp" style={{ fontSize: 28 }}>Turning points</h2>
          <div className="turns">
            {turning.map((t) => {
              const p = positions[t.ply];
              const c = legalMoves(p, rules).find((x) => sameMove(x.move, game.moves[t.ply]));
              const d = c ? describe(p, c, human, rules) : null;
              return (
                <button key={t.ply} type="button" className="turn" aria-pressed={t.ply === current} onClick={() => setSel(t.ply)}>
                  <span className="lbl num" style={{ color: 'var(--ochre-ink)' }}>Ply {t.ply + 1} · cost {t.loss.toFixed(1)}</span>
                  <span className="disp" style={{ fontSize: 22, lineHeight: 1.2 }}>{d?.headline ?? 'Your move'}</span>
                  <span className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>Select to compare it with the coach’s move.</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="split" aria-labelledby="pos-h">
        <figure style={{ margin: 0 }} className="stack">
          <Board pos={pos} viewer={human} label={`Board before ply ${current + 1}`}
            youMark={playedC ? [pos.toMove, playedC.move.pit] : null}
            coachMark={bestC && !sameMove(bestC.move, game.moves[current]) ? [pos.toMove, bestC.move.pit] : null} />
          <figcaption className="key">
            <span><i className="ring-sw" style={{ boxShadow: 'inset 0 0 0 3px var(--ink)' }} />{byHuman ? 'Your move' : 'Fundi’s move'}</span>
            <span><i className="ring-sw" style={{ boxShadow: 'inset 0 0 0 3px var(--ochre)' }} />Coach’s move</span>
            <span>Position before ply {current + 1}</span>
          </figcaption>
        </figure>
        <div className="card stack" style={{ gap: 14 }}>
          <p className="lbl">Ply {current + 1} · {byHuman ? 'what happened' : 'Fundi’s move'}</p>
          <h2 id="pos-h" className="disp" style={{ fontSize: 28, lineHeight: 1.15 }}>{played?.headline ?? 'Move'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ padding: '12px 14px', border: '1.5px solid var(--ink)', borderRadius: 4 }}><span className="lbl">{byHuman ? 'You played' : 'Fundi played'}</span><p className="num" style={{ marginTop: 6, fontSize: 20, fontWeight: 600 }}>{note(playedC)}</p></div>
            <div style={{ padding: '12px 14px', border: '2px solid var(--ochre)', borderRadius: 4 }}><span className="lbl" style={{ color: 'var(--ochre-ink)' }}>Coach played</span><p className="num" style={{ marginTop: 6, fontSize: 20, fontWeight: 600 }}>{note(bestC)}</p></div>
          </div>
          {byHuman && played && <p style={{ lineHeight: 1.6 }}>{played.why}</p>}
          {byHuman && best && bestC && playedC && !sameMove(bestC.move, playedC.move) && (
            <p style={{ lineHeight: 1.6 }}><strong>Coach:</strong> {best.headline} {best.why}</p>
          )}
          <p className="muted" style={{ fontSize: 14 }}>Scores come from a 3-ply search per move; see roadmap.txt for planned deeper review.</p>
        </div>
      </section>
    </div>
  );
}
