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
      answer = 'Eh, y a eu un souci côté IA. Réessaie encore un peu.';
    }

    memory.push(channelId, { role: 'model', text: answer });

    try {
      await message.reply(answer);
    } catch {
      // ignore
    }
  });

  await client.login(env.DISCORD_TOKEN);
}
