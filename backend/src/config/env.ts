import { z } from 'zod';

/**
 * Validated environment. Fail-fast: if anything is missing/malformed the process
 * refuses to boot. Exposed through a getter so the rest of the app never reads
 * `process.env` directly (single source of truth, easy to mock in tests).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .default('postgres://skylark:skylark@localhost:5432/skylark'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 chars').default('change-me-in-prod'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  WORKER_API_KEY: z.string().min(1).default('worker-shared-secret'),
  WORKER_CONTROL_URL: z.string().url().default('http://worker:8090'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

/** Parse + cache env on first access. Throws (with details) if invalid. */
export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}
