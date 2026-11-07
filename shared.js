// Default settings. No server details are bundled with the extension:
// add your own proxy servers from the extension's "Manage servers" page.
const DEFAULTS = {
  enabled: false,
  activeId: 'server1',
  servers: [
    { id: 'server1', name: 'Server 1', host: '', port: 8118, username: '', password: '' },
    { id: 'server2', name: 'Server 2', host: '', port: 8118, username: '', password: '' }
  ]
};

function getState() {
  return chrome.storage.local.get(DEFAULTS);
}
