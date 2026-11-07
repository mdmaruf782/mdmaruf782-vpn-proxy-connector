importScripts('shared.js');

// Apply (or clear) Chrome's proxy settings from the saved state.
async function applyProxy() {
  const { enabled, activeId, servers } = await getState();
  const srv = servers.find((s) => s.id === activeId);

  if (enabled && srv && srv.host) {
    await chrome.proxy.settings.set({
      value: {
        mode: 'fixed_servers',
        rules: {
          singleProxy: { scheme: 'http', host: srv.host, port: Number(srv.port) || 8118 },
          bypassList: ['<local>', 'localhost', '127.0.0.1', '[::1]', srv.host]
        }
      },
      scope: 'regular'
    });
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#1a9d55' });
  } else {
    await chrome.proxy.settings.clear({ scope: 'regular' });
    chrome.action.setBadgeText({ text: '' });
  }
}

// Answer the proxy's login prompt automatically (only for the active server).
const attempts = new Map();

chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (!details.isProxy) {
      callback({});
      return;
    }
    getState().then(({ enabled, activeId, servers }) => {
      const srv = servers.find((s) => s.id === activeId);
      if (!enabled || !srv || details.challenger.host !== srv.host) {
        callback({});
        return;
      }
      const n = (attempts.get(details.requestId) || 0) + 1;
      attempts.set(details.requestId, n);
      if (n > 2) {
        callback({}); // wrong credentials: stop retrying
        return;
      }
      callback({ authCredentials: { username: srv.username, password: srv.password } });
    });
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);

const forget = (d) => attempts.delete(d.requestId);
chrome.webRequest.onCompleted.addListener(forget, { urls: ['<all_urls>'] });
chrome.webRequest.onErrorOccurred.addListener(forget, { urls: ['<all_urls>'] });

// Re-apply whenever the user changes anything.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.activeId || changes.servers)) applyProxy();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  const cur = await chrome.storage.local.get(null);
  if (!cur.servers) await chrome.storage.local.set(DEFAULTS);
  applyProxy();
  // First install: open the settings page so the user can add a server.
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(applyProxy);
