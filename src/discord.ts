import {
  Client,
  GatewayIntentBits,
  Message,
  Partials,
} from 'discord.js';

import { env } from './env';
import { GeminiClient } from './gemini';
import { ThreadMemory } from './memory';

function stripBotMention(message: Message<true>, text: string): string {
  const me = message.client.user;
  if (!me) return text;

  // Remove <@id> and <@!id>
  const mentionRegex = new RegExp(`<@!?${me.id}>`, 'g');
  return text.replace(mentionRegex, '').trim();
}

async function safeTyping(message: Message<true>): Promise<void> {
  try {
    await message.channel.sendTyping();
  } catch {
    // ignore
  }
}

export function createDiscordClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
  });
}

export async function startBot(): Promise<void> {
  const client = createDiscordClient();
  const gemini = new GeminiClient();
  const memory = new ThreadMemory({ maxTurns: env.MAX_TURNS });

  client.on('ready', () => {
    // eslint-disable-next-line no-console
    console.log(`Logged in as ${client.user?.tag}`);
  });

  client.on('messageCreate', async (message) => {
    if (!message.inGuild()) return;
    if (message.author.bot) return;
    if (!client.user) return;

    const channel = message.channel;
    const isThread = channel.isThread();

    const mentioned = message.mentions.has(client.user);
    const isActiveThread = isThread ? memory.isActive(channel.id) : false;

    // Salon normal: répond uniquement si mentionné, sans garder de mémoire.
    if (!isThread) {
      if (!mentioned) return;

      const userText = stripBotMention(message, message.content ?? '').trim();
      if (!userText) return;

      await safeTyping(message as Message<true>);

      let answer: string;
      try {
        answer = await gemini.reply({ history: [], userText });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        answer = 'Eh, y a eu un souci côté IA. Réessaie encore un peu.';
      }

      const hint =
        "\n\nSi tu veux continuer avec contexte, crée un thread ici puis mentionne-moi une fois dedans, après on avance tranquille.";

      try {
        await message.reply(`${answer}${hint}`);
      } catch {
        // ignore
      }
      return;
    }

    // Thread: si mentionné on active la mémoire; si déjà actif, on répond même sans mention.
    if (!mentioned && !isActiveThread) return;

    const threadId = channel.id;
    if (mentioned) memory.activate(threadId);

    const userTextRaw = message.content ?? '';
    const userText = (mentioned ? stripBotMention(message, userTextRaw) : userTextRaw).trim();
    if (!userText) return;

    const history = memory.getHistory(threadId);
    memory.push(threadId, { role: 'user', text: userText });

    await safeTyping(message as Message<true>);

    let answer: string;
    try {
      answer = await gemini.reply({ history, userText });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      answer = 'Eh, y a eu un souci côté IA. Réessaie encore un peu.';
    }

    memory.push(threadId, { role: 'model', text: answer });

    try {
      await message.reply(answer);
    } catch {
      // ignore
    }
  });

  await client.login(env.DISCORD_TOKEN);
}
