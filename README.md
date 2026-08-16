# Discord Tournament Bot + Web Panel

Originally used on https://discord.gg/n3DV3aUygA

A Discord bot with a browser-based control panel for posting messages to a server.

## What it does right now

- **Web panel** (opens in a browser): pick a server and a channel, and send a tournament announcement to it.
- **The form is tailored to a specific message format** (organization card + title + subtitle with a link + big image + corner logo):
    - Organization name + its icon (small icon at the top of the card)
    - Title (large bold text)
    - Subtitle/description with a mini formatting toolbar: **bold**, *italic*, link, ||spoiler||
    - Big banner image
    - Small logo thumbnail in the top-right corner of the card
    - Left stripe color
    - Optional auto-reaction under the message (the bot adds an emoji itself, e.g. ✅ — from there the counter grows based on real clicks from people; you can't set an exact number in advance)
- Shows the bot's status (online / offline) in the panel.

## 🤖 AI tournament helper — on hold

The AI feature (answering questions about Matcherino / Brawl Stars tournaments via `/ask` and the panel) is
**temporarily disabled**, but the code is fully written and sitting in the project — see
**[NOTES.md](./NOTES.md)** for step-by-step instructions on what to uncomment to turn it back on.

Briefly, for future reference: Matcherino has no official public API, so data about a specific
tournament is meant to be scraped from its public page (`lib/matcherino.js`), and the Claude API
(`lib/ai.js`) handles the actual answering.

## Setup

1. Install [Node.js](https://nodejs.org/) version 18 or newer.
2. Unzip the project and open a terminal in it.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
5. Fill in `.env`:

   ### DISCORD_TOKEN and DISCORD_CLIENT_ID
    1. Go to https://discord.com/developers/applications
    2. Create an application (New Application).
    3. In the **General Information** section, copy the **Application ID** → this is `DISCORD_CLIENT_ID`.
    4. In the **Bot** section, click **Reset Token** and copy the token → this is `DISCORD_TOKEN`.
    5. In the same section, enable **MESSAGE CONTENT INTENT** (the toggle under Privileged Gateway Intents).
    6. In **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes, and under permissions check at least `Send Messages` and `Read Messages/View Channels`. Copy the generated link and open it in a browser — that's how the bot gets added to your server.

## Only you can add the bot to servers

Two independent layers of protection:

1. **Main method (in the Discord Developer Portal):** open your application → **Installation** → under **Authorization Flow**, turn off the **Public Bot** toggle. After that, only the application owner (you) can use the invite link. This is how the project is set up by default — don't forget to turn this toggle off.

2. **Backup (in the bot's code):** if you fill in `OWNER_DISCORD_ID` in `.env`, the bot will check on startup and every time it's added to a new server that the server's owner is actually you. If not, the bot leaves the server on its own.

   ### How to find your Discord ID
    1. In Discord: User Settings → Advanced → enable **Developer Mode**.
    2. Right-click your username (in any chat or the member list) → **Copy User ID**.
    3. Paste this ID into `OWNER_DISCORD_ID` in `.env`.

   ### ANTHROPIC_API_KEY
   Get a key at https://console.anthropic.com/ (API Keys section).

   ### PANEL_PASSWORD
   Pick any password — you'll use it to log into the web panel.

6. Start the bot:
   ```bash
   npm start
   ```
7. Open in a browser: `http://localhost:3000` (or another port if you changed `PORT` in `.env`), enter `PANEL_PASSWORD` — you'll land in the panel.

## Deploying to hosting (if the bot needs to run 24/7 without your PC)

The easiest options are [Railway](https://railway.app) or [Render](https://render.com):
1. Push the project to a GitHub repository.
2. On Railway/Render, create a new service from that repository.
3. In the service settings, add the same environment variables as in `.env`.
4. Start command: `npm start`.
5. After deploying, the service will give you a public URL — the panel will be available there (`https://your-service.up.railway.app`).

⚠️ On free tiers, hosts may put the service to sleep when idle — for a bot that needs to stay online all the time, you'll usually need a paid plan (typically inexpensive, around $5/month as a rough estimate — check the host's site for current pricing).

## Project structure

```
discord-tournament-bot/
├── server.js           # Express server + bot startup
├── lib/
│   ├── discordClient.js  # Discord client, /ask slash command, sending messages
│   ├── ai.js              # Talks to the Claude API
│   └── matcherino.js      # Scrapes the tournament page
├── public/               # Web panel (HTML/CSS/JS)
├── .env.example
└── package.json
```

## Security

- The panel is protected by a single shared password (`PANEL_PASSWORD`) — that's enough for personal use, but it's not designed for many users with different permission levels. For a serious production setup, add proper authentication (e.g. via Discord OAuth2).
- Never commit the `.env` file (with your tokens) to a public repository — add it to `.gitignore` (already done).
