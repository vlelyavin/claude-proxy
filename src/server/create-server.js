import { createServer as createHttpServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { Readable, pipeline } from 'node:stream';
import { promisify } from 'node:util';

import { rewriteOutboundJson, rewriteInboundJson } from '../rewrite/json-transform.js';
import { createSseTransform } from '../rewrite/sse-transform.js';
import { applyRulesToString } from '../rewrite/rule-engine.js';
import { buildHealthPayload } from './health.js';
import { UpstreamClientError } from '../upstream/upstream-client.js';

const pipelineAsync = promisify(pipeline);

class RequestTooLargeError extends Error {
  constructor(limit) {
    super(`Request body exceeds configured limit of ${limit} bytes`);
    this.name = 'RequestTooLargeError';
  }
}

async function readRequestBody(request, limit) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > limit) {
      throw new RequestTooLargeError(limit);
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(response, statusCode, payload) {
  if (response.headersSent || response.writableEnded || response.destroyed) {
    response.destroy();
    return;
  }

  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

function copyHeaders(upstreamHeaders, response, { streaming = false } = {}) {
  for (const [key, value] of upstreamHeaders.entries()) {
    const normalized = key.toLowerCase();
    if (streaming && normalized === 'content-length') {
      continue;
    }
    if (normalized === 'transfer-encoding' || normalized === 'connection') {
      continue;
    }
    response.setHeader(key, value);
  }
}

function shouldReadBody(method) {
  return !['GET', 'HEAD'].includes(method);
}

function shouldRewriteJson(contentType, body = null) {
  if (String(contentType ?? '').includes('application/json')) {
    return true;
  }

  if (typeof body === 'string') {
    const trimmed = body.trimStart();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  return false;
}

function rewriteInboundText(rawBody, contentType, rewriteConfig, logger) {
  if (!rawBody) {
    return rawBody;
  }

  if (shouldRewriteJson(contentType)) {
    try {
      return rewriteInboundJson(rawBody, rewriteConfig);
    } catch (error) {
      logger?.warn?.('rewrite.inbound_json_failed', { error: error.message });
      return rawBody;
    }
  }

  return applyRulesToString(rawBody, rewriteConfig.inboundRules);
}

export function createServer({ config, credentialStore, upstreamClient, logger = null }) {
  const startedAt = Date.now();

  return createHttpServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health') {
        const health = await buildHealthPayload({ config, credentialStore, startedAt });
        sendJson(response, health.httpStatus, health.payload);
        return;
      }

      const requestBody = shouldReadBody(request.method)
        ? await readRequestBody(request, config.service.maxBodyBytes)
        : null;

      let outboundBody = requestBody;
      if (requestBody && shouldRewriteJson(request.headers['content-type'], requestBody)) {
        try {
          outboundBody = rewriteOutboundJson(requestBody, config.rewrite);
        } catch (error) {
          sendJson(response, 400, { error: { message: `Invalid JSON request body: ${error.message}` } });
          return;
        }
      }

      const upstreamResponse = await upstreamClient.request({
        method: request.method,
        urlPath: request.url,
        headers: request.headers,
        body: outboundBody,
      });

      const contentType = upstreamResponse.headers.get('content-type') ?? '';
      const isEventStream = contentType.includes('text/event-stream');

      if (request.method === 'HEAD') {
        response.statusCode = upstreamResponse.status;
        copyHeaders(upstreamResponse.headers, response, { streaming: false });
        response.end();
        return;
      }

      if (isEventStream) {
        response.statusCode = upstreamResponse.status;
        copyHeaders(upstreamResponse.headers, response, { streaming: true });
        const source = upstreamResponse.body ? Readable.fromWeb(upstreamResponse.body) : Readable.from([]);
        const transform = createSseTransform({ inboundRules: config.rewrite.inboundRules });
        await pipelineAsync(source, transform, response);
        return;
      }

      let rawBody;
      try {
        rawBody = await upstreamResponse.text();
      } catch (error) {
        throw new UpstreamClientError(`Upstream response body read failed: ${error.message}`, { cause: error });
      }
      const rewrittenBody = rewriteInboundText(rawBody, contentType, config.rewrite, logger);
      response.statusCode = upstreamResponse.status;
      copyHeaders(upstreamResponse.headers, response, { streaming: false });
      response.setHeader('content-length', Buffer.byteLength(rewrittenBody));
      response.end(rewrittenBody);
    } catch (error) {
      if (error instanceof RequestTooLargeError) {
        sendJson(response, 413, { error: { message: error.message } });
        return;
      }

      if (error instanceof UpstreamClientError) {
        logger?.error?.('upstream.failed', { error: error.message });
        sendJson(response, 502, { error: { message: error.message } });
        return;
      }

      logger?.error?.('server.unhandled', { error: error.message });
      sendJson(response, 500, { error: { message: 'Internal server error' } });
    }
  });
}
