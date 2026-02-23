import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';
import { type LoggingConfig } from '../config/schema.js';

export type Logger = PinoLogger;

let rootLogger: Logger | null = null;

export function createLogger(config: LoggingConfig, name?: string): Logger {
  const options: LoggerOptions = {
    level: config.level,
    name: name || 'megasloth',
  };

  if (config.pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  return pino(options);
}

export function initLogger(config: LoggingConfig): Logger {
  rootLogger = createLogger(config);
  return rootLogger;
}

export function getLogger(name?: string): Logger {
  if (!rootLogger) {
    // Create a default logger if not initialized
    rootLogger = pino({
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  if (name) {
    return rootLogger.child({ name });
  }

  return rootLogger;
}

export function createChildLogger(parent: Logger, bindings: Record<string, unknown>): Logger {
  return parent.child(bindings);
}
