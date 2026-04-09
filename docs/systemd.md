# systemd deployment

This document shows two ways to run Claude Proxy as a boot-persistent local service.

## Fast path

From the repo root:

```bash
sudo ./scripts/install-systemd.sh
```

That script:
- writes `/etc/systemd/system/claude-proxy.service`
- reloads systemd
- enables the service
- starts it immediately

Default assumptions:
- repo lives where you cloned it
- node is already on your `PATH`
- service should use `config.json`
- service user and home are auto-detected from the invoking user when possible

If you want to override those, pass flags like:

```bash
sudo ./scripts/install-systemd.sh \
  --user myuser \
  --home /home/myuser \
  --workdir /opt/claude-proxy \
  --config /opt/claude-proxy/config.json
```

## Manual unit

Adjust the user, home directory, and working directory for your environment.

```ini
[Unit]
Description=Claude Proxy
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/opt/claude-proxy
ExecStart=/usr/bin/node /opt/claude-proxy/src/cli.js --config /opt/claude-proxy/config.json
Restart=always
RestartSec=5
Environment=HOME=/home/YOUR_USER

[Install]
WantedBy=multi-user.target
```

## Manual install

```bash
sudo tee /etc/systemd/system/claude-proxy.service >/dev/null <<'EOF'
[Unit]
Description=Claude Proxy
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/opt/claude-proxy
ExecStart=/usr/bin/node /opt/claude-proxy/src/cli.js --config /opt/claude-proxy/config.json
Restart=always
RestartSec=5
Environment=HOME=/home/YOUR_USER

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now claude-proxy
```

## Verify

```bash
systemctl status claude-proxy --no-pager
curl -sS http://127.0.0.1:18801/health
```

## Logs

```bash
journalctl -u claude-proxy -f
```

## Restart

```bash
sudo systemctl restart claude-proxy
```

## Notes

- keep the service bound to localhost unless you intentionally want remote access
- make sure the configured user can read the Claude credential file referenced by `config.json`
- if you run the service as root, set `User=root` and `Environment=HOME=/root`
- if you do not need custom settings, you can skip `config.json` entirely and start with built-in defaults instead
