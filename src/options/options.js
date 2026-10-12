import { DEFAULT_SETTINGS, KNOWN_MODELS } from '../taxonomy.js';
import { listModels } from '../engines/claude.js';

const $ = (id) => document.getElementById(id);
const CUSTOM = '__custom__';
let models = [...KNOWN_MODELS];

function fillModels(selected) {
  const sel = $('model');
  sel.replaceChildren();
  const seen = new Set();
  for (const m of models) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    sel.append(new Option(m.label === m.id ? m.id : `${m.label} — ${m.id}`, m.id));
  }
  sel.append(new Option('Custom model id…', CUSTOM));
  if (selected && !seen.has(selected)) {
    sel.value = CUSTOM;
    $('customModel').value = selected;
  } else {
    sel.value = selected || DEFAULT_SETTINGS.model;
  }
  $('customModel').hidden = sel.value !== CUSTOM;
}

function setRadio(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}
const getRadio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;

function msg(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.className = `msg ${kind || ''}`;
}

async function load() {
  const s = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(DEFAULT_SETTINGS)) };
  $('apiKey').value = s.apiKey;
  fillModels(s.model);
  setRadio('engine', s.engine);
  setRadio('sensitivity', s.sensitivity);
  $('maxChars').value = String(s.maxChars);
  if (!$('maxChars').value) $('maxChars').value = '50000';
  $('preferMain').checked = !!s.preferMain;
}

function currentModel() {
  return $('model').value === CUSTOM ? $('customModel').value.trim() : $('model').value;
}

let toastTimer;
function toast(text, err) {
  const el = $('saveMsg');
  el.textContent = text;
  el.className = `toast show${err ? ' err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, err ? 4000 : 1600);
}

async function save() {
  const model = currentModel();
  if (!model) { toast('Enter a model id.', true); return; }
  await chrome.storage.local.set({
    apiKey: $('apiKey').value.trim(),
    model,
    engine: getRadio('engine') || 'auto',
    sensitivity: getRadio('sensitivity') || 'balanced',
    maxChars: Number($('maxChars').value) || DEFAULT_SETTINGS.maxChars,
    preferMain: $('preferMain').checked,
    apiBase: DEFAULT_SETTINGS.apiBase
  });
  toast('Saved');
}

async function testKey() {
  const key = $('apiKey').value.trim();
  if (!key) { msg('keyMsg', 'Paste a key first.', 'err'); return; }
  msg('keyMsg', 'Checking…');
  try {
    const list = await listModels(key, DEFAULT_SETTINGS.apiBase);
    const keep = currentModel();
    if (list.length) {
      models = [...KNOWN_MODELS, ...list.filter(m => !KNOWN_MODELS.some(k => k.id === m.id))];
      fillModels(keep);
    }
    const ok = list.some(m => m.id === keep) || KNOWN_MODELS.some(m => m.id === keep);
    msg('keyMsg', `Key works. ${list.length} model${list.length === 1 ? '' : 's'} available.${ok ? '' : ` "${keep}" isn't in the list; pick another.`}`, ok ? 'ok' : 'err');
    await save();
  } catch (e) {
    msg('keyMsg', e.auth ? 'That key was rejected. Check for a typo or create a new key.' : `Couldn't reach the API: ${e.message}`, 'err');
  }
}

$('model').addEventListener('change', () => {
  $('customModel').hidden = $('model').value !== CUSTOM;
  if ($('model').value === CUSTOM) $('customModel').focus(); else save();
});
$('toggleKey').addEventListener('click', () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('toggleKey').textContent = show ? 'Hide' : 'Show';
});
$('testKey').addEventListener('click', testKey);

// Autosave: text fields on change (blur/Enter), everything else immediately.
let keyTimer;
$('apiKey').addEventListener('input', () => { clearTimeout(keyTimer); keyTimer = setTimeout(save, 800); });
for (const id of ['apiKey', 'customModel', 'maxChars', 'preferMain']) $(id).addEventListener('change', save);
document.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', save));

load();
