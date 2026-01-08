import { z } from 'zod';

export type AutoActionMessage = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
};

export type AutoAction =
  | { type: 'add_reaction'; messageId: string; emoji: string }
  | { type: 'send_message'; content: string }
  | { type: 'timeout_user'; userId: string; minutes: number; reason: string }
  | { type: 'untimeout_user'; userId: string; reason?: string };

export type AutoActionPlan = {
  summary: string;
  actions: AutoAction[];
};

const AddReactionSchema = z.object({
  type: z.literal('add_reaction'),
  messageId: z.string().min(1),
  emoji: z.string().min(1).max(32),
});

const SendMessageSchema = z.object({
  type: z.literal('send_message'),
  content: z.string().min(1).max(800),
});

const TimeoutUserSchema = z.object({
  type: z.literal('timeout_user'),
  userId: z.string().min(1),
  minutes: z.number().min(1).max(60),
  reason: z.string().min(1).max(200),
});

const UnTimeoutUserSchema = z.object({
  type: z.literal('untimeout_user'),
  userId: z.string().min(1),
  reason: z.string().min(1).max(200).optional(),
});

const AutoActionSchema = z.union([
  AddReactionSchema,
  SendMessageSchema,
  TimeoutUserSchema,
  UnTimeoutUserSchema,
]);

const AutoActionPlanSchema = z.object({
  summary: z.string().max(1200).optional(),
  actions: z.array(AutoActionSchema).optional(),
});

function extractJsonObject(text: string): string | null {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last < 0 || last <= first) return null;
  return text.slice(first, last + 1);
}

const EmojiChoiceSchema = z.object({
  emoji: z.string().min(1).max(32),
});

const AutoMessageDecisionSchema = z.object({
  send: z.boolean(),
  content: z.string().min(1).max(800).optional(),
});


export function parseAutoActionPlan(
  raw: string,
  fallbackSummary: string,
  maxActions: number,
): AutoActionPlan {
  const json = extractJsonObject(raw);
  if (!json) return { summary: fallbackSummary, actions: [] };

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return { summary: fallbackSummary, actions: [] };
  }

  const parsed = AutoActionPlanSchema.safeParse(payload);
  if (!parsed.success) return { summary: fallbackSummary, actions: [] };

  const summary = parsed.data.summary?.trim() || fallbackSummary;
  const actions = (parsed.data.actions ?? []).slice(0, Math.max(0, maxActions));

  return { summary, actions };
}

export function parseEmojiChoice(raw: string): string | null {
  const json = extractJsonObject(raw);
  if (!json) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }

  const parsed = EmojiChoiceSchema.safeParse(payload);
  if (!parsed.success) return null;

  return parsed.data.emoji.trim() || null;
}

export function parseAutoMessageDecision(raw: string): string | null {
  const json = extractJsonObject(raw);
  if (!json) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }

  const parsed = AutoMessageDecisionSchema.safeParse(payload);
  if (!parsed.success) return null;

  if (!parsed.data.send) return null;
  return parsed.data.content?.trim() || null;
}
