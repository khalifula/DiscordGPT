import {
  Client,
  Events,
  GatewayIntentBits,
  Message,
  Partials,
} from 'discord.js';

import { env } from './env';
import { GeminiClient } from './gemini';
import { ChannelMemory } from './memory';

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

function splitForDiscord(text: string, limit: number): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  const parts: string[] = [];
  let remaining = cleaned;

  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    const lastNewline = slice.lastIndexOf('\n');
    const lastSpace = slice.lastIndexOf(' ');
    let cut = Math.max(lastNewline, lastSpace);

    // If we can't find a reasonable break, hard cut.
    if (cut < Math.floor(limit * 0.5)) cut = limit;

    const chunk = remaining.slice(0, cut).trimEnd();
    if (chunk) parts.push(chunk);
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining.trim()) parts.push(remaining.trim());
  return parts;
}

async function safeReply(message: Message<true>, content: string): Promise<void> {
  const text = content.trim();
  if (!text) return;

  const chunks = splitForDiscord(text, 2000);
  if (chunks.length === 0) return;

  try {
    await message.reply(chunks[0]);
    for (const chunk of chunks.slice(1)) {
      await message.channel.send({ content: chunk });
    }
    return;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to reply():', { err, totalLength: text.length, chunks: chunks.length });
  }

  // Fallback when reply() fails (permissions, deleted message, etc.).
  const mentionPrefix = `<@${message.author.id}> `;
  const firstLimit = Math.max(1, 2000 - mentionPrefix.length);
  const fallbackChunks = splitForDiscord(text, firstLimit);

  try {
    if (fallbackChunks.length > 0) {
      await message.channel.send({ content: `${mentionPrefix}${fallbackChunks[0]}` });
      for (const chunk of fallbackChunks.slice(1)) {
        await message.channel.send({ content: chunk });
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to channel.send():', { err, totalLength: text.length, chunks: fallbackChunks.length });
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
  const memory = new ChannelMemory({ maxMessages: env.MAX_CONTEXT_MESSAGES });

  client.once(Events.ClientReady, () => {
    // eslint-disable-next-line no-console
    console.log(`Logged in as ${client.user?.tag}`);
  });

  client.on('messageCreate', async (message) => {
    if (!message.inGuild()) return;
    if (message.author.bot) return;
    if (!client.user) return;

    const channelId = message.channelId;
    const mentioned = message.mentions.has(client.user);

    const raw = message.content ?? '';
    const cleaned = (mentioned ? stripBotMention(message, raw) : raw).trim();

    // If the user only mentions the bot with no text, prompt them for a question.
    if (mentioned && !cleaned) {
      await safeReply(message as Message<true>, "Oui — dis-moi ce dont tu as besoin (jeu, quête, build, etc.).");
      return;
    }

    if (!cleaned) return;

    // Always keep a rolling context of recent messages in the channel.
    // (Bot still replies only when mentioned.)
    const history = memory.getHistory(channelId);
    memory.push(channelId, { role: 'user', text: cleaned });

    if (!mentioned) return;

    await safeTyping(message as Message<true>);

    let answer: string;
    try {
      answer = await gemini.reply({ history, userText: cleaned });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      answer = "Désolé — je n'ai pas pu générer une réponse. Réessaie dans quelques secondes.";
    }

    if (!answer.trim()) {
      answer = "Je n'ai pas réussi à produire une réponse. Peux-tu reformuler ta question ?";
    }

    memory.push(channelId, { role: 'model', text: answer });

    await safeReply(message as Message<true>, answer);
  });

  await client.login(env.DISCORD_TOKEN);
}
