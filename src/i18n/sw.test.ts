import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULESETS } from '../engine/ruleset';
import { LEVELS } from '../engine/search';
import { TOUR } from '../ui/tourSteps';
import { SW } from './sw';

const LITERAL = /\bt\(\s*'([^']*)'/g;

function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [p] : [];
  });
}

describe('Kiswahili dictionary', () => {
  it('covers every literal t() string and every data-driven string', () => {
    const keys = new Set<string>();
    for (const f of walk('src')) for (const m of readFileSync(f, 'utf8').matchAll(LITERAL)) keys.add(m[1]);
    for (const s of TOUR) { keys.add(s.title); keys.add(s.body); }
    for (const l of LEVELS) { keys.add(l.gloss); keys.add(l.note); }
    for (const r of RULESETS) { keys.add(r.name); keys.add(r.note); }
    const missing = [...keys].filter((k) => !(k in SW));
    expect(missing).toEqual([]);
  });

  it('keeps every {placeholder} of the English text', () => {
    for (const [en, sw] of Object.entries(SW)) {
      const want = (en.match(/\{\w+\}/g) ?? []).sort();
      const got = (sw.match(/\{\w+\}/g) ?? []).sort();
      expect(got, en).toEqual(want);
    }
  });
});
