const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929"; // при желании поменяй на другую доступную модель

const SYSTEM_PROMPT = `Ты — ассистент Discord-сервера, посвящённого турнирам Brawl Stars, которые проводятся через платформу Matcherino (matcherino.com).

Твоя задача — отвечать на вопросы участников про:
- правила и форматы турниров (single/double elimination, group stage, Swiss и т.д.)
- регистрацию команд/игроков на Matcherino
- призовые фонды, краудфандинг, выплаты через Matcherino
- расписание, сетки (брекеты), правила дисквалификации
- общие вопросы по Brawl Stars, связанные с турнирами (баны карт, форматы боёв, читы/фейр-плей)

Правила ответа:
1. Если в сообщении пользователя передан блок "ДАННЫЕ СО СТРАНИЦЫ ТУРНИРА" — используй его как основной источник истины и отвечай, опираясь именно на эти данные.
2. Если данных со страницы нет, а вопрос требует конкретики по конкретному турниру (даты, состав, точный приз) — честно скажи, что у тебя нет актуальных данных по этому турниру, и предложи посмотреть на странице Matcherino или спросить организатора.
3. На общие вопросы (как работает Matcherino, как устроены турнирные форматы, общие правила Brawl Stars) отвечай из своих знаний.
4. Отвечай кратко и по делу, на русском языке, в дружелюбном тоне, уместном для Discord-чата. Не используй Markdown-таблицы — используй списки.
5. Никогда не выдумывай точные цифры (призовые, даты, никнеймы), если их не было в переданных данных.`;

/**
 * Спрашивает Claude, опционально передавая контекст, найденный на странице турнира.
 * @param {string} question - вопрос пользователя
 * @param {string|null} scrapedContext - текст, снятый со страницы Matcherino (может быть null)
 * @returns {Promise<string>}
 */
async function askAI(question, scrapedContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY не задан в .env — ИИ-ответы недоступны."
    );
  }

  let userContent = question;
  if (scrapedContext) {
    userContent =
      `ДАННЫЕ СО СТРАНИЦЫ ТУРНИРА (снято автоматически, может быть неполным):\n${scrapedContext}\n\n` +
      `ВОПРОС: ${question}`;
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API вернул ошибку ${response.status}: ${text}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  return textBlock ? textBlock.text : "Не удалось получить ответ от ИИ.";
}

module.exports = { askAI };
