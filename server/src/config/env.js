import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(5000), NODE_ENV: z.string().default('development'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'), MONGODB_URI: z.string().default('mongodb://localhost:27017/ai-court'),
  JWT_SECRET: z.string().default('local-development-secret-change-before-deploy'), COOKIE_SECURE: z.enum(['true','false']).default('false'),
  MOCK_GEMINI: z.enum(['true','false']).default('true'), GEMINI_API_KEY: z.string().optional(),
  GEMINI_TEXT_MODEL: z.string().default('gemini-2.5-flash'), GEMINI_IMAGE_MODEL: z.string().default('gemini-2.5-flash-image'),
  CASES_PER_HOUR: z.coerce.number().default(5), GEMINI_TIMEOUT_MS: z.coerce.number().default(60000)
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET === 'local-development-secret-change-before-deploy') throw new Error('Set JWT_SECRET to a unique secret in production.');
if (parsed.data.MOCK_GEMINI !== 'true' && !parsed.data.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required when MOCK_GEMINI is disabled.');
export const env = parsed.data;
