import { useEffect, useState } from 'react';
import { Overview } from './screens/Overview';
import { Play } from './screens/Play';
import { Reader } from './screens/Reader';
import { Review } from './screens/Review';
import { store } from './ui/storage';
import { useRoute } from './ui/route';

const NAV = [
  { path: '/', label: 'Overview' },
  { path: '/play', label: 'Play vs Fundi' },
  { path: '/review', label: 'Game review' },
  { path: '/reader', label: 'Board reader' },
];

type Theme = 'auto' | 'light' | 'dark';

export function App() {
  const route = useRoute();
  const [theme, setTheme] = useState<Theme>(store.theme());

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
    store.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    const t = NAV.find((n) => n.path === route.path)?.label ?? 'Seed Mind';
    document.title = route.path === '/' ? 'Seed Mind' : `${t} · Seed Mind`;
    window.scrollTo(0, 0);
  }, [route.path]);

  let screen;
  switch (route.path) {
    case '/play': screen = <Play key={route.query.get('new') ?? 'play'} />; break;
    case '/review': screen = <Review id={route.query.get('id')} />; break;
    case '/reader': screen = <Reader />; break;
    default: screen = <Overview />;
  }

  return (
    <>
      <header className="bar">
        <a href="#/" className="brand">Seed Mind</a>
        <nav aria-label="Primary">
          {NAV.map((n) => (
            <a key={n.path} href={`#${n.path}`} aria-current={route.path === n.path ? 'page' : undefined}>{n.label}</a>
          ))}
        </nav>
        <label className="theme-pick">
          <span className="muted">Theme</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <main className="page" id="main">{screen}</main>
    </>
  );
}
