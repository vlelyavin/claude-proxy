const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

function shouldLog(configuredLevel, messageLevel) {
  return LOG_LEVELS.indexOf(messageLevel) >= LOG_LEVELS.indexOf(configuredLevel);
}

export function createLogger(level = 'info') {
  return {
    debug(event, details = {}) {
      if (shouldLog(level, 'debug')) {
        console.log(JSON.stringify({ level: 'debug', event, ...details }));
      }
    },
    info(event, details = {}) {
      if (shouldLog(level, 'info')) {
        console.log(JSON.stringify({ level: 'info', event, ...details }));
      }
    },
    warn(event, details = {}) {
      if (shouldLog(level, 'warn')) {
        console.warn(JSON.stringify({ level: 'warn', event, ...details }));
      }
    },
    error(event, details = {}) {
      if (shouldLog(level, 'error')) {
        console.error(JSON.stringify({ level: 'error', event, ...details }));
      }
    },
  };
}
