// Checks the locale files against each other. Run with `npm run check:locales`.
//
// Norwegian is the source language: every key that exists in no.json must exist in the other
// four, and no file may carry a key Norwegian doesn't have. Missing keys don't crash the app
// (i18n.jsx falls back to Norwegian) — which is exactly why they need catching here instead,
// since the symptom in production is a Lithuanian cleaner seeing one Norwegian sentence in an
// otherwise Lithuanian screen, and nobody reports that as a bug.
//
// Placeholders are checked too: "{count} rom" translated without its {count} silently drops a
// number out of a sentence, and that reads as a rendering bug rather than a translation one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales');
const SOURCE = 'no';
const OTHERS = ['en', 'lt', 'lv', 'ru'];

// CLDR plural categories a language actually uses. A key written as "<base>.<category>" is only
// required in the languages whose category list contains it — Russian has "many", Norwegian
// doesn't, and demanding parity on those would be wrong rather than helpful.
const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const categoriesFor = (lang) => {
  const pr = new Intl.PluralRules(lang === 'no' ? 'nb' : lang);
  return new Set(pr.resolvedOptions().pluralCategories);
};

const load = (lang) => JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), 'utf8'));
const placeholders = (text) => (text.match(/\{(\w+)\}/g) || []).sort().join(',');

const source = load(SOURCE);
const problems = [];

for (const lang of OTHERS) {
  const dict = load(lang);
  const cats = categoriesFor(lang);
  const sourceCats = categoriesFor(SOURCE);

  for (const key of Object.keys(source)) {
    const lastSegment = key.split('.').pop();
    const isPlural = PLURAL_CATEGORIES.has(lastSegment);
    // A plural key only matters here if this language has that category at all.
    if (isPlural && !cats.has(lastSegment)) continue;
    if (!(key in dict)) { problems.push(`${lang}: missing key "${key}"`); continue; }

    // A placeholder the source has but the translation doesn't is always a bug — a number or a
    // name silently disappears from the sentence. The reverse is only a bug outside plural forms:
    // tn() always passes `count`, so a language whose singular reads better with the number in it
    // ("1 užduotis") may use {count} where Norwegian's singular doesn't ("det siste rommet").
    const want = placeholders(source[key]);
    const got = placeholders(dict[key]);
    const wantSet = new Set(want ? want.split(',') : []);
    const gotSet = new Set(got ? got.split(',') : []);
    const dropped = [...wantSet].filter((x) => !gotSet.has(x));
    const added = [...gotSet].filter((x) => !wantSet.has(x));
    if (dropped.length) problems.push(`${lang}: "${key}" drops ${dropped.join(',')} that ${SOURCE}.json has`);
    if (added.length && !isPlural) problems.push(`${lang}: "${key}" adds ${added.join(',')} that ${SOURCE}.json does not have`);
  }

  for (const key of Object.keys(dict)) {
    const lastSegment = key.split('.').pop();
    const isPlural = PLURAL_CATEGORIES.has(lastSegment);
    // Extra plural categories are expected (ru has "many", no does not) as long as the base key
    // exists in Norwegian in some form.
    if (isPlural && !sourceCats.has(lastSegment)) {
      const base = key.slice(0, -(lastSegment.length + 1));
      if (!Object.keys(source).some((k) => k.startsWith(`${base}.`))) {
        problems.push(`${lang}: "${key}" has no counterpart in ${SOURCE}.json`);
      }
      continue;
    }
    if (!(key in source)) problems.push(`${lang}: "${key}" is not in ${SOURCE}.json`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`Locales OK — ${Object.keys(source).length} keys in ${SOURCE}.json, ${OTHERS.length} translations in sync.`);
