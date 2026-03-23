/**
 * Industry-grade structured logger.
 */

const formatLog = (level, message, context) => {
  const timestamp = new Date().toISOString();
  const contextStr = context ? JSON.stringify(context) : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message} ${contextStr}`;
};

export const logger = {
  info: (message, context) => {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`%c INFO`, 'background: #22c55e; color: #fff; padding: 2px 4px; rounded: 2px', message, context || '');
    } else {
      console.info(formatLog('info', message, context));
    }
  },

  warn: (message, context) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`%c WARN`, 'background: #f59e0b; color: #fff; padding: 2px 4px; rounded: 2px', message, context || '');
    } else {
      console.warn(formatLog('warn', message, context));
    }
  },

  error: (message, error, context) => {
    console.error(formatLog('error', message, { ...context, error: error?.message || error }));
    if (error?.stack) console.error(error.stack);
  },

  debug: (message, context) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`%c DEBUG`, 'background: #3b82f6; color: #fff; padding: 2px 4px; rounded: 2px', message, context || '');
    }
  }
};
