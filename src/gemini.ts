import { GoogleGenAI, type Content } from '@google/genai';

import { env } from './env';
import { SYSTEM_INSTRUCTION_FR_CONGO } from './systemPrompt';
import type { ChatTurn } from './memory';

export class GeminiClient {
  private readonly ai: GoogleGenAI;
  private readonly modelName: string;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    this.modelName = env.GEMINI_MODEL;
  }

  async reply(opts: { history: ChatTurn[]; userText: string }): Promise<string> {
    const contents: Content[] = [];
    for (const turn of opts.history) {
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
    contents.push({ role: 'user', parts: [{ text: opts.userText }] });

    const wantsSources = /\b(source|sources|lien|liens|référence|références|reference|references|citation|citations)\b/i.test(
      opts.userText,
    );

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_FR_CONGO,
        tools: env.GEMINI_ENABLE_SEARCH ? [{ googleSearch: {} }] : undefined,
      },
    });

    const answer = (response.text ?? '').trim();
    if (!answer) return '';

    if (!env.GEMINI_ENABLE_SEARCH || !wantsSources) return answer;

    const grounding = (response.candidates?.[0] as any)?.groundingMetadata;
    const chunks = (grounding?.groundingChunks ?? []) as any[];
    const urls = chunks
      .map((c) => c?.web?.uri || c?.web?.url)
      .filter((u) => typeof u === 'string' && u.length > 0);

    if (urls.length === 0) return answer;

    const unique = Array.from(new Set(urls)).slice(0, 5);
    return `${answer}\n\nSources:\n- ${unique.join('\n- ')}`;
  }
}
