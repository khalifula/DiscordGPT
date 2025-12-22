import { GoogleGenerativeAI, type Content } from '@google/generative-ai';

import { env } from './env';
import { SYSTEM_INSTRUCTION_FR_CONGO } from './systemPrompt';
import type { ChatTurn } from './memory';

export class GeminiClient {
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    this.modelName = env.GEMINI_MODEL;
  }

  async reply(opts: { history: ChatTurn[]; userText: string }): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: SYSTEM_INSTRUCTION_FR_CONGO,
    });

    const contents: Content[] = [];
    for (const turn of opts.history) {
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
    contents.push({ role: 'user', parts: [{ text: opts.userText }] });

    const result = await model.generateContent({ contents });
    const text = result.response.text();

    return text.trim();
  }
}
