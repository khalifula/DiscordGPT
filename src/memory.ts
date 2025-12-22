export type ChatRole = 'user' | 'model';

export type ChatTurn = {
  role: ChatRole;
  text: string;
};

export class ChannelMemory {
  private readonly maxMessages: number;
  private readonly byChannelId = new Map<string, ChatTurn[]>();

  constructor(opts: { maxMessages: number }) {
    this.maxMessages = opts.maxMessages;
  }

  getHistory(channelId: string): ChatTurn[] {
    return this.byChannelId.get(channelId) ?? [];
  }

  push(channelId: string, turn: ChatTurn): void {
    const history = this.byChannelId.get(channelId) ?? [];
    history.push(turn);

    const trimmed =
      history.length > this.maxMessages ? history.slice(history.length - this.maxMessages) : history;

    this.byChannelId.set(channelId, trimmed);
  }
}
