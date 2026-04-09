# Architecture

Claude Proxy is split into six layers:

1. config loading and validation
2. credential resolution
3. rewrite engine
4. upstream transport
5. HTTP service surface
6. operational documentation and deployment

The design goal is to keep parsing, mutation, transport, and service logic isolated so each layer can be tested without a live upstream dependency.

## Request flow

1. the CLI loads config and validates it
2. the HTTP server accepts a request on the local listen address
3. request size and basic request metadata are validated
4. credentials are loaded from the configured local Claude credential file
5. outbound JSON content is rewritten structurally according to configured rules
6. the upstream client forwards the request with sanitized headers, timeout handling, and retry policy
7. upstream JSON or SSE output is reverse-mapped back through configured inbound rules
8. the response is returned to the caller

## Main components

### `src/config/*`
Handles defaults, config loading, and validation. Invalid config should fail fast before the server starts.

### `src/credentials/*`
Resolves the credential file location and reads session metadata on demand. This avoids requiring a service restart after local auth refresh.

### `src/rewrite/*`
Applies configured term replacements to structured JSON bodies and streaming SSE data while preserving payload shape and event framing.

### `src/upstream/*`
Wraps upstream fetch calls with timeout, retry classification, and retry-after handling.

### `src/server/*`
Exposes the local HTTP surface, `/health`, body-size limits, and upstream proxying.

## Why this structure

Compared to a single-file proxy script, this layout makes it easier to:
- test each behavior in isolation
- evolve rewrite logic safely
- reason about request/response handling
- document deployment and operations cleanly
- replace one layer without rewriting the whole service
