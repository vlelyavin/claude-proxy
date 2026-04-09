# Claude Proxy

Claude Proxy is a small local relay that lets Claude-compatible tooling use your Claude subscription through local auth.

I built it for OpenClaw and similar local workflows where I wanted a real service instead of a brittle one-file proxy script.

What it does:
- loads local Claude OAuth credentials from disk on each request
- forwards Anthropic-compatible traffic upstream with controlled headers
- rewrites JSON requests and responses structurally instead of raw body splicing
- rewrites streaming SSE output line-by-line without breaking framing
- retries transient upstream failures with backoff
- exposes `/health` for runtime and credential visibility
- runs with zero runtime dependencies

## What this repo is

A local HTTP relay for people who want to plug local Claude auth into their own tooling and keep the integration inspectable.

## What this repo is not

- not an official Anthropic project
- not a hosted service
- not a credential bundle
- not a replacement for secure local credential handling

Bring your own local Claude credentials. No tokens, keys, or private config are included in this repository.

## Requirements

- Node.js 24+
- a local Claude credential file, usually one of:
  - `~/.claude/.credentials.json`
  - `~/.claude/credentials.json`

## Fast start

There are no runtime dependencies, so there is no `npm install` step.

```bash
git clone git@github.com:vlelyavin/claude-proxy.git
cd claude-proxy
node src/cli.js
```

Default behavior:
- listens on `127.0.0.1:18801`
- auto-loads local Claude credentials from the default search paths
- uses built-in retry, timeout, and health defaults

Check that it started:

```bash
curl -sS http://127.0.0.1:18801/health
```

## Optional config

If you want to change the port, rewrite rules, or credential path, copy the example config and edit it:

```bash
cp config.example.json config.json
node src/cli.js --config ./config.json
```

Main config sections:
- `listen` - host and port
- `upstream` - base URL, timeout, retries, required betas
- `credentials` - explicit credential path and fallback search paths
- `rewrite` - system preamble plus outbound and inbound replacement rules
- `service` - body size limit and log level

If `config.json` is missing, the service falls back to built-in defaults.

## Example request

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

## Run tests

```bash
npm test
```

## One-command systemd install

If you want a boot-persistent localhost service on Linux:

```bash
sudo ./scripts/install-systemd.sh
```

That writes the unit, reloads systemd, enables the service, and starts it.

More detail: `docs/systemd.md`

## Repository layout

- `src/config/*` - defaults, validation, config loader
- `src/credentials/*` - Claude credential lookup and session metadata
- `src/rewrite/*` - outbound and inbound JSON/SSE transforms
- `src/upstream/*` - timeout and retry-aware upstream client
- `src/server/*` - HTTP surface and `/health`
- `scripts/install-systemd.sh` - one-command systemd installer
- `test/*` - config, rewrite, credentials, transport, and server tests
- `docs/architecture.md` - component overview
- `docs/systemd.md` - service deployment notes

## Notes on behavior

- outbound JSON bodies are rewritten structurally
- inbound JSON responses are reverse-mapped structurally
- SSE responses are rewritten line-by-line while preserving event framing
- credentials are reloaded on demand, so local auth refreshes do not require a service restart
- request body size is capped by `service.maxBodyBytes`
- retry behavior is controlled by `upstream.maxAttempts`, `retryBaseDelayMs`, `retryMaxDelayMs`, and `retryOnStatuses`

## Security notes

- do not commit `config.json`
- do not commit credential files
- keep the service bound to localhost unless you intentionally want remote access
- rotate credentials immediately if you think they were exposed
- review rewrite rules and logs before publishing modified versions

See `SECURITY.md` for disclosure guidance.

## Running under systemd

See `docs/systemd.md` for the example unit, logs, and verification commands.

## License

MIT
