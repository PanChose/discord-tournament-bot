const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929"; // feel free to swap for another available model

const SYSTEM_PROMPT = `You write short, punchy Discord tournament announcement descriptions.

Given a game name, tournament format, prize info, and optional extra notes from the organizer,
produce ready-to-use description text for a Discord embed:
- 3-6 short lines, can use Discord markdown (**bold**, bullet points with "-", emoji sparingly)
- mention the format and prize if given
- confident, hype but not spammy tone appropriate for a competitive gaming community
- do not invent specific dates, rules, or numbers that weren't given to you
- output only the description text itself, no preamble or explanation`;

/**
 * Generates a tournament description from a few keywords the organizer provides.
 * @param {{ game?: string, format?: string, prize?: string, notes?: string }} input
 * @returns {Promise<string>}
 */
async function generateDescription({ game, format, prize, notes }) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not set in .env — the AI helper is unavailable.");
    }

    const parts = [];
    if (game) parts.push(`Game: ${game}`);
    if (format) parts.push(`Format: ${format}`);
    if (prize) parts.push(`Prize: ${prize}`);
    if (notes) parts.push(`Extra notes: ${notes}`);
    if (!parts.length) {
        throw new Error("Give at least one of: game, format, prize, or notes.");
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
            max_tokens: 400,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: parts.join("\n") }],
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Anthropic API returned an error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    return textBlock ? textBlock.text.trim() : "Couldn't get a response from the AI.";
}

module.exports = { generateDescription };
