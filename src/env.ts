import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-1.5-flash'),
  MAX_TURNS: z.preprocess(
    (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim().length > 0) return Number(v);
      return 20;
    },
    z.number().int().min(1).max(100),
  ),
});

export const env = envSchema.parse(process.env);
