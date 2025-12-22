export type ChatRole = 'user' | 'model';

export type ChatTurn = {
  role: ChatRole;
  text: string;
};

export class ThreadMemory {
  private readonly maxTurns: number;
  private readonly byThreadId = new Map<string, ChatTurn[]>();
  private readonly activeThreads = new Set<string>();

  constructor(opts: { maxTurns: number }) {
    this.maxTurns = opts.maxTurns;
  }

  isActive(threadId: string): boolean {
    return this.activeThreads.has(threadId);
  }

  activate(threadId: string): void {
    this.activeThreads.add(threadId);
    if (!this.byThreadId.has(threadId)) this.byThreadId.set(threadId, []);
  }

  getHistory(threadId: string): ChatTurn[] {
    return this.byThreadId.get(threadId) ?? [];
  }

  push(threadId: string, turn: ChatTurn): void {
    const history = this.byThreadId.get(threadId) ?? [];
    history.push(turn);

    // Keep at most maxTurns user+model pairs => 2*maxTurns turns
    const limit = this.maxTurns * 2;
    const trimmed = history.length > limit ? history.slice(history.length - limit) : history;

    this.byThreadId.set(threadId, trimmed);
  }
}
