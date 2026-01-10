import pino from 'pino';
import pinoPretty from 'pino-pretty';

// Create a pretty print stream for development
const prettyStream = pinoPretty({
	colorize: true,
	translateTime: 'SYS:standard',
	ignore: 'pid,hostname',
	messageFormat: '{msg}'
});

// Determine log level from safe client env
let logLevel = 'info';
try {
	logLevel = (import.meta?.env?.VITE_LOG_LEVEL || 'info');
} catch (_) {
	// Fallback for non-Vite/Node contexts
	logLevel = 'info';
}

// Create the logger instance
const logger = pino(
	{
		level: logLevel,
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
