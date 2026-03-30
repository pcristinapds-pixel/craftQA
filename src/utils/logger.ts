export const logger = {
  info: (...args: unknown[]) => console.error('[sentinel-qa]', ...args),
  warn: (...args: unknown[]) => console.error('[sentinel-qa:warn]', ...args),
  error: (...args: unknown[]) => console.error('[sentinel-qa:error]', ...args),
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG) {
      console.error('[sentinel-qa:debug]', ...args);
    }
  },
};
