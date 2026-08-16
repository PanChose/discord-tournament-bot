const cheerio = require("cheerio");

/**
 * IMPORTANT: Matcherino has no official public API for third-party developers.
 * This function does a best-effort scrape of the public tournament HTML page:
 * it grabs the title, meta description, and all visible text on the page so it
 * can be passed to the AI as context. If Matcherino changes its site markup,
 * this scraping can break — that's expected for an unofficial parser.
 *
 * @param {string} url - link to a tournament page on matcherino.com/...
 * @returns {Promise<string>} truncated text context from the page
 */
async function fetchMatcherinoContext(url) {
    if (!/^https?:\/\/(www\.)?matcherino\.com\//i.test(url)) {
        throw new Error("The link must point to matcherino.com");
    }

    const res = await fetch(url, {
        headers: {
            "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
    });

    if (!res.ok) {
        throw new Error(`Couldn't load the tournament page (HTTP ${res.status})`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    $("script, style, noscript, svg").remove();

    const title = $("title").text().trim();
    const metaDescription = $('meta[name="description"]').attr("content") || "";

    // Grab the visible text from the main content, collapsing extra whitespace
    let bodyText = $("body").text().replace(/\s+/g, " ").trim();

    // Cap the size so we don't bloat the request to the AI
    const MAX_CHARS = 6000;
    if (bodyText.length > MAX_CHARS) {
        bodyText = bodyText.slice(0, MAX_CHARS) + " …[truncated]";
    }

    return [
        `Page title: ${title}`,
        metaDescription ? `Description: ${metaDescription}` : null,
        `Link: ${url}`,
        `Page text: ${bodyText}`,
    ]
        .filter(Boolean)
        .join("\n");
}

module.exports = { fetchMatcherinoContext };