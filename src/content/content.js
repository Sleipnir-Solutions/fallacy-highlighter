// Content script (injected on demand). Collects readable text blocks, then renders
// findings as <mark> highlights with a tooltip and an in-page results panel.
// All model output is inserted with textContent, never as HTML.

(() => {
  if (window.__lfhLoaded) return;
  window.__lfhLoaded = true;

  const ROOT_ID = 'lfh-root';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'TEXTAREA', 'INPUT',
    'SELECT', 'OPTION', 'BUTTON', 'CODE', 'PRE', 'KBD', 'SAMP', 'MATH', 'IFRAME', 'OBJECT', 'HEAD', 'TITLE', 'VIDEO', 'AUDIO']);
  const SKIP_SEL = [
    'nav', 'footer', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="menu"]',
    '[role="menubar"]', '[role="toolbar"]', '[role="search"]', '[role="dialog"]', '[aria-hidden="true"]',
    '[contenteditable=""]', '[contenteditable="true"]', '#' + ROOT_ID
  ].join(',');
  const INLINE = new Set(['inline', 'inline-block', 'inline-flex', 'inline-grid', 'inline-table', 'contents',
    'ruby', 'ruby-base', 'ruby-text', 'ruby-base-container', 'ruby-text-container']);
  const FOLD = {
    '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'", 'ʼ': "'",
    '“': '"', '”': '"', '„': '"', '″': '"', '«': '"', '»': '"',
    '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-', '−': '-',
    '…': '...', '­': '', '​': '', '‌': '', '‍': '', '﻿': ''
  };
  const FAMILY_ORDER = ['relevance', 'presumption', 'ambiguity', 'formal'];

  const state = {
    runId: 0,
    blocks: new Map(),      // id -> {el}
    findings: new Map(),    // id -> {f, marks: [], located}
    hidden: new Set(),      // hidden family keys
    status: 'idle',         // idle | running | done | error
    scope: 'page',
    engine: null, model: null,
    progress: null, meta: null, error: null,
    minimized: false
  };

  // ------------------------------------------------------------------ DOM helpers

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  let displayCache = new WeakMap();
  function display(el) {
    let d = displayCache.get(el);
    if (d === undefined) { d = getComputedStyle(el).display; displayCache.set(el, d); }
    return d;
  }
  function nearestBlock(node) {
    let el = node.parentElement;
    while (el && el !== document.body && INLINE.has(display(el))) el = el.parentElement;
    return el || document.body;
  }

  function makeWalker(root) {
    return document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) {
          const tag = n.tagName.toUpperCase();
          if (SKIP_TAGS.has(tag) || n.hidden) return NodeFilter.FILTER_REJECT;
          if (n.matches(SKIP_SEL)) return NodeFilter.FILTER_REJECT;
          if (tag === 'HEADER' && !n.closest('article, main, [role="main"]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
  }

  function isVisible(el) {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function pickRoot(preferMain) {
    if (!preferMain) return document.body;
    const main = document.querySelector('main, [role="main"]');
    if (main && main.textContent.trim().length > 500) return main;
    let best = null, bestLen = 0;
    for (const a of document.querySelectorAll('article')) {
      const len = a.textContent.length;
      if (len > bestLen) { best = a; bestLen = len; }
    }
    return best && bestLen > 500 ? best : document.body;
  }

  // ------------------------------------------------------------------ collect

  function collect(scope, preferMain) {
    displayCache = new WeakMap();
    state.blocks.clear();
    let range = null, root;
    if (scope === 'selection') {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        return { error: 'Select some text on the page first, then choose "Analyze selected text".' };
      }
      range = sel.getRangeAt(0);
      const c = range.commonAncestorContainer;
      root = c.nodeType === 1 ? c : c.parentElement;
    } else {
      root = pickRoot(preferMain);
    }

    const groups = new Map(); // block el -> [text pieces]
    const walker = makeWalker(root);
    let n, total = 0;
    const addNode = (node) => {
      let text = node.nodeValue;
      if (range) {
        if (!range.intersectsNode(node)) return;
        const s = node === range.startContainer ? range.startOffset : 0;
        const e = node === range.endContainer ? range.endOffset : text.length;
        text = text.slice(s, e);
      }
      const blk = nearestBlock(node);
      if (blk.closest('#' + ROOT_ID)) return;
      let g = groups.get(blk);
      if (!g) { g = []; groups.set(blk, g); }
      g.push(text);
      total += text.length;
    };
    if (root.nodeType === 1 && range && range.commonAncestorContainer.nodeType === 3) {
      addNode(range.commonAncestorContainer);
    } else {
      while ((n = walker.nextNode()) && total < 400000) if (n.nodeType === 3) addNode(n);
    }

    const blocks = [];
    let i = 0;
    for (const [el, pieces] of groups) {
      const text = pieces.join('').replace(/\s+/g, ' ').trim();
      if (text.length < (range ? 12 : 30)) continue;
      if (!isVisible(el)) continue;
      const id = 'b' + (i++);
      state.blocks.set(id, { el });
      blocks.push({ id, text });
    }
    return { blocks, title: document.title, url: location.href };
  }

  // ------------------------------------------------------------------ text matching

  function blockNodes(el) {
    const out = [];
    const w = makeWalker(el);
    let n;
    while ((n = w.nextNode())) if (n.nodeType === 3 && nearestBlock(n) === el) out.push(n);
    return out;
  }

  /** Normalized, lower-cased text of the nodes plus a map from each output char to [nodeIndex, offset]. */
  function normWithMap(nodes) {
    let out = '';
    const map = [];
    let prevSpace = true;
    nodes.forEach((node, ni) => {
      const t = node.nodeValue;
      for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (/\s/.test(c)) {
          if (!prevSpace) { out += ' '; map.push([ni, i]); prevSpace = true; }
          continue;
        }
        const f = FOLD[c];
        const s = (f !== undefined ? f : c).toLowerCase();
        if (!s) continue;
        prevSpace = false;
        for (const ch of s) { out += ch; map.push([ni, i]); }
      }
    });
    return { text: out, map };
  }

  function norm(s) {
    let out = '', prevSpace = true;
    for (const c of s) {
      if (/\s/.test(c)) { if (!prevSpace) { out += ' '; prevSpace = true; } continue; }
      const f = FOLD[c];
      const t = (f !== undefined ? f : c).toLowerCase();
      if (!t) continue;
      prevSpace = false;
      out += t;
    }
    return out.trim();
  }

  function findSpan(S, quote) {
    const Q = norm(quote);
    if (Q.length < 4) return null;
    let i = S.indexOf(Q);
    if (i >= 0) return { start: i, end: i + Q.length };
    const Q2 = Q.replace(/^[\s"'.,;:()\[\]-]+|[\s"',;:()\[\]-]+$/g, '').replace(/\.{3}$/, '').trim();
    if (Q2.length >= 4) {
      i = S.indexOf(Q2);
      if (i >= 0) return { start: i, end: i + Q2.length };
    }
    if (Q2.includes('...')) {
      const parts = Q2.split('...').map(s => s.trim()).filter(s => s.length >= 4);
      if (parts.length >= 2) {
        const a = S.indexOf(parts[0]);
        const last = parts[parts.length - 1];
        const z = a >= 0 ? S.indexOf(last, a + parts[0].length) : -1;
        if (z >= 0 && z - a < Q2.length * 3) return { start: a, end: z + last.length };
      }
    }
    if (Q2.length >= 30) {
      const pre = Q2.slice(0, 24), suf = Q2.slice(-24);
      for (let a = S.indexOf(pre); a >= 0; a = S.indexOf(pre, a + 1)) {
        const z = S.indexOf(suf, a + pre.length);
        if (z >= 0 && z + suf.length - a <= Q2.length * 1.5 + 20) return { start: a, end: z + suf.length, approx: true };
      }
      const a = S.indexOf(pre);
      if (a >= 0) return { start: a, end: Math.min(S.length, a + Q2.length), approx: true };
      const z = S.indexOf(suf);
      if (z >= 0) return { start: Math.max(0, z + suf.length - Q2.length), end: z + suf.length, approx: true };
    }
    return null;
  }

  function locate(f) {
    const tryBlock = (b) => {
      if (!b || !b.el.isConnected) return null;
      const nodes = blockNodes(b.el);
      const { text, map } = normWithMap(nodes);
      const r = findSpan(text, f.quote);
      return r ? { nodes, map, ...r } : null;
    };
    const own = state.blocks.get(f.blockId);
    let hit = tryBlock(own);
    if (!hit) {
      for (const b of state.blocks.values()) {
        if (b === own) continue;
        hit = tryBlock(b);
        if (hit) break;
      }
    }
    return hit;
  }

  function confLevel(c) { return c >= 0.75 ? 'high' : c >= 0.5 ? 'med' : 'low'; }
  function confLabel(c) { return c >= 0.75 ? 'High' : c >= 0.5 ? 'Medium' : 'Low'; }

  function wrap(hit, f) {
    const { nodes, map, start, end } = hit;
    const [si, so] = map[start];
    const [ei, eoRaw] = map[end - 1];
    const eo = eoRaw + 1;
    const marks = [];
    for (let k = si; k <= ei; k++) {
      let node = nodes[k];
      if (!node.parentNode) continue;
      const a = k === si ? so : 0;
      const b = k === ei ? eo : node.nodeValue.length;
      if (a >= b || !/\S/.test(node.nodeValue.slice(a, b))) continue;
      if (b < node.nodeValue.length) node.splitText(b);
      if (a > 0) node = node.splitText(a);
      const m = document.createElement('mark');
      m.className = `lfh-mark lfh-f-${f.family} lfh-c-${confLevel(f.confidence)}${state.hidden.has(f.family) ? ' lfh-off' : ''}`;
      m.dataset.lfhId = f.id;
      node.parentNode.insertBefore(m, node);
      m.appendChild(node);
      marks.push(m);
    }
    if (marks.length) {
      marks[0].tabIndex = 0;
      marks[0].setAttribute('aria-label', `Possible fallacy: ${f.labels.map(l => l.name).join(' or ')}. Press Enter for details.`);
    }
    return marks;
  }

  function unwrap(m) {
    const p = m.parentNode;
    if (!p) return;
    while (m.firstChild) p.insertBefore(m.firstChild, m);
    p.removeChild(m);
    p.normalize();
  }

  function clearMarks() {
    hideTip(true);
    document.querySelectorAll('mark.lfh-mark').forEach(unwrap);
    state.findings.clear();
  }

  // ------------------------------------------------------------------ findings

  function addFindings(list) {
    displayCache = new WeakMap();
    for (const f of list) {
      if (state.findings.has(f.id)) continue;
      let marks = [];
      try {
        const hit = locate(f);
        if (hit) marks = wrap(hit, f);
      } catch (e) { /* page changed under us; leave unlocated */ }
      state.findings.set(f.id, { f, marks, located: marks.length > 0 });
    }
    render();
  }

  function dismiss(id) {
    const rec = state.findings.get(id);
    if (!rec) return;
    rec.marks.forEach(unwrap);
    state.findings.delete(id);
    hideTip(true);
    render();
    chrome.runtime.sendMessage({ cmd: 'count', count: state.findings.size }).catch(() => {});
  }

  function sortedFindings() {
    const arr = [...state.findings.values()];
    arr.sort((a, b) => {
      if (a.located !== b.located) return a.located ? -1 : 1;
      if (!a.located) return 0;
      const pos = a.marks[0].compareDocumentPosition(b.marks[0]);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    });
    return arr;
  }

  function toggleFamily(fam) {
    if (state.hidden.has(fam)) state.hidden.delete(fam); else state.hidden.add(fam);
    for (const { f, marks } of state.findings.values()) {
      if (f.family === fam) marks.forEach(m => m.classList.toggle('lfh-off', state.hidden.has(fam)));
    }
    hideTip(true);
    render();
  }

  // ------------------------------------------------------------------ shadow UI

  let host = null, shadow = null, ui = null;

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = ROOT_ID;
    host.style.cssText = 'all: initial; position: fixed; inset: auto; z-index: 2147483647;';
    // Closed: page scripts can't reach into the panel to read it or click its buttons.
    shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = UI_CSS;
    shadow.append(style);
    ui = {
      panel: h('section', { class: 'panel', role: 'complementary', 'aria-label': 'Fallacy check results' }),
      pill: h('button', { class: 'pill', type: 'button', hidden: true, onclick: () => { state.minimized = false; render(); } }),
      tip: h('div', { class: 'tip', role: 'dialog', 'aria-label': 'Fallacy details', tabindex: '-1', hidden: true }),
      live: h('div', { class: 'sr', role: 'status', 'aria-live': 'polite' })
    };
    ui.tip.addEventListener('mouseenter', () => clearTimeout(tipHideTimer));
    ui.tip.addEventListener('mouseleave', () => { if (!tipPinned) scheduleHide(); });
    ui.tip.addEventListener('keydown', onTipKeydown);
    shadow.append(ui.panel, ui.pill, ui.tip, ui.live);
    document.documentElement.append(host);
  }

  function removeHost() {
    host?.remove();
    host = shadow = ui = null;
  }

  function engineText() {
    const m = state.meta;
    const engine = m?.engine || state.engine;
    if (engine === 'claude') return `Claude · ${m?.model || state.model || ''}`;
    return 'Local pattern cues';
  }

  function render() {
    ensureHost();
    const { panel, pill } = ui;
    const items = sortedFindings();
    const visible = items.filter(r => !state.hidden.has(r.f.family));
    const n = items.length;
    const countText = () => `${n} possible fallac${n === 1 ? 'y' : 'ies'}`;

    pill.hidden = !state.minimized;
    panel.hidden = state.minimized;
    pill.textContent = state.status === 'running'
      ? `∴ Checking${state.progress ? ` ${state.progress.done}/${state.progress.total}` : ''}…`
      : `∴ ${countText()}`;
    if (state.minimized) return;

    panel.replaceChildren();

    // header
    panel.append(h('header', { class: 'hd' },
      h('div', { class: 'title' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, '∴'), 'Fallacy check'),
      h('div', { class: 'hd-actions' },
        h('button', { class: 'icon', type: 'button', title: 'Minimize', 'aria-label': 'Minimize', onclick: () => { state.minimized = true; hideTip(true); render(); } }, '–'),
        h('button', { class: 'icon', type: 'button', title: 'Close and remove highlights', 'aria-label': 'Close and remove highlights', onclick: closeAll }, '×'))));

    // status
    const status = h('div', { class: 'status' });
    if (state.status === 'running') {
      const p = state.progress;
      const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
      status.append(
        h('div', { class: 'status-line' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }),
          state.engine === 'claude'
            ? `Analyzing with Claude${p && p.total > 1 ? ` — part ${Math.min(p.done + 1, p.total)} of ${p.total}` : ''}…`
            : 'Scanning for pattern cues…'),
        h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${state.engine === 'claude' ? Math.max(6, pct) : 50}%` })));
    } else if (state.status === 'error') {
      status.append(h('div', { class: 'error', role: 'alert' }, state.error || 'Something went wrong.'));
    } else if (state.status === 'done') {
      status.append(h('div', { class: 'status-line' },
        h('strong', {}, countText()),
        state.scope === 'selection' ? ' in selection' : ''));
    }
    const m = state.meta;
    const announce = state.status === 'running' ? 'Checking the page for fallacies.'
      : state.status === 'error' ? `Fallacy check failed: ${state.error || 'something went wrong'}`
      : state.status === 'done' ? `Fallacy check finished: ${countText()}${state.scope === 'selection' ? ' in selection' : ''}.` : '';
    if (ui.live.textContent !== announce) ui.live.textContent = announce;
    const metaBits = [engineText()];
    if (m?.usage) metaBits.push(`${(m.usage.input_tokens + m.usage.cache_creation_input_tokens + m.usage.cache_read_input_tokens + m.usage.output_tokens).toLocaleString()} tokens`);
    if (m?.cost != null) metaBits.push(`≈ $${m.cost < 0.01 ? m.cost.toFixed(4) : m.cost.toFixed(3)}`);
    status.append(h('div', { class: 'meta' }, metaBits.join(' · ')));
    panel.append(status);

    // warnings / notes
    const notes = [];
    for (const w of m?.warnings || []) notes.push(h('div', { class: 'warn' }, w));
    if (state.status === 'done' && (m?.engine === 'local') && !m?.hasKey) {
      notes.push(h('div', { class: 'note' }, 'Local mode only matches wording, so it misses most fallacies and can misfire. ',
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); chrome.runtime.sendMessage({ cmd: 'openOptions' }); } }, 'Add a Claude API key'),
        ' for real argument analysis.'));
    }
    if (state.status === 'done' && m?.belowThreshold) {
      notes.push(h('div', { class: 'note' }, `${m.belowThreshold} lower-confidence candidate${m.belowThreshold === 1 ? ' was' : 's were'} hidden by your sensitivity setting.`));
    }
    if (state.status === 'done' && m?.engine === 'claude' && !items.length && m?.modelNotes?.length) {
      notes.push(h('div', { class: 'note' }, h('strong', {}, 'Claude: '), m.modelNotes[0]));
    }

    if (notes.length) panel.append(h('div', { class: 'notes' }, notes));

    // family chips
    if (n) {
      const counts = {};
      for (const { f } of items) counts[f.family] = (counts[f.family] || 0) + 1;
      const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by family' });
      for (const fam of FAMILY_ORDER) {
        if (!counts[fam]) continue;
        const f0 = items.find(r => r.f.family === fam).f;
        const on = !state.hidden.has(fam);
        chips.append(h('button', {
          class: 'chip' + (on ? ' on' : ''), type: 'button', 'aria-pressed': String(on),
          style: `--c:${f0.color}`, title: on ? 'Hide this family' : 'Show this family',
          onclick: () => toggleFamily(fam)
        }, h('span', { class: 'dot' }), `${f0.familyLabel} ${counts[fam]}`));
      }
      panel.append(chips);
    }

    // list
    if (visible.length) {
      const list = h('ol', { class: 'list' });
      for (const { f, located } of visible) {
        list.append(h('li', {},
          h('button', { class: 'item', type: 'button', style: `--c:${f.color}`, onclick: (e) => focusFinding(f.id, e.currentTarget) },
            h('span', { class: 'dot', 'aria-hidden': 'true' }),
            h('span', { class: 'item-body' },
              h('span', { class: 'row1' },
                h('span', { class: 'name' }, f.labels.map(l => l.name).join(' / ')),
                h('span', { class: `conf conf-${confLevel(f.confidence)}` }, confLabel(f.confidence))),
              h('span', { class: 'quote' }, `“${f.quote.replace(/^["'“‘\s]+|["'”’\s,]+$/g, '')}”`),
              located ? null : h('span', { class: 'unloc' }, 'Couldn\'t pinpoint this text on the page')))));
      }
      panel.append(list);
    } else if (state.status === 'done' && !n) {
      panel.append(h('p', { class: 'empty' }, 'No likely fallacies found at this sensitivity. That doesn\'t mean every argument here is sound.'));
    }

    // footer
    panel.append(h('footer', { class: 'ft' },
      h('div', { class: 'ft-actions' },
        h('button', { class: 'btn', type: 'button', disabled: state.status === 'running', onclick: (e) => { if (e.isTrusted) rerun(); } }, 'Re-run'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => chrome.runtime.sendMessage({ cmd: 'openOptions' }) }, 'Settings')),
      h('p', { class: 'disclaimer' }, 'Possible issues, not verdicts. A flawed argument doesn\'t make its conclusion false.')));
  }

  function rerun() {
    // A selection is usually gone by now, so a re-run checks the whole page.
    chrome.runtime.sendMessage({ cmd: 'analyze', scope: 'page' }).catch(() => {});
  }

  function closeAll() {
    clearMarks();
    removeHost();
    state.status = 'idle';
    chrome.runtime.sendMessage({ cmd: 'clear' }).catch(() => {});
  }

  // `from` is the list item that asked; Escape returns focus there.
  function focusFinding(id, from) {
    const rec = state.findings.get(id);
    if (!rec) return;
    if (!rec.located) { showTip(null, [rec.f], true); tipReturnFocus = from || null; focusTip(); return; }
    const m = rec.marks[0];
    m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    rec.marks.forEach(x => { x.classList.remove('lfh-flash'); void x.offsetWidth; x.classList.add('lfh-flash'); });
    setTimeout(() => rec.marks.forEach(x => x.classList.remove('lfh-flash')), 1800);
    setTimeout(() => { showTip(m, findingsAt(m), true); tipReturnFocus = from || m; focusTip(); }, 450);
  }

  // ------------------------------------------------------------------ tooltip

  let tipAnchor = null, tipPinned = false, tipHideTimer = null;

  function findingsAt(markEl) {
    const out = [];
    for (let el = markEl; el; el = el.parentElement?.closest('mark.lfh-mark')) {
      const rec = state.findings.get(el.dataset.lfhId);
      if (rec && !out.includes(rec.f)) out.push(rec.f);
    }
    return out;
  }

  function showTip(anchor, findings, pin) {
    ensureHost();
    clearTimeout(tipHideTimer);
    if (!findings.length) return;
    document.querySelectorAll('mark.lfh-active').forEach(x => x.classList.remove('lfh-active'));
    tipAnchor = anchor;
    tipPinned = !!pin;
    const tip = ui.tip;
    tip.replaceChildren();
    for (const f of findings) {
      const primary = f.labels[0];
      const card = h('div', { class: 'card', style: `--c:${f.color}` },
        h('div', { class: 't-head' },
          h('span', { class: 'fam' }, f.familyLabel),
          h('span', { class: `conf conf-${confLevel(f.confidence)}` }, `${confLabel(f.confidence)} confidence`),
          f.source === 'local' ? h('span', { class: 'src' }, 'pattern cue') : null),
        h('div', { class: 't-title' }, 'Possible: ', h('strong', {}, primary.name),
          f.labels[1] ? h('span', { class: 'alt' }, ` or ${f.labels[1].name}`) : null),
        f.explanation ? h('p', { class: 't-expl' }, f.explanation) : null,
        f.question ? h('p', { class: 't-q' }, h('span', { class: 'lbl' }, 'Ask: '), f.question) : null,
        f.attribution && !/^author$/i.test(f.attribution) ? h('p', { class: 't-attr' }, `Whose reasoning: ${f.attribution}`) : null,
        (f.def || f.counter) ? h('details', { class: 't-more' },
          h('summary', {}, `About ${primary.name.toLowerCase().startsWith('appeal') ? 'this pattern' : primary.name}`),
          f.def ? h('p', {}, f.def) : null,
          f.counter ? h('p', {}, h('span', { class: 'lbl' }, 'Counter-move: '), f.counter) : null) : null,
        h('div', { class: 't-actions' },
          h('button', { class: 'btn ghost sm', type: 'button', onclick: () => dismiss(f.id) }, 'Dismiss')));
      tip.append(card);
    }
    tip.append(h('p', { class: 't-foot' }, 'A flawed argument doesn\'t make its conclusion false.'));
    tip.hidden = false;
    if (anchor) {
      const rec = state.findings.get(anchor.dataset.lfhId);
      (rec?.marks || [anchor]).forEach(x => x.classList.add('lfh-active'));
    }
    positionTip();
  }

  function positionTip() {
    if (!ui || ui.tip.hidden) return;
    const tip = ui.tip;
    const W = Math.min(360, window.innerWidth - 16);
    tip.style.width = W + 'px';
    if (!tipAnchor) {
      // unlocated finding: show next to the panel
      tip.style.left = Math.max(8, window.innerWidth - W - 392) + 'px';
      tip.style.top = Math.max(8, window.innerHeight - tip.offsetHeight - 16) + 'px';
      return;
    }
    const rects = tipAnchor.getClientRects();
    const r = rects[0] || tipAnchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { if (!tipPinned) hideTip(true); return; }
    const th = tip.offsetHeight;
    let top = r.bottom + 8;
    if (top + th > window.innerHeight - 8 && r.top - th - 8 > 8) top = r.top - th - 8;
    top = Math.max(8, Math.min(top, window.innerHeight - th - 8));
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }

  function scheduleHide() {
    clearTimeout(tipHideTimer);
    tipHideTimer = setTimeout(() => hideTip(false), 280);
  }

  function hideTip(force) {
    if (!ui) return;
    if (tipPinned && !force) return;
    clearTimeout(tipHideTimer);
    ui.tip.hidden = true;
    tipPinned = false;
    tipAnchor = null;
    document.querySelectorAll('mark.lfh-active').forEach(x => x.classList.remove('lfh-active'));
  }

  const markFrom = (t) => (t && t.nodeType === 1 ? t.closest('mark.lfh-mark') : null);

  document.addEventListener('mouseover', (e) => {
    const m = markFrom(e.target);
    if (!m || m.classList.contains('lfh-off') || tipPinned) return;
    showTip(m, findingsAt(m), false);
  }, true);
  document.addEventListener('mouseout', (e) => {
    const m = markFrom(e.target);
    if (!m || tipPinned) return;
    const to = e.relatedTarget;
    if (to && (to === host || markFrom(to) === m)) return;
    scheduleHide();
  }, true);
  document.addEventListener('click', (e) => {
    const m = markFrom(e.target);
    if (m && !m.classList.contains('lfh-off')) {
      showTip(m, findingsAt(m), true);
      return;
    }
    if (e.target === host) return; // click inside our UI
    if (tipPinned) hideTip(true);
  }, true);
  document.addEventListener('focusin', (e) => {
    const m = markFrom(e.target);
    if (m && !tipPinned) showTip(m, findingsAt(m), false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui && !ui.tip.hidden) { closeTipAndReturnFocus(); return; }
    const m = markFrom(e.target);
    if (m && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      showTip(m, findingsAt(m), true);
      tipReturnFocus = m;
      focusTip();
    }
  }, true);

  // ---- tooltip keyboard support: focus moves into the tooltip, Tab stays inside it, Escape returns
  let tipReturnFocus = null;
  function tipFocusables() {
    return [...ui.tip.querySelectorAll('button, summary, a[href]')].filter(el => !el.disabled && el.getClientRects().length);
  }
  function focusTip() {
    if (!ui || ui.tip.hidden) return;
    const first = tipFocusables()[0];
    (first || ui.tip).focus({ preventScroll: true });
  }
  function closeTipAndReturnFocus() {
    const anchor = tipAnchor;
    let back = tipReturnFocus;
    tipReturnFocus = null;
    if (back && !back.isConnected) back = anchor; // the list was re-rendered; fall back to the highlight
    hideTip(true);
    if (back && back.isConnected) back.focus({ preventScroll: true });
  }
  function onTipKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeTipAndReturnFocus(); return; }
    if (e.key !== 'Tab') return;
    const items = tipFocusables();
    if (!items.length) { e.preventDefault(); return; }
    const active = shadow.activeElement;
    const i = items.indexOf(active);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
    e.preventDefault();
    items[next].focus();
  }
  window.addEventListener('scroll', () => positionTip(), { capture: true, passive: true });
  window.addEventListener('resize', () => positionTip(), { passive: true });

  // ------------------------------------------------------------------ messages

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case 'lfh:begin': {
        clearMarks();
        Object.assign(state, {
          runId: msg.runId, scope: msg.scope, engine: msg.engine, model: msg.model,
          status: 'running', progress: null, meta: null, error: null, minimized: false
        });
        let res;
        try { res = collect(msg.scope, msg.preferMain); } catch (e) { res = { error: `Couldn't read this page (${e.message}).` }; }
        if (res.error) { state.status = 'error'; state.error = res.error; }
        render();
        sendResponse(res);
        return false;
      }
      case 'lfh:progress':
        if (msg.runId !== state.runId) return false;
        state.progress = { done: msg.done, total: msg.total };
        render();
        return false;
      case 'lfh:findings':
        if (msg.runId !== state.runId) return false;
        addFindings(msg.findings || []);
        return false;
      case 'lfh:done':
        if (msg.runId !== state.runId) return false;
        state.status = 'done';
        state.meta = msg.meta;
        render();
        return false;
      case 'lfh:error':
        if (msg.runId !== state.runId) return false;
        state.status = 'error';
        state.error = msg.error;
        render();
        return false;
      case 'lfh:clear':
        clearMarks();
        removeHost();
        state.status = 'idle';
        return false;
    }
    return false;
  });

  // ------------------------------------------------------------------ styles (shadow DOM)

  const UI_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.panel, .pill, .tip {
  --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0; --soft: #f6f8fa; --accent: #b45309;
  --warn-bg: #fff8c5; --warn-fg: #4d2d00; --err-bg: #ffebe9; --err-fg: #82071e;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  .panel, .pill, .tip {
    --bg: #1c2128; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d; --soft: #262c36; --accent: #f0b35a;
    --warn-bg: #3b2e0a; --warn-fg: #f2cc60; --err-bg: #3c1618; --err-fg: #ffa198;
  }
}
button { font: inherit; color: inherit; cursor: pointer; }
a { color: var(--accent); }
.panel {
  position: fixed; right: 16px; bottom: 16px; width: 372px; max-width: calc(100vw - 32px);
  max-height: min(72vh, 680px); display: flex; flex-direction: column;
  background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08); overflow: hidden;
}
.hd { display: flex; align-items: center; justify-content: space-between; padding: 10px 10px 8px 14px; border-bottom: 1px solid var(--line); }
.title { font-weight: 650; font-size: 14px; display: flex; gap: 8px; align-items: center; }
.logo { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #1e293b; color: #fbbf24; font-size: 15px; line-height: 1; }
.hd-actions { display: flex; gap: 2px; }
.icon { border: 0; background: transparent; width: 28px; height: 28px; border-radius: 6px; font-size: 18px; line-height: 1; color: var(--muted); }
.icon:hover { background: var(--soft); color: var(--fg); }
.status { padding: 10px 14px 6px; }
.status-line { display: flex; align-items: center; gap: 8px; }
.meta { color: var(--muted); font-size: 12px; margin-top: 2px; }
.bar { height: 4px; background: var(--soft); border-radius: 2px; margin-top: 8px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); transition: width .4s ease; }
.spinner { width: 12px; height: 12px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; flex: none; }
@keyframes spin { to { transform: rotate(360deg); } }
.error { background: var(--err-bg); color: var(--err-fg); padding: 8px 10px; border-radius: 8px; }
.notes { padding: 0 14px 4px; display: grid; gap: 6px; }
.warn { background: var(--warn-bg); color: var(--warn-fg); padding: 6px 10px; border-radius: 8px; font-size: 12px; }
.note { color: var(--muted); font-size: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 14px 8px; }
.chip { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; border: 1px solid var(--line); background: transparent; border-radius: 999px; padding: 2px 10px 2px 8px; font-size: 12px; color: var(--muted); }
.chip.on { color: var(--fg); border-color: var(--c); }
.chip .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); opacity: .35; }
.chip.on .dot { opacity: 1; }
.list { list-style: none; margin: 0; padding: 0 6px 6px; overflow: auto; flex: 1 1 auto; min-height: 0; border-top: 1px solid var(--line); }
.item { display: flex; gap: 10px; width: 100%; text-align: left; border: 0; background: transparent; padding: 9px 8px; border-radius: 8px; }
.item:hover { background: var(--soft); }
.item:focus-visible { background: var(--soft); outline: 2px solid var(--accent); outline-offset: -2px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } .bar-fill { transition: none; } }
.item .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c); margin-top: 4px; flex: none; }
.item-body { display: grid; gap: 2px; min-width: 0; }
.row1 { display: flex; gap: 8px; align-items: baseline; justify-content: space-between; }
.name { font-weight: 600; }
.conf { font-size: 11px; padding: 0 6px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
.conf-high { color: var(--fg); border-color: var(--fg); }
.quote { color: var(--muted); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.unloc { font-size: 11px; color: var(--accent); }
.empty { padding: 4px 14px 12px; color: var(--muted); margin: 0; }
.ft { border-top: 1px solid var(--line); padding: 8px 14px 10px; }
.ft-actions { display: flex; gap: 8px; }
.btn { border: 1px solid var(--line); background: var(--soft); border-radius: 8px; padding: 5px 12px; font-weight: 550; }
.btn:hover:not(:disabled) { border-color: var(--muted); }
.btn:disabled { opacity: .5; cursor: default; }
.btn.ghost { background: transparent; }
.btn.sm { padding: 3px 10px; font-size: 12px; }
.disclaimer { margin: 6px 0 0; font-size: 11.5px; color: var(--muted); }
.pill {
  position: fixed; right: 16px; bottom: 16px; border: 1px solid var(--line); background: var(--bg);
  border-radius: 999px; padding: 8px 14px; font-weight: 600; box-shadow: 0 6px 20px rgba(0,0,0,.18);
}
.tip {
  position: fixed; top: 0; left: 0; max-height: min(70vh, 560px); overflow: auto;
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 4px 0 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,.22);
}
.card { padding: 10px 14px 8px; border-left: 4px solid var(--c); margin: 6px 0; }
.card + .card { border-top: 1px solid var(--line); }
.t-head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 11.5px; }
.fam { color: var(--c); font-weight: 650; text-transform: uppercase; letter-spacing: .03em; }
.src { color: var(--muted); border: 1px dashed var(--line); border-radius: 999px; padding: 0 6px; }
.t-title { font-size: 14px; margin: 3px 0 4px; }
.alt { color: var(--muted); }
.t-expl { margin: 0 0 6px; }
.t-q { margin: 0 0 6px; }
.lbl { font-weight: 650; }
.t-attr { margin: 0 0 6px; color: var(--muted); font-size: 12px; }
.t-more { margin: 2px 0 6px; font-size: 12px; color: var(--muted); }
.t-more summary { cursor: pointer; }
.t-more p { margin: 4px 0; }
.t-actions { display: flex; justify-content: flex-end; }
.t-foot { margin: 2px 14px 0; font-size: 11.5px; color: var(--muted); }
`;
})();
