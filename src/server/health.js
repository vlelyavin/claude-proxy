export async function buildHealthPayload({ config, credentialStore, startedAt }) {
  try {
    const session = await credentialStore.getSession();
    return {
      httpStatus: 200,
      payload: {
        status: session.isExpired ? 'token_expired' : 'ok',
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        listen: config.listen,
        upstream: {
          baseUrl: config.upstream.baseUrl,
          timeoutMs: config.upstream.timeoutMs,
          maxAttempts: config.upstream.maxAttempts,
        },
        credentials: {
          path: session.credentialsPath,
          subscriptionType: session.subscriptionType,
          expiresAt: session.expiresAt,
          expiresInMs: session.expiresInMs,
          isExpired: session.isExpired,
        },
      },
    };
  } catch (error) {
    return {
      httpStatus: 503,
      payload: {
        status: 'error',
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        error: {
          message: error.message,
        },
      },
    };
  }
}
