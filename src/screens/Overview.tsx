import { useEffect, useState } from 'react';
import { initialPosition } from '../engine/board';
import type { Advice } from '../engine/coach';
import { Board } from '../ui/Board';
import { engine } from '../ui/engineClient';

const start = initialPosition();

export function Overview() {
  const [tip, setTip] = useState<Advice | null>(null);
  useEffect(() => {
    let live = true;
    engine('coach').advise(start).then((a) => { if (live) setTip(a); }).catch(() => {});
    return () => { live = false; };
  }, []);

  return (
    <>
      <section className="hero" aria-labelledby="h1">
        <div className="stack" style={{ gap: 22 }}>
          <p className="lbl">Bao la Kiswahili · engine &amp; coach</p>
          <h1 id="h1" className="disp" style={{ fontSize: 'clamp(42px, 5.5vw, 76px)', lineHeight: 1.02 }}>Every kete counted. Every move explained.</h1>
          <p className="muted" style={{ fontSize: 19, lineHeight: 1.55, maxWidth: '34em' }}>
            Seed Mind plays you at the strength you choose, lights up the move a fundi would make and explains why. It uses four rows of eight pits and 64 kete, the same as the board at the baraza.
          </p>
          <div className="row" style={{ gap: 14 }}>
            <a className="btn go" href="#/play">Cheza na Fundi (play)</a>
            <a className="btn" href="#/reader">Set up a real board</a>
          </div>
        </div>
        <figure style={{ margin: 0 }}>
          <div className="round">
            <div className="plate"><span className="lbl">Opening position</span><span>64 kete · 22 in each hand</span></div>
            <Board pos={start} viewer={0} label="The Bao opening position. Each side has 6 kete in its nyumba and 2 in each of the two pits to its right." coach={tip ? { start: tip.startPit, targets: tip.targets, path: tip.path } : null} />
            <div className="plate">
              <span className="lbl" style={{ color: 'var(--ochre-ink)' }}>Coach light</span>
              <span>{tip ? tip.headline : 'Reading the board…'}</span>
            </div>
          </div>
          <figcaption className="lbl" style={{ marginTop: 18, textAlign: 'center' }}>Fig. 1 · The coach light follows the sowing path and rings the pit it starts from</figcaption>
        </figure>
      </section>
      <section className="steps" aria-label="How a move works">
        <article className="card"><p className="lbl" style={{ marginBottom: 10 }}>01 · Lift</p><h2 className="disp" style={{ fontSize: 30, marginBottom: 10 }}>Choose a pit and a direction</h2><p className="muted" style={{ lineHeight: 1.55 }}>While you still have kete in hand (namua), place one into your front row. After that (mtaji), lift any pit with two or more kete and sow either way.</p></article>
        <article className="card"><p className="lbl" style={{ marginBottom: 10 }}>02 · Sow</p><h2 className="disp" style={{ fontSize: 30, marginBottom: 10 }}>One seed per pit, all the way round</h2><p className="muted" style={{ lineHeight: 1.55 }}>Seeds travel around your own two rows. If the last one lands in a pit that already had seeds, you lift that pit and keep sowing.</p></article>
        <article className="card"><p className="lbl" style={{ marginBottom: 10 }}>03 · Capture</p><h2 className="disp" style={{ fontSize: 30, marginBottom: 10 }}>Take, then re-sow from the kichwa</h2><p className="muted" style={{ lineHeight: 1.55 }}>End on a filled front pit facing Fundi’s kete and you take them all, then sow them back in from the end of your front row. Empty Fundi’s front row to win.</p></article>
      </section>
    </>
  );
}
