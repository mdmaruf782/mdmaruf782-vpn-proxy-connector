const $ = (id) => document.getElementById(id);
let st;

async function render() {
  st = await getState();
  const usable = st.servers.filter((s) => s.host);

  const sel = $('server');
  sel.innerHTML = '';
  usable.forEach((s) => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name + ' — ' + s.host;
    sel.appendChild(o);
  });
  sel.value = usable.some((s) => s.id === st.activeId) ? st.activeId : usable[0] ? usable[0].id : '';

  $('msg').textContent = usable.length ? '' : 'No servers yet. Open "Manage servers" and add one.';
  $('toggle').textContent = st.enabled ? 'Disconnect' : 'Connect';
  $('toggle').className = st.enabled ? 'on' : '';
  $('toggle').disabled = !usable.length;
  $('state').textContent = st.enabled ? 'Proxy ON' : 'Proxy OFF';
  $('dot').className = st.enabled ? 'dot on' : 'dot';

  const lvl = await chrome.proxy.settings.get({ incognito: false });
  $('warn').textContent =
    st.enabled && lvl.levelOfControl !== 'controlled_by_this_extension'
      ? 'Another extension is controlling Chrome\'s proxy. Disable it first.'
      : '';
}

async function checkIp() {
  $('ip').textContent = 'Checking…';
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store', signal: ctl.signal });
    clearTimeout(timer);
    const j = await r.json();
    $('ip').textContent = 'Your IP: ' + j.ip;
  } catch (e) {
    $('ip').textContent = st && st.enabled ? 'No connection via proxy' : 'No connection';
  }
}

$('toggle').onclick = async () => {
  const enabled = !st.enabled;
  await chrome.storage.local.set({ enabled, activeId: $('server').value || st.activeId });
  await render();
  setTimeout(checkIp, 500);
};

$('server').onchange = async () => {
  await chrome.storage.local.set({ activeId: $('server').value });
  await render();
  if (st.enabled) setTimeout(checkIp, 500);
};

$('check').onclick = checkIp;
$('opts').onclick = () => chrome.runtime.openOptionsPage();

render().then(checkIp);
