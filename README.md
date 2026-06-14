# claude-proxy

local relay that routes claude api calls through your subscription auth. bypasses enforced extra usage billing so you can use tools like hermes/openclaw on a regular claude subscription.

## what it does

- loads local claude oauth credentials from disk on each request
- forwards anthropic-compatible traffic upstream with controlled headers
- rewrites json requests and sse responses structurally (not raw splicing)
- retries transient upstream failures with backoff
- rewrites tool names on the wire for subscription compatibility
- zero runtime dependencies

## what this is not

- not an official anthropic project
- not a hosted service
- not a credential bundle

bring your own local claude credentials. nothing private is included in this repo.

## setup

requires node.js 24+ and a local claude credential file (`~/.claude/.credentials.json`).

```bash
git clone git@github.com:vlelyavin/claude-proxy.git
cd claude-proxy
node src/cli.js
```

that's it. no npm install needed. listens on `127.0.0.1:18801` by default.

```bash
curl -sS http://127.0.0.1:18801/health
```

## config

copy the example if you want to change defaults:

```bash
cp config.example.json config.json
node src/cli.js --config ./config.json
```

covers listen host/port, upstream timeout/retries, credential paths, rewrite rules, body size limits.

## usage with hermes

```yaml
# ~/.hermes/config.yaml
model_aliases:
  opus:
    model: claude-opus-4-6
    provider: anthropic
    base_url: http://127.0.0.1:18801
```

## usage with openclaw

```bash
openclaw config set models.providers.anthropic.baseUrl '"http://127.0.0.1:18801"' --strict-json
```

## example request

```bash
curl -sS http://127.0.0.1:18801/v1/messages \
  -H 'content-type: application/json' \
  -H 'anthropic-version: 2023-06-01' \
  --data '{
    "model": "claude-opus-4-6",
    "max_tokens": 32,
    "messages": [
      {"role": "user", "content": "reply with exactly: pong"}
    ]
  }'
```

## systemd

```bash
sudo ./scripts/install-systemd.sh
```

one command - writes the unit, enables, starts. see `docs/systemd.md`.

## structure

```
src/
  config/         # defaults, validation, loader
  credentials/    # claude credential lookup
  rewrite/        # outbound/inbound json+sse transforms
  upstream/       # retry-aware upstream client
  server/         # http surface + /health
scripts/          # systemd installer
test/             # config, rewrite, credentials, transport tests
```

## security

- don't commit config.json or credential files
- keep bound to localhost
- rotate credentials if exposed

## license

MIT
