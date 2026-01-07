import type { ResponseStyle } from './responseStyle';

export class ChannelSettings {
  private readonly byChannelId = new Map<string, { responseStyle: ResponseStyle }>();
  private readonly defaultStyle: ResponseStyle;

  constructor(opts: { defaultStyle: ResponseStyle }) {
    this.defaultStyle = opts.defaultStyle;
  }

  getStyle(channelId: string): ResponseStyle {
    return this.byChannelId.get(channelId)?.responseStyle ?? this.defaultStyle;
  }

  setStyle(channelId: string, responseStyle: ResponseStyle): void {
    this.byChannelId.set(channelId, { responseStyle });
  }

  clear(channelId: string): void {
    this.byChannelId.delete(channelId);
  }
}
