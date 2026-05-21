type LogArgs = unknown[];

const enabled = import.meta.env.DEV;

export const logger = {
  error: (...args: LogArgs) => {
    if (enabled) console.error(...args);
  },
  warn: (...args: LogArgs) => {
    if (enabled) console.warn(...args);
  },
};
