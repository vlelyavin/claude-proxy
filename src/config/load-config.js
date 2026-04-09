import { readFile as fsReadFile } from 'node:fs/promises';
import path from 'node:path';

import { validateConfig } from './validate-config.js';

async function fileExistsDefault(targetPath) {
  try {
    await fsReadFile(targetPath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function resolveConfigPath(argv, cwd) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--config' && argv[index + 1]) {
      return path.resolve(cwd, argv[index + 1]);
    }
  }

  return path.join(cwd, 'config.json');
}

export async function loadConfig({
  argv = process.argv,
  cwd = process.cwd(),
  readFile = fsReadFile,
  fileExists = fileExistsDefault,
} = {}) {
  const configPath = resolveConfigPath(argv, cwd);
  const exists = await fileExists(configPath);
  const rawConfig = exists ? JSON.parse(await readFile(configPath, 'utf8')) : {};
  return validateConfig(rawConfig);
}
