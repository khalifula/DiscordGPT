import {
  Client,
  Events,
  GatewayIntentBits,
  Message,
  Partials,
} from 'discord.js';

import { env } from './env';
import { GeminiClient } from './gemini';
import { ChannelSettings } from './channelSettings';
import { ChannelMemory } from './memory';
import {
  getResponseStyleLabel,
  listResponseStyleOptions,
  parseResponseStyle,
  type ResponseStyle,
} from './responseStyle';

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
    await message.reply({ content: chunks[0], allowedMentions: { parse: [], repliedUser: false } });
    for (const chunk of chunks.slice(1)) {
      await message.channel.send({ content: chunk, allowedMentions: { parse: [] } });
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
      await message.channel.send({
        content: `${mentionPrefix}${fallbackChunks[0]}`,
        allowedMentions: { users: [message.author.id], parse: [] },
      });
      for (const chunk of fallbackChunks.slice(1)) {
        await message.channel.send({ content: chunk, allowedMentions: { parse: [] } });
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

type BotCommand =
  | { type: 'help' }
  | { type: 'reset' }
  | { type: 'stats' }
  | { type: 'style'; style: ResponseStyle | null };

function parseCommand(input: string): BotCommand | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  if (/^(help|aide|commandes?)$/.test(normalized)) return { type: 'help' };
  if (/^(reset|clear|forget|oublie|oublier|efface)$/.test(normalized)) return { type: 'reset' };
  if (/^(stats?|status|etat|état)$/.test(normalized)) return { type: 'stats' };

  const styleMatch = /^(?:mode|style|ton|format)\s*[:\-]?\s*(.*)$/i.exec(trimmed);
  if (styleMatch) {
    const style = styleMatch[1] ? parseResponseStyle(styleMatch[1]) : null;
    return { type: 'style', style };
  }

  return null;
}

function buildHelpMessage(): string {
  return [
    'Utilisation:',
    '- Mentionne-moi avec ta question pour une réponse.',
    '- Commandes: help/aide, reset/clear, stats, style <valeur>.',
    `- Styles disponibles: ${listResponseStyleOptions()}.`,
  ].join('\n');
}

function formatUserTurn(message: Message<true>, text: string): string {
  const displayName = message.member?.displayName ?? message.author.username;
  return `${displayName}: ${text}`;
}

function buildUserText(message: Message<true>, cleaned: string): string {
  const lines: string[] = [];
  if (cleaned.trim()) lines.push(cleaned.trim());

  const attachments = [...message.attachments.values()];
  if (attachments.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Pièces jointes:');
    for (const attachment of attachments) {
      const label = attachment.name ?? 'fichier';
      lines.push(`- ${label}: ${attachment.url}`);
    }
  }

  return lines.join('\n').trim();
}

export async function startBot(): Promise<void> {
  const client = createDiscordClient();
  const gemini = new GeminiClient();
  const memory = new ChannelMemory({ maxMessages: env.MAX_CONTEXT_MESSAGES });
  const defaultStyle = parseResponseStyle(env.DEFAULT_RESPONSE_STYLE ?? '') ?? 'normal';
  const settings = new ChannelSettings({ defaultStyle });
  const lastRequestByUserId = new Map<string, number>();

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
    const userText = buildUserText(message as Message<true>, cleaned);

    if (!userText) {
      if (!mentioned) return;
      await safeReply(message as Message<true>, buildHelpMessage());
      return;
    }

    // Always keep a rolling context of recent messages in the channel.
    // (Bot still replies only when mentioned.)
    const history = memory.getHistory(channelId);
    const userTurnText = formatUserTurn(message as Message<true>, userText);

    if (!mentioned) {
      memory.push(channelId, { role: 'user', text: userTurnText });
      return;
    }

    const command = parseCommand(cleaned);
    if (command) {
      if (command.type === 'help') {
        await safeReply(message as Message<true>, buildHelpMessage());
        return;
      }

      if (command.type === 'reset') {
        memory.clear(channelId);
        settings.clear(channelId);
        await safeReply(message as Message<true>, 'Mémoire du salon réinitialisée.');
        return;
      }

      if (command.type === 'stats') {
        const stats = memory.getStats(channelId);
        const style = settings.getStyle(channelId);
        await safeReply(
          message as Message<true>,
          `Mémoire: ${stats.count}/${stats.max} messages (~${stats.chars} caractères). Style: ${getResponseStyleLabel(
            style,
          )}.`,
        );
        return;
      }

      if (command.type === 'style') {
        if (!command.style) {
          await safeReply(
            message as Message<true>,
            `Précise un style: ${listResponseStyleOptions()}. Exemple: "style concis".`,
          );
          return;
        }
        settings.setStyle(channelId, command.style);
        await safeReply(
          message as Message<true>,
          `Style mis à jour: ${getResponseStyleLabel(command.style)}.`,
        );
        return;
      }
    }

    const cooldownMs = Math.max(0, env.USER_COOLDOWN_SECONDS) * 1000;
    if (cooldownMs > 0) {
      const now = Date.now();
      const last = lastRequestByUserId.get(message.author.id) ?? 0;
      if (now - last < cooldownMs) {
        const waitSec = Math.ceil((cooldownMs - (now - last)) / 1000);
        await safeReply(
          message as Message<true>,
          `Attends ${waitSec}s avant de refaire une demande.`,
        );
        return;
      }
      lastRequestByUserId.set(message.author.id, now);
    }

    memory.push(channelId, { role: 'user', text: userTurnText });

    await safeTyping(message as Message<true>);

    let answer: string;
    try {
      const responseStyle = settings.getStyle(channelId);
      answer = await gemini.reply({ history, userText: userTurnText, responseStyle });
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
