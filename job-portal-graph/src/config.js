import 'dotenv/config';
import { z } from 'zod';

// Blank/missing values get the same readable message instead of zod's type error.
const required = (min = 1) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string({ error: 'required' }).min(min, `must be at least ${min} characters`),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce
    .number({ error: 'must be a number' })
    .int({ error: 'must be an integer' })
    .min(1, 'must be between 1 and 65535')
    .max(65535, 'must be between 1 and 65535')
    .default(3000),
  NEO4J_URI: required(),
  NEO4J_USER: required(),
  NEO4J_PASSWORD: required(),
  NEO4J_DATABASE: z.string().default('neo4j'),
  NEO4J_TEST_URI: z.string().default(''),
  NEO4J_TEST_PASSWORD: z.string().default(''),
  JWT_SECRET: required(32),
  COOKIE_SECURE: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .default(false),
  QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  SCREEN_THRESHOLD: z.coerce.number().min(0).max(100).default(40),
  BAND_STRONG: z.coerce.number().min(0).max(100).default(75),
  BAND_MODERATE: z.coerce.number().min(0).max(100).default(40),
  BLIND_UNMASK_THRESHOLD: z.coerce.number().min(0).max(100).default(75),
  ENFORCE_MANDATORY: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .default(true),
  ENABLE_ESCO: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .default(true),
  ENABLE_ARBEITNOW: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .default(false),
  ADZUNA_APP_ID: z.string().default(''),
  ADZUNA_APP_KEY: z.string().default(''),
  EMBEDDINGS_PROVIDER: z.string().default(''),
  EMBEDDINGS_API_KEY: z.string().default(''),
  RELATIONAL_URL: z.string().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  console.error(`Invalid configuration:\n  ${lines.join('\n  ')}`);
  process.exit(1);
}

export const config = parsed.data;
