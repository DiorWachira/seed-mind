/**
 * Mwongozo, the guided tour. A veil darkens the page except for a cut-out around the target
 * (which stays clickable), three growth rings ripple out from it, and a carved wooden tag
 * explains it. Progress is a row of small pits that fill with a seed per step.
 * Keys: ← → Esc. Focus moves into the tag and is trapped there; steps are announced.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from './i18n';
import { go, prefersReducedMotion } from './route';
import { TOUR } from './tourSteps';

interface Rect { x: number; y: number; w: number; h: number }

const HEADER_GAP = 16;
const PAD = 10;

function find(target: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  // Prefer a visible one (some targets exist in two layouts).
  return all.find((el) => el.offsetParent !== null || el.getClientRects().length > 0) ?? null;
}

function stickyHeaderHeight(): number {
  const bar = document.querySelector<HTMLElement>('.bar');
  if (!bar) return 0;
  const cs = getComputedStyle(bar);
  return cs.position === 'sticky' || cs.position === 'fixed' ? bar.getBoundingClientRect().height : 0;
}

export function Tour({ steps, onClose }: { steps: number[]; onClose: (finished: boolean) => void }) {
  const t = useT();
  const [k, setK] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const [cardH, setCardH] = useState(220);
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const el = useRef<HTMLElement | null>(null);
  const step = TOUR[steps[k]];
  const n = steps.length;
  const last = k === n - 1;

  const measure = useCallback(() => {
    const e = el.current;
    if (!e || !e.isConnected) { setRect(null); return; }
    const r = e.getBoundingClientRect();
    setRect({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 });
  }, []);

  // Navigate to the step's route, wait for its target, scroll it into view.
  useEffect(() => {
    let live = true;
    setMissing(false);
    setRect(null);
    el.current = null;
    const route = (window.location.hash.replace(/^#/, '') || '/').split('?')[0];
    if (step.route !== '*' && route !== step.route) go(`#${step.route}`);
    const started = performance.now();
    const look = () => {
      if (!live) return;
      const e = find(step.target);
      if (e) {
        el.current = e;
        const r = e.getBoundingClientRect();
        const top = stickyHeaderHeight() + HEADER_GAP;
        const vh = window.innerHeight;
        const fits = r.height + 2 * PAD < vh - top - 260;
        if (r.top < top || r.bottom > vh - (fits ? 260 : 0)) {
          const y = window.scrollY + r.top - top - (fits ? 0 : 0);
          window.scrollTo({ top: Math.max(0, y), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        }
        // measure after the scroll settles
        window.setTimeout(() => live && measure(), prefersReducedMotion() ? 30 : 380);
        measure();
        return;
      }
      if (performance.now() - started > 4000) { setMissing(true); return; }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
    return () => { live = false; };
  }, [k, step.route, step.target, measure]);

  useEffect(() => {
    const on = () => measure();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, { passive: true });
    const id = window.setInterval(on, 600); // targets can move as content loads
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on); window.clearInterval(id); };
  }, [measure]);

  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.getBoundingClientRect().height);
  });

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [k]);

  const next = useCallback(() => { if (last) onClose(true); else setK((x) => Math.min(n - 1, x + 1)); }, [last, n, onClose]);
  const back = useCallback(() => setK((x) => Math.max(0, x - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(false); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (e.key === 'Tab' && card.current) {
        const f = Array.from(card.current.querySelectorAll<HTMLElement>('button'));
        if (f.length === 0) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onClose]);

  // Card placement: below or above the target; docked to an edge on phones.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const phone = vw < 640;
  const W = Math.min(380, vw - 32);
  let cx = (vw - W) / 2;
  let cy = (vh - cardH) / 2;
  let notch: { side: 'top' | 'bottom'; x: number } | null = null;
  let dock: 'top' | 'bottom' | null = null;
  if (rect && !missing) {
    if (phone) {
      dock = rect.y + rect.h / 2 < vh * 0.55 ? 'bottom' : 'top';
    } else {
      const below = rect.y + rect.h + 18;
      const above = rect.y - 18 - cardH;
      if (below + cardH < vh - 8) { cy = below; notch = { side: 'top', x: 0 }; }
      else if (above > stickyHeaderHeight() + 8) { cy = above; notch = { side: 'bottom', x: 0 }; }
      else { cy = Math.max(8, vh - cardH - 16); }
      cx = Math.max(16, Math.min(vw - W - 16, rect.x + rect.w / 2 - W / 2));
      if (notch) notch.x = Math.max(22, Math.min(W - 22, rect.x + rect.w / 2 - cx));
    }
  }

  const hole = rect && !missing ? rect : null;
  const veilPath = `M0 0H${vw}V${vh}H0Z` + (hole ? ` M${hole.x + 8} ${hole.y}H${hole.x + hole.w - 8}Q${hole.x + hole.w} ${hole.y} ${hole.x + hole.w} ${hole.y + 8}V${hole.y + hole.h - 8}Q${hole.x + hole.w} ${hole.y + hole.h} ${hole.x + hole.w - 8} ${hole.y + hole.h}H${hole.x + 8}Q${hole.x} ${hole.y + hole.h} ${hole.x} ${hole.y + hole.h - 8}V${hole.y + 8}Q${hole.x} ${hole.y} ${hole.x + 8} ${hole.y}Z` : '');

  const style: React.CSSProperties = dock
    ? { left: 12, right: 12, width: 'auto', ...(dock === 'bottom' ? { bottom: 12 } : { top: 12 }) }
    : { left: cx, top: cy, width: W };

  return (
    <div className="tour" data-testid="tour">
      <svg className="tour-veil" width={vw} height={vh} aria-hidden="true">
        <path d={veilPath} fillRule="evenodd" />
      </svg>
      {hole && [0, 1, 2].map((i) => (
        <span key={`${k}-${i}`} className={`tour-ring r${i}`} aria-hidden="true"
          style={{ left: hole.x - i * 9, top: hole.y - i * 9, width: hole.w + i * 18, height: hole.h + i * 18 }} />
      ))}
      <div ref={card} className={`tour-tag${dock ? ` dock-${dock}` : ''}`} role="dialog" aria-modal="false" aria-labelledby="tour-h" aria-describedby="tour-b" style={style}>
        {notch && <span className={`tour-notch ${notch.side}`} style={{ left: notch.x }} aria-hidden="true" />}
        <div className="tour-top">
          <span className="tour-kicker">{t('Mwongozo · guide')} · <span className="num">{k + 1} / {n}</span></span>
          <button type="button" className="tour-x" onClick={() => onClose(false)} aria-label={t('Close the guide')}>×</button>
        </div>
        <h2 id="tour-h" ref={heading} tabIndex={-1}>{t(step.title)}</h2>
        <p id="tour-b">{missing ? t('This part of the screen isn’t showing right now. Carry on to the next step.') : t(step.body)}</p>
        <div className="tour-pits" role="progressbar" aria-valuemin={1} aria-valuemax={n} aria-valuenow={k + 1} aria-label={t('Guide progress')}>
          {steps.map((_, i) => <span key={i} className={i <= k ? 'full' : ''} />)}
        </div>
        <div className="tour-btns">
          <button type="button" className="tbtn" onClick={back} disabled={k === 0}>{t('Back')}</button>
          <button type="button" className="tbtn go" onClick={next}>{last ? t('Finish') : t('Next')}</button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{t('Step {k} of {n}', { k: k + 1, n })}: {t(step.title)}</p>
    </div>
  );
}

/** The one-time invitation. Opt-in: the tour never starts by itself. */
export function TourInvite({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  const t = useT();
  return (
    <div className="invite" role="dialog" aria-labelledby="inv-h" data-testid="tour-invite">
      <span className="invite-ring" aria-hidden="true" />
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="inv-h">{t('Karibu! New to Seed Mind?')}</h2>
        <p>{t('A one-minute tour shows how to play, read the coach light and review a game.')}</p>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="tbtn go" onClick={onStart}>{t('Start the tour')}</button>
        <button type="button" className="tbtn" onClick={onDismiss}>{t('Not now')}</button>
      </div>
    </div>
  );
}
