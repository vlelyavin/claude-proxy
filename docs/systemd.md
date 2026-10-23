# systemd deployment

This guide covers two ways to set up Claude Proxy as a persistent systemd service.

## Fast path

Run the installation script from the repository root:

```bash
sudo ./scripts/install-systemd.sh
```

The script will:
- generate `/etc/systemd/system/claude-proxy.service`
- reload the systemd daemon
- enable the service on boot
- start the service immediately

Default assumptions:
- the repository stays where you cloned it
- Node.js is available on your `PATH`
- the service will read `config.json`
- the service user and home directory are inferred from the invoking user whenever possible

To override these defaults, pass the appropriate flags:

```bash
sudo ./scripts/install-systemd.sh \
  --user myuser \
  --home /home/myuser \
  --workdir /opt/claude-proxy \
  --config /opt/claude-proxy/config.json
```

## Manual unit

Adjust the user, home directory, and working directory to match your environment:

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

- Keep the service bound to localhost unless you explicitly require remote access.
- Ensure the configured user has read permissions for the Claude credentials file referenced in `config.json`.
- If you run the service as root, set `User=root` and `Environment=HOME=/root`.
- If you don't need custom configuration, you can omit `config.json` entirely and run with the built-in defaults.
