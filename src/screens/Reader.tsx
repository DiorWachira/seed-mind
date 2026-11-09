import { useEffect, useMemo, useRef, useState } from 'react';
import { NYUMBA, TOTAL_KETE, cellAt, clonePosition, initialPosition, pitName, sum } from '../engine/board';
import type { Advice } from '../engine/coach';
import { status } from '../engine/rules';
import { rulesFor } from '../engine/ruleset';
import type { Position, Side } from '../engine/types';
import { Board } from '../ui/Board';
import { engine } from '../ui/engineClient';
import { go } from '../ui/route';
import { store } from '../ui/storage';

const ROWS = ['D', 'C', 'A', 'B'];

function emptyPosition(): Position {
  return { pits: [new Array(16).fill(0), new Array(16).fill(0)], stock: [0, 0], nyumba: [false, false], toMove: 0, blocked: null };
}

export function Reader() {
  const [pos, setPos] = useState<Position>(() => initialPosition());
  const [sel, setSel] = useState<[Side, number]>([0, NYUMBA]);
  const [cam, setCam] = useState<'off' | 'starting' | 'on' | 'denied'>('off');
  const [shot, setShot] = useState<string | null>(null);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [thinking, setThinking] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => stop, []);

  const startCamera = async () => {
    setShot(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCam('denied'); return; }
    setCam('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      stream.current = s;
      setCam('on');
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; void video.current.play(); } });
    } catch {
      setCam('denied');
    }
  };

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    setShot(c.toDataURL('image/jpeg', 0.85));
    stop();
    setCam('off');
  };

  const update = (f: (p: Position) => void) => {
    setPos((p) => { const n = clonePosition(p); f(n); return n; });
    setAdvice(null);
  };
  const bump = (d: number) => update((p) => { p.pits[sel[0]][sel[1]] = Math.max(0, Math.min(40, p.pits[sel[0]][sel[1]] + d)); });

  const total = sum(pos.pits[0]) + sum(pos.pits[1]) + pos.stock[0] + pos.stock[1];
  const rules = rulesFor(store.ruleset());
  const st = useMemo(() => (total === TOTAL_KETE ? status(pos, undefined, rules) : null), [pos, total, rules]);
  const valid = total === TOTAL_KETE && st !== null && !st.over;
  const selName = pitName(0, sel[0], sel[1]);

  const analyse = async () => {
    setThinking(true);
    try { setAdvice(await engine('coach').advise(pos, rules)); } finally { setThinking(false); }
  };
  const playOn = () => { store.putSetup(pos); go('#/play?new=' + Date.now()); };

  const totalNote = total === TOTAL_KETE
    ? st?.over ? `This position is already over: ${st.winner === 0 ? 'you' : 'Fundi'} win${st.winner === 0 ? '' : 's'}.` : 'All 64 kete are accounted for. Ready to analyse.'
    : total < TOTAL_KETE ? `${TOTAL_KETE - total} kete missing. Check the pits, or add kete still in hand if you are in namua.` : `${total - TOTAL_KETE} too many. One pit is overcounted.`;

  return (
    <div className="reader">
      <section aria-label="Camera" className="stack" style={{ gap: 18 }}>
        <div className="stack" style={{ gap: 10 }}>
          <p className="lbl">Board reader</p>
          <h1 className="disp" style={{ fontSize: 'clamp(34px, 4.2vw, 56px)', lineHeight: 1.04 }}>Bring a real board in. Get the position back.</h1>
          <p className="muted" style={{ lineHeight: 1.55, fontSize: 17 }}>
            Take a photo from your own side as a reference, then enter the count for each pit. Automatic counting from the photo is the next milestone; for now Seed Mind checks your counts add up to 64.
          </p>
        </div>
        <div className="camera">
          {cam === 'on' && <video ref={video} playsInline muted aria-label="Live camera view" />}
          {cam !== 'on' && shot && <img src={shot} alt="Your photo of the board, for reference while you enter counts" />}
          {cam !== 'on' && !shot && (
            <p style={{ padding: 24, textAlign: 'center', maxWidth: 320 }}>
              {cam === 'denied' ? 'Camera unavailable. You can still enter the board by hand.' : cam === 'starting' ? 'Starting camera…' : 'Shoot from your seat with the whole board in frame, in daylight.'}
            </p>
          )}
          <span className="corner" style={{ left: 14, top: 14, borderRight: 0, borderBottom: 0 }} aria-hidden="true" />
          <span className="corner" style={{ right: 14, top: 14, borderLeft: 0, borderBottom: 0 }} aria-hidden="true" />
          <span className="corner" style={{ left: 14, bottom: 14, borderRight: 0, borderTop: 0 }} aria-hidden="true" />
          <span className="corner" style={{ right: 14, bottom: 14, borderLeft: 0, borderTop: 0 }} aria-hidden="true" />
        </div>
        <div className="row">
          {cam === 'on'
            ? <button type="button" className="btn go" onClick={capture}>Take photo</button>
            : <button type="button" className="btn" onClick={() => void startCamera()}>{shot ? 'Retake photo' : 'Open camera'}</button>}
          <button type="button" className="btn small" onClick={() => update((p) => Object.assign(p, initialPosition()))}>Opening position</button>
          <button type="button" className="btn small" onClick={() => update((p) => Object.assign(p, emptyPosition()))}>Clear board</button>
        </div>
      </section>

      <section aria-labelledby="read-h" className="stack" style={{ gap: 20 }}>
        <div className="card stack" style={{ gap: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 id="read-h" className="disp" style={{ fontSize: 30 }}>The board, pit by pit</h2>
            <span className="lbl">Seen from your seat</span>
          </div>
          <div className="edit-grid" role="group" aria-label="Kete count per pit. Select a pit, then change its count.">
            {ROWS.map((rn, r) => [
              r === 2 ? <div className="mid" key="mid" aria-hidden="true" /> : null,
              <span className="rl" key={`l${r}`}>{rn}</span>,
              ...Array.from({ length: 8 }, (_, c) => {
                const [side, i] = cellAt(0, r, c);
                const isSel = sel[0] === side && sel[1] === i;
                return (
                  <button key={`${r}-${c}`} type="button" className={`rd${i === NYUMBA ? ' ny' : ''}`} aria-pressed={isSel}
                    aria-label={`${pitName(0, side, i)}${i === NYUMBA ? ' nyumba' : ''}, ${pos.pits[side][i]} kete`} onClick={() => setSel([side, i])}>
                    {pos.pits[side][i]}
                  </button>
                );
              }),
            ])}
          </div>
          <div className="row muted" style={{ fontSize: 14, gap: 16 }}>
            <span>D, C · Fundi’s back and front rows</span><span>A, B · your front and back rows</span><span>Square pits are the nyumba</span>
          </div>
        </div>

        <div className="card row" style={{ gap: 18 }}>
          <div className="stack" style={{ gap: 4, flex: '1 1 200px' }}>
            <span className="lbl">Set {selName}</span>
            <span>{selName}{sel[1] === NYUMBA ? ' is a nyumba' : ''} holds {pos.pits[sel[0]][sel[1]]} kete.</span>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="btn sq" aria-label={`One fewer kete in ${selName}`} onClick={() => bump(-1)}>−</button>
            <span className="disp num" style={{ fontSize: 40, minWidth: 48, textAlign: 'center' }} aria-live="polite">{pos.pits[sel[0]][sel[1]]}</span>
            <button type="button" className="btn sq" aria-label={`One more kete in ${selName}`} onClick={() => bump(1)}>+</button>
          </div>
        </div>

        <div className="card stack" style={{ gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <label className="field"><span className="lbl">Your kete in hand</span>
              <input type="number" min={0} max={22} value={pos.stock[0]} onChange={(e) => update((p) => { p.stock[0] = Math.max(0, Math.min(22, Number(e.target.value) || 0)); })} /></label>
            <label className="field"><span className="lbl">Fundi’s kete in hand</span>
              <input type="number" min={0} max={22} value={pos.stock[1]} onChange={(e) => update((p) => { p.stock[1] = Math.max(0, Math.min(22, Number(e.target.value) || 0)); })} /></label>
            <label className="field"><span className="lbl">To move</span>
              <select value={pos.toMove} onChange={(e) => update((p) => { p.toMove = Number(e.target.value) as Side; })}>
                <option value={0}>You</option><option value={1}>Fundi</option>
              </select></label>
          </div>
          <div className="row">
            <label className="switch"><input type="checkbox" checked={pos.nyumba[0]} onChange={(e) => update((p) => { p.nyumba[0] = e.target.checked; })} />Your nyumba still works</label>
            <label className="switch"><input type="checkbox" checked={pos.nyumba[1]} onChange={(e) => update((p) => { p.nyumba[1] = e.target.checked; })} />Fundi’s nyumba still works</label>
          </div>
        </div>

        <div className="card stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="lbl">Kete accounted for</span>
            <span className="disp num" style={{ fontSize: 30 }}>{total} of 64</span>
          </div>
          <div className="meter" role="img" aria-label={`${total} of 64 kete counted`}><i style={{ width: `${Math.min(100, (total / TOTAL_KETE) * 100)}%` }} /></div>
          <p className="muted">{totalNote}</p>
          <div className="row">
            <button type="button" className="btn go" disabled={!valid || thinking} onClick={() => void analyse()}>{thinking ? 'Analysing…' : 'Analyse this position'}</button>
            <button type="button" className="btn" disabled={!valid} onClick={playOn}>Play on from here</button>
          </div>
        </div>

        {advice && (
          <div className="card coach stack" style={{ gap: 12 }} aria-live="polite">
            <span className="lbl" style={{ color: 'var(--ochre-ink)' }}>Coach light · {pos.toMove === 0 ? 'your best move' : 'Fundi’s best move'}</span>
            <Board pos={pos} viewer={0} label="Analysed position" coach={pos.toMove === 0 ? { start: advice.startPit, targets: advice.targets, path: advice.path } : null}
              coachMark={pos.toMove === 1 ? [1, advice.startPit] : null} />
            <p className="disp" style={{ fontSize: 24, lineHeight: 1.2 }}>{pos.toMove === 0 ? advice.headline : `Fundi’s best: ${pitName(0, 1, advice.startPit)}.`}</p>
            {pos.toMove === 0 && <p className="muted" style={{ lineHeight: 1.55 }}>{advice.why}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
