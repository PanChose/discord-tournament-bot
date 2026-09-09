# Discord Tournament Bot + Web Panel

A Discord bot for running community tournaments, plus a web control panel organizers use instead of
typing commands: build the announcement visually with a live preview, publish it with one click, and
watch registrations come in in real time — all synced back to the same Discord message.

## What it does

- **Discord bot**: slash commands to create, publish, edit, and close tournaments; a single **Join**
  button on the announcement itself with a live "12/32 slots" counter — click it and the bot records
  your Discord tag as a participant and, if the tournament has an external link (Challonge, Matcherino,
  etc.), replies with it so you can finish signing up there; DM confirmations, start-time reminders,
  and an optional role ping when the tournament kicks off.
- **Web panel**: sign in with your own Discord account (OAuth2 — no separate password), pick a server
  you organize for, build the tournament with a form that renders a live Discord-style preview as you
  type, and manage everything from a dashboard (publish / edit / close / delete, participant list,
  CSV export).
- **Optional AI helper**: generates a tournament description from a few keywords (game, format, prize)
  via the Claude API.

## Roles

| Role | Can do |
|---|---|
| **Organizer** | Anyone with the **Manage Server** permission on a guild. Create/edit/close tournaments, from Discord or the panel. |
| **Participant** | Join via the button on the announcement (or `/register`); cancel with `/unregister`. |
| **Viewer** | Sees the announcement and the live slot counter like any other message in the channel. |

## Discord commands

- `/tournament create` — opens a form (Discord modal) for a quick draft without leaving Discord
- `/tournament announce id:<id>` — publishes a draft's embed + buttons to its channel
- `/tournament edit id:<id>` — edits a tournament's core fields; if it's already published, the live
  message is updated in place
- `/tournament close id:<id>` — closes registration, disables the button, posts a closed notice
- `/tournament list` — lists this server's tournaments
- `/register id:<id>` — slash-command alternative to the Join button
- `/unregister id:<id>` — cancels a registration (there's no button for this — see below)

All of the above (except `list`/`register`/`unregister`) require **Manage Server**, checked
server-side against `interaction.memberPermissions` — not just hidden from users in the Discord UI.

## Architecture

```
Browser (public/)  <-- OAuth2 + REST + polling -->  Express (server.js)
                                                          |
                                                          |-- lib/oauth.js        (Discord OAuth2)
                                                          |-- lib/tournaments.js  (business logic)
                                                          |-- lib/ai.js           (Claude API, optional)
                                                          |
                                                    lib/discordClient.js (discord.js client)
                                                          |
                                                     Discord Gateway/API
                                                          |
                                                     SQLite (lib/db.js, better-sqlite3)
```

- **Backend**: Node.js + Express, [discord.js](https://discord.js.org) v14 for the bot.
- **Frontend**: plain HTML/CSS/JS (no build step) — kept intentionally framework-free so the whole
  thing deploys as a single Node process with no separate frontend build/host.
- **Database**: SQLite via `better-sqlite3` (synchronous driver — see below for why that matters).
- **Auth**: Discord OAuth2 for the panel; slash-command permission checks for the bot.

## The non-trivial parts

### 1. Keeping the Discord message and the database in sync (and not overselling slots)

Every tournament row stores the `channel_id` + `message_id` of its announcement. Registering doesn't
post a new message — `refreshAnnouncementMessage()` in `lib/discordClient.js` re-renders the same
message's embed and buttons from the current DB state and calls `message.edit()` on it. That's how the
"12/32 slots" counter updates live without spamming the channel.

The harder problem is two people clicking **Join** for the last open slot within milliseconds of
each other. `registerParticipant()` in `lib/tournaments.js` handles this by relying on `better-sqlite3`
being a **synchronous** driver: the whole "count active registrations → compare to max → insert" sequence
runs inside one `db.transaction()` call with no `await` in between. Since Node is single-threaded and
the driver blocks rather than yielding to the event loop mid-query, a second registration attempt simply
cannot be interleaved between another one's read and write — whichever call's transaction commits first
is immediately visible to the next one's `COUNT(*)`. No extra locking layer, no oversold slots. (A
`UNIQUE(tournament_id, user_id)` constraint backs this up against double-registration too.)

### 2. OAuth2 — tokens aren't stored in plain text

The panel login is a standard Discord OAuth2 Authorization Code flow (`lib/oauth.js`): exchange the
code for an access + refresh token pair, fetch the user's guild list (Discord returns each guild's
permission bitfield for that user — that's how "only servers where you're an organizer" is filtered,
with no extra bot-side permission lookup needed), and store a session.

Access/refresh tokens are encrypted (AES-256-GCM, `lib/crypto.js`) before being written to the
`oauth_sessions` table — never in plain text. The browser only ever holds an opaque, random session ID
in an `httpOnly` cookie; that ID is meaningless outside the server, and it's the only thing that could
leak client-side. Access tokens expire quickly, so `getValidAccessToken()` transparently refreshes
(and re-encrypts) them on demand using the stored refresh token.

### 3. Live preview without hammering the Discord API

The constructor form's preview (left side of the "New tournament" tab) is rendered **entirely in the
browser** from the current form values — `renderPreview()` in `public/panel.js` mirrors the same embed
shape `buildEmbedData()` builds on the server, but never calls Discord or even the backend while you
type. Input is debounced (150ms) purely to avoid re-rendering the DOM on every keystroke; there's no
network round-trip to debounce in the first place. The real embed only touches the Discord API once,
when you hit Publish.

The dashboard's slot counters, by contrast, *do* need to reflect real activity from other people
clicking the button in Discord — that view polls `GET /api/tournaments` every 5 seconds while it's open.

## Setup

1. Install [Node.js](https://nodejs.org/) 18+.
2. `npm install`
3. `cp .env.example .env` and fill it in:

   **Discord app** — [discord.com/developers/applications](https://discord.com/developers/applications):
   - New Application → **General Information**: copy the *Application ID* → `DISCORD_CLIENT_ID`
   - **Bot** → Reset Token → `DISCORD_TOKEN`
   - **OAuth2** → copy the *Client Secret* → `DISCORD_CLIENT_SECRET`
   - **OAuth2 → Redirects**: add `http://localhost:3000/auth/discord/callback` (must match
     `DISCORD_REDIRECT_URI` exactly) — add your production URL's callback here too once you deploy
   - **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`, permissions at least
     `Send Messages`, `Read Messages/View Channels`, `Manage Messages` (to edit its own announcements).
     Open the generated link to add the bot to your server.
   - **Installation → Authorization Flow**: turn off **Public Bot** so only you can add it elsewhere
     (this repo also enforces that in code via `OWNER_DISCORD_ID`, as a backup)

   **Security**
   - `ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `OWNER_DISCORD_ID` (optional but recommended): User Settings → Advanced → Developer Mode, then
     right-click your name → Copy User ID

   **Optional**
   - `ANTHROPIC_API_KEY`: from [console.anthropic.com](https://console.anthropic.com/) — only needed
     for the "Generate with AI" description button

4. `npm start`, then open `http://localhost:3000` and log in with Discord.

## Deploying (Railway / Render)

Not done yet — when the app is ready to go live, here's the outline (you run it yourself):

1. Push this repo to GitHub.
2. Create a new Web Service on [Railway](https://railway.app) or [Render](https://render.com) from
   that repo. Start command: `npm start`.
3. Add every variable from `.env.example` to the service's environment settings, using the
   **production** URL for `DISCORD_REDIRECT_URI` (e.g. `https://your-app.up.railway.app/auth/discord/callback`).
4. Add that same callback URL under **OAuth2 → Redirects** in the Discord Developer Portal.
5. Note: the SQLite database lives in `./data/` on disk — on most PaaS free tiers this directory does
   **not** persist across redeploys/restarts unless you attach a persistent volume. Attach one (Railway
   and Render both support this) if you want tournament data to survive redeploys.
6. Free tiers may sleep the service when idle — a bot that needs to stay connected to Discord 24/7
   generally needs a paid/always-on plan.

## Project structure

```
discord-tournament-bot/
├── server.js              # Express app: OAuth2, REST API, static panel
├── lib/
│   ├── db.js               # SQLite schema (tournaments, registrations, oauth_sessions)
│   ├── crypto.js            # AES-256-GCM helpers for encrypting stored tokens
│   ├── oauth.js              # Discord OAuth2 flow + session storage
│   ├── tournaments.js         # CRUD + atomic registration/unregistration + CSV export
│   ├── discordClient.js        # discord.js client: slash commands, buttons, embeds
│   ├── reminders.js             # polls for due reminder DMs / start-time role pings
│   └── ai.js                     # Claude API — tournament description generator
├── public/                # Web panel (vanilla HTML/CSS/JS, no build step)
├── data/                   # SQLite database file (gitignored)
├── .env.example
└── package.json
```

## Security notes

- OAuth2 tokens are encrypted at rest; the session cookie is `httpOnly` and carries only an opaque ID.
- Every privileged bot action re-checks the Manage Server permission server-side.
- Never commit `.env` — already covered by `.gitignore`.

## Ready-to-show checklist

- [ ] Bot deployed and added to a public demo server
- [ ] Web panel deployed, live link available
- [ ] 15-20s demo clip: create → publish → register → live slot counter update
- [x] README with an Architecture section and the non-trivial parts called out
- [x] No real tokens committed — `.env` + `.gitignore` in place
