# claude-proxy

[README на русском](README.ru.md)

You have a Claude subscription. Your tools want an API key. This sits in between: a local relay that routes Anthropic API calls through your subscription OAuth, allowing Hermes, OpenClaw, or `curl` to run on your subscription instead of racking up per-token API bills.

## What it does

- Reads your local Claude OAuth credentials from disk on every request-no restart required after token rotation.
- Forwards requests to `api.anthropic.com` with the headers expected by the subscription endpoint.
- Rewrites JSON and SSE streams structurally, rather than through naive string manipulation.
- Retries `429` and `5xx` responses with exponential backoff.
- Maps tool names unsupported by the subscription path (such as MCP and memory tools).
- Zero npm dependencies. Built entirely on the Node.js standard library.

## What it is not

- Not an official Anthropic product, nor affiliated with them in any way.
- Not a hosted service-runs locally on your machine with your own credentials.
- Not a credential bundle-contains no private data or secrets.

## Heads up

This proxy uses subscription OAuth outside the official client, which sits in a gray area of Anthropic's Terms of Service. Abuse it and you risk losing your subscription. Use at your own discretion.

## Requirements

- Node.js 24+
- `~/.claude/.credentials.json` (generated automatically after logging in via Claude Code; required for the proxy to work)

## Usage

```bash
git clone https://github.com/vlelyavin/claude-proxy.git
cd claude-proxy
node src/cli.js
```

No `npm install` needed. The proxy listens on `127.0.0.1:18801`.

```bash
curl -sS http://127.0.0.1:18801/health
```

The health check returns your subscription type and token expiration status. If it reports `token_expired`, the proxy is running fine, but your Claude session needs a refresh.

Always use full model IDs (e.g., `claude-opus-5-5`); shorthand aliases like `opus` will return a `404`.

Anthropic restricts access to newer models based on the Claude Code version advertised in the billing header. If you encounter a `claude_code_version_too_old` error, update `cc_version` in the system preamble (in defaults or `config.json`) to the minimum version specified in the error message, then restart the proxy. Note that model IDs use hyphens (`claude-opus-5-5`), not dots.

## Configuration

Optional. The defaults cover most common setups.

```bash
cp config.example.json config.json
node src/cli.js --config ./config.json
```

Configurable options include host and port, upstream timeouts and retries, credential paths, rewrite rules, and request body size limits.

## Hermes

Gotcha: Hermes cannot auto-detect the wire format when targeting a loopback URL. Without `api_mode: anthropic_messages`, all requests default to `chat_completions` and will return a `404`.

```yaml
# ~/.hermes/config.yaml
custom_providers:
  - name: anthropic_proxy
    api_key: none
    api_mode: anthropic_messages
    base_url: http://127.0.0.1:18801
    discover_models: false
    model: claude-opus-5-5

model_aliases:
  opus:
    model: claude-opus-5-5
    provider: custom:anthropic_proxy
    api_mode: anthropic_messages
```

## OpenClaw

```bash
openclaw config set models.providers.anthropic.baseUrl '"http://127.0.0.1:18801"' --strict-json
```

## Quick test

```bash
curl -sS http://127.0.0.1:18801/v1/messages \
  -H 'content-type: application/json' \
  -H 'anthropic-version: 2023-06-01' \
  --data '{"model":"claude-opus-5-5","max_tokens":32,"messages":[{"role":"user","content":"reply with exactly: pong"}]}'
```

If you get back `pong`, the entire pipeline is working properly.

## systemd

```bash
sudo ./scripts/install-systemd.sh
```

A single script generates the unit file, enables it, and starts the service. For manual setup instructions, see `docs/systemd.md`.

## Project structure

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

## Security

- Keep bound to localhost unless you have a specific, secure reason not to.
- Never commit `config.json` or any credential files.
- If your credentials are ever leaked, revoke and rotate them immediately.

## License

MIT
