const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929"; // feel free to swap for another available model

const SYSTEM_PROMPT = `You are the assistant for a Discord server dedicated to Brawl Stars tournaments run through the Matcherino platform (matcherino.com).

Your job is to answer participants' questions about:
- tournament rules and formats (single/double elimination, group stage, Swiss, etc.)
- registering teams/players on Matcherino
- prize pools, crowdfunding, and payouts through Matcherino
- schedules, brackets, and disqualification rules
- general Brawl Stars questions related to tournaments (map bans, match formats, cheating/fair play)

Response rules:
1. If the user's message includes a "TOURNAMENT PAGE DATA" block — use it as your primary source of truth and base your answer on that data.
2. If there's no page data and the question needs specifics about a particular tournament (dates, roster, exact prize) — honestly say you don't have up-to-date data for that tournament, and suggest checking the Matcherino page or asking the organizer.
3. For general questions (how Matcherino works, how tournament formats work, general Brawl Stars rules) answer from your own knowledge.
4. Keep answers short and to the point, in English, in a friendly tone appropriate for a Discord chat. Don't use Markdown tables — use lists instead.
5. Never make up exact figures (prize amounts, dates, usernames) if they weren't in the data you were given.`;

/**
 * Asks Claude, optionally passing along context scraped from the tournament page.
 * @param {string} question - the user's question
 * @param {string|null} scrapedContext - text scraped from the Matcherino page (may be null)
 * @returns {Promise<string>}
 */
async function askAI(question, scrapedContext) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error(
            "ANTHROPIC_API_KEY is not set in .env — AI responses are unavailable."
        );
    }

    let userContent = question;
    if (scrapedContext) {
        userContent =
            `TOURNAMENT PAGE DATA (scraped automatically, may be incomplete):\n${scrapedContext}\n\n` +
            `QUESTION: ${question}`;
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
        throw new Error(`Anthropic API returned an error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    return textBlock ? textBlock.text : "Couldn't get a response from the AI.";
}

module.exports = { askAI };