import { useEffect, useMemo, useRef, useState } from 'react';
import { NYUMBA, TOTAL_KETE, cellAt, clonePosition, initialPosition, pitName, sum } from '../engine/board';
import type { Advice } from '../engine/coach';
import { status } from '../engine/rules';
import { RULESETS, rulesFor, type RulesetId } from '../engine/ruleset';
import type { Position, Side } from '../engine/types';
import { Board } from '../ui/Board';
import { CornerStage, type StageCount } from '../ui/CornerStage';
import { engine } from '../ui/engineClient';
import { useT } from '../ui/i18n';
import { go } from '../ui/route';
import { store } from '../ui/storage';
import { CONFIDENT, findBoard, readBoard, type Raster } from '../vision/count';
import type { Pt } from '../vision/geometry';
import { defaultCorners, synthBoard } from '../vision/synth';

const ROWS = ['D', 'C', 'A', 'B'];
const MAX_SIDE = 1280;

function emptyPosition(): Position {
  return { pits: [new Array(16).fill(0), new Array(16).fill(0)], stock: [0, 0], nyumba: [false, false], toMove: 0, blocked: null };
}

/** The sample photo's position: a mid-game board (mtaji), 64 kete, South's nyumba still working. */
export function samplePosition(): Position {
  return {
    pits: [[2, 3, 0, 4, 7, 1, 2, 3, 1, 0, 2, 3, 0, 1, 2, 1], [3, 1, 2, 6, 0, 2, 4, 1, 2, 3, 0, 1, 4, 2, 0, 1]],
    stock: [0, 0], nyumba: [true, false], toMove: 0, blocked: null,
  };
}

interface Photo { url: string; raster: Raster }

function rasterFrom(source: CanvasImageSource, w: number, h: number): Photo {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(source, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  return { url: c.toDataURL('image/jpeg', 0.88), raster: { width: c.width, height: c.height, data: d.data } };
}

const keyOf = (s: Side, i: number) => `${s}:${i}`;

export function Reader() {
  const t = useT();
  const [pos, setPos] = useState<Position>(() => initialPosition());
  const [sel, setSel] = useState<[Side, number]>([0, NYUMBA]);
  const [cam, setCam] = useState<'off' | 'starting' | 'on' | 'denied'>('off');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [corners, setCorners] = useState<Pt[] | null>(null);
  const [found, setFound] = useState<'auto' | 'guide' | null>(null);
  const [counted, setCounted] = useState<StageCount[] | null>(null);
  const [unsure, setUnsure] = useState<Set<string>>(new Set());
  const [ruleset, setRuleset] = useState<RulesetId>(store.ruleset());
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const stop = () => { stream.current?.getTracks().forEach((x) => x.stop()); stream.current = null; };
  useEffect(() => stop, []);

  const usePhoto = (p: Photo) => {
    setPhoto(p);
    setCounted(null);
    setAdvice(null);
    const auto = findBoard(p.raster);
    setCorners(auto ?? defaultCorners(p.raster.width, p.raster.height));
    setFound(auto ? 'auto' : 'guide');
    setNote('');
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setCam('denied'); return; }
    setCam('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
      stream.current = s;
      setPhoto(null);
      setCam('on');
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; void video.current.play(); } });
    } catch {
      setCam('denied');
    }
  };

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const p = rasterFrom(v, v.videoWidth, v.videoHeight);
    stop();
    setCam('off');
    usePhoto(p);
  };

  const upload = (f: File) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { usePhoto(rasterFrom(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
    img.onerror = () => { setNote(t('That file could not be opened as a photo.')); URL.revokeObjectURL(url); };
    img.src = url;
  };

  const sample = () => {
    const sp = samplePosition();
    const counts = [0, 1, 2, 3].map((r) => Array.from({ length: 8 }, (_, c) => { const [s, i] = cellAt(0, r, c); return sp.pits[s][i]; }));
    const W = 960, H = 720;
    const raster = synthBoard({ width: W, height: H, counts, seed: 11 });
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d')!.putImageData(new ImageData(raster.data, W, H), 0, 0);
    stop();
    setCam('off');
    usePhoto({ url: c.toDataURL('image/jpeg', 0.9), raster });
    setPos((p) => ({ ...p, stock: [0, 0], nyumba: [true, false], toMove: 0, blocked: null }));
    setNote(t('A sample photo of a mid-game board. Nothing in hand; your nyumba still works.'));
  };

  const count = () => {
    if (!photo || !corners) return;
    try {
      const r = readBoard(photo.raster, corners);
      const n = new Set<string>();
      setPos((p) => {
        const q = clonePosition(p);
        for (const x of r.pits) {
          const [s, i] = cellAt(0, x.row, x.col);
          q.pits[s][i] = x.count;
          if (x.confidence < CONFIDENT) n.add(keyOf(s, i));
        }
        return q;
      });
      setUnsure(n);
      setCounted(r.pits.map((x) => ({ row: x.row, col: x.col, count: x.count, unsure: x.confidence < CONFIDENT })));
      setAdvice(null);
      setNote(n.size === 0 ? t('Counted every pit. Check the total below.') : t('Counted. {n} pits are uncertain: they have a dashed ring. Check those first.', { n: n.size }));
    } catch {
      setNote(t('Those corner marks don’t make a board shape. Move them onto the four corner pits.'));
    }
  };

  const update = (f: (p: Position) => void) => {
    setPos((p) => { const n = clonePosition(p); f(n); return n; });
    setAdvice(null);
  };
  const bump = (d: number) => {
    update((p) => { p.pits[sel[0]][sel[1]] = Math.max(0, Math.min(40, p.pits[sel[0]][sel[1]] + d)); });
    setUnsure((u) => { const n = new Set(u); n.delete(keyOf(sel[0], sel[1])); return n; });
  };

  const total = sum(pos.pits[0]) + sum(pos.pits[1]) + pos.stock[0] + pos.stock[1];
  const rules = rulesFor(ruleset);
  const st = useMemo(() => (total === TOTAL_KETE ? status(pos, undefined, rules) : null), [pos, total, rules]);
  const valid = total === TOTAL_KETE && st !== null && !st.over;
  const selName = pitName(0, sel[0], sel[1]);

  const analyse = async () => {
    setThinking(true);
    try { setAdvice(await engine('coach').advise(pos, rules)); } finally { setThinking(false); }
  };
  const playOn = () => { store.putSetup(pos, ruleset); go('#/play?new=' + Date.now()); };

  const totalNote = total === TOTAL_KETE
    ? st?.over ? (st.winner === 0 ? t('This position is already over: you win.') : t('This position is already over: Fundi wins.')) : t('All 64 kete are accounted for. Ready to analyse.')
    : total < TOTAL_KETE ? t('{n} kete missing. Check the pits, or add kete still in hand if you are in namua.', { n: TOTAL_KETE - total }) : t('{n} too many. One pit is overcounted.', { n: total - TOTAL_KETE });

  return (
    <div className="reader">
      <section aria-label={t('Photo')} className="stack" style={{ gap: 18 }}>
        <div className="stack" style={{ gap: 10 }}>
          <p className="lbl">{t('Board reader')}</p>
          <h1 className="disp" style={{ fontSize: 'clamp(34px, 4.2vw, 56px)', lineHeight: 1.04 }}>{t('Bring a real board in. Get the position back.')}</h1>
          <p className="muted" style={{ lineHeight: 1.55, fontSize: 17 }}>
            {t('Photograph the board from your own seat, line the four marks up with the outer corners of the corner pits, and Seed Mind counts the grey seeds. The photo never leaves your device.')}
          </p>
        </div>

        <div data-tour="reader-photo" className="stack" style={{ gap: 14 }}>
          {photo && corners && cam !== 'on' ? (
            <CornerStage src={photo.url} width={photo.raster.width} height={photo.raster.height} corners={corners}
              onChange={(c) => { setCorners(c); setCounted(null); }} counts={counted} />
          ) : (
            <div className="camera">
              {cam === 'on' && <video ref={video} playsInline muted aria-label={t('Live camera view')} />}
              {cam !== 'on' && (
                <p style={{ padding: 24, textAlign: 'center', maxWidth: 340 }}>
                  {cam === 'denied' ? t('Camera unavailable. Upload a photo instead, or enter the board by hand.') : cam === 'starting' ? t('Starting camera…') : t('Shoot from your seat with the whole board in frame, in daylight, without flash.')}
                </p>
              )}
              <span className="corner" style={{ left: '7%', top: '20%', borderRight: 0, borderBottom: 0 }} aria-hidden="true" />
              <span className="corner" style={{ right: '7%', top: '20%', borderLeft: 0, borderBottom: 0 }} aria-hidden="true" />
              <span className="corner" style={{ left: '7%', bottom: '18%', borderRight: 0, borderTop: 0 }} aria-hidden="true" />
              <span className="corner" style={{ right: '7%', bottom: '18%', borderLeft: 0, borderTop: 0 }} aria-hidden="true" />
            </div>
          )}
          <div className="row">
            {cam === 'on'
              ? <button type="button" className="btn go" onClick={capture}>{t('Take photo')}</button>
              : <button type="button" className="btn" onClick={() => void startCamera()}>{photo ? t('Retake with camera') : t('Open camera')}</button>}
            <button type="button" className="btn" onClick={() => file.current?.click()}>{t('Upload a photo')}</button>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
            <button type="button" className="btn small" onClick={sample}>{t('Try a sample photo')}</button>
          </div>
          {photo && corners && (
            <div className="card stack" style={{ gap: 10 }}>
              <p className="lbl">{t('Step 2 · Mark the corners')}</p>
              <p className="muted">{found === 'auto'
                ? t('The marks were placed automatically. Drag them onto the outer corners of the four corner pits if they are off.')
                : t('No board outline was found, so the marks start at the guide. Drag them onto the outer corners of the four corner pits.')}</p>
              <div className="row">
                <button type="button" className="btn go" onClick={count}>{t('Count the seeds')}</button>
                <button type="button" className="btn small" onClick={() => { const a = findBoard(photo.raster); if (a) { setCorners(a); setFound('auto'); setCounted(null); } }}>{t('Find the board again')}</button>
              </div>
            </div>
          )}
          {note && <p role="status" className="muted">{note}</p>}
        </div>
      </section>

      <section aria-labelledby="read-h" className="stack" style={{ gap: 20 }}>
        <div className="card stack" style={{ gap: 16 }} data-tour="reader-grid">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 id="read-h" className="disp" style={{ fontSize: 30 }}>{t('The board, pit by pit')}</h2>
            <span className="lbl">{t('Seen from your seat')}</span>
          </div>
          <div className="edit-grid" role="group" aria-label={t('Kete count per pit. Select a pit, then change its count.')}>
            {ROWS.map((rn, r) => [
              r === 2 ? <div className="mid" key="mid" aria-hidden="true" /> : null,
              <span className="rl" key={`l${r}`}>{rn}</span>,
              ...Array.from({ length: 8 }, (_, c) => {
                const [side, i] = cellAt(0, r, c);
                const isSel = sel[0] === side && sel[1] === i;
                const u = unsure.has(keyOf(side, i));
                return (
                  <button key={`${r}-${c}`} type="button" className={`rd${i === NYUMBA ? ' ny' : ''}${u ? ' unsure' : ''}`} aria-pressed={isSel}
                    aria-label={`${pitName(0, side, i)}${i === NYUMBA ? ` ${t('nyumba')}` : ''}, ${t('{n} kete', { n: pos.pits[side][i] })}${u ? `, ${t('uncertain, please check')}` : ''}`} onClick={() => setSel([side, i])}>
                    {pos.pits[side][i]}
                  </button>
                );
              }),
            ])}
          </div>
          <div className="row muted" style={{ fontSize: 14, gap: 16 }}>
            <span>{t('D, C · Fundi’s back and front rows')}</span><span>{t('A, B · your front and back rows')}</span><span>{t('Square pits are the nyumba')}</span>
            {unsure.size > 0 && <span><i className="unsure-sw" aria-hidden="true" /> {t('dashed: uncertain count')}</span>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn small" onClick={() => { update((p) => Object.assign(p, initialPosition())); setUnsure(new Set()); }}>{t('Opening position')}</button>
            <button type="button" className="btn small" onClick={() => { update((p) => Object.assign(p, emptyPosition())); setUnsure(new Set()); }}>{t('Clear board')}</button>
          </div>
        </div>

        <div className="card row" style={{ gap: 18 }}>
          <div className="stack" style={{ gap: 4, flex: '1 1 200px' }}>
            <span className="lbl">{t('Set {pit}', { pit: selName })}</span>
            <span>{sel[1] === NYUMBA ? t('{pit} is a nyumba and holds {n} kete.', { pit: selName, n: pos.pits[sel[0]][sel[1]] }) : t('{pit} holds {n} kete.', { pit: selName, n: pos.pits[sel[0]][sel[1]] })}</span>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="btn sq" aria-label={t('One fewer kete in {pit}', { pit: selName })} onClick={() => bump(-1)}>−</button>
            <span className="disp num" style={{ fontSize: 40, minWidth: 48, textAlign: 'center' }} aria-live="polite">{pos.pits[sel[0]][sel[1]]}</span>
            <button type="button" className="btn sq" aria-label={t('One more kete in {pit}', { pit: selName })} onClick={() => bump(1)}>+</button>
          </div>
        </div>

        <div className="card stack" style={{ gap: 14 }}>
          <div className="form-grid">
            <label className="field"><span className="lbl">{t('Your kete in hand')}</span>
              <input type="number" min={0} max={22} value={pos.stock[0]} onChange={(e) => update((p) => { p.stock[0] = Math.max(0, Math.min(22, Number(e.target.value) || 0)); })} /></label>
            <label className="field"><span className="lbl">{t('Fundi’s kete in hand')}</span>
              <input type="number" min={0} max={22} value={pos.stock[1]} onChange={(e) => update((p) => { p.stock[1] = Math.max(0, Math.min(22, Number(e.target.value) || 0)); })} /></label>
            <label className="field"><span className="lbl">{t('To move')}</span>
              <select value={pos.toMove} onChange={(e) => update((p) => { p.toMove = Number(e.target.value) as Side; p.blocked = null; })}>
                <option value={0}>{t('You')}</option><option value={1}>{t('Fundi')}</option>
              </select></label>
            <label className="field"><span className="lbl">{t('Rules')}</span>
              <select value={ruleset} onChange={(e) => setRuleset(e.target.value as RulesetId)}>
                {RULESETS.map((r) => <option key={r.id} value={r.id}>{t(r.name)}</option>)}
              </select></label>
            <label className="field"><span className="lbl">{t('Takasia-protected pit')}</span>
              <select value={pos.blocked ?? ''} onChange={(e) => update((p) => { p.blocked = e.target.value === '' ? null : Number(e.target.value); })}>
                <option value="">{t('None')}</option>
                {Array.from({ length: 8 }, (_, i) => <option key={i} value={i}>{pitName(0, pos.toMove, i)}</option>)}
              </select></label>
          </div>
          <div className="row">
            <label className="switch"><input type="checkbox" checked={pos.nyumba[0]} onChange={(e) => update((p) => { p.nyumba[0] = e.target.checked; })} />{t('Your nyumba still works')}</label>
            <label className="switch"><input type="checkbox" checked={pos.nyumba[1]} onChange={(e) => update((p) => { p.nyumba[1] = e.target.checked; })} />{t('Fundi’s nyumba still works')}</label>
          </div>
        </div>

        <div className="card stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="lbl">{t('Kete accounted for')}</span>
            <span className="disp num" style={{ fontSize: 30 }}>{t('{a} of {b}', { a: total, b: 64 })}</span>
          </div>
          <div className="meter" role="img" aria-label={t('{a} of {b} kete counted', { a: total, b: 64 })}><i style={{ width: `${Math.min(100, (total / TOTAL_KETE) * 100)}%` }} /></div>
          <p className="muted" data-testid="total-note">{totalNote}</p>
          <div className="row">
            <button type="button" className="btn go" disabled={!valid || thinking} onClick={() => void analyse()}>{thinking ? t('Analysing…') : t('Analyse this position')}</button>
            <button type="button" className="btn" disabled={!valid} onClick={playOn}>{t('Play on from here')}</button>
          </div>
        </div>

        {advice && (
          <div className="card coach stack" style={{ gap: 12 }} aria-live="polite">
            <span className="lbl" style={{ color: 'var(--ochre-ink)' }}>{t('Coach light')} · {pos.toMove === 0 ? t('your best move') : t('Fundi’s best move')}</span>
            <Board pos={pos} viewer={0} label={t('Analysed position')} coach={pos.toMove === 0 ? { start: advice.startPit, targets: advice.targets, path: advice.path } : null}
              coachMark={pos.toMove === 1 ? [1, advice.startPit] : null} />
            <p className="disp" style={{ fontSize: 24, lineHeight: 1.2 }}>{pos.toMove === 0 ? advice.headline : t('Fundi’s best: {pit}.', { pit: pitName(0, 1, advice.startPit) })}</p>
            {pos.toMove === 0 && <p className="muted" style={{ lineHeight: 1.55 }}>{advice.why}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
