import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RulesetId } from './engine/ruleset';
import { NotFound } from './screens/NotFound';
import { Overview } from './screens/Overview';
import { Play } from './screens/Play';
import { Reader } from './screens/Reader';
import { Review } from './screens/Review';
import { Help, type HelpTab } from './ui/Help';
import { useLang, useT } from './ui/i18n';
import { useRoute } from './ui/route';
import { ShellCtx } from './ui/shell';
import { sound } from './ui/sound';
import { store, type Theme } from './ui/storage';
import { Tour, TourInvite } from './ui/Tour';
import { TOUR, tourFor } from './ui/tourSteps';

const NAV = [
  { path: '/', label: 'Overview', short: 'Home' },
  { path: '/play', label: 'Play vs Fundi', short: 'Play' },
  { path: '/review', label: 'Game review', short: 'Review' },
  { path: '/reader', label: 'Board reader', short: 'Reader' },
];
const KNOWN = new Set(NAV.map((n) => n.path));


/** The ruleset the help drawer should explain: the game in play, else the choice for new games. */
function activeRuleset(path: string): RulesetId {
  if (path === '/play') {
    const g = store.currentGame();
    if (g) return g.ruleset ?? 'v1';
  }
  return store.ruleset();
}

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function App() {
  const route = useRoute();
  const t = useT();
  const { lang, setLang } = useLang();
  const [theme, setTheme] = useState<Theme>(store.theme());
  const [muted, setMuted] = useState(sound.muted);
  const [help, setHelp] = useState<HelpTab | null>(null);
  const [tour, setTour] = useState<number[] | null>(null);
  const [invite, setInvite] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
    store.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    const label = NAV.find((n) => n.path === route.path)?.label;
    document.title = route.path === '/' ? 'Seed Mind' : `${label ? t(label) : t('Not found')} · Seed Mind`;
    window.scrollTo(0, 0);
  }, [route.path, t]);

  // The invitation: once, on a first visit, after the page has settled. Never forced.
  useEffect(() => {
    if (store.guide() !== 'new') return;
    const id = window.setTimeout(() => setInvite(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  const startTour = useCallback((scope: 'all' | 'screen') => {
    setHelp(null);
    setInvite(false);
    store.setGuide('done');
    setTour(scope === 'all' ? TOUR.map((_, i) => i) : tourFor(KNOWN.has(route.path) ? route.path : '/'));
  }, [route.path]);
  const openHelp = useCallback((tab: HelpTab = 'guide') => { setInvite(false); setHelp(tab); }, []);
  const shell = useMemo(() => ({ openHelp, startTour }), [openHelp, startTour]);

  const toggleMute = useCallback(() => { const m = !sound.muted; sound.setMuted(m); setMuted(m); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setHelp((h) => (h ? null : 'guide')); setInvite(false); }
      else if ((e.key === 'm' || e.key === 'M') && !tour) toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleMute, tour]);

  let screen;
  switch (route.path) {
    case '/': screen = <Overview />; break;
    case '/play': screen = <Play key={route.query.get('new') ?? 'play'} />; break;
    case '/review': screen = <Review id={route.query.get('id')} code={route.query.get('g')} />; break;
    case '/reader': screen = <Reader />; break;
    default: screen = <NotFound path={route.path} />;
  }

  return (
    <ShellCtx.Provider value={shell}>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>{t('Skip to content')}</a>
      <header className="bar">
        <a href="#/" className="brand" aria-label="Seed Mind, overview">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" className="brand-mark">
            <circle cx="16" cy="16" r="14.5" className="bm-bark" />
            <circle cx="16" cy="16" r="11" className="bm-ring" />
            <circle cx="16.6" cy="15.6" r="7.4" className="bm-ring" />
            <circle cx="16" cy="16" r="3.6" className="bm-seed" />
          </svg>
          <span>Seed Mind</span>
        </a>
        <nav aria-label={t('Primary')}>
          {NAV.map((n) => (
            <a key={n.path} href={`#${n.path}`} aria-current={route.path === n.path ? 'page' : undefined} data-tour={`nav-${n.path.slice(1) || 'home'}`}>
              <span className="nav-long">{t(n.label)}</span><span className="nav-short" aria-hidden="true">{t(n.short)}</span>
            </a>
          ))}
        </nav>
        <div className="tools">
          <button type="button" className="tool" onClick={() => openHelp('guide')} data-tour="help-key" aria-keyshortcuts="?">
            <span className="tool-key" aria-hidden="true">?</span>{t('Help')}
          </button>
          <button type="button" className="tool" onClick={toggleMute} aria-pressed={!muted} title={muted ? t('Seed sounds are off') : t('Seed sounds are on')} aria-keyshortcuts="M">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor" />{muted ? <path d="M13 7l5 6M18 7l-5 6" stroke="currentColor" strokeWidth="1.8" /> : <path d="M13.5 6.5a5 5 0 010 7M15.8 4.5a8 8 0 010 11" stroke="currentColor" strokeWidth="1.6" fill="none" />}</svg>
            <span className="tool-label">{t('Sound')}</span>
          </button>
          <label className="tool sel">
            <span className="sr-only">{t('Language')}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'sw')}>
              <option value="en">English</option>
              <option value="sw">Kiswahili</option>
            </select>
          </label>
          <label className="tool sel">
            <span className="sr-only">{t('Theme')}</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              <option value="auto">{t('Auto theme')}</option>
              <option value="light">{t('Light')}</option>
              <option value="dark">{t('Dark')}</option>
            </select>
          </label>
        </div>
      </header>
      <main className="page" id="main" tabIndex={-1}>{screen}</main>
      <footer className="foot">
        <span>Seed Mind · Bao la Kiswahili</span>
        <span>{t('Rules after de Voogt’s record of the Zanzibar masters. Everything runs in your browser.')}</span>
      </footer>
      {invite && !tour && !help && (
        <TourInvite onStart={() => startTour('all')} onDismiss={() => { setInvite(false); store.setGuide('dismissed'); }} />
      )}
      {tour && <Tour steps={tour} onClose={() => { setTour(null); store.setGuide('done'); }} />}
      {help && <Help tab={help} setTab={setHelp} onClose={() => setHelp(null)} onTour={startTour} ruleset={activeRuleset(route.path)} />}
    </ShellCtx.Provider>
  );
}
