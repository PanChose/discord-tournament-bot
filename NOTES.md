# NOTES: ИИ-функция (отложена)

ИИ-ответы про турниры Matcherino / Brawl Stars временно **отключены** от бота и панели,
но код никуда не делся — он лежит готовый в `lib/ai.js` и `lib/matcherino.js`.
Ничего с нуля переписывать не придётся, когда решишь включать.

## Что уже готово

- **`lib/ai.js`** — обращение к Claude API (Anthropic), с системным промптом,
  заточенным под тематику турниров Matcherino / Brawl Stars.
- **`lib/matcherino.js`** — скрейпинг публичной страницы турнира на matcherino.com
  (официального API у Matcherino нет, поэтому данные берутся напрямую со страницы).

## Как включить обратно

1. **В `lib/discordClient.js`**:
   - раскомментировать `require` для `askAI` и `fetchMatcherinoContext` в начале файла;
   - раскомментировать блок команды `/ask` в массиве `commands`;
   - раскомментировать обработчик `interactionCreate` для команды `/ask`.

2. **В `server.js`**:
   - раскомментировать `require` для `askAI` и `fetchMatcherinoContext`;
   - вернуть роут `POST /api/ask` (сохранён в истории/можно взять из этого файла ниже).

3. **В `public/index.html`**:
   - вернуть секцию `<section class="card"> ... 🤖 ИИ ... </section>` со полями
     `tournament-url`, `question-input`, кнопкой `ask-btn` и блоком `ask-result`.

4. **В `public/panel.js`**:
   - вернуть обработчик клика на `#ask-btn`, который дергает `/api/ask`.

5. Не забыть проставить `ANTHROPIC_API_KEY` в `.env`.

## Резервная копия отключённого кода — роут `/api/ask` (server.js)

```js
app.post("/api/ask", checkAuth, async (req, res) => {
  const { question, tournamentUrl } = req.body;
  if (!question) {
    return res.status(400).json({ error: "question обязателен" });
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

## Резервная копия отключённого HTML-блока (public/index.html)

```html
<section class="card">
  <h2>🤖 ИИ: вопросы по турнирам Matcherino / Brawl Stars</h2>
  <label>Ссылка на турнир (необязательно, matcherino.com/...)</label>
  <input id="tournament-url" type="text" placeholder="https://matcherino.com/t/..." />

  <label>Вопрос</label>
  <textarea id="question-input" rows="3" placeholder="Например: какой формат сетки у этого турнира?"></textarea>

  <button id="ask-btn">Спросить</button>
  <div id="ask-result" class="result answer"></div>
</section>
```

## Резервная копия отключённого JS (public/panel.js)

```js
document.getElementById("ask-btn").addEventListener("click", async () => {
  const question = document.getElementById("question-input").value.trim();
  const tournamentUrl = document.getElementById("tournament-url").value.trim();
  const resultEl = document.getElementById("ask-result");

  if (!question) {
    resultEl.textContent = "Введи вопрос";
    return;
  }

  resultEl.textContent = "Думаю…";

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
