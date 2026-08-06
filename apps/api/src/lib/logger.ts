type LogContext = Readonly<Record<string, unknown>>;

const serialize = (level: string, message: string, context?: LogContext): string =>
  JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...context });

/** The only application boundary allowed to write directly to stdout/stderr. */
export const logger = {
  info(message: string, context?: LogContext): void {
    console.log(serialize("info", message, context));
  },
  warn(message: string, context?: LogContext): void {
    console.warn(serialize("warn", message, context));
  },
  error(message: string, context?: LogContext): void {
    console.error(serialize("error", message, context));
  },
};
