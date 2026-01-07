# DiscordGPT

Bot Discord en TypeScript qui répond via Gemini directement dans ton serveur.

## Comportement
- Le bot répond **uniquement quand on le mentionne**.
- Il garde le contexte des **50 derniers messages du salon** (configurable) et s’en sert quand tu le mentionnes.
- Commandes rapides: `help/aide`, `reset/clear`, `stats`, `style <valeur>`.
- Style de réponse configurable par salon (`style concis`, `style détaillé`, `style points`).
- Cooldown anti-spam configurable (par défaut 4s).
- Auto actions: l'IA maintient un résumé interne et peut agir toutes les N messages par salon.

## Prérequis
- Node.js 18+ (recommandé 20+)
- Un bot Discord + token
- Une clé Gemini (Google AI Studio)

## Installation
```bash
npm install
```

Copie les variables d’environnement:
```bash
cp .env.example .env
```

Puis complète `.env`:
- `DISCORD_TOKEN`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (par défaut `gemini-1.5-flash`)
- `GEMINI_ENABLE_SEARCH` (optionnel, `false` par défaut)
- `USER_COOLDOWN_SECONDS` (optionnel, `4` par défaut)
- `DEFAULT_RESPONSE_STYLE` (optionnel, `normal` par défaut)
- `AUTO_ACTION_EVERY_N_MESSAGES` (optionnel, `10` par défaut)
- `AUTO_ACTION_MAX_ACTIONS` (optionnel, `2` par défaut)
- `AUTO_ACTION_MAX_TIMEOUT_MINUTES` (optionnel, `10` par défaut)
- `MAX_CONTEXT_MESSAGES` (optionnel, `50` par défaut)

### Search grounding (Google Search)
Si tu veux que Gemini puisse chercher sur le web (quand utile):
- Mets `GEMINI_ENABLE_SEARCH=true`

Quand c'est activé, le bot déclenche automatiquement la recherche pour des sujets qui bougent vite (ex: jeux vidéo: builds/meta, quêtes, patch notes, MMO, saisons). Pour les autres questions, il peut répondre sans recherche.

Note: même activé, le modèle ne fait pas forcément une recherche pour des questions “générales”. Pour tester, pose une question très récente (actualité, résultats, prix du jour) ou demande explicitement “donne-moi les sources/liens”.

## Lancer en dev
```bash
npm run dev
```

## Build + run
```bash
npm run build
npm start
```

## Permissions Discord
Le bot a besoin au minimum:
- Intent **Message Content** activé dans le portail développeur Discord
- Permissions pour lire/écrire dans les salons

## Notes
- La mémoire/contexte est gardée **en RAM** (pas de base de données). Si tu redémarres le process, le contexte repart à zéro.

## Commandes (exemples)
- `@Bot help` → affiche l’aide rapide.
- `@Bot reset` → oublie la mémoire du salon.
- `@Bot stats` → affiche les stats mémoire + style actuel.
- `@Bot style concis` → réponses très courtes.
- `@Bot style détaillé` → réponses détaillées.
- `@Bot style points` → réponses en liste à puces.

## Auto actions
- Toutes les N messages par salon, l'IA se fait un résumé interne et peut déclencher des actions.
- Actions autorisées: réactions, message d'interaction, timeout/unmute.
- Pour désactiver: `AUTO_ACTION_EVERY_N_MESSAGES=0`.
