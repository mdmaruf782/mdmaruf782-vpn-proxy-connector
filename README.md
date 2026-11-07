# Ghost VPN Proxy

A small Chrome extension (Manifest V3) that routes your browser through **your own HTTP proxy servers** with one click. Add as many servers as you like (for example one per country) and switch between them from the toolbar.

This README also contains a complete **server setup guide**: how to turn a small VPS (Ubuntu 22.04 / 24.04) into an HTTP proxy, an optional SOCKS5 proxy and an optional WireGuard VPN.

No server details, accounts or analytics are bundled with the extension. Everything you enter stays in your browser's local extension storage.

## Contents

- [Features](#features)
- [Install the extension](#install-the-extension-developer-mode)
- [Add a server in the extension](#add-a-server-in-the-extension)
- [Server setup guide](#server-setup-guide)
- [Security notes](#security-notes)
- [How it works](#how-it-works)
- [Limitations](#limitations)
- [Project layout](#project-layout)

## Features

- One-click **Connect / Disconnect**, with an `ON` badge on the toolbar icon
- Server picker for multiple proxies
- **Check IP** button to confirm which address websites see
- Automatic proxy login (HTTP basic auth), no browser prompts
- Warns if another extension is controlling Chrome's proxy settings

## Install the extension (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the extension folder (the one containing `manifest.json`).
4. The settings page opens on first install. Add your server (see below), then click the toolbar icon and press **Connect**.

## Add a server in the extension

Open the extension, click **Manage servers**, and fill in:

| Field | Example |
|---|---|
| Name | `UK` |
| Server IP | `YOUR_SERVER_IP` |
| Port | `8118` |
| Username | your proxy username |
| Password | your proxy password |

Click **Save**. Servers with an empty IP are hidden from the popup.

---

## Server setup guide

The extension only needs **part 1** (HTTP proxy). Parts 2 and 3 are optional extras for other apps and whole-device VPN.

Replace the placeholders in the commands: `YOUR_SERVER_IP`, `YOUR_USER`, `YOUR_STRONG_PASSWORD`, `eth0` (your network interface).

### 0. Before you start

- **Take a snapshot or backup** from your VPS provider's panel.
- Find your network interface and check that the ports you plan to use are free:
  ```bash
  ip -o -4 route show to default      # interface name is after "dev"
  sudo ss -tulpn                      # ports 8118, 1080, 51820 should not appear
  ```
- If the server already runs websites or a control panel, only **add** firewall rules. Do not run `ufw reset`, `iptables -F`, or enable a firewall you did not have.
- Open each port in **both** the server firewall (UFW) and your provider's firewall / security group, if it has one.
- Use long random passwords, for example `openssl rand -hex 10`.

### 1. HTTP proxy with login (used by the extension)

Chrome cannot log in to SOCKS5 proxies that need a password, so the extension uses an HTTP proxy such as [tinyproxy](https://tinyproxy.github.io/).

```bash
sudo apt update && sudo apt install -y tinyproxy

sudo sed -i -e 's/^Port .*/Port 8118/' \
            -e 's/^#\?Listen .*/Listen 0.0.0.0/' \
            -e '/^Allow /d' /etc/tinyproxy/tinyproxy.conf

echo "BasicAuth YOUR_USER YOUR_STRONG_PASSWORD" | sudo tee -a /etc/tinyproxy/tinyproxy.conf

sudo ufw allow 8118/tcp
sudo systemctl enable --now tinyproxy
sudo systemctl restart tinyproxy
```

Test from another machine (it should print the server's IP):

```bash
curl -x http://YOUR_USER:YOUR_STRONG_PASSWORD@YOUR_SERVER_IP:8118 https://api.ipify.org
```

If you always connect from a fixed IP, you can keep an `Allow YOUR_IP` line in the config and skip opening the port to everyone.

### 2. SOCKS5 proxy (optional, for apps other than Chrome)

Other apps (curl, Telegram, torrent clients, etc.) can use SOCKS5 with a login. The extension does not use it.

```bash
sudo apt install -y dante-server
sudo cp /etc/danted.conf /etc/danted.conf.bak
```

Replace `/etc/danted.conf` with (change `eth0` if needed):

```
logoutput: syslog
user.privileged: root
user.unprivileged: nobody
internal: 0.0.0.0 port = 1080
external: eth0
socksmethod: username
clientmethod: none
client pass {
 from: 0.0.0.0/0 to: 0.0.0.0/0
}
socks pass {
 from: 0.0.0.0/0 to: 0.0.0.0/0
}
```

Create a login user (SOCKS5 uses a system account with no shell), open the port and start it:

```bash
sudo useradd -r -s /usr/sbin/nologin YOUR_USER
echo "YOUR_USER:YOUR_STRONG_PASSWORD" | sudo chpasswd
sudo ufw allow 1080/tcp
sudo systemctl enable --now danted
sudo systemctl restart danted
```

Test:

```bash
curl --socks5-hostname YOUR_USER:YOUR_STRONG_PASSWORD@YOUR_SERVER_IP:1080 https://api.ipify.org
```

### 3. WireGuard VPN (optional, whole device)

This works on a normal VPS (KVM / dedicated) whose kernel supports WireGuard. See the note at the end of this part for container-based VPS.

#### 3.1 Install and generate keys

```bash
sudo apt install -y wireguard qrencode
cd /etc/wireguard
umask 077
wg genkey | tee server.key | wg pubkey > server.pub
wg genkey | tee client.key | wg pubkey > client.pub
wg genpsk > psk.key
```

#### 3.2 Server config: `/etc/wireguard/wg0.conf`

Use `cat server.key client.pub psk.key` to get the values. Change `eth0` if your interface is different.

```ini
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = <contents of server.key>
PostUp = iptables -I FORWARD -i wg0 -j ACCEPT; iptables -I FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE

[Peer]
PublicKey = <contents of client.pub>
PresharedKey = <contents of psk.key>
AllowedIPs = 10.8.0.2/32
```

#### 3.3 Client config: `client1.conf`

```ini
[Interface]
PrivateKey = <contents of client.key>
Address = 10.8.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = <contents of server.pub>
PresharedKey = <contents of psk.key>
Endpoint = YOUR_SERVER_IP:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

#### 3.4 Enable forwarding, open the port, start

```bash
echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/99-wireguard.conf
sudo sysctl --system
sudo ufw allow 51820/udp
sudo systemctl enable --now wg-quick@wg0
sudo wg show
```

#### 3.5 Connect a device

Import `client1.conf` into the WireGuard app (Windows, macOS, Linux, Android, iOS). On a phone you can show a QR code instead:

```bash
qrencode -t ansiutf8 < client1.conf
```

Make one key pair and one `[Peer]` block per device, each with its own address (`10.8.0.3/32`, and so on).

#### Container-based VPS (OpenVZ / LXC)

If `systemctl start wg-quick@wg0` fails with `Operation not supported` or `Protocol not supported`, the provider's kernel does not allow WireGuard interfaces inside the container. Ask the provider to enable it, move to a KVM VPS, or use another VPN such as OpenVPN.

### Undo everything

```bash
sudo systemctl disable --now wg-quick@wg0 danted tinyproxy
sudo apt remove --purge -y wireguard wireguard-tools dante-server tinyproxy
sudo ufw delete allow 51820/udp
sudo ufw delete allow 1080/tcp
sudo ufw delete allow 8118/tcp
sudo rm -f /etc/sysctl.d/99-wireguard.conf
```

---

## Security notes

- **The browser-to-proxy connection is not encrypted.** HTTPS websites stay encrypted end to end, but anyone on your network can see that you are talking to the proxy and can see the proxy login. If that matters, use WireGuard instead, or put the proxy behind TLS.
- Credentials are stored **unencrypted** in `chrome.storage.local`. Do not use this extension on a shared or untrusted browser profile.
- An open proxy is quickly found and abused. Always set a long random password, never reuse your server login, and restrict access by IP where you can.
- Keep the server updated, and only use servers you own or are allowed to use. Follow your provider's terms.

## How it works

- `chrome.proxy` sets a fixed HTTP proxy for the browser while connected, and clears it when disconnected.
- `chrome.webRequest.onAuthRequired` answers the proxy's login challenge for the active server only, and gives up after two failed attempts so a wrong password does not loop.
- Settings live in `chrome.storage.local`; changing them re-applies the proxy automatically.

## Limitations

- Chrome only. It does not cover other apps on your device.
- HTTP proxies only (no SOCKS5 with authentication, because Chrome does not support it).
- Incognito windows are not covered unless you allow the extension there and extend the proxy scope.

## Project layout

```
manifest.json    extension manifest (MV3)
background.js    service worker: applies proxy settings and handles proxy auth
shared.js        default settings
popup.html/js    toolbar popup
options.html/js  server management page
icons/           extension icons
README.md        this file (extension + server setup guide)
```
