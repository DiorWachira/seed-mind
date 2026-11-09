import { NYUMBA, cellAt, pitName } from '../engine/board';
import type { Position, Side } from '../engine/types';

export interface CoachLight {
  /** Mover pit (mover's frame) to start from. */
  start: number;
  /** Opponent pits (opponent's frame) that will be captured. */
  targets: number[];
  /** Mover pits sown, in order, for the raking light. */
  path: number[];
}

export interface BoardProps {
  pos: Position;
  viewer: Side;
  /** Pits of `viewer` that can be picked. When absent, the board is read-only. */
  pickable?: (pit: number) => boolean;
  onPick?: (pit: number) => void;
  selected?: number | null;
  /** Coach light for the side to move (drawn only when that side is the viewer). */
  coach?: CoachLight | null;
  /** Review marks: [side, pit] pairs. */
  youMark?: [Side, number] | null;
  coachMark?: [Side, number] | null;
  /** Pit currently receiving a seed during animation. */
  hot?: [Side, number] | null;
  label: string;
}

const dotCache = new Map<number, { x: string; y: string }[]>();
export function seedDots(n: number) {
  const k = Math.min(n, 12);
  let d = dotCache.get(k);
  if (!d) {
    d = [];
    for (let j = 0; j < k; j++) {
      const r = k === 1 ? 0 : 30 * Math.sqrt((j + 0.5) / k);
      const a = j * 2.39996;
      d.push({ x: `${(50 + r * Math.cos(a)).toFixed(1)}%`, y: `${(50 + r * 0.92 * Math.sin(a)).toFixed(1)}%` });
    }
    dotCache.set(k, d);
  }
  return d;
}

function PitBody({ n }: { n: number }) {
  return (
    <>
      {seedDots(n).map((d, i) => <span key={i} className="seed" style={{ left: d.x, top: d.y }} />)}
      <span className="cnt" aria-hidden="true">{n}</span>
    </>
  );
}

export function Board({ pos, viewer, pickable, onPick, selected, coach, youMark, coachMark, hot, label }: BoardProps) {
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      const [side, i] = cellAt(viewer, r, c);
      const n = pos.pits[side][i];
      const mine = side === viewer;
      const cls = ['pit'];
      if (i === NYUMBA && i < 8) cls.push('ny');
      let delay = 0;
      if (coach && pos.toMove === viewer) {
        if (mine && i === coach.start) cls.push('coach');
        if (!mine && coach.targets.includes(i)) cls.push('target');
        const k = mine ? coach.path.indexOf(i) : -1;
        if (k >= 0) { cls.push('lit'); delay = k * 140; }
      }
      if (youMark && youMark[0] === side && youMark[1] === i) cls.push('you');
      if (coachMark && coachMark[0] === side && coachMark[1] === i) cls.push('coach');
      if (hot && hot[0] === side && hot[1] === i) cls.push('hot');
      const isBlocked = side === pos.toMove && pos.blocked === i;
      if (isBlocked) cls.push('blocked');
      const house = i === NYUMBA && pos.nyumba[side] ? ' nyumba' : '';
      const name = pitName(viewer, side, i) + house + `, ${n} kete` + (isBlocked ? ', protected by takasia' : '');
      const canPick = mine && !!onPick && (pickable ? pickable(i) : true);
      if (mine && onPick) {
        if (selected === i) cls.push('sel');
        if (!canPick) cls.push('dim');
        cells.push(
          <div className="cell" key={`${r}-${c}`}>
            <button type="button" className="pit-btn" aria-label={name} aria-pressed={selected === i} disabled={!canPick} onClick={() => onPick(i)}>
              <span className={cls.join(' ')} style={{ animationDelay: `${delay}ms` }}><PitBody n={n} /></span>
            </button>
          </div>,
        );
      } else {
        cells.push(
          <div className="cell" key={`${r}-${c}`}>
            <span className={cls.join(' ')} style={{ animationDelay: `${delay}ms` }} role="img" aria-label={name}><PitBody n={n} /></span>
          </div>,
        );
      }
    }
  }
  return (
    <div className="slab" role="group" aria-label={label}>
      <div className="pits">{cells}</div>
    </div>
  );
}

export function Heap({ n }: { n: number }) {
  return (
    <div className="heap" aria-hidden="true">
      {Array.from({ length: Math.min(n, 12) }, (_, i) => <span key={i} />)}
    </div>
  );
}
