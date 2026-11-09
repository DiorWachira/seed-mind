/**
 * The help drawer (opened by the Help key in the header or by pressing ? anywhere):
 * the guide, the active ruleset, a glossary of Bao words, the keyboard keys and how the
 * engine works. It is a modal dialog with a focus trap; Esc closes it.
 */
import { useEffect, useRef } from 'react';
import { RULESETS, rulesFor, type RulesetId } from '../engine/ruleset';
import { useT } from './i18n';

export type HelpTab = 'guide' | 'rules' | 'words' | 'keys';

const GLOSSARY: [string, string][] = [
  ['kete', 'the seeds; 64 in all'],
  ['komwe', 'the grey bonduc nuts traditionally used as kete'],
  ['shimo / mashimo', 'pit / pits'],
  ['nyumba', 'the square “house” pit, 5th in your front row; it has special powers while it holds 6 or more kete'],
  ['kichwa / vichwa', 'the end pits of your front row; captured kete are sown back in from a kichwa'],
  ['kimbi', 'the pit next to each kichwa'],
  ['mkononi', 'in hand: kete not yet on the board'],
  ['namua', 'the first stage, while you still have kete in hand'],
  ['mtaji', 'the second stage, once the hands are empty; also a turn that starts with a capture'],
  ['takasa', 'a quiet turn that captures nothing'],
  ['takasia', 'a rule that protects a lone threatened pit for one turn (mtaji moja)'],
  ['safari', 'lifting a working nyumba to keep a capture turn going; the house loses its powers'],
  ['kutaxa', 'taxing: sowing only two kete out of the nyumba so it keeps its powers'],
  ['fundi', 'a master; also the name of the AI'],
  ['ply', 'one player’s turn; a move in the record is a pair of plies'],
];

function RulesTab({ ruleset }: { ruleset: RulesetId }) {
  const t = useT();
  const info = RULESETS.find((r) => r.id === ruleset)!;
  const o = rulesFor(ruleset);
  const rows: [string, string][] = [
    [t('Nyumba powers'), o.nyumbaStages === 'both'
      ? t('In both stages, while it holds {n} or more kete', { n: o.nyumbaMinSeeds })
      : t('Only during namua')],
    [t('Taxing in mtaji'), o.mtajiTaxing ? t('Yes: a turn from a working nyumba sows only two kete') : t('No')],
    [t('Takasia'), o.takasia === 'off' ? t('Off') : o.takasia === 'mtaji' ? t('In mtaji: a lone threatened pit is protected for one turn') : t('In both stages')],
    [t('Captures'), t('Compulsory. Kichwa and kimbi captures re-enter from the nearest kichwa.')],
    [t('Winning'), t('Empty your opponent’s front row, or leave them no legal move. Emptying your own front row loses.')],
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <p className="lbl">{t('Rules in this game')}</p>
      <h3 className="disp" style={{ fontSize: 26 }}>{t(info.name)}</h3>
      <p className="muted">{t(info.note)}</p>
      <dl className="rule-list">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <p className="lbl" style={{ marginTop: 6 }}>{t('A turn, in short')}</p>
      <ol className="steps-list">
        <li>{t('Namua: place a kete from your hand into a filled front-row pit. Facing kete? Capture them. Otherwise lift the pit and sow.')}</li>
        <li>{t('Mtaji: lift any pit with 2 or more kete and sow one per pit, either way round your two rows.')}</li>
        <li>{t('Land in a filled pit and you lift it and sow on (relay). Land in an empty pit and the turn ends.')}</li>
        <li>{t('Captured kete are sown back in from a kichwa at the end of your front row.')}</li>
      </ol>
      <p className="muted" style={{ fontSize: 14 }}>{t('Sources and the decisions behind each rule are in RULES.md, from de Voogt’s record of the Zanzibar masters.')}</p>
    </div>
  );
}

export function Help({ tab, setTab, onClose, onTour, ruleset }: {
  tab: HelpTab;
  setTab: (t: HelpTab) => void;
  onClose: () => void;
  onTour: (scope: 'all' | 'screen') => void;
  ruleset: RulesetId;
}) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    panel.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return () => { (opener.current as HTMLElement | null)?.focus?.(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = Array.from(panel.current.querySelectorAll<HTMLElement>('button, a[href], select, input, [tabindex="0"]')).filter((x) => !x.hasAttribute('disabled'));
      if (f.length === 0) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabs: [HelpTab, string][] = [['guide', t('Guide')], ['rules', t('Rules')], ['words', t('Words')], ['keys', t('Keys')]];
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    e.stopPropagation();
    const j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    setTab(tabs[j][0]);
    window.setTimeout(() => panel.current?.querySelectorAll<HTMLElement>('[role="tab"]')[j]?.focus(), 0);
  };

  return (
    <div className="drawer-wrap" data-testid="help">
      <div className="drawer-veil" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="drawer" role="dialog" aria-modal="true" aria-labelledby="help-h">
        <div className="drawer-head">
          <h2 id="help-h" className="disp">{t('Help')}</h2>
          <button type="button" className="tour-x dark" onClick={onClose} aria-label={t('Close help')}>×</button>
        </div>
        <div className="tabs" role="tablist" aria-label={t('Help sections')}>
          {tabs.map(([id, label], i) => (
            <button key={id} type="button" role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(e) => onTabKey(e, i)}>{label}</button>
          ))}
        </div>
        <div className="drawer-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'guide' && (
            <div className="stack" style={{ gap: 18 }}>
              <p>{t('Mwongozo walks you through Seed Mind in about a minute: the board, the coach light, playing Fundi, reviewing a game and reading a real board.')}</p>
              <div className="row">
                <button type="button" className="btn go" onClick={() => onTour('all')}>{t('Take the full tour')}</button>
                <button type="button" className="btn" onClick={() => onTour('screen')}>{t('Tour this screen')}</button>
              </div>
              <p className="lbl" style={{ marginTop: 8 }}>{t('How Seed Mind works')}</p>
              <ol className="pipeline">
                <li><b>{t('Rules engine')}</b><span>{t('Plays every legal turn to its end, including relay sowings, captures and the nyumba.')}</span></li>
                <li><b>{t('Fundi')}</b><span>{t('Searches ahead with alpha-beta and a hash table, in a background worker so the board never freezes.')}</span></li>
                <li><b>{t('Coach light')}</b><span>{t('Scores every move you could make and explains the best one in plain words.')}</span></li>
                <li><b>{t('Review')}</b><span>{t('Replays your game and measures each move against the best one, in kete.')}</span></li>
                <li><b>{t('Board reader')}</b><span>{t('Straightens your photo, finds each pit and counts the grey seeds, on your device.')}</span></li>
              </ol>
            </div>
          )}
          {tab === 'rules' && <RulesTab ruleset={ruleset} />}
          {tab === 'words' && (
            <dl className="glossary">
              {GLOSSARY.map(([w, d]) => <div key={w}><dt lang="sw">{w}</dt><dd>{t(d)}</dd></div>)}
            </dl>
          )}
          {tab === 'keys' && (
            <table className="keys">
              <tbody>
                {([
                  ['?', t('Open or close this help')],
                  ['Esc', t('Close the help or the guide')],
                  ['← →', t('Guide: previous and next step. Play and Review: step through the moves')],
                  ['Home  End', t('Play and Review: first and last move')],
                  ['S', t('Play: skip the sowing animation')],
                  ['C', t('Play: switch the coach light on or off')],
                  ['M', t('Mute or unmute the seed sounds')],
                ] as [string, string][]).map(([k, d]) => (
                  <tr key={k}><th scope="row">{k.split('  ').map((x) => <kbd key={x}>{x}</kbd>)}</th><td>{d}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
