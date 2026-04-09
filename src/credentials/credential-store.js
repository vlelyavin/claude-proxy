import os from 'node:os';
import path from 'node:path';
import { readFile as fsReadFile } from 'node:fs/promises';

export class CredentialStoreError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'CredentialStoreError';
  }
}

function defaultFileExistsFactory(readFile) {
  return async (targetPath) => {
    try {
      await readFile(targetPath, 'utf8');
      return true;
    } catch {
      return false;
    }
  };
}

function expandHome(targetPath, homeDirectory) {
  if (!targetPath) {
    return targetPath;
  }

  if (targetPath === '~') {
    return homeDirectory;
  }

  if (targetPath.startsWith('~/')) {
    return path.join(homeDirectory, targetPath.slice(2));
  }

  return targetPath;
}

export class CredentialStore {
  constructor({
    path: credentialsPath = null,
    searchPaths = [],
    homeDirectory = os.homedir(),
    readFile = fsReadFile,
    fileExists,
  } = {}) {
    this.credentialsPath = credentialsPath;
    this.searchPaths = searchPaths;
    this.homeDirectory = homeDirectory;
    this.readFile = readFile;
    this.fileExists = fileExists ?? defaultFileExistsFactory(readFile);
  }

  async locateCredentialsFile() {
    const candidates = [this.credentialsPath, ...this.searchPaths]
      .filter(Boolean)
      .map((candidate) => expandHome(candidate, this.homeDirectory));

    for (const candidate of candidates) {
      if (await this.fileExists(candidate)) {
        return candidate;
      }
    }

    throw new CredentialStoreError(`Claude credentials file not found. Checked: ${candidates.join(', ') || '(none configured)'}`);
  }

  async getSession() {
    const credentialsPath = await this.locateCredentialsFile();

    let payload;
    try {
      payload = JSON.parse(await this.readFile(credentialsPath, 'utf8'));
    } catch (error) {
      throw new CredentialStoreError(`Unable to read Claude credentials from ${credentialsPath}`, { cause: error });
    }

    const oauth = payload?.claudeAiOauth;
    if (!oauth?.accessToken) {
      throw new CredentialStoreError(`Claude credentials at ${credentialsPath} do not contain claudeAiOauth.accessToken`);
    }

    const expiresAt = Number.isFinite(oauth.expiresAt) ? oauth.expiresAt : null;
    const expiresInMs = expiresAt === null ? null : expiresAt - Date.now();

    return {
      credentialsPath,
      accessToken: oauth.accessToken,
      expiresAt,
      expiresInMs,
      isExpired: expiresInMs !== null ? expiresInMs <= 0 : false,
      subscriptionType: oauth.subscriptionType ?? 'unknown',
    };
  }
}
