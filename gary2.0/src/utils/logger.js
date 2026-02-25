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

// Default export — the only logger instance used across the codebase
const defaultLogger = logger.child({ module: 'app' });
export default defaultLogger;
