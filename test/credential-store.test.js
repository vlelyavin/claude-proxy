import test from 'node:test';
import assert from 'node:assert/strict';

import { CredentialStore, CredentialStoreError } from '../src/credentials/credential-store.js';

test('CredentialStore resolves explicit path and returns session metadata', async () => {
  const store = new CredentialStore({
    path: '~/.claude/.credentials.json',
    homeDirectory: '/root',
    fileExists: async (targetPath) => targetPath === '/root/.claude/.credentials.json',
    readFile: async () => JSON.stringify({
      claudeAiOauth: {
        accessToken: 'token-123',
        expiresAt: Date.now() + 60_000,
        subscriptionType: 'max',
      },
    }),
  });

  const session = await store.getSession();
  assert.equal(session.credentialsPath, '/root/.claude/.credentials.json');
  assert.equal(session.accessToken, 'token-123');
  assert.equal(session.subscriptionType, 'max');
  assert.equal(session.isExpired, false);
});

test('CredentialStore falls back across searchPaths', async () => {
  const store = new CredentialStore({
    searchPaths: ['~/.claude/missing.json', '~/.claude/credentials.json'],
    homeDirectory: '/home/app',
    fileExists: async (targetPath) => targetPath === '/home/app/.claude/credentials.json',
    readFile: async (targetPath) => {
      assert.equal(targetPath, '/home/app/.claude/credentials.json');
      return JSON.stringify({
        claudeAiOauth: {
          accessToken: 'fallback-token',
          expiresAt: Date.now() - 1,
          subscriptionType: 'pro',
        },
      });
    },
  });

  const session = await store.getSession();
  assert.equal(session.accessToken, 'fallback-token');
  assert.equal(session.isExpired, true);
});

test('CredentialStore throws a descriptive error when credentials cannot be found', async () => {
  const store = new CredentialStore({
    searchPaths: ['~/.claude/a.json', '~/.claude/b.json'],
    homeDirectory: '/tmp/user',
    fileExists: async () => false,
    readFile: async () => {
      throw new Error('should not be called');
    },
  });

  await assert.rejects(() => store.getSession(), CredentialStoreError);
});
