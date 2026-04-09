import { loadConfig } from './config/load-config.js';
import { createLogger } from './utils/logger.js';
import { CredentialStore } from './credentials/credential-store.js';
import { UpstreamClient } from './upstream/upstream-client.js';
import { createServer } from './server/create-server.js';

const config = await loadConfig();
const logger = createLogger(config.service.logLevel);

const credentialStore = new CredentialStore({
  path: config.credentials.path,
  searchPaths: config.credentials.searchPaths,
});

const upstreamClient = new UpstreamClient({
  config,
  credentialStore,
  logger,
});

const server = createServer({
  config,
  credentialStore,
  upstreamClient,
  logger,
});

server.on('error', (error) => {
  logger.error('server.start_failed', {
    error: error.message,
    listenHost: config.listen.host,
    listenPort: config.listen.port,
  });
  process.exitCode = 1;
});

server.listen(config.listen.port, config.listen.host, () => {
  logger.info('server.started', {
    listenHost: config.listen.host,
    listenPort: config.listen.port,
    upstreamBaseUrl: config.upstream.baseUrl,
  });
});
