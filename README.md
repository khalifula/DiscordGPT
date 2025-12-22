# DiscordGPT

Bot Discord en TypeScript qui répond via Gemini directement dans ton serveur.

## Comportement
- Le bot répond **uniquement quand on le mentionne** dans un salon normal.
- Si tu veux garder le contexte: **c’est l’utilisateur qui crée le thread** (depuis Discord), puis il mentionne le bot **une seule fois** dans ce thread.
- Dans un thread “actif” (où le bot a déjà été mentionné), il répond aux messages **sans besoin de mention** pour que la conversation coule.

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

### Search grounding (Google Search)
Si tu veux que Gemini puisse chercher sur le web (quand utile):
- Mets `GEMINI_ENABLE_SEARCH=true`

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
- Permission **Send Messages in Threads** pour répondre dans les threads

## Notes
- La mémoire/contexte est gardée **en RAM** (pas de base de données). Si tu redémarres le process, le contexte repart à zéro.