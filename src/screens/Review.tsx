import { useEffect, useMemo, useRef, useState } from 'react';
import { moveNotation, other, sameMove } from '../engine/board';
import { describe, verdictFor, type PlyAnalysis } from '../engine/coach';
import { gameMode, gameRules, playerName, replay, resultText, type GameRecord } from '../engine/game';
import { legalMoves } from '../engine/rules';
import { parseGame, toJSON, toShareCode, toText } from '../engine/record';
import { WIN } from '../engine/search';
import type { Move, Position, Side } from '../engine/types';
import { Board } from '../ui/Board';
import { engine } from '../ui/engineClient';
import { GameRings, ringsFrom } from '../ui/GameRings';
import { useT, type T } from '../ui/i18n';
import { go } from '../ui/route';
import { store, type ReviewDepth } from '../ui/storage';

const TURN_LOSS = 1.5;
const CLAMP = 12;
const DEPTHS: Record<ReviewDepth, { maxDepth: number; timeMs: number }> = {
  quick: { maxDepth: 6, timeMs: 250 },
  deep: { maxDepth: 30, timeMs: 1200 },
};

function pickGame(id: string | null): GameRecord | null {
  if (id) return store.game(id);
  const cur = store.currentGame();
  if (cur && cur.moves.length > 0) return cur;
  return store.games()[0] ?? null;
}

/** Notation for a line of moves played from `pos`, read from `viewer`'s seat. */
function lineText(pos: Position, line: Move[], viewer: Side, rules: ReturnType<typeof gameRules>): string[] {
  const out: string[] = [];
  let p = pos;
  for (const m of line) {
    const c = legalMoves(p, rules).find((x) => sameMove(x.move, m));
    if (!c) break;
    out.push(moveNotation(m, p.stock[p.toMove] > 0 && c.result.kind === 'capture', p.toMove, viewer));
    p = c.result.next;
  }
  return out;
}

const verdictWord = (t: T, loss: number) => t(verdictFor(loss));
/** Losses against a forced win or loss are mate scores (hundreds of "kete"): say "decisive" instead. */
const lossText = (t: T, loss: number) => (loss >= 100 ? t('decisive') : loss.toFixed(1));

function Library({ current }: { current: string | null }) {
  const t = useT();
  const games = store.games();
  if (games.length === 0) return null;
  return (
    <section className="stack" aria-labelledby="lib-h" style={{ gap: 14 }}>
      <h2 id="lib-h" className="disp" style={{ fontSize: 28 }}>{t('Your games')}</h2>
      <ul className="library">
        {games.map((g) => {
          const a = store.anyAnalysis(g.id);
          const subject = gameMode(g) === 'local' ? null : g.human;
          // Without an analysis yet, draw even rings (every move "matched"): the tree still shows the game's length.
          const ps = a ? null : replay(g);
          const rings = a ? ringsFrom(a, subject, g.notation) : ringsFrom(g.moves.map((_, k) => ({ ply: k, mover: ps![k].toMove, loss: 0 } as PlyAnalysis)), subject, g.notation);
          const turning = new Set((a ?? []).filter((p) => (subject === null || p.mover === subject) && p.loss >= TURN_LOSS).map((p) => p.ply));
          return (
            <li key={g.id}>
              <a href={`#/review?id=${g.id}`} aria-current={g.id === current ? 'true' : undefined} className="lib-item">
                <GameRings rings={rings} turning={turning} mini size={60} label={t('Growth rings of this game')} />
                <span className="stack" style={{ gap: 2 }}>
                  <b>{t(resultText(g).split(' · ')[0])}</b>
                  <span className="muted num" style={{ fontSize: 14 }}>
                    {new Date(g.startedAt).toLocaleDateString()} · {gameMode(g) === 'local' ? t('pass and play') : t('level {n}', { n: g.level })} · {t('{n} plies', { n: g.moves.length })}{g.imported ? ` · ${t('imported')}` : ''}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShareBox({ game }: { game: GameRecord }) {
  const t = useT();
  const [note, setNote] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const link = `${window.location.origin}${window.location.pathname}#/review?g=${toShareCode(game)}`;

  const copy = async (s: string, done: string) => {
    try { await navigator.clipboard.writeText(s); setNote(done); } catch { setText(s); setNote(t('Copy it from the box below.')); }
  };
  const download = () => {
    const blob = new Blob([toJSON(game)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `seed-mind-${game.startedAt.slice(0, 10)}-${game.id}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setNote(t('Downloaded the game as JSON.'));
  };
  const doImport = (s: string) => {
    setErr('');
    try {
      const g = parseGame(s);
      store.archive(g);
      setText('');
      go(`#/review?id=${g.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <section className="card stack" aria-labelledby="share-h" style={{ gap: 14 }}>
      <h2 id="share-h" className="lbl">{t('Share, export, import')}</h2>
      <div className="row">
        <button type="button" className="btn small" onClick={() => void copy(link, t('Share link copied.'))}>{t('Copy share link')}</button>
        <button type="button" className="btn small" onClick={() => void copy(toText(game), t('Text record copied.'))}>{t('Copy text record')}</button>
        <button type="button" className="btn small" onClick={download}>{t('Download JSON')}</button>
      </div>
      <p role="status" className="muted" style={{ minHeight: '1.4em' }}>{note}</p>
      <label className="field">
        <span className="lbl">{t('Import a game')}</span>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Paste a share link, a text record or JSON')} />
      </label>
      <div className="row">
        <button type="button" className="btn small go" disabled={!text.trim()} onClick={() => doImport(text)}>{t('Import')}</button>
        <button type="button" className="btn small" onClick={() => file.current?.click()}>{t('Open a file…')}</button>
        <input ref={file} type="file" accept=".json,.txt,application/json,text/plain" hidden
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) doImport(await f.text()); e.target.value = ''; }} />
      </div>
      {err && <p role="alert" className="err">{t('Could not import: {m}', { m: err })}</p>}
    </section>
  );
}

export function Review({ id, code }: { id: string | null; code: string | null }) {
  const t = useT();
  const shared = useMemo(() => {
    if (!code) return { game: null, error: '' };
    try { return { game: parseGame(code), error: '' }; } catch (e) { return { game: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [code]);
  const game = useMemo(() => shared.game ?? (code ? null : pickGame(id)), [id, code, shared.game]);
  const positions = useMemo(() => (game ? replay(game) : []), [game]);
  const [depth, setDepth] = useState<ReviewDepth>(store.reviewDepth());
  const [plies, setPlies] = useState<PlyAnalysis[] | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [sel, setSel] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSel(null);
    setSaved(false);
    if (!game || game.moves.length === 0) return;
    const rs = game.ruleset ?? 'v1';
    const cached = store.analysis(game.id, game.moves.length, rs, depth);
    if (cached) { setPlies(cached); return; }
    let live = true;
    setPlies(null);
    setError('');
    setProgress([0, game.moves.length]);
    engine('review').analyse(positions.slice(0, -1), game.moves, gameRules(game), (d, n) => live && setProgress([d, n]), DEPTHS[depth])
      .then((p) => {
        if (!live) return;
        setPlies(p);
        if (!shared.game) store.saveAnalysis(game.id, { moves: game.moves.length, ruleset: rs, depth, plies: p });
      })
      .catch((e: Error) => { if (live && e.message !== 'cancelled') setError(e.message); });
    return () => { live = false; engine('review').restart(); };
  }, [game, positions, depth, shared.game]);

  // ← → Home End step through plies (when no overlay or text field has the keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!plies || !game || document.querySelector('.tour, .drawer-wrap')) return;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.getAttribute('role') === 'slider')) return;
      const n = plies.length;
      if (e.key === 'ArrowLeft') setSel((s) => Math.max(0, (s ?? 0) - 1));
      else if (e.key === 'ArrowRight') setSel((s) => Math.min(n - 1, (s ?? -1) + 1));
      else if (e.key === 'Home') setSel(0);
      else if (e.key === 'End') setSel(n - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [plies, game]);

  if (code && !game) {
    return (
      <div className="empty-state" data-tour="review-main">
        <div className="empty-pit" aria-hidden="true"><span /></div>
        <div className="stack" style={{ gap: 14, maxWidth: 600 }}>
          <p className="lbl">{t('Shared game')}</p>
          <h1 className="disp" style={{ fontSize: 44, lineHeight: 1.05 }}>{t('This link doesn’t hold a game we can read.')}</h1>
          <p className="muted" style={{ fontSize: 18 }}>{shared.error}</p>
          <div className="row"><a className="btn go" href="#/review">{t('Go to your games')}</a></div>
        </div>
      </div>
    );
  }

  if (!game || game.moves.length === 0) {
    return (
      <div className="stack" style={{ gap: 40 }}>
        <div className="empty-state" data-tour="review-main">
          <div className="seedling" aria-hidden="true"><span className="r2" /><span className="r1" /><span className="pith" /></div>
          <div className="stack" style={{ gap: 18, maxWidth: 600 }}>
            <p className="lbl">{t('Game review')}</p>
            <h1 className="disp" style={{ fontSize: 'clamp(36px, 5vw, 52px)', lineHeight: 1.05 }}>{t('No rings yet. Play a game and it grows here.')}</h1>
            <p className="muted" style={{ fontSize: 18, lineHeight: 1.55 }}>{t('Every move you make becomes a growth ring, scored against the coach. You can also import a game someone shared with you.')}</p>
            <div><a className="btn go" href="#/play">{t('Play a game')}</a></div>
          </div>
        </div>
        <div className="split">
          <Library current={null} />
          <ImportOnly />
        </div>
      </div>
    );
  }

  const human = game.human;
  const local = gameMode(game) === 'local';
  const subject: Side | null = local ? null : human;
  const rules = gameRules(game);
  const viewer: Side = local ? 0 : human;
  const pname = (s: Side) => t(playerName(game, s));

  if (!plies) {
    const [d, n] = progress;
    return (
      <div className="stack" style={{ gap: 18, maxWidth: 640 }} data-tour="review-main">
        <p className="lbl">{t('Game review')} · {t('{n} plies', { n: game.moves.length })}</p>
        <h1 className="disp" style={{ fontSize: 44, lineHeight: 1.05 }}>{t('Reading your game…')}</h1>
        <div className="growing" aria-hidden="true">{Array.from({ length: Math.min(12, Math.max(1, Math.ceil((d / Math.max(1, n)) * 12))) }, (_, i) => <span key={i} style={{ inset: `${(11 - i) * 4}%` }} />)}</div>
        <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={n || game.moves.length} aria-valuenow={d} aria-label={t('Analysis progress')}><i style={{ width: `${n ? (d / n) * 100 : 0}%` }} /></div>
        <p className="muted num">{t('{d} of {n} moves scored', { d, n: n || game.moves.length })} · {depth === 'deep' ? t('deep analysis') : t('quick analysis')}</p>
        {error && <p role="alert" className="err">{t('Analysis failed: {m}', { m: error })}</p>}
      </div>
    );
  }

  const persp = viewer === 0 ? 1 : -1;
  const evals = plies.map((p) => Math.max(-CLAMP, Math.min(CLAMP, p.evalSouth * persp)));
  const subjectPlies = plies.filter((p) => subject === null || p.mover === subject);
  const matched = subjectPlies.filter((p) => p.loss < 0.5).length;
  const turning = subjectPlies.filter((p) => p.loss >= TURN_LOSS).sort((a, b) => b.loss - a.loss).slice(0, 3).sort((a, b) => a.ply - b.ply);
  const turnSet = new Set(turning.map((x) => x.ply));
  const allScars = new Set(subjectPlies.filter((p) => p.loss >= TURN_LOSS).map((p) => p.ply));
  let peak = 0;
  let peakAt = 0;
  evals.forEach((v, k) => { if (v > peak) { peak = v; peakAt = k; } });
  const current = sel ?? turning[0]?.ply ?? 0;
  const pa = plies[current];
  const pos = positions[current];
  const cands = legalMoves(pos, rules);
  const playedC = cands.find((c) => sameMove(c.move, game.moves[current]));
  const bestC = cands.find((c) => sameMove(c.move, pa.best));
  const bySubject = subject === null || pa.mover === subject;
  const played = playedC ? describe(pos, playedC, viewer, rules) : null;
  const best = bestC ? describe(pos, bestC, viewer, rules) : null;
  const note = (c: typeof playedC) => (c ? moveNotation(c.move, pos.stock[pos.toMove] > 0 && c.result.kind === 'capture', pos.toMove, viewer) : '·');
  const fmt = (v: number) => (Math.abs(v) >= WIN - 100 ? t('decisive') : Math.abs(v).toFixed(1));
  const rings = ringsFrom(plies, subject, game.notation);
  const coachLine = lineText(pos, pa.pv?.length ? pa.pv : [pa.best], viewer, rules);
  const counts = { blunder: 0, mistake: 0, inaccuracy: 0 };
  for (const p of subjectPlies) { const v = verdictFor(p.loss); if (v in counts) counts[v as keyof typeof counts]++; }
  const head = turning.length === 0
    ? t('A clean game. You stayed close to the coach throughout.')
    : turning.length === 1 ? t('1 turning point decided this game.') : t('{n} turning points decided this game.', { n: turning.length });

  return (
    <div className="stack" style={{ gap: 36 }}>
      {shared.game && (
        <div className="banner" role="status">
          <p>{t('A shared game. It is not in your games yet.')}</p>
          <button type="button" className="btn small go" disabled={saved} onClick={() => { store.archive(shared.game!); store.saveAnalysis(shared.game!.id, { moves: game.moves.length, ruleset: game.ruleset ?? 'v1', depth, plies }); setSaved(true); }}>
            {saved ? t('Saved') : t('Save to my games')}
          </button>
        </div>
      )}

      <section className="review-hero" aria-labelledby="rv-h" data-tour="review-main">
        <div className="stack" style={{ gap: 14 }}>
          <p className="lbl">{t('Review')} · {local ? t('pass and play') : t('you vs Fundi level {n}', { n: game.level })} · {t('{n} plies', { n: game.moves.length })}</p>
          <h1 id="rv-h" className="disp" style={{ fontSize: 'clamp(34px, 4.6vw, 56px)', lineHeight: 1.04 }}>{head}</h1>
          <section className="stats" aria-label={t('Game summary')}>
            <div className="stat"><span className="lbl">{t('Result')}</span><span className="disp stat-v">{t(resultText(game).split(' · ')[0])}</span>{game.result && <span className="muted" style={{ fontSize: 14 }}>{t(resultText(game).split(' · ')[1] ?? '')}</span>}</div>
            <div className="stat"><span className="lbl">{t('Matched the coach')}</span><span className="disp num stat-v">{t('{a} of {b}', { a: matched, b: subjectPlies.length })}</span><span className="muted" style={{ fontSize: 14 }}>{t('Within half a kete of the best move')}</span></div>
            <div className="stat"><span className="lbl">{t('Costly moves')}</span><span className="disp num stat-v">{counts.blunder + counts.mistake}</span><span className="muted" style={{ fontSize: 14 }}>{t('{b} blunders, {m} mistakes, {i} inaccuracies', { b: counts.blunder, m: counts.mistake, i: counts.inaccuracy })}</span></div>
            <div className="stat"><span className="lbl">{t('Peak lead')}</span><span className="disp num stat-v">{peak > 0 ? <><span className="sign">+</span>{peak.toFixed(1)}</> : '—'}</span>{peak > 0 && <span className="muted" style={{ fontSize: 14 }}>{t('After ply {n}', { n: peakAt + 1 })}</span>}</div>
          </section>
          <div className="row">
            <span className="lbl">{t('Analysis')}</span>
            <fieldset className="seg compact">
              <legend className="sr-only">{t('Analysis depth')}</legend>
              <label><input type="radio" name="depth" checked={depth === 'quick'} onChange={() => { setDepth('quick'); store.setReviewDepth('quick'); }} /><span>{t('Quick')}</span></label>
              <label><input type="radio" name="depth" checked={depth === 'deep'} onChange={() => { setDepth('deep'); store.setReviewDepth('deep'); }} /><span>{t('Deep')}</span></label>
            </fieldset>
            <span className="muted" style={{ fontSize: 14 }}>{t('Searched up to {n} plies per move', { n: Math.max(...plies.map((p) => p.depth ?? 3)) })}</span>
          </div>
        </div>
        <figure className="rings-wrap">
          <GameRings rings={rings} turning={allScars} selected={current} onSelect={setSel}
            label={t('Growth rings of this game: one ring per move, wide for strong moves, narrow for costly ones, ochre scars on turning points. Use the arrow keys to read rings and Enter to open one.')}
            describeRing={(r, i) => `${t('Move {n}', { n: i + 1 })} · ${pname(r.mover as Side)} · ${r.note} · ${r.loss < 0.5 ? t('matched the coach') : t('cost {k} kete ({v})', { k: lossText(t, r.loss), v: verdictWord(t, r.loss) })}`} />
          <figcaption className="lbl fig-cap">{local ? t('Fig. 2 · The game as a tree section. Each ring is one ply; wide rings are strong moves, narrow rings gave kete away, scars mark turning points.') : t('Fig. 2 · Your game as a tree section. Each ring is one of your moves; wide rings are strong moves, narrow rings gave kete away, scars mark turning points.')}</figcaption>
        </figure>
      </section>

      <section className="card stack" aria-labelledby="tl-h" style={{ gap: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 id="tl-h" className="disp" style={{ fontSize: 28 }}>{t('Who was ahead, ply by ply')}</h2>
          <div className="key" aria-hidden="true">
            <span><i className="sw" style={{ background: 'var(--ink)' }} />{local ? t('South ahead') : t('You ahead')}</span>
            <span><i className="sw" style={{ background: 'var(--down)' }} />{local ? t('North ahead') : t('Fundi ahead')}</span>
            <span><i className="sw" style={{ background: 'var(--ochre)', transform: 'rotate(45deg)' }} />{t('Turning point')}</span>
          </div>
        </div>
        <div className="chartbox">
          <div className="chart" role="group" aria-label={t('Advantage after each ply, in kete. Select a ply to inspect it.')}>
            {evals.map((v, k) => (
              <button key={k} type="button" className="mv" aria-pressed={k === current} onClick={() => setSel(k)}
                aria-label={t('Ply {k}, {who}: {lead} ahead by {n}', { k: k + 1, who: pname(plies[k].mover), lead: v >= 0 ? pname(viewer) : pname(other(viewer)), n: Math.abs(v).toFixed(1) }) + (turnSet.has(k) ? `, ${t('turning point')}` : '')}>
                <span className="half top"><span className="up" style={{ height: `${v > 0 ? (v / CLAMP) * 100 : 0}%` }} /></span>
                <span className="half bot"><span className="dn" style={{ height: `${v < 0 ? (-v / CLAMP) * 100 : 0}%` }} /></span>
                {turnSet.has(k) && <span className="scar" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
        <p role="status" className="num" style={{ fontSize: 16 }}>
          <strong>{t('Ply {n}', { n: current + 1 })}</strong> · {pname(pa.mover)} · {t('{who} ahead by {n} kete', { who: evals[current] >= 0 ? pname(viewer) : pname(other(viewer)), n: fmt(evals[current]) })}
          {bySubject && (pa.loss >= 0.5 ? ` · ${t('cost {k} against the coach', { k: lossText(t, pa.loss) })}` : ` · ${t('matched the coach')}`)}
        </p>
      </section>

      {turning.length > 0 && (
        <section className="stack" aria-labelledby="tp-h" style={{ gap: 18 }}>
          <h2 id="tp-h" className="disp" style={{ fontSize: 28 }}>{t('Turning points')}</h2>
          <div className="turns">
            {turning.map((x) => {
              const p = positions[x.ply];
              const c = legalMoves(p, rules).find((y) => sameMove(y.move, game.moves[x.ply]));
              const d = c ? describe(p, c, viewer, rules) : null;
              const line = lineText(p, x.pv?.length ? x.pv : [x.best], viewer, rules);
              return (
                <button key={x.ply} type="button" className="turn" aria-pressed={x.ply === current} onClick={() => setSel(x.ply)}>
                  <span className="lbl num" style={{ color: 'var(--ochre-ink)' }}>{t('Ply {n}', { n: x.ply + 1 })} · {t('cost {k}', { k: lossText(t, x.loss) })} · {verdictWord(t, x.loss)}</span>
                  <span className="disp" style={{ fontSize: 22, lineHeight: 1.2 }}>{d?.headline ?? t('Your move')}</span>
                  <span className="line"><span className="lbl">{t('Coach’s line')}</span><span className="num">{line.join('  ·  ')}</span></span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="split" aria-labelledby="pos-h">
        <figure style={{ margin: 0 }} className="stack">
          <Board pos={pos} viewer={viewer} label={t('Board before ply {n}', { n: current + 1 })}
            youMark={playedC ? [pos.toMove, playedC.move.pit] : null}
            coachMark={bestC && !sameMove(bestC.move, game.moves[current]) ? [pos.toMove, bestC.move.pit] : null} />
          <figcaption className="key">
            <span><i className="ring-sw" style={{ boxShadow: 'inset 0 0 0 3px var(--ink)' }} />{t('Move played')}</span>
            <span><i className="ring-sw" style={{ boxShadow: 'inset 0 0 0 3px var(--ochre)' }} />{t('Coach’s move')}</span>
            <span>{t('Position before ply {n}', { n: current + 1 })}</span>
          </figcaption>
        </figure>
        <div className="card stack" style={{ gap: 14 }}>
          <p className="lbl">{t('Ply {n}', { n: current + 1 })} · {pname(pa.mover)}</p>
          <h2 id="pos-h" className="disp" style={{ fontSize: 28, lineHeight: 1.15 }}>{played?.headline ?? t('Move')}</h2>
          <div className="pair">
            <div className="pair-you"><span className="lbl">{t('Played')}</span><p className="num">{note(playedC)}</p></div>
            <div className="pair-coach"><span className="lbl" style={{ color: 'var(--ochre-ink)' }}>{t('Coach played')}</span><p className="num">{note(bestC)}</p></div>
          </div>
          {played && <p style={{ lineHeight: 1.6 }}>{played.why}</p>}
          {best && bestC && playedC && !sameMove(bestC.move, playedC.move) && (
            <p style={{ lineHeight: 1.6 }}><strong>{t('Coach')}:</strong> {best.headline} {best.why}</p>
          )}
          <p className="line"><span className="lbl">{t('Coach’s line from here')}</span><span className="num">{coachLine.join('  ·  ')}</span></p>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn small sq" aria-label={t('Previous ply')} disabled={current === 0} onClick={() => setSel(Math.max(0, current - 1))}>◀</button>
            <button type="button" className="btn small sq" aria-label={t('Next ply')} disabled={current >= plies.length - 1} onClick={() => setSel(Math.min(plies.length - 1, current + 1))}>▶</button>
            <span className="muted" style={{ fontSize: 14 }}>{t('Scores come from a search of up to {n} plies per move.', { n: pa.depth ?? 3 })}</span>
          </div>
        </div>
      </section>

      <div className="split">
        <Library current={game.id} />
        <ShareBox game={game} />
      </div>
    </div>
  );
}

function ImportOnly() {
  const t = useT();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  return (
    <section className="card stack" style={{ gap: 12 }} aria-labelledby="imp-h">
      <h2 id="imp-h" className="lbl">{t('Import a game')}</h2>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Paste a share link, a text record or JSON')} aria-labelledby="imp-h" />
      <div><button type="button" className="btn small go" disabled={!text.trim()} onClick={() => {
        try { const g = parseGame(text); store.archive(g); go(`#/review?id=${g.id}`); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
      }}>{t('Import')}</button></div>
      {err && <p role="alert" className="err">{t('Could not import: {m}', { m: err })}</p>}
    </section>
  );
}
