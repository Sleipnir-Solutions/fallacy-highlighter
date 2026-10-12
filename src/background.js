// Service worker: wires the toolbar popup, context menu and keyboard shortcut to the
// content script, and runs the chosen engine (Claude API or local patterns).

import { DEFAULT_SETTINGS, SENSITIVITY, FAMILIES } from './taxonomy.js';
import { analyzeWithClaude } from './engines/claude.js';
import { analyzeLocally } from './engines/local.js';

// Keep the API key out of reach of content scripts, which run inside web pages' processes.
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});

const running = new Map(); // tabId -> AbortController
const lastPageRun = new Map(); // tabId -> time of the last run started from the in-page panel
let runCounter = 0;

async function getSettings() {
  const s = await chrome.storage.local.get(DEFAULT_SETTINGS);
  // The API endpoint is fixed (the manifest CSP also only allows api.anthropic.com).
  return { ...DEFAULT_SETTINGS, ...s, apiBase: DEFAULT_SETTINGS.apiBase };
}

function pickEngine(settings) {
  if (settings.engine === 'local') return 'local';
  if (settings.engine === 'claude') return 'claude';
  return settings.apiKey ? 'claude' : 'local';
}

// ---------- setup

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'lfh-page', title: 'Check this page for logical fallacies', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'lfh-selection', title: 'Check selected text for logical fallacies', contexts: ['selection'] });
  });
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  start(tab.id, info.menuItemId === 'lfh-selection' ? 'selection' : 'page').then(reportStartFailure(tab.id));
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab?.id) return;
  if (command === 'analyze-page') start(tab.id, 'page').then(reportStartFailure(tab.id));
  if (command === 'analyze-selection') start(tab.id, 'selection').then(reportStartFailure(tab.id));
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && info.url) resetTab(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => resetTab(tabId));

function reportStartFailure(tabId) {
  return (r) => {
    if (r && !r.ok) {
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#6b7280' });
      chrome.action.setBadgeText({ tabId, text: '!' });
      chrome.action.setTitle({ tabId, title: `Fallacy Highlighter: ${r.error}` });
    }
  };
}

function resetTab(tabId) {
  running.get(tabId)?.abort();
  running.delete(tabId);
  chrome.storage.session.remove(`tab_${tabId}`).catch(() => {});
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  chrome.action.setTitle({ tabId, title: 'Fallacy Highlighter' }).catch(() => {});
}

// ---------- messages from popup, options and content script

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Extension pages (popup, settings) may name a tab; content scripts may only act on their own tab.
  const fromExtensionPage = (sender.url || '').startsWith(chrome.runtime.getURL(''));
  const tabId = fromExtensionPage ? msg?.tabId : sender.tab?.id;
  switch (msg?.cmd) {
    case 'analyze': {
      if (!fromExtensionPage) {
        // Re-run from the in-page panel: allow at most one paid run per tab every 5 seconds.
        const now = Date.now();
        if (now - (lastPageRun.get(tabId) || 0) < 5000) { sendResponse({ ok: false, error: 'Please wait a few seconds before re-running.' }); return false; }
        lastPageRun.set(tabId, now);
      }
      start(tabId, msg.scope === 'selection' ? 'selection' : 'page').then(sendResponse, e => sendResponse({ ok: false, error: e.message }));
      return true;
    }
    case 'clear':
      resetTab(tabId);
      chrome.tabs.sendMessage(tabId, { type: 'lfh:clear' }, { frameId: 0 }).catch(() => {});
      sendResponse({ ok: true });
      return false;
    case 'status':
      Promise.all([getSettings(), chrome.storage.session.get(`tab_${tabId}`)]).then(([s, st]) => {
        sendResponse({
          engine: pickEngine(s), engineSetting: s.engine, hasKey: !!s.apiKey, model: s.model,
          running: running.has(tabId), last: st[`tab_${tabId}`] || null
        });
      });
      return true;
    case 'count':
      if (sender.tab?.id) setBadge(sender.tab.id, msg.count);
      chrome.storage.session.get(`tab_${sender.tab?.id}`).then(st => {
        const k = `tab_${sender.tab?.id}`;
        if (st[k]) chrome.storage.session.set({ [k]: { ...st[k], count: msg.count } });
      });
      return false;
    case 'openOptions':
      chrome.runtime.openOptionsPage();
      return false;
  }
  return false;
});

function setBadge(tabId, count) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#b45309' }).catch(() => {});
  chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' }).catch(() => {});
}

// ---------- run

function friendlyInjectError(e) {
  const m = String(e?.message || e);
  if (/chrome:\/\/|edge:\/\/|about:|extensions gallery|webstore|chrome-extension:/i.test(m)) {
    return 'Chrome doesn\'t let extensions read this kind of page.';
  }
  if (/Cannot access|permission/i.test(m)) {
    return 'No access to this page yet. Use the toolbar button, right-click menu or shortcut on the page to grant it.';
  }
  if (/PDF|pdf/.test(m)) return 'PDF viewer pages can\'t be analyzed.';
  return `Couldn't open the page for analysis (${m}).`;
}

async function ensureInjected(tabId) {
  const [probe] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!window.__lfhLoaded });
  if (!probe?.result) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['src/content/content.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/content.js'] });
  }
}

/**
 * Inject, collect the page text, and kick off analysis. Resolves as soon as the
 * page text is collected; analysis continues in the background and streams results
 * to the content script.
 */
async function start(tabId, scope) {
  if (tabId == null) return { ok: false, error: 'No active tab.' };
  try {
    await ensureInjected(tabId);
  } catch (e) {
    return { ok: false, error: friendlyInjectError(e) };
  }
  const settings = await getSettings();
  const engine = pickEngine(settings);
  const runId = ++runCounter;

  running.get(tabId)?.abort();
  const ac = new AbortController();
  running.set(tabId, ac);

  let collected;
  try {
    collected = await chrome.tabs.sendMessage(tabId, {
      type: 'lfh:begin', runId, scope, engine, model: settings.model, preferMain: settings.preferMain
    }, { frameId: 0 });
  } catch (e) {
    running.delete(tabId);
    return { ok: false, error: `The page didn't respond (${e.message}).` };
  }
  if (!collected || collected.error) {
    running.delete(tabId);
    return { ok: false, error: collected?.error || 'Nothing to analyze.' };
  }
  if (engine === 'claude' && !settings.apiKey) {
    running.delete(tabId);
    const error = 'Claude-only mode needs an API key. Add one in Settings, or switch the engine to Auto.';
    chrome.tabs.sendMessage(tabId, { type: 'lfh:error', runId, error }, { frameId: 0 }).catch(() => {});
    return { ok: false, error };
  }
  if (!collected.blocks.length) {
    running.delete(tabId);
    chrome.tabs.sendMessage(tabId, { type: 'lfh:done', runId, meta: { engine, count: 0, warnings: ['No readable paragraphs found on this page.'] } }, { frameId: 0 }).catch(() => {});
    return { ok: true, count: 0 };
  }

  analyze({ tabId, runId, scope, engine, settings, collected, ac }); // not awaited
  return { ok: true, blocks: collected.blocks.length };
}

async function analyze({ tabId, runId, scope, engine, settings, collected, ac }) {
  const send = (m) => {
    if (ac.signal.aborted) return Promise.resolve();
    return chrome.tabs.sendMessage(tabId, { ...m, runId }, { frameId: 0 }).catch(() => {});
  };
  // Keep the MV3 worker alive across long API calls (extension API calls reset the idle timer).
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  let lastPing = 0;
  const onActivity = () => {
    const now = Date.now();
    if (now - lastPing > 10000) { lastPing = now; chrome.runtime.getPlatformInfo(); }
  };

  // A selection is an explicit request about that text, so show everything Claude reports (>= 0.35);
  // whole-page runs use the sensitivity setting.
  const baseMin = SENSITIVITY[settings.sensitivity]?.min ?? 0.5;
  const minConf = scope === 'selection' ? Math.min(baseMin, 0.35) : baseMin;
  let count = 0, belowThreshold = 0;
  const emit = (findings) => {
    if (ac.signal.aborted) return;
    const keep = [];
    for (const f of findings) {
      if (f.confidence >= minConf) keep.push({ ...f, familyLabel: FAMILIES[f.family].label, color: FAMILIES[f.family].color });
      else belowThreshold++;
    }
    count += keep.length;
    if (keep.length) send({ type: 'lfh:findings', findings: keep });
  };

  const warnings = [];
  let engineUsed = engine, meta = {};
  const page = { title: collected.title, url: collected.url, scope };

  try {
    if (engine === 'claude') {
      try {
        meta = await analyzeWithClaude({
          blocks: collected.blocks, settings, page, onFindings: emit, onActivity, signal: ac.signal,
          onProgress: (done, total) => send({ type: 'lfh:progress', done, total })
        });
        if (meta.partialError) warnings.push(`Part of the page couldn't be analyzed: ${meta.partialError}`);
        const d = meta.diag || {};
        if (d.unreadable?.length) warnings.push(`Claude replied without results for part ${d.unreadable.join(', ')}${d.lastText ? ` ("${d.lastText.slice(0, 120)}")` : ''}. Try again.`);
        if (d.truncatedParts?.length) warnings.push(`Claude's answer was cut off for part ${d.truncatedParts.join(', ')}; some findings may be missing.`);
      } catch (e) {
        if (ac.signal.aborted) return;
        if (settings.engine !== 'auto') throw e;
        warnings.push(`Claude analysis failed: ${e.message} Showing local pattern cues instead.`);
        engineUsed = 'local';
        meta = analyzeLocally(collected.blocks, settings);
        emit(meta.findings);
      }
    } else {
      meta = analyzeLocally(collected.blocks, settings);
      emit(meta.findings);
    }
    if (ac.signal.aborted) return;
    if (meta.truncated) warnings.push(`Long page: analyzed the first ${meta.totalChars.toLocaleString()} characters (change the limit in Settings).`);

    await send({
      type: 'lfh:done',
      meta: {
        engine: engineUsed, model: engineUsed === 'claude' ? settings.model : null,
        count, belowThreshold, sensitivity: settings.sensitivity, scope,
        modelNotes: [...new Set(meta.diag?.notes || [])].slice(0, 3),
        usage: meta.usage || null, cost: meta.cost ?? null, chunks: meta.chunks || 1,
        warnings, hasKey: !!settings.apiKey
      }
    });
    setBadge(tabId, count);
    chrome.action.setTitle({ tabId, title: `Fallacy Highlighter: ${count} possible issue${count === 1 ? '' : 's'}` }).catch(() => {});
    chrome.storage.session.set({
      [`tab_${tabId}`]: { count, engine: engineUsed, model: engineUsed === 'claude' ? settings.model : null, scope, at: Date.now(), cost: meta.cost ?? null }
    }).catch(() => {});
  } catch (e) {
    if (!ac.signal.aborted) send({ type: 'lfh:error', error: e.message || String(e) });
  } finally {
    clearInterval(keepAlive);
    if (running.get(tabId) === ac) running.delete(tabId);
  }
}
