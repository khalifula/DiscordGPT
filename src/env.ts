import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-1.5-flash'),
  GEMINI_ENABLE_SEARCH: z.preprocess(
    (v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
        if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
      }
      return false;
    },
    z.boolean(),
  ),
  MAX_TURNS: z.preprocess(
    (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim().length > 0) return Number(v);
      return 20;
    },
    z.number().int().min(1).max(100),
  ),
  MAX_CONTEXT_MESSAGES: z.preprocess(
    (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim().length > 0) return Number(v);
      return undefined;
    },
    z.number().int().min(1).max(200).optional(),
  ),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  // Backward-compatible: if MAX_CONTEXT_MESSAGES is not set, fall back to MAX_TURNS*2 (old behavior).
  MAX_CONTEXT_MESSAGES: parsed.MAX_CONTEXT_MESSAGES ?? parsed.MAX_TURNS * 2,
};
