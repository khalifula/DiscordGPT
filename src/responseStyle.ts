export type ResponseStyle = 'normal' | 'concise' | 'detailed' | 'bullet';

const RESPONSE_STYLE_ALIASES: Record<ResponseStyle, string[]> = {
  normal: ['normal', 'standard', 'neutre', 'default', 'defaut'],
  concise: ['concise', 'court', 'bref', 'brève', 'breve', 'short'],
  detailed: ['detailed', 'detaille', 'detaillé', 'detaillée', 'long', 'longue', 'complet'],
  bullet: ['bullet', 'bullets', 'liste', 'list', 'points', 'puces'],
};

const RESPONSE_STYLE_LABELS: Record<ResponseStyle, string> = {
  normal: 'Normal',
  concise: 'Concis',
  detailed: 'Détaillé',
  bullet: 'Points',
};

function normalizeToken(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseResponseStyle(input: string): ResponseStyle | null {
  const normalized = normalizeToken(input);
  if (!normalized) return null;

  for (const [style, aliases] of Object.entries(RESPONSE_STYLE_ALIASES) as [
    ResponseStyle,
    string[],
  ][]) {
    if (aliases.some((alias) => normalizeToken(alias) === normalized)) return style;
  }

  return null;
}

export function getResponseStyleLabel(style: ResponseStyle): string {
  return RESPONSE_STYLE_LABELS[style] ?? style;
}

export function getResponseStyleInstruction(style: ResponseStyle): string {
  switch (style) {
    case 'concise':
      return 'Style: réponds très concis, va droit au but (4-6 phrases max).';
    case 'detailed':
      return 'Style: réponds en profondeur, avec étapes et détails utiles.';
    case 'bullet':
      return 'Style: réponds sous forme de liste à puces, courtes et structurées.';
    case 'normal':
    default:
      return 'Style: réponds naturellement, ni trop court ni trop long.';
  }
}

export function listResponseStyleOptions(): string {
  return Object.entries(RESPONSE_STYLE_LABELS)
    .map(([key, label]) => `${key} (${label})`)
    .join(', ');
}
