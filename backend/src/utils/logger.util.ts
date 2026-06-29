/**
 * Tiny structured logger. Stateless, no deps. Level filtering via LOG_LEVEL.
 * Reads env lazily to avoid a circular import with config/env at module load.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level) || 'info';
  return ORDER[lvl] ?? ORDER.info;
}

function emit(level: Level, message: string, meta?: unknown): void {
  if (ORDER[level] < threshold()) return;
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };
  if (meta !== undefined) line.meta = meta;
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
  info: (msg: string, meta?: unknown) => emit('info', msg, meta),
  warn: (msg: string, meta?: unknown) => emit('warn', msg, meta),
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
};
