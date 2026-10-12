// Claude engine with the network stubbed: request shape, parsing, retries, timeouts.
// No API key and no paid calls are needed.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWithClaude, chunkBlocks, normalizeFinding, TIMEOUTS } from '../src/engines/claude.js';
import { DEFAULT_SETTINGS } from '../src/taxonomy.js';

const KEY = 'test-key-not-a-real-credential';
const settings = { ...DEFAULT_SETTINGS, apiKey: KEY, model: 'claude-sonnet-5-5' };
const page = { title: 'Test page', url: 'https://example.com/a', scope: 'page' };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function sse(events) {
  const body = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const toolReply = (input) => sse([
  { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'report_fallacies', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 50 } }
]);
const textReply = (text) => sse([
  { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }
]);

test('request: key only in the header, context rule in the prompt, selection instruction for selections', async () => {
  const sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url, init }); return toolReply({ findings: [], note: 'Nothing to report.' }); };
  await analyzeWithClaude({ blocks: [{ id: 'b0', text: 'Some text here that is long enough.' }], settings, page: { ...page, scope: 'selection' } });
  const { url, init } = sent[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], KEY);
  assert.ok(!init.body.includes(KEY), 'API key must not appear in the request body');
  const body = JSON.parse(init.body);
  assert.match(body.system[0].text, /CONTEXT NEVER EXCUSES A FALLACY/);
  assert.match(body.messages[0].content, /reader selected this text/);
  assert.deepEqual(body.tools[0].input_schema.required, ['findings', 'note']);
});

test('parses streamed findings and reports Claude\'s note', async () => {
  globalThis.fetch = async () => toolReply({
    findings: [{ block_id: 'b0', quote: 'All of them are lazy', family: 'relevance', labels: ['Ad Hominem'], confidence: 0.8, explanation: 'x', question: 'y', attribution: 'author' }],
    note: 'An opinion piece.'
  });
  const got = [];
  const meta = await analyzeWithClaude({ blocks: [{ id: 'b0', text: 'All of them are lazy, so ignore them.' }], settings, page, onFindings: f => got.push(...f) });
  assert.equal(got.length, 1);
  assert.equal(got[0].labels[0].key, 'ad_hominem');
  assert.deepEqual(meta.diag.notes, ['An opinion piece.']);
});

test('a text-only reply is retried once, then reported as unreadable', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return textReply('I cannot analyze this.'); };
  const meta = await analyzeWithClaude({ blocks: [{ id: 'b0', text: 'Some text here that is long enough.' }], settings, page });
  assert.equal(calls, 2);
  assert.deepEqual(meta.diag.unreadable, [1]);
});

test('a text-only reply followed by a tool reply recovers', async () => {
  let calls = 0;
  globalThis.fetch = async () => (++calls === 1 ? textReply('Hmm.') : toolReply({ findings: [], note: 'ok' }));
  const meta = await analyzeWithClaude({ blocks: [{ id: 'b0', text: 'Some text here that is long enough.' }], settings, page });
  assert.equal(calls, 2);
  assert.deepEqual(meta.diag.unreadable, []);
});

test('a request with no response times out and is retried only once', async () => {
  const saved = { ...TIMEOUTS };
  TIMEOUTS.headersMs = 50; TIMEOUTS.idleMs = 50;
  let calls = 0;
  globalThis.fetch = (url, init) => new Promise((_, reject) => {
    calls++;
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  try {
    await assert.rejects(
      analyzeWithClaude({ blocks: [{ id: 'b0', text: 'Some text here that is long enough.' }], settings, page }),
      /did not respond in time/
    );
    assert.equal(calls, 2);
  } finally { Object.assign(TIMEOUTS, saved); }
});

test('a rejected key is not retried', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 }); };
  await assert.rejects(analyzeWithClaude({ blocks: [{ id: 'b0', text: 'Some text here that is long enough.' }], settings, page }), /rejected/);
  assert.equal(calls, 1);
});

test('normalizeFinding maps alternative names and survives built-in property names', () => {
  const nf = (labels) => normalizeFinding({ block_id: 'b0', quote: 'quote text', family: 'relevance', labels, confidence: 1.7, explanation: 'e', question: 'q' }, 0);
  assert.equal(nf(['Either/or']).labels[0].key, 'false_dilemma');
  assert.equal(nf(['Circular argument']).labels[0].key, 'begging_question');
  assert.equal(nf(['Strawman']).labels[0].key, 'straw_man');
  assert.equal(nf(['Ad populum']).labels[0].key, 'bandwagon');
  for (const bad of ['constructor', '__proto__', 'toString']) {
    const f = nf([bad]);
    assert.equal(f.labels[0].key, 'other', bad);
    assert.ok(['formal', 'relevance', 'presumption', 'ambiguity'].includes(f.family), bad);
  }
  assert.equal(nf(['ad_hominem']).confidence, 1, 'confidence is clamped to 0..1');
});

test('chunkBlocks respects the page character limit', () => {
  const blocks = Array.from({ length: 40 }, (_, i) => ({ id: 'b' + i, text: 'x'.repeat(1500) }));
  const r = chunkBlocks(blocks, 50000);
  assert.equal(r.totalChars, 50000);
  assert.ok(r.truncated);
  assert.ok(r.chunks.every(c => c.reduce((a, b) => a + b.text.length, 0) <= 12000));
});
