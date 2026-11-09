/**
 * The photo with the board's four corner marks. Drag a mark (mouse, touch or pen), or focus it
 * and nudge with the arrow keys (Shift = bigger steps). The projected 4 x 8 grid follows, so
 * you can see when the marks sit on the outer corners of the corner pits. After counting,
 * each pit shows its count, with a dashed ring when the reader is unsure.
 */
import { useRef } from 'react';
import { apply, boardToImage, type Pt } from '../vision/geometry';
import { useT } from './i18n';

export interface StageCount { row: number; col: number; count: number; unsure: boolean }

const NAMES = ['far left', 'far right', 'near right', 'near left'];

export function CornerStage({ src, width, height, corners, onChange, counts }: {
  src: string;
  width: number;
  height: number;
  corners: Pt[];
  onChange: (c: Pt[]) => void;
  counts: StageCount[] | null;
}) {
  const t = useT();
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  let h: number[] | null = null;
  try { h = boardToImage(corners); } catch { h = null; }
  const P = (x: number, y: number) => (h ? apply(h, { x, y }) : { x: 0, y: 0 });

  const toImg = (clientX: number, clientY: number): Pt => {
    const b = svg.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(width, ((clientX - b.left) / b.width) * width)),
      y: Math.max(0, Math.min(height, ((clientY - b.top) / b.height) * height)),
    };
  };
  const move = (i: number, p: Pt) => onChange(corners.map((c, j) => (j === i ? p : c)));
  const handle = Math.max(width, height) / 38;

  const lines: string[] = [];
  if (h) {
    for (let c = 0; c <= 8; c++) { const a = P(c, 0), b = P(c, 4); lines.push(`M${a.x} ${a.y}L${b.x} ${b.y}`); }
    for (let r = 0; r <= 4; r++) { const a = P(0, r), b = P(8, r); lines.push(`M${a.x} ${a.y}L${b.x} ${b.y}`); }
  }

  return (
    <div className="stage" style={{ aspectRatio: `${width} / ${height}` }}>
      <img src={src} alt={t('Your photo of the board')} draggable={false} />
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} className="stage-svg"
        onPointerMove={(e) => { if (drag.current !== null) move(drag.current, toImg(e.clientX, e.clientY)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {h && <path d={lines.join('')} className="stage-grid" style={{ strokeWidth: Math.max(1, width / 500) }} />}
        <polygon points={corners.map((p) => `${p.x},${p.y}`).join(' ')} className="stage-quad" style={{ strokeWidth: Math.max(2, width / 300) }} />
        {h && counts?.map((c) => {
          const p = P(c.col + 0.5, c.row + 0.5);
          const q = P(c.col + 0.9, c.row + 0.5);
          const r = Math.hypot(q.x - p.x, q.y - p.y);
          return (
            <g key={`${c.row}-${c.col}`}>
              <circle cx={p.x} cy={p.y} r={r} className={c.unsure ? 'stage-pit unsure' : 'stage-pit'} style={{ strokeWidth: Math.max(1.5, width / 400) }} />
              <text x={p.x} y={p.y + r * 0.35} textAnchor="middle" className="stage-n" style={{ fontSize: r * 1.0 }}>{c.count}</text>
            </g>
          );
        })}
        {corners.map((p, i) => (
          <g key={i} className="stage-handle" tabIndex={0} role="button"
            aria-label={t('Corner mark: {name}. Drag, or use the arrow keys to move it.', { name: t(NAMES[i]) })}
            onPointerDown={(e) => { drag.current = i; (e.target as Element).setPointerCapture?.(e.pointerId); e.preventDefault(); }}
            onKeyDown={(e) => {
              const s = (e.shiftKey ? 12 : 3) * (width / 640);
              const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
              if (!d) return;
              e.preventDefault();
              move(i, { x: Math.max(0, Math.min(width, p.x + d[0])), y: Math.max(0, Math.min(height, p.y + d[1])) });
            }}>
            <circle cx={p.x} cy={p.y} r={handle * 1.9} className="stage-hit" />
            <circle cx={p.x} cy={p.y} r={handle} className="stage-dot" style={{ strokeWidth: handle / 3 }} />
            <circle cx={p.x} cy={p.y} r={handle / 3.2} className="stage-core" />
          </g>
        ))}
      </svg>
    </div>
  );
}
