# claude-proxy

[README на русском](README.ru.md)

you have a claude subscription. your tools want an api key. this sits in the middle: a local relay that pushes anthropic api calls through your subscription oauth, so hermes / openclaw / curl ride on the sub instead of a per-token bill.

## what it does

- reads your local claude oauth from disk on every request — token rotation needs no restart
- forwards to api.anthropic.com with the headers the subscription expects
- rewrites json and sse structurally, not by splicing strings
- retries 429/5xx with backoff
- renames tools the subscription path doesn't know (mcp, memory tools)
- zero npm dependencies. node stdlib, nothing else.

## what it is not

- not an anthropic product, not affiliated with them
- not a hosted service — runs on your machine, your creds
- not a cred bundle — nothing private ships in this repo

## straight talk

it uses subscription oauth outside the official client. that's a gray zone in anthropic's tos. hammer it and you can lose the subscription. your call.

## requirements

- node 24+
- `~/.claude/.credentials.json` — appears after you log in via Claude Code. no file, no proxy.

## run

```bash
git clone https://github.com/vlelyavin/claude-proxy.git
cd claude-proxy
node src/cli.js
```

no `npm install`. listens on `127.0.0.1:18801`.

```bash
curl -sS http://127.0.0.1:18801/health
```

health shows subscription type and token expiry. if it says `token_expired` — the proxy is fine, the sub isn't.

use full model ids (`claude-opus-4-6`). `opus` alone 404s.

## config

optional. defaults cover the common case.

```bash
cp config.example.json config.json
node src/cli.js --config ./config.json
```

host/port, upstream timeouts and retries, credential paths, rewrite rules, body size limit.

## hermes

the trap: hermes can't auto-detect the wire format on a loopback url. without `api_mode: anthropic_messages` every call goes out as chat_completions and 404s.

```yaml
# ~/.hermes/config.yaml
custom_providers:
  - name: anthropic_proxy
    api_key: none
    api_mode: anthropic_messages
    base_url: http://127.0.0.1:18801
    discover_models: false
    model: claude-opus-4-6

model_aliases:
  opus:
    model: claude-opus-4-6
    provider: custom:anthropic_proxy
    api_mode: anthropic_messages
```

## openclaw

```bash
openclaw config set models.providers.anthropic.baseUrl '"http://127.0.0.1:18801"' --strict-json
```

## test it

```bash
curl -sS http://127.0.0.1:18801/v1/messages \
  -H 'content-type: application/json' \
  -H 'anthropic-version: 2023-06-01' \
  --data '{"model":"claude-opus-4-6","max_tokens":32,"messages":[{"role":"user","content":"reply with exactly: pong"}]}'
```

a `pong` means the whole path works.

## systemd

```bash
sudo ./scripts/install-systemd.sh
```

one command — writes the unit, enables, starts. manual path in `docs/systemd.md`.

## structure

```
src/
  config/         defaults, validation, loader
  credentials/    claude cred lookup
  rewrite/        json + sse transforms, both directions
  upstream/       retry-aware upstream client
  server/         http surface + /health
scripts/          systemd installer
test/             36 tests, no network needed
```

## security

- localhost only, unless you know exactly why not
- never commit `config.json` or credential files
- leaked creds = rotate immediately

## license

MIT
