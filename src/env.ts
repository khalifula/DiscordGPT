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
  USER_COOLDOWN_SECONDS: z.preprocess(
    (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim().length > 0) return Number(v);
      return 4;
    },
    z.number().min(0).max(120),
  ),
  DEFAULT_RESPONSE_STYLE: z.preprocess(
    (v) => {
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
      return undefined;
    },
    z.string().optional(),
  ),
  AUTO_ACTION_EVERY_N_MESSAGES: z.preprocess(
    (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim().length > 0) return Number(v);
      return 10;
    },
    z.number().int().min(0).max(200),
  ),
  AUTO_ACTION_MAX_ACTIONS: z.preprocess(
    (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim().length > 0) return Number(v);
      return 2;
    },
    z.number().int().min(0).max(5),
  ),
  AUTO_ACTION_MAX_TIMEOUT_MINUTES: z.preprocess(
    (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim().length > 0) return Number(v);
      return 10;
    },
    z.number().int().min(1).max(120),
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
