import { useEffect, useState } from 'react';
import { NYUMBA, initialPosition, pitName } from '../engine/board';
import type { Advice } from '../engine/coach';
import { rulesFor } from '../engine/ruleset';
import type { Position, Side } from '../engine/types';
import { Board } from '../ui/Board';
import { engine } from '../ui/engineClient';
import { useT, type T } from '../ui/i18n';
import { go } from '../ui/route';
import { useShell } from '../ui/shell';
import { store } from '../ui/storage';

const start = initialPosition();

/** Plain words for one pit: its name, its role on the board and what it holds. */
export function pitStory(t: T, pos: Position, viewer: Side, side: Side, i: number): { name: string; role: string; holds: string } {
  const mine = side === viewer;
  const name = pitName(viewer, side, i);
  const n = pos.pits[side][i];
  const owner = mine ? t('Your') : t('Fundi’s');
  let role: string;
  if (i >= 8) role = t('{owner} back row. Kete here are safe from capture.', { owner });
  else if (i === NYUMBA) role = t('{owner} nyumba, the square house. While it holds 6 or more it has special powers.', { owner });
  else if (i === 0 || i === 7) role = t('{owner} kichwa, an end of the front row. Captured kete are sown back in from here.', { owner });
  else if (i === 1 || i === 6) role = t('{owner} kimbi, beside the kichwa. Captures here re-enter from the nearest end.', { owner });
  else role = t('{owner} front row. Front-row kete capture, and can be captured.', { owner });
  return { name, role, holds: n === 1 ? t('1 kete') : t('{n} kete', { n }) };
}

export function Overview() {
  const t = useT();
  const { openHelp } = useShell();
  const [tip, setTip] = useState<Advice | null>(null);
  const [insp, setInsp] = useState<[Side, number] | null>(null);
  useEffect(() => {
    let live = true;
    engine('coach').advise(start, rulesFor(store.ruleset())).then((a) => { if (live) setTip(a); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const story = insp ? pitStory(t, start, 0, insp[0], insp[1]) : null;

  return (
    <>
      <section className="hero" aria-labelledby="h1">
        <div className="stack" style={{ gap: 22 }}>
          <p className="lbl">{t('Bao la Kiswahili · engine & coach')}</p>
          <h1 id="h1" className="disp hero-h">{t('Every kete counted. Every move explained.')}</h1>
          <p className="muted lede">
            {t('Seed Mind plays you at the strength you choose, lights up the move a fundi would make and explains why. It uses four rows of eight pits and 64 kete, the same as the board at the baraza.')}
          </p>
          <div className="row" style={{ gap: 14 }}>
            <a className="btn go" href="#/play">{t('Cheza na Fundi (play)')}</a>
            <a className="btn" href="#/reader">{t('Set up a real board')}</a>
          </div>
          <dl className="facts">
            <div><dt className="num">64</dt><dd>{t('kete on a 4 × 8 board')}</dd></div>
            <div><dt className="num">9</dt><dd>{t('strength levels, pupil to master')}</dd></div>
            <div><dt className="num">0</dt><dd>{t('servers: it all runs on your device')}</dd></div>
          </dl>
        </div>
        <figure className="hero-fig">
          <div className="round">
            <div className="plate readout" aria-live="polite" data-tour="hero-readout">
              {story
                ? <><span className="lbl">{story.name} · {story.holds}</span><span>{story.role}</span></>
                : <><span className="lbl">{t('Opening position')}</span><span>{t('64 kete · 22 in each hand. Point at a pit to read it.')}</span></>}
            </div>
            <div data-tour="hero-board" style={{ width: '82%' }} className="hero-board">
              <Board pos={start} viewer={0}
                label={t('The Bao opening position. Each side has 6 kete in its nyumba and 2 in each of the two pits to its right. Select a pit to read it; activate it to start a game.')}
                coach={tip ? { start: tip.startPit, targets: tip.targets, path: tip.path } : null}
                onInspect={setInsp} inspected={insp} onActivate={() => go('#/play')} />
            </div>
            <div className="plate" data-tour="hero-coach">
              <span className="lbl" style={{ color: 'var(--ochre-ink)' }}>{t('Coach light')}</span>
              <span>{tip ? tip.headline : t('Reading the board…')}</span>
            </div>
          </div>
          <figcaption className="lbl fig-cap">{t('Fig. 1 · The opening, seen from your seat. The coach light rings the pit a fundi would start from and rakes along its sowing path.')}</figcaption>
        </figure>
      </section>

      <section className="steps" aria-label={t('How a move works')}>
        <article className="card step-card"><p className="lbl">01 · {t('Lift')}</p><h2 className="disp">{t('Choose a pit and a direction')}</h2><p className="muted">{t('While you still have kete in hand (namua), place one into your front row. After that (mtaji), lift any pit with two or more kete and sow either way.')}</p></article>
        <article className="card step-card"><p className="lbl">02 · {t('Sow')}</p><h2 className="disp">{t('One seed per pit, all the way round')}</h2><p className="muted">{t('Seeds travel around your own two rows. If the last one lands in a pit that already had seeds, you lift that pit and keep sowing.')}</p></article>
        <article className="card step-card"><p className="lbl">03 · {t('Capture')}</p><h2 className="disp">{t('Take, then re-sow from the kichwa')}</h2><p className="muted">{t('End on a filled front pit facing Fundi’s kete and you take them all, then sow them back in from the end of your front row. Empty Fundi’s front row to win.')}</p></article>
      </section>

      <section className="ways" aria-labelledby="ways-h">
        <h2 id="ways-h" className="disp">{t('Four ways in')}</h2>
        <div className="ways-grid">
          <a className="way" href="#/play"><span className="way-glyph g-play" aria-hidden="true" /><b>{t('Play vs Fundi')}</b><span>{t('Nine levels, a coach on call, take-backs and pass-and-play.')}</span></a>
          <a className="way" href="#/review"><span className="way-glyph g-rings" aria-hidden="true" /><b>{t('Game review')}</b><span>{t('Your game as growth rings, with its turning points marked.')}</span></a>
          <a className="way" href="#/reader"><span className="way-glyph g-cam" aria-hidden="true" /><b>{t('Board reader')}</b><span>{t('Photograph a real board and let Seed Mind count the seeds.')}</span></a>
          <button type="button" className="way" onClick={() => openHelp('rules')}><span className="way-glyph g-help" aria-hidden="true" /><b>{t('Rules and words')}</b><span>{t('The Zanzibar rules in short, and a glossary of Bao words.')}</span></button>
        </div>
      </section>
    </>
  );
}
