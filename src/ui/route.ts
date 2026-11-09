import { useEffect, useState } from 'react';

export interface Route { path: string; query: URLSearchParams }

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs ?? '') };
}

/** Tiny hash router: #/play, #/review?id=..., works from any static host. */
export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (hash: string) => { window.location.hash = hash; };

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
