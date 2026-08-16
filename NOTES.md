# NOTES: AI feature (on hold)

AI answers about Matcherino / Brawl Stars tournaments are temporarily **disabled** in the bot
and the panel, but the code hasn't gone anywhere — it's ready to go in `lib/ai.js` and
`lib/matcherino.js`. You won't have to rewrite anything from scratch when you decide to turn it back on.

## What's already done

- **`lib/ai.js`** — talks to the Claude API (Anthropic), with a system prompt tailored
  to Matcherino / Brawl Stars tournament topics.
- **`lib/matcherino.js`** — scrapes the public tournament page on matcherino.com
  (Matcherino has no official API, so data is pulled straight from the page).

## How to turn it back on

1. **In `lib/discordClient.js`**:
    - uncomment the `require` calls for `askAI` and `fetchMatcherinoContext` at the top of the file;
    - uncomment the `/ask` command block in the `commands` array;
    - uncomment the `interactionCreate` handler for the `/ask` command.

2. **In `server.js`**:
    - uncomment the `require` calls for `askAI` and `fetchMatcherinoContext`;
    - bring back the `POST /api/ask` route (kept below — you can copy it from this file).

3. **In `public/index.html`**:
    - bring back the `<section class="card"> ... 🤖 AI ... </section>` section with the
      `tournament-url` and `question-input` fields, the `ask-btn` button, and the `ask-result` block.

4. **In `public/panel.js`**:
    - bring back the click handler for `#ask-btn` that calls `/api/ask`.

5. Don't forget to set `ANTHROPIC_API_KEY` in `.env`.

## Backup of the disabled code — the `/api/ask` route (server.js)

```js
app.post("/api/ask", checkAuth, async (req, res) => {
  const { question, tournamentUrl } = req.body;
  if (!question) {
    return res.status(400).json({ error: "question is required" });
  }
  try {
    let context = null;
    let scrapeWarning = null;
    if (tournamentUrl) {
      try {
        context = await fetchMatcherinoContext(tournamentUrl);
      } catch (err) {
        scrapeWarning = err.message;
      }
    }
    const answer = await askAI(question, context);
    res.json({ answer, scrapeWarning });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

## Backup of the disabled HTML block (public/index.html)

```html
<section class="card">
  <h2>🤖 AI: questions about Matcherino / Brawl Stars tournaments</h2>
  <label>Tournament link (optional, matcherino.com/...)</label>
  <input id="tournament-url" type="text" placeholder="https://matcherino.com/t/..." />

  <label>Question</label>
  <textarea id="question-input" rows="3" placeholder="E.g.: what bracket format does this tournament use?"></textarea>

  <button id="ask-btn">Ask</button>
  <div id="ask-result" class="result answer"></div>
</section>
```

## Backup of the disabled JS (public/panel.js)

```js
document.getElementById("ask-btn").addEventListener("click", async () => {
  const question = document.getElementById("question-input").value.trim();
  const tournamentUrl = document.getElementById("tournament-url").value.trim();
  const resultEl = document.getElementById("ask-result");

  if (!question) {
    resultEl.textContent = "Enter a question";
    return;
  }

  resultEl.textContent = "Thinking…";

  try {
    const data = await apiFetch("/api/ask", {
      method: "POST",
      body: JSON.stringify({ question, tournamentUrl: tournamentUrl || undefined }),
    });
    let text = data.answer;
    if (data.scrapeWarning) {
      text = `⚠️ ${data.scrapeWarning}\n\n${text}`;
    }
    resultEl.textContent = text;
  } catch (err) {
    resultEl.textContent = "❌ " + err.message;
  }
});
```