const API = "";

function getToken() {
    return sessionStorage.getItem("panel_token");
}

async function apiFetch(url, options = {}) {
    const res = await fetch(API + url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken() || ""}`,
            ...(options.headers || {}),
        },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
    return data;
}

// --- Логин ---
document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("password-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
});

async function login() {
    const password = document.getElementById("password-input").value;
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    try {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Неверный пароль");
        sessionStorage.setItem("panel_token", data.token);
        showApp();
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

function showApp() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");
    loadStatus();
    loadGuilds();
}

// --- Статус бота ---
async function loadStatus() {
    const statusEl = document.getElementById("bot-status");
    try {
        const data = await apiFetch("/api/status");
        statusEl.textContent = data.ready ? `в сети: ${data.tag}` : "подключается…";
        statusEl.classList.toggle("offline", !data.ready);
    } catch (err) {
        statusEl.textContent = "ошибка: " + err.message;
        statusEl.classList.add("offline");
    }
}

// --- Гильдии и каналы ---
let guildsData = [];

async function loadGuilds() {
    const guildSelect = document.getElementById("guild-select");
    try {
        const data = await apiFetch("/api/guilds");
        guildsData = data.guilds;
        guildSelect.innerHTML = guildsData
            .map((g) => `<option value="${g.id}">${g.name}</option>`)
            .join("");
        updateChannels();
    } catch (err) {
        guildSelect.innerHTML = `<option>Ошибка: ${err.message}</option>`;
    }
}

document.getElementById("guild-select").addEventListener("change", updateChannels);

function updateChannels() {
    const guildId = document.getElementById("guild-select").value;
    const channelSelect = document.getElementById("channel-select");
    const guild = guildsData.find((g) => g.id === guildId);
    channelSelect.innerHTML = (guild ? guild.channels : [])
        .map((c) => `<option value="${c.id}">#${c.name}</option>`)
        .join("");
}

// --- Отправка сообщения ---
document.getElementById("send-btn").addEventListener("click", async () => {
    const guildId = document.getElementById("guild-select").value;
    const channelId = document.getElementById("channel-select").value;
    const content = document.getElementById("message-input").value.trim();
    const embed = collectEmbed();
    const buttonRows = collectButtonRows();
    const resultEl = document.getElementById("send-result");
    resultEl.textContent = "";
    resultEl.className = "result";

    if (!guildId || !channelId) {
        resultEl.textContent = "Выбери сервер и канал";
        resultEl.className = "result error";
        return;
    }

    const hasButtons = buttonRows.some((row) => row.length);
    if (!content && !embed && !hasButtons) {
        resultEl.textContent = "Добавь текст, Embed или хотя бы одну кнопку";
        resultEl.className = "result error";
        return;
    }

    try {
        await apiFetch("/api/send", {
            method: "POST",
            body: JSON.stringify({ guildId, channelId, content, embed, buttonRows }),
        });
        resultEl.textContent = "✅ Отправлено";
        resultEl.className = "result";
        document.getElementById("message-input").value = "";
    } catch (err) {
        resultEl.textContent = "❌ " + err.message;
        resultEl.className = "result error";
    }
});

// ==========================================================
// Форматирование текста (панель инструментов над textarea)
// ==========================================================

const messageInput = document.getElementById("message-input");

function insertAtCursor(textarea, before, after = "") {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selected = value.slice(start, end) || "текст";
    textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
    const cursorPos = start + before.length + selected.length + after.length;
    textarea.focus();
    textarea.setSelectionRange(cursorPos, cursorPos);
}

function insertLinePrefix(textarea, prefix) {
    const start = textarea.selectionStart;
    const value = textarea.value;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    textarea.value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    const cursorPos = start + prefix.length;
    textarea.focus();
    textarea.setSelectionRange(cursorPos, cursorPos);
}

const FORMAT_ACTIONS = {
    bold: () => insertAtCursor(messageInput, "**", "**"),
    italic: () => insertAtCursor(messageInput, "*", "*"),
    underline: () => insertAtCursor(messageInput, "__", "__"),
    strike: () => insertAtCursor(messageInput, "~~", "~~"),
    spoiler: () => insertAtCursor(messageInput, "||", "||"),
    code: () => insertAtCursor(messageInput, "`", "`"),
    codeblock: () => insertAtCursor(messageInput, "```\n", "\n```"),
    quote: () => insertLinePrefix(messageInput, "> "),
    h1: () => insertLinePrefix(messageInput, "# "),
    h2: () => insertLinePrefix(messageInput, "## "),
    h3: () => insertLinePrefix(messageInput, "### "),
    list: () => insertLinePrefix(messageInput, "- "),
};

document.getElementById("format-toolbar").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-fmt]");
    if (!btn) return;
    const action = FORMAT_ACTIONS[btn.dataset.fmt];
    if (action) action();
});

// ==========================================================
// Embed-конструктор
// ==========================================================

const embedToggle = document.getElementById("embed-toggle");
const embedSection = document.getElementById("embed-section");
embedToggle.addEventListener("change", () => {
    embedSection.classList.toggle("hidden", !embedToggle.checked);
});

const fieldTemplate = document.getElementById("field-template");
const embedFieldsContainer = document.getElementById("embed-fields");

document.getElementById("add-field-btn").addEventListener("click", () => {
    const node = fieldTemplate.content.cloneNode(true);
    embedFieldsContainer.appendChild(node);
});

embedFieldsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-btn")) {
        e.target.closest(".field-item").remove();
    }
});

function collectEmbed() {
    if (!embedToggle.checked) return null;

    const fields = [...embedFieldsContainer.querySelectorAll(".field-item")]
        .map((item) => ({
            name: item.querySelector(".field-name").value.trim(),
            value: item.querySelector(".field-value").value.trim(),
            inline: item.querySelector(".field-inline").checked,
        }))
        .filter((f) => f.name && f.value);

    const embed = {
        title: document.getElementById("embed-title").value.trim() || undefined,
        description: document.getElementById("embed-description").value.trim() || undefined,
        color: document.getElementById("embed-color").value || undefined,
        url: document.getElementById("embed-url").value.trim() || undefined,
        authorName: document.getElementById("embed-author").value.trim() || undefined,
        imageUrl: document.getElementById("embed-image").value.trim() || undefined,
        thumbnailUrl: document.getElementById("embed-thumbnail").value.trim() || undefined,
        footer: document.getElementById("embed-footer").value.trim() || undefined,
        timestamp: document.getElementById("embed-timestamp").checked,
        fields,
    };

    // Discord требует хотя бы одно заполненное поле у embed
    const hasContent =
        embed.title || embed.description || embed.imageUrl || embed.fields.length;
    return hasContent ? embed : null;
}

// ==========================================================
// Конструктор кнопок
// ==========================================================

const buttonsToggle = document.getElementById("buttons-toggle");
const buttonsSection = document.getElementById("buttons-section");
buttonsToggle.addEventListener("change", () => {
    buttonsSection.classList.toggle("hidden", !buttonsToggle.checked);
});

const buttonTemplate = document.getElementById("button-template");
const buttonListContainer = document.getElementById("button-list");

function addButtonItem() {
    const node = buttonTemplate.content.cloneNode(true);
    buttonListContainer.appendChild(node);
}

document.getElementById("add-button-btn").addEventListener("click", addButtonItem);

buttonListContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-btn")) {
        e.target.closest(".button-item").remove();
    }
});

buttonListContainer.addEventListener("change", (e) => {
    if (e.target.classList.contains("btn-style")) {
        const item = e.target.closest(".button-item");
        const urlInput = item.querySelector(".btn-url");
        urlInput.classList.toggle("hidden", e.target.value !== "link");
    }
});

function collectButtonRows() {
    if (!buttonsToggle.checked) return [];

    const flatButtons = [...buttonListContainer.querySelectorAll(".button-item")]
        .map((item) => {
            const style = item.querySelector(".btn-style").value;
            const label = item.querySelector(".btn-label").value.trim() || "Кнопка";
            const url = item.querySelector(".btn-url").value.trim();
            return { label, style, url: style === "link" ? url : undefined };
        })
        .filter((b) => (b.style === "link" ? !!b.url : true));

    const rows = [];
    for (let i = 0; i < flatButtons.length; i += 5) {
        rows.push(flatButtons.slice(i, i + 5));
    }
    return rows.slice(0, 5);
}

// --- Автовход, если токен уже сохранён ---
if (getToken()) {
    showApp();
}