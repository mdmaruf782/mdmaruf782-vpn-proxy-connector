const $ = (id) => document.getElementById(id);
let servers = [];

function field(label, key, value, type) {
  return (
    '<div class="row"><label>' + label + '</label>' +
    '<input data-key="' + key + '" type="' + (type || 'text') + '" value="' +
    String(value == null ? '' : value).replace(/"/g, '&quot;') + '"></div>'
  );
}

function draw() {
  const list = $('list');
  list.innerHTML = '';
  servers.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'srv';
    d.dataset.index = i;
    d.innerHTML =
      field('Name (e.g. USA)', 'name', s.name) +
      field('Server IP', 'host', s.host) +
      field('Port', 'port', s.port, 'number') +
      field('Username', 'username', s.username) +
      field('Password', 'password', s.password, 'password') +
      '<div class="actions"><button class="danger" data-del="' + i + '">Remove</button></div>';
    list.appendChild(d);
  });
  list.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      read();
      servers.splice(Number(b.dataset.del), 1);
      draw();
    };
  });
}

function read() {
  document.querySelectorAll('.srv').forEach((el) => {
    const s = servers[Number(el.dataset.index)];
    el.querySelectorAll('input').forEach((inp) => {
      s[inp.dataset.key] = inp.dataset.key === 'port' ? Number(inp.value) || 8118 : inp.value.trim();
    });
  });
}

$('add').onclick = () => {
  read();
  servers.push({ id: 'vps' + Date.now(), name: 'New server', host: '', port: 8118, username: '', password: '' });
  draw();
};

$('save').onclick = async () => {
  read();
  const cur = await getState();
  const patch = { servers };
  if (!servers.some((s) => s.id === cur.activeId)) patch.activeId = servers[0] ? servers[0].id : '';
  await chrome.storage.local.set(patch);
  $('saved').textContent = 'Saved';
  setTimeout(() => ($('saved').textContent = ''), 1500);
};

getState().then((st) => {
  servers = st.servers;
  draw();
});
