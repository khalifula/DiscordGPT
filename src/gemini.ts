import { GoogleGenAI, type Content } from '@google/genai';

import { env } from './env';
import { SYSTEM_INSTRUCTION_DISCORD } from './systemPrompt';
import type { ChatTurn } from './memory';

function shouldUseSearchForPrompt(userText: string): boolean {
  // Heuristique simple: sujets qui changent souvent / nécessitent du contenu à jour.
  const text = userText.toLowerCase();
  const keywords = [
    // Général "guides/meta".
    'build',
    'stuff',
    'gear',
    'item',
    'patch',
    'patch note',
    'hotfix',
    'update',
    'season',
    'saison',
    'meta',
    'tier list',
    // Quêtes / progression.
    'quest',
    'quête',
    'walkthrough',
    'guide',
    'raid',
    'donjon',
    'dungeon',
    'mmo',
    'mmorpg',
    'pvp',
    'pve',
    // Drops / loot.
    'drop rate',
    'taux de drop',
    'loot',
    'boss',
    'strategy',
    'stratégie',
    // Jeux fréquents (exemples).
    'fortnite',
    'warzone',
    'valorant',
    'league of legends',
    'dofus',
    'wakfu',
    'diablo',
    'path of exile',
    'poe',
    'wow',
    'world of warcraft',
    'genshin',
    'honkai',
    'elden ring',
    'minecraft',
    'destiny 2',
    'cs2',
    'counter strike',
  ];

  if (keywords.some((k) => text.includes(k))) return true;

  // Garde-fou: si ça parle explicitement de "build"/"quête"/"patch" au pluriel/variantes.
  return /\b(builds?|qu[eê]tes?|quests?|patch(?:es)?|hotfix(?:es)?|mmorpg|mmo)\b/i.test(userText);
}

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

    const isGameQuery = shouldUseSearchForPrompt(opts.userText);
    const enableSearchThisRequest = env.GEMINI_ENABLE_SEARCH && (isGameQuery || wantsSources);

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_DISCORD,
        tools: enableSearchThisRequest ? [{ googleSearch: {} }] : undefined,
      },
    });

    const answer = (response.text ?? '').trim();
    if (!answer) return '';

    // Affiche les sources seulement si demandé, ou si on est sur une question "jeu" (où l'info évolue).
    if (!enableSearchThisRequest || (!wantsSources && !isGameQuery)) return answer;

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
