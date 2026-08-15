const cheerio = require("cheerio");

/**
 * ВАЖНО: у Matcherino нет официального публичного API для сторонних разработчиков.
 * Эта функция делает best-effort скрейпинг публичной HTML-страницы турнира:
 * забирает заголовок, мета-описание и весь видимый текст со страницы, чтобы
 * передать это как контекст в ИИ. Если Matcherino изменит вёрстку сайта —
 * скрейпинг может сломаться, это ожидаемо для неофициального парсинга.
 *
 * @param {string} url - ссылка на страницу турнира matcherino.com/...
 * @returns {Promise<string>} обрезанный текстовый контекст со страницы
 */
async function fetchMatcherinoContext(url) {
  if (!/^https?:\/\/(www\.)?matcherino\.com\//i.test(url)) {
    throw new Error("Ссылка должна вести на matcherino.com");
  }

  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Не удалось загрузить страницу турнира (HTTP ${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, noscript, svg").remove();

  const title = $("title").text().trim();
  const metaDescription = $('meta[name="description"]').attr("content") || "";

  // Забираем видимый текст из основного контента, схлопывая лишние пробелы
  let bodyText = $("body").text().replace(/\s+/g, " ").trim();

  // Ограничиваем размер, чтобы не раздувать запрос к ИИ
  const MAX_CHARS = 6000;
  if (bodyText.length > MAX_CHARS) {
    bodyText = bodyText.slice(0, MAX_CHARS) + " …[обрезано]";
  }

  return [
    `Заголовок страницы: ${title}`,
    metaDescription ? `Описание: ${metaDescription}` : null,
    `Ссылка: ${url}`,
    `Текст страницы: ${bodyText}`,
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = { fetchMatcherinoContext };
