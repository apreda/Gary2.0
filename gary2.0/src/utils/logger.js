import pino from 'pino';
import pinoPretty from 'pino-pretty';

// Create a pretty print stream for development
const prettyStream = pinoPretty({
  colorize: true,
  translateTime: 'SYS:standard',
  ignore: 'pid,hostname',
  messageFormat: '{msg}'
});

// Create the logger instance
const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
  },
  prettyStream
);

// Create a child logger with default context
const createLogger = (context = {}) => {
  return logger.child(context);
};

export { createLogger };

// Default export for backward compatibility
const defaultLogger = createLogger({ module: 'app' });
export default defaultLogger;
