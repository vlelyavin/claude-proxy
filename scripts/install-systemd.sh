#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="claude-proxy"
SERVICE_USER="${SUDO_USER:-${USER:-root}}"
SERVICE_HOME=""
WORKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node)"
CONFIG_PATH="$WORKDIR/config.json"
LISTEN_HOST="127.0.0.1"
LISTEN_PORT="18801"

usage() {
  cat <<'EOF'
usage: install-systemd.sh [options]

options:
  --service-name NAME   systemd service name (default: claude-proxy)
  --user USER           service user
  --home PATH           home directory for that user
  --workdir PATH        repo working directory
  --node PATH           explicit node binary path
  --config PATH         config file path passed to --config
  --host HOST           expected listen host for post-install hint
  --port PORT           expected listen port for post-install hint
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service-name)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --user)
      SERVICE_USER="$2"
      shift 2
      ;;
    --home)
      SERVICE_HOME="$2"
      shift 2
      ;;
    --workdir)
      WORKDIR="$2"
      shift 2
      ;;
    --node)
      NODE_BIN="$2"
      shift 2
      ;;
    --config)
      CONFIG_PATH="$2"
      shift 2
      ;;
    --host)
      LISTEN_HOST="$2"
      shift 2
      ;;
    --port)
      LISTEN_PORT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ${EUID} -ne 0 ]]; then
  echo "run this script with sudo or as root" >&2
  exit 1
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "node binary not found - pass --node /path/to/node" >&2
  exit 1
fi

if [[ ! -d "$WORKDIR" ]]; then
  echo "workdir does not exist: $WORKDIR" >&2
  exit 1
fi

if [[ -z "$SERVICE_HOME" ]]; then
  SERVICE_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6 || true)"
  SERVICE_HOME="${SERVICE_HOME:-/root}"
fi

UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Claude Proxy
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${WORKDIR}
ExecStart=${NODE_BIN} ${WORKDIR}/src/cli.js --config ${CONFIG_PATH}
Restart=always
RestartSec=5
Environment=HOME=${SERVICE_HOME}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

echo
systemctl --no-pager --full status "$SERVICE_NAME" || true
echo
echo "health: curl -sS http://${LISTEN_HOST}:${LISTEN_PORT}/health"
echo "logs:   journalctl -u ${SERVICE_NAME} -f"
