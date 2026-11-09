/**
 * Lists every UI string that goes through t(): literal t('...') calls in src/, plus strings
 * that reach t() from data (tour steps, levels, rulesets, glossary, verdicts, names).
 *   npm run i18n            prints the strings missing from the Kiswahili dictionary
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RULESETS } from '../src/engine/ruleset';
import { LEVELS } from '../src/engine/search';
import { SW } from '../src/i18n/sw';
import { TOUR } from '../src/ui/tourSteps';

// UI strings use typographic apostrophes, never escaped quotes, so these stay simple.
const LITERAL = /\bt\(\s*'([^']*)'/g;
const GLOSS = /\['[^']*', '([^']*)'\]/g;

function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [p] : [];
  });
}

export function allKeys(): Set<string> {
  const keys = new Set<string>();
  for (const f of walk('src')) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(LITERAL)) keys.add(m[1]);
  }
  for (const s of TOUR) { keys.add(s.title); keys.add(s.body); }
  for (const l of LEVELS) { keys.add(l.gloss); keys.add(l.note); }
  for (const r of RULESETS) { keys.add(r.name); keys.add(r.note); }
  for (const k of ['Overview', 'Play vs Fundi', 'Game review', 'Board reader', 'Home', 'Play', 'Review', 'Reader',
    'best', 'fine', 'inaccuracy', 'mistake', 'blunder', 'South', 'North', 'You', 'Fundi',
    'You won', 'Fundi won', 'South won', 'North won', 'In progress',
    'You resigned', 'Fundi resigned', 'South resigned', 'North resigned',
    'You had no legal move', 'Fundi had no legal move', 'South had no legal move', 'North had no legal move',
    'You ran out of front-row kete', 'Fundi ran out of front-row kete', 'South ran out of front-row kete', 'North ran out of front-row kete',
    'far left', 'far right', 'near right', 'near left']) keys.add(k);
  const help = readFileSync('src/ui/Help.tsx', 'utf8');
  const g = help.slice(help.indexOf('const GLOSSARY'), help.indexOf('];', help.indexOf('const GLOSSARY')));
  for (const m of g.matchAll(GLOSS)) keys.add(m[1]);
  return keys;
}

const keys = allKeys();
const missing = [...keys].filter((k) => !(k in SW));
const unused = Object.keys(SW).filter((k) => !keys.has(k));
console.log(JSON.stringify({ total: keys.size, missing, unused }, null, 1));
