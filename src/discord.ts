import {
  Client,
  Events,
  GatewayIntentBits,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Message,
  PermissionsBitField,
  Partials,
} from 'discord.js';

import { env } from './env';
import { GeminiClient } from './gemini';
import type { AutoAction, AutoActionMessage } from './autoActions';
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
    await message.reply({
      content: chunks[0],
      allowedMentions: { parse: ['users'], repliedUser: false },
    });
    for (const chunk of chunks.slice(1)) {
      await message.channel.send({ content: chunk, allowedMentions: { parse: ['users'] } });
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
  const autoInfo =
    env.AUTO_ACTION_EVERY_N_MESSAGES > 0
      ? `- Auto actions: resume interne + actions toutes les ${env.AUTO_ACTION_EVERY_N_MESSAGES} messages (par salon).`
      : '- Auto actions: desactivees (AUTO_ACTION_EVERY_N_MESSAGES=0).';

  return [
    'Utilisation:',
    '- Mentionne-moi avec ta question pour une réponse.',
    '- Commandes: help/aide, reset/clear, stats, style <valeur>.',
    `- Styles disponibles: ${listResponseStyleOptions()}.`,
    autoInfo,
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

async function safeSend(
  channel: GuildTextBasedChannel,
  content: string,
  opts: { allowUserMentions?: boolean } = {},
): Promise<void> {
  const text = content.trim();
  if (!text) return;

  const chunks = splitForDiscord(text, 2000);
  if (chunks.length === 0) return;

  try {
    for (const chunk of chunks) {
      await channel.send({
        content: chunk,
        allowedMentions: { parse: opts.allowUserMentions ? ['users'] : [] },
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to channel.send():', { err, totalLength: text.length, chunks: chunks.length });
  }
}

function createAutoActionMessage(message: Message<true>, content: string): AutoActionMessage {
  const authorName = message.member?.displayName ?? message.author.username;
  return {
    id: message.id,
    authorId: message.author.id,
    authorName,
    content,
  };
}

function getChannelName(channel: GuildTextBasedChannel, channelId: string): string {
  if ('name' in channel && typeof channel.name === 'string') return channel.name;
  return channelId;
}

const SUMMARY_REQUEST_REGEX =
  /\b(r[eé]sum[ée]r?|r[eé]cap(?:itulatif)?|recap|summary|tl;?dr|synth[eè]se)\b/i;
const MASS_PING_REGEX = /@everyone|@here/i;
const MENTION_REGEX = /<@!?(\d+)>/g;

function hasSummaryRequest(messages: AutoActionMessage[]): boolean {
  return messages.some((msg) => SUMMARY_REQUEST_REGEX.test(msg.content));
}

function looksLikeSummaryMessage(content: string): boolean {
  return SUMMARY_REQUEST_REGEX.test(content);
}

function extractMentionIds(content: string): string[] {
  const ids: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function filterAutoActions(opts: {
  actions: AutoAction[];
  allowedMessageIds: Set<string>;
  allowedUserIds: Set<string>;
  summaryRequested: boolean;
}): AutoAction[] {
  const filtered: AutoAction[] = [];

  for (const action of opts.actions) {
    if (action.type === 'add_reaction') {
      if (!opts.allowedMessageIds.has(action.messageId)) continue;
      filtered.push(action);
      continue;
    }

    if (action.type === 'timeout_user' || action.type === 'untimeout_user') {
      if (!opts.allowedUserIds.has(action.userId)) continue;
      filtered.push(action);
      continue;
    }

    if (action.type === 'send_message') {
      if (!opts.summaryRequested && looksLikeSummaryMessage(action.content)) continue;
      if (MASS_PING_REGEX.test(action.content)) continue;
      const mentionIds = extractMentionIds(action.content);
      const unknown = mentionIds.find((id) => !opts.allowedUserIds.has(id));
      if (unknown) continue;
      filtered.push(action);
    }
  }

  return filtered;
}

type AutoActionState = {
  count: number;
  buffer: AutoActionMessage[];
  summary: string;
  inFlight: boolean;
  pending: boolean;
};

function shouldSkipModerationTarget(member: GuildMember): boolean {
  if (member.user.bot) return true;
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  if (member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return true;
  return false;
}

async function applyAutoAction(opts: {
  action: AutoAction;
  channel: GuildTextBasedChannel;
  guild: Guild;
  client: Client;
  maxTimeoutMinutes: number;
}): Promise<void> {
  const { action, channel, guild, client, maxTimeoutMinutes } = opts;

  if (action.type === 'send_message') {
    await safeSend(channel, action.content, { allowUserMentions: true });
    return;
  }

  if (action.type === 'add_reaction') {
    if (!('messages' in channel)) return;
    const target = await channel.messages.fetch(action.messageId).catch(() => null);
    if (!target) return;
    await target.react(action.emoji);
    return;
  }

  if (action.type === 'timeout_user') {
    if (action.userId === client.user?.id) return;
    const member = await guild.members.fetch(action.userId).catch(() => null);
    if (!member || shouldSkipModerationTarget(member)) return;
    const minutes = Math.min(Math.max(action.minutes, 1), maxTimeoutMinutes);
    const reason = action.reason.trim().slice(0, 180);
    await member.timeout(minutes * 60 * 1000, reason);
    return;
  }

  if (action.type === 'untimeout_user') {
    if (action.userId === client.user?.id) return;
    const member = await guild.members.fetch(action.userId).catch(() => null);
    if (!member || shouldSkipModerationTarget(member)) return;
    const reason = action.reason?.trim().slice(0, 180) ?? 'AI auto untimeout';
    await member.timeout(null, reason);
  }
}

async function runAutoActionCycle(opts: {
  channelId: string;
  channel: GuildTextBasedChannel;
  guild: Guild;
  client: Client;
  gemini: GeminiClient;
  state: AutoActionState;
  maxActions: number;
  maxTimeoutMinutes: number;
}): Promise<void> {
  const { channelId, channel, guild, client, gemini, state, maxActions, maxTimeoutMinutes } = opts;
  const snapshot = {
    summary: state.summary,
    messages: [...state.buffer],
  };
  const summaryRequested = hasSummaryRequest(snapshot.messages);

  let plan: { summary: string; actions: AutoAction[] };
  try {
    plan = await gemini.planActions({
      channelName: getChannelName(channel, channelId),
      summary: snapshot.summary,
      messages: snapshot.messages,
      maxActions,
      maxTimeoutMinutes,
      summaryRequested,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Auto action plan failed:', err);
    plan = { summary: snapshot.summary, actions: [] };
  }

  if (plan.summary?.trim()) {
    state.summary = plan.summary.trim();
  }

  const allowedMessageIds = new Set(snapshot.messages.map((msg) => msg.id));
  const allowedUserIds = new Set(snapshot.messages.map((msg) => msg.authorId));
  const filteredActions = filterAutoActions({
    actions: plan.actions,
    allowedMessageIds,
    allowedUserIds,
    summaryRequested,
  });

  const actionsToApply = [...filteredActions];
  const hasSendMessage = actionsToApply.some((action) => action.type === 'send_message');
  if (!hasSendMessage && actionsToApply.length < maxActions) {
    try {
      const content = await gemini.decideAutoMessage({
        channelName: getChannelName(channel, channelId),
        summary: state.summary,
        messages: snapshot.messages,
      });
      if (content) {
        const candidate: AutoAction = { type: 'send_message', content };
        const validated = filterAutoActions({
          actions: [candidate],
          allowedMessageIds,
          allowedUserIds,
          summaryRequested,
        });
        if (validated.length > 0) {
          actionsToApply.push(candidate);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Auto message decision failed:', err);
    }
  }

  const hasReaction = actionsToApply.some((action) => action.type === 'add_reaction');
  if (!hasReaction) {
    const lastMessage = snapshot.messages[snapshot.messages.length - 1];
    if (lastMessage) {
      try {
        const emoji = await gemini.pickReactionEmoji({
          channelName: getChannelName(channel, channelId),
          summary: state.summary,
          message: lastMessage,
        });
        if (emoji) {
          actionsToApply.push({
            type: 'add_reaction',
            messageId: lastMessage.id,
            emoji,
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Auto reaction pick failed:', err);
      }
    }
  }

  for (const action of actionsToApply) {
    try {
      await applyAutoAction({ action, channel, guild, client, maxTimeoutMinutes });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Auto action failed:', { action, err });
    }
  }
}

export async function startBot(): Promise<void> {
  const client = createDiscordClient();
  const gemini = new GeminiClient();
  const memory = new ChannelMemory({ maxMessages: env.MAX_CONTEXT_MESSAGES });
  const defaultStyle = parseResponseStyle(env.DEFAULT_RESPONSE_STYLE ?? '') ?? 'normal';
  const settings = new ChannelSettings({ defaultStyle });
  const lastRequestByUserId = new Map<string, number>();
  const autoStates = new Map<string, AutoActionState>();
  const autoEvery = Math.max(0, env.AUTO_ACTION_EVERY_N_MESSAGES);
  const autoMaxActions = Math.max(0, env.AUTO_ACTION_MAX_ACTIONS);
  const autoMaxTimeoutMinutes = Math.max(1, env.AUTO_ACTION_MAX_TIMEOUT_MINUTES);

  const getAutoState = (channelId: string): AutoActionState => {
    const existing = autoStates.get(channelId);
    if (existing) return existing;
    const created: AutoActionState = {
      count: 0,
      buffer: [],
      summary: '',
      inFlight: false,
      pending: false,
    };
    autoStates.set(channelId, created);
    return created;
  };

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

    if (autoEvery > 0) {
      const state = getAutoState(channelId);
      state.count += 1;
      state.buffer.push(createAutoActionMessage(message as Message<true>, userText));
      if (state.buffer.length > autoEvery) state.buffer.shift();

      if (state.count >= autoEvery) {
        state.count = 0;
        const channel = message.channel as GuildTextBasedChannel;
        const guild = message.guild as Guild;

        const trigger = (): void => {
          if (state.inFlight) {
            state.pending = true;
            return;
          }
          state.inFlight = true;
          void runAutoActionCycle({
            channelId,
            channel,
            guild,
            client,
            gemini,
            state,
            maxActions: autoMaxActions,
            maxTimeoutMinutes: autoMaxTimeoutMinutes,
          }).finally(() => {
            state.inFlight = false;
            if (state.pending) {
              state.pending = false;
              trigger();
            }
          });
        };

        trigger();
      }
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
        autoStates.delete(channelId);
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
