// Catalog integrity and the local (no-API) pattern engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLACIES, FAMILIES, FALLACY_BY_KEY, familyOf, catalogForPrompt, DEFAULT_SETTINGS } from '../src/taxonomy.js';
import { analyzeLocally } from '../src/engines/local.js';

test('every catalog entry has a unique key, a known family and the fields the UI shows', () => {
  const keys = new Set();
  for (const f of FALLACIES) {
    assert.ok(!keys.has(f.key), `duplicate key ${f.key}`);
    keys.add(f.key);
    assert.ok(Object.hasOwn(FAMILIES, f.family), `${f.key} has unknown family ${f.family}`);
    for (const field of ['name', 'def', 'counter', 'question']) assert.ok(f[field], `${f.key} is missing ${field}`);
  }
  assert.ok(FALLACY_BY_KEY.moral_equivalence, 'moral equivalence is in the catalog');
});

test('familyOf ignores built-in object property names', () => {
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.ok(Object.hasOwn(FAMILIES, familyOf(k, 'nonsense')), `familyOf(${k}) should return a real family`);
  }
});

test('the prompt catalog lists every key', () => {
  const text = catalogForPrompt();
  for (const f of FALLACIES) assert.ok(text.includes(`${f.key}:`), f.key);
});

test('the API endpoint default is Anthropic over HTTPS', () => {
  assert.equal(DEFAULT_SETTINGS.apiBase, 'https://api.anthropic.com');
});

const run = (texts) => analyzeLocally(texts.map((text, i) => ({ id: 'b' + i, text })), { maxChars: 1e6 }).findings;

test('local engine flags clear wording cues', () => {
  const cases = [
    ["Millions of people can't be wrong, so this supplement clearly works.", 'bandwagon'],
    ["Either you're with us, or you're against us in this fight.", 'false_dilemma'],
    ['No true patriot would ever question the flag in public.', 'no_true_scotsman'],
    ['Prove me wrong: nobody has shown it does not work.', 'burden_of_proof'],
    ['The truth probably lies somewhere in the middle between the two camps.', 'middle_ground']
  ];
  for (const [text, key] of cases) {
    const f = run([text]);
    assert.ok(f.some(x => x.labels.some(l => l.key === key)), `expected ${key} for: ${text}`);
  }
});

test('local engine leaves neutral and well-sourced sentences alone', () => {
  const f = run([
    'The committee will meet on Tuesday to review the budget for the coming year.',
    'According to a 2023 study published in Nature, experts say sleep improves memory.',
    'Either option is acceptable to the board, and both have been costed in detail.'
  ]);
  assert.equal(f.length, 0, JSON.stringify(f.map(x => x.quote)));
});

test('local findings quote text that exists in the block, and abbreviations do not split sentences', () => {
  const text = "Critics like Dr. Lee are just a so-called expert who failed chemistry, so why listen to her?";
  const f = run([text]);
  assert.ok(f.length >= 1);
  for (const x of f) assert.ok(text.includes(x.quote), x.quote);
  assert.ok(f[0].quote.startsWith('Critics like Dr. Lee'), f[0].quote);
});

test('local engine stays fast on adversarial input', () => {
  const big = ('either ' + 'x '.repeat(40) + 'or ' + 'y '.repeat(40) + 'only ').repeat(300).slice(0, 50000);
  const t0 = performance.now();
  analyzeLocally([{ id: 'b0', text: big }], { maxChars: 50000 });
  assert.ok(performance.now() - t0 < 2000, 'took too long');
});
