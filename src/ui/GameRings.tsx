/**
 * Game rings: a game drawn as a cross-section of the tree the board was carved from.
 * Read it like a dendrochronologist reads a stump: the pith is the opening, each growth ring
 * is one move, a WIDE ring is a good year (a move close to the coach's), a NARROW ring is a
 * hard one (kete given away), and a fire scar (ochre, the coach's colour) marks each turning
 * point. Hover or use the arrow keys to read a ring; click or Enter to open that move.
 */
import { useMemo, useRef, useState } from 'react';
import type { PlyAnalysis } from '../engine/coach';
import { verdictFor } from '../engine/coach';
import { useT } from './i18n';

export interface RingPly { ply: number; loss: number; mover: number; note: string }

const MAX_W = 9;
const MIN_W = 2;
const widthFor = (loss: number) => MIN_W + (MAX_W - MIN_W) * (1 - Math.min(loss, 4) / 4);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** A slightly irregular closed ring path, like real growth. */
function ringPath(cx: number, cy: number, r: number, wobble: number, seed: number): string {
  const R = rng(seed);
  const a1 = R() * 6.28, a2 = R() * 6.28;
  const pts: string[] = [];
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r + wobble * (0.6 * Math.sin(a * 2 + a1) + 0.4 * Math.sin(a * 3 + a2));
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

export function ringsFrom(plies: PlyAnalysis[], subject: number | null, notation: string[]): RingPly[] {
  return plies.filter((p) => subject === null || p.mover === subject).map((p) => ({ ply: p.ply, loss: p.loss, mover: p.mover, note: notation[p.ply] ?? '' }));
}

export function GameRings({ rings, turning, selected, onSelect, size = 360, mini = false, label, describeRing }: {
  rings: RingPly[];
  turning: Set<number>;
  selected?: number | null;
  onSelect?: (ply: number) => void;
  size?: number;
  mini?: boolean;
  label: string;
  describeRing?: (r: RingPly, i: number) => string;
}) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const c = size / 2;
  const pith = mini ? size * 0.08 : size * 0.06;
  const bark = mini ? 3 : 10;

  // Radii: widths scaled to fill the section.
  const geo = useMemo(() => {
    const raw = rings.map((r) => widthFor(r.loss));
    const total = raw.reduce((a, b) => a + b, 0) || 1;
    const avail = c - pith - bark - (mini ? 1 : 6);
    const k = Math.min(avail / total, mini ? 4 : 3.2);
    let r = pith;
    return raw.map((w) => { const inner = r; r += w * k; return { inner, outer: r, w: w * k }; });
  }, [rings, c, pith, bark, mini]);
  const outerR = geo.length ? geo[geo.length - 1].outer : pith;

  const idxAt = (clientX: number, clientY: number): number | null => {
    const el = svg.current;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const s = size / b.width;
    const d = Math.hypot((clientX - b.left) * s - c, (clientY - b.top) * s - c);
    if (d < pith || d > outerR + 4) return null;
    const i = geo.findIndex((g) => d >= g.inner && d < g.outer);
    return i >= 0 ? i : geo.length - 1;
  };

  const selIdx = selected == null ? -1 : rings.findIndex((r) => r.ply === selected);
  const active = hover ?? focusIdx ?? (selIdx >= 0 ? selIdx : null);
  const scarAngle = -Math.PI / 3;

  const body = (
    <>
      <defs>
        <radialGradient id={mini ? undefined : 'rings-wood'} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--rings-core)" />
          <stop offset="100%" stopColor="var(--rings-sap)" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={outerR + bark} className="rings-bark" />
      <circle cx={c} cy={c} r={outerR} fill={mini ? 'var(--rings-sap)' : 'url(#rings-wood)'} />
      {geo.map((g, i) => (
        <g key={rings[i].ply}>
          {/* latewood line at the ring's outer edge; heavier for a narrow (hard) year */}
          <path d={ringPath(c, c, g.outer - Math.min(1.2, g.w * 0.3), mini ? 0.4 : 1.1, rings[i].ply + 7)} className="rings-late"
            strokeWidth={mini ? 0.7 : g.w < 6 ? 1.8 : 1.1} />
          {!mini && i === active && <path d={ringPath(c, c, (g.inner + g.outer) / 2, 1.1, rings[i].ply + 7)} className="rings-active" strokeWidth={Math.max(3, g.w)} />}
          {turning.has(rings[i].ply) && (
            <path className="rings-scar" strokeWidth={mini ? 2 : Math.max(3, g.w * 0.9)}
              d={`M${c + ((g.inner + g.outer) / 2) * Math.cos(scarAngle - 0.22)} ${c + ((g.inner + g.outer) / 2) * Math.sin(scarAngle - 0.22)} A${(g.inner + g.outer) / 2} ${(g.inner + g.outer) / 2} 0 0 1 ${c + ((g.inner + g.outer) / 2) * Math.cos(scarAngle + 0.22)} ${c + ((g.inner + g.outer) / 2) * Math.sin(scarAngle + 0.22)}`} />
          )}
        </g>
      ))}
      <circle cx={c} cy={c} r={pith} className="rings-pith" />
      {!mini && <text x={c} y={c + 4} textAnchor="middle" className="rings-pith-t">{t('start')}</text>}
      {!mini && <path className="rings-check" d={`M${c} ${c - pith} V${c - outerR - bark + 2}`} />}
    </>
  );

  if (mini) {
    return <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label} className="rings mini">{body}</svg>;
  }

  const readout = active !== null && rings[active]
    ? (describeRing ? describeRing(rings[active], active) : `${rings[active].note}`)
    : t('Point at a ring to read it. Wide rings are strong moves; narrow rings cost kete; ochre scars are turning points.');

  const onKey = (e: React.KeyboardEvent) => {
    if (rings.length === 0) return;
    const cur = focusIdx ?? (selIdx >= 0 ? selIdx : 0);
    let n = cur;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = Math.min(rings.length - 1, cur + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = Math.max(0, cur - 1);
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = rings.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(rings[cur].ply); return; }
    else return;
    e.preventDefault();
    e.stopPropagation();
    setFocusIdx(n);
  };

  return (
    <div className="rings-fig">
      <svg ref={svg} viewBox={`0 0 ${size} ${size}`} className="rings" role="slider" tabIndex={0}
        aria-label={label} aria-valuemin={1} aria-valuemax={Math.max(1, rings.length)} aria-valuenow={(active ?? 0) + 1} aria-valuetext={readout}
        onMouseMove={(e) => setHover(idxAt(e.clientX, e.clientY))} onMouseLeave={() => setHover(null)}
        onClick={(e) => { const i = idxAt(e.clientX, e.clientY); if (i !== null) onSelect?.(rings[i].ply); }}
        onKeyDown={onKey} onFocus={() => setFocusIdx(selIdx >= 0 ? selIdx : 0)} onBlur={() => setFocusIdx(null)}
        data-testid="game-rings">
        {body}
      </svg>
      <p className="rings-readout" aria-hidden="true">{readout}</p>
    </div>
  );
}

export const ringVerdict = verdictFor;
