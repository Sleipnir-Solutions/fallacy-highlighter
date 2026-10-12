const $ = (id) => document.getElementById(id);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

async function init() {
  const tab = await activeTab();
  const st = await chrome.runtime.sendMessage({ cmd: 'status', tabId: tab?.id });

  $('engine').textContent = st.engine === 'claude'
    ? `Engine: Claude (${st.model})`
    : (st.engineSetting === 'local' ? 'Engine: local pattern cues' : 'Engine: local pattern cues (no API key)');

  if (st.engineSetting !== 'local' && !st.hasKey) {
    const msg = $('msg');
    msg.className = 'ok';
    msg.append('Add a Claude API key in ');
    const a = document.createElement('a');
    a.href = '#'; a.textContent = 'Settings';
    a.onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
    msg.append(a, ' for real argument analysis.');
  }

  if (st.last) {
    const l = st.last;
    $('last').textContent = `Last check: ${l.count} possible issue${l.count === 1 ? '' : 's'} · ${l.engine === 'claude' ? 'Claude' : 'local'} · ${ago(l.at)}${l.cost != null ? ` · ≈ $${l.cost.toFixed(3)}` : ''}`;
  }
  if (st.running) $('analyze').textContent = 'Analyzing… (click to restart)';

  try {
    const cmds = await chrome.commands.getAll();
    const c = cmds.find(x => x.name === 'analyze-page');
    if (c?.shortcut) $('shortcut').textContent = `Shortcut: ${c.shortcut}`;
  } catch { /* ignore */ }

  const run = async (scope) => {
    $('analyze').disabled = $('selection').disabled = true;
    $('msg').className = 'ok';
    $('msg').textContent = 'Reading the page…';
    const r = await chrome.runtime.sendMessage({ cmd: 'analyze', tabId: tab.id, scope });
    if (r?.ok) { window.close(); return; }
    $('msg').className = '';
    $('msg').textContent = r?.error || 'Something went wrong.';
    $('analyze').disabled = $('selection').disabled = false;
  };

  $('analyze').onclick = () => run('page');
  $('selection').onclick = () => run('selection');
  $('clear').onclick = async () => {
    await chrome.runtime.sendMessage({ cmd: 'clear', tabId: tab.id });
    window.close();
  };
  $('settings').onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
}

init();
