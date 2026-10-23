# Architecture

Claude Proxy is organized into six layers:

1. Configuration loading and validation
2. Credential resolution
3. Rewrite engine
4. Upstream transport
5. HTTP service layer
6. Operational documentation and deployment

The architecture isolates parsing, mutation, transport, and service logic so each layer can be tested independently without relying on a live upstream service.

## Request flow

1. The CLI loads and validates the configuration.
2. The HTTP server accepts a request on the configured local address.
3. Request size and basic request metadata are validated.
4. Credentials are read from the configured local Claude credential file.
5. Outbound JSON content is structurally rewritten according to configured rules.
6. The upstream client forwards the request with sanitized headers, configured timeouts, and retry policies.
7. Upstream JSON or SSE output is reverse-mapped through configured inbound rules.
8. The processed response is returned to the caller.

## Main components

### `src/config/*`
Handles defaults, configuration loading, and validation. Invalid configuration fails fast before the server starts.

### `src/credentials/*`
Resolves the credential file location and reads session metadata on demand. This eliminates the need to restart the service after refreshing local credentials.

### `src/rewrite/*`
Applies configured term replacements to structured JSON bodies and streaming SSE data while preserving payload structure and event framing.

### `src/upstream/*`
Wraps upstream fetch calls with timeouts, retry classification, and `Retry-After` handling.

### `src/server/*`
Exposes the local HTTP surface, provides the `/health` endpoint, enforces body-size limits, and coordinates upstream proxying.

## Why this structure

Compared to a single-file proxy script, this modular layout makes it easier to:
- test each layer in isolation;
- evolve rewrite rules safely;
- reason about the request and response lifecycle;
- keep operational and deployment documentation clear;
- swap or modify a single layer without rewriting the entire service.
