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
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
}

// --- Login ---
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
        if (!res.ok) throw new Error(data.error || "Wrong password");
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
    loadEmojis();
    updatePreview();
}

// --- Bot status ---
async function loadStatus() {
    const statusEl = document.getElementById("bot-status");
    try {
        const data = await apiFetch("/api/status");
        statusEl.textContent = data.ready ? `online: ${data.tag}` : "connecting…";
        statusEl.classList.toggle("offline", !data.ready);
    } catch (err) {
        statusEl.textContent = "error: " + err.message;
        statusEl.classList.add("offline");
    }
}

// --- Guilds and channels ---
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
        guildSelect.innerHTML = `<option>Error: ${err.message}</option>`;
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

// ==========================================================
// Local files (uploading images instead of / alongside a link)
// ==========================================================

// State of selected local images: { name, dataUrl }
const fileState = {
    image: null,        // the embed's big image
    thumbnail: null,     // corner logo
    authorIcon: null,    // organization icon
    attachments: [],      // plain images sent alongside the message
};

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Couldn't read the file"));
        reader.readAsDataURL(file);
    });
}

function renderThumbRow(containerId, items, onRemove) {
    const el = document.getElementById(containerId);
    el.innerHTML = "";
    items.forEach((item, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "file-thumb";
        const img = document.createElement("img");
        img.src = item.dataUrl;
        const rm = document.createElement("button");
        rm.type = "button";
        rm.textContent = "✕";
        rm.addEventListener("click", () => onRemove(idx));
        wrap.appendChild(img);
        wrap.appendChild(rm);
        el.appendChild(wrap);
    });
}

function refreshSingleFilePreview(kind) {
    const map = {
        image: "image-preview",
        thumbnail: "thumbnail-preview",
    };
    const containerId = map[kind];
    if (!containerId) return;
    const item = fileState[kind];
    renderThumbRow(containerId, item ? [item] : [], () => {
        fileState[kind] = null;
        refreshSingleFilePreview(kind);
        updatePreview();
    });
}

function refreshAttachmentsPreview() {
    renderThumbRow("attachments-preview", fileState.attachments, (idx) => {
        fileState.attachments.splice(idx, 1);
        refreshAttachmentsPreview();
        updatePreview();
    });
}

function setupSingleImageUpload({ dropzoneId, inputId, urlInputId, kind }) {
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    const urlInput = urlInputId ? document.getElementById(urlInputId) : null;

    dropzone.addEventListener("click", () => input.click());
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", async (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) await handleSingleFile(file);
    });
    input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (file) await handleSingleFile(file);
        input.value = "";
    });

    async function handleSingleFile(file) {
        if (!file.type.startsWith("image/")) return;
        const dataUrl = await readFileAsDataUrl(file);
        fileState[kind] = { name: file.name, dataUrl };
        if (urlInput) urlInput.value = ""; // the file takes priority over the link
        refreshSingleFilePreview(kind);
        updatePreview();
    }
}

setupSingleImageUpload({
    dropzoneId: "image-dropzone",
    inputId: "embed-image-file",
    urlInputId: "embed-image",
    kind: "image",
});
setupSingleImageUpload({
    dropzoneId: "thumbnail-dropzone",
    inputId: "embed-thumbnail-file",
    urlInputId: "embed-thumbnail",
    kind: "thumbnail",
});

// Organization icon — no dropzone, just a small upload button next to the link field
document.getElementById("embed-author-icon-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    fileState.authorIcon = { name: file.name, dataUrl };
    document.getElementById("embed-author-icon").value = "";
    e.target.value = "";
    updatePreview();
});

// If the user starts typing a link manually — clear the selected file
document.getElementById("embed-image").addEventListener("input", () => {
    if (document.getElementById("embed-image").value.trim()) {
        fileState.image = null;
        refreshSingleFilePreview("image");
    }
    updatePreview();
});
document.getElementById("embed-thumbnail").addEventListener("input", () => {
    if (document.getElementById("embed-thumbnail").value.trim()) {
        fileState.thumbnail = null;
        refreshSingleFilePreview("thumbnail");
    }
    updatePreview();
});
document.getElementById("embed-author-icon").addEventListener("input", () => {
    if (document.getElementById("embed-author-icon").value.trim()) {
        fileState.authorIcon = null;
    }
    updatePreview();
});

// --- Plain attachments (drag images straight into the message) ---
const attachmentsDropzone = document.getElementById("attachments-dropzone");
const attachmentsInput = document.getElementById("attachments-input");

attachmentsDropzone.addEventListener("click", () => attachmentsInput.click());
attachmentsDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    attachmentsDropzone.classList.add("dragover");
});
attachmentsDropzone.addEventListener("dragleave", () => attachmentsDropzone.classList.remove("dragover"));
attachmentsDropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    attachmentsDropzone.classList.remove("dragover");
    await addAttachmentFiles(e.dataTransfer.files);
});
attachmentsInput.addEventListener("change", async () => {
    await addAttachmentFiles(attachmentsInput.files);
    attachmentsInput.value = "";
});

async function addAttachmentFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    for (const file of files.slice(0, 10 - fileState.attachments.length)) {
        const dataUrl = await readFileAsDataUrl(file);
        fileState.attachments.push({ name: file.name, dataUrl });
    }
    refreshAttachmentsPreview();
    updatePreview();
}

// ==========================================================
// Emoji picker (including emoji from any guild the bot is in)
// ==========================================================

let emojiCache = null;
const QUICK_UNICODE_EMOJIS = [
    "✅", "❌", "🔥", "🏆", "🎮", "🎉", "⚔️", "🛡️", "⭐", "💥",
    "👑", "🚀", "📢", "🔔", "🕹️", "💰", "🥇", "🥈", "🥉", "❤️",
];

async function loadEmojis() {
    try {
        const data = await apiFetch("/api/emojis");
        emojiCache = data.emojis || [];
    } catch (err) {
        emojiCache = [];
    }
}

let emojiTargetId = null;
const emojiPicker = document.getElementById("emoji-picker");
const emojiListEl = document.getElementById("emoji-list");
const emojiSearchEl = document.getElementById("emoji-search");

document.querySelectorAll(".emoji-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        emojiTargetId = btn.dataset.fmtTarget;
        openEmojiPicker(btn);
    });
});

function openEmojiPicker(anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    emojiPicker.style.top = `${window.scrollY + rect.bottom + 6}px`;
    emojiPicker.style.left = `${window.scrollX + rect.left}px`;
    emojiPicker.classList.remove("hidden");
    emojiSearchEl.value = "";
    renderEmojiList("");
    emojiSearchEl.focus();
}

function closeEmojiPicker() {
    emojiPicker.classList.add("hidden");
}

document.addEventListener("click", (e) => {
    if (!emojiPicker.contains(e.target)) closeEmojiPicker();
});

emojiSearchEl.addEventListener("input", () => renderEmojiList(emojiSearchEl.value.trim().toLowerCase()));

function renderEmojiList(filter) {
    emojiListEl.innerHTML = "";

    const quick = QUICK_UNICODE_EMOJIS.filter((e) => !filter || e.includes(filter));
    quick.forEach((emoji) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "emoji-option";
        btn.textContent = emoji;
        btn.title = "Standard emoji";
        btn.addEventListener("click", () => pickEmoji(emoji));
        emojiListEl.appendChild(btn);
    });

    const custom = (emojiCache || []).filter(
        (e) => !filter || e.name.toLowerCase().includes(filter)
    );
    custom.forEach((emoji) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "emoji-option custom";
        btn.title = `:${emoji.name}: — ${emoji.guildName}`;
        if (emoji.url) {
            const img = document.createElement("img");
            img.src = emoji.url;
            img.alt = emoji.name;
            btn.appendChild(img);
        } else {
            btn.textContent = emoji.name;
        }
        const tag = `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
        btn.addEventListener("click", () => pickEmoji(tag));
        emojiListEl.appendChild(btn);
    });

    if (!quick.length && !custom.length) {
        emojiListEl.innerHTML = `<p class="hint">Nothing found</p>`;
    }
}

function pickEmoji(value) {
    const targetEl = document.getElementById(emojiTargetId);
    if (targetEl) {
        if (targetEl.id === "reaction-emoji") {
            targetEl.value = value; // a reaction needs exactly one emoji
        } else {
            insertAtCursor(targetEl, value, "", true);
        }
        targetEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    closeEmojiPicker();
    updatePreview();
}

// ==========================================================
// Server role picker (mirrors the emoji picker) — inserts
// a mention like <@&roleId> into the text
// ==========================================================

const roleCache = {}; // guildId -> roles[]
let roleTargetId = null;
const rolePicker = document.getElementById("role-picker");
const roleListEl = document.getElementById("role-list");
const roleSearchEl = document.getElementById("role-search");

document.querySelectorAll(".role-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        roleTargetId = btn.dataset.fmtTarget;
        openRolePicker(btn);
    });
});

async function openRolePicker(anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    rolePicker.style.top = `${window.scrollY + rect.bottom + 6}px`;
    rolePicker.style.left = `${window.scrollX + rect.left}px`;
    rolePicker.classList.remove("hidden");
    roleSearchEl.value = "";
    roleSearchEl.focus();

    const guildId = document.getElementById("guild-select").value;
    if (!guildId) {
        roleListEl.innerHTML = `<p class="hint">Pick a server at the top of the form first</p>`;
        return;
    }

    roleListEl.innerHTML = `<p class="hint">Loading…</p>`;
    try {
        const roles = await loadRolesForGuild(guildId);
        renderRoleList(roles, "");
    } catch (err) {
        roleListEl.innerHTML = `<p class="hint">Error: ${err.message}</p>`;
    }
}

async function loadRolesForGuild(guildId) {
    if (roleCache[guildId]) return roleCache[guildId];
    const data = await apiFetch(`/api/roles?guildId=${encodeURIComponent(guildId)}`);
    roleCache[guildId] = data.roles || [];
    return roleCache[guildId];
}

function closeRolePicker() {
    rolePicker.classList.add("hidden");
}

document.addEventListener("click", (e) => {
    if (!rolePicker.contains(e.target)) closeRolePicker();
});

roleSearchEl.addEventListener("input", () => {
    const guildId = document.getElementById("guild-select").value;
    renderRoleList(roleCache[guildId] || [], roleSearchEl.value.trim().toLowerCase());
});

function renderRoleList(roles, filter) {
    roleListEl.innerHTML = "";

    const filtered = roles.filter((r) => !filter || r.name.toLowerCase().includes(filter));
    filtered.forEach((role) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "role-option";
        btn.title = `@${role.name}`;

        const dot = document.createElement("span");
        dot.className = "role-color-dot";
        dot.style.background = role.color || "#99aab5";
        btn.appendChild(dot);

        const label = document.createElement("span");
        label.className = "role-name";
        label.textContent = role.name;
        btn.appendChild(label);

        btn.addEventListener("click", () => pickRole(`<@&${role.id}>`));
        roleListEl.appendChild(btn);
    });

    if (!filtered.length) {
        roleListEl.innerHTML = `<p class="hint">Nothing found</p>`;
    }
}

function pickRole(mentionTag) {
    const targetEl = document.getElementById(roleTargetId);
    if (targetEl) {
        insertAtCursor(targetEl, mentionTag, "", true);
        targetEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    closeRolePicker();
    updatePreview();
}

// Changing the selected server — close any open role picker,
// since the role list depends on the server
document.getElementById("guild-select").addEventListener("change", closeRolePicker);

// ==========================================================
// Text formatting (bold/italic/spoiler/link)
// ==========================================================

function insertAtCursor(el, before, after = "", noWrapSelection = false) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const value = el.value;
    const selected = noWrapSelection ? "" : (value.slice(start, end) || "text");
    el.value = value.slice(0, start) + before + selected + after + value.slice(end);
    const cursorPos = start + before.length + selected.length + after.length;
    el.focus();
    el.setSelectionRange(cursorPos, cursorPos);
}

// Headings (#, ##, ###), quotes (>), and lists (-) are line prefixes rather
// than wrappers around the selection, so they're handled separately.
// Clicking the same button again removes the prefix (toggle).
function toggleLinePrefix(el, prefix) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const value = el.value;

    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = value.length;
    const line = value.slice(lineStart, lineEnd);

    const headingRe = /^(#{1,3}\s)/;
    const quoteRe = /^(>\s)/;
    const listRe = /^(-\s)/;

    let newLine;
    if (/^#{1,3}\s$/.test(prefix)) {
        const match = line.match(headingRe);
        if (match && match[1] === prefix) {
            newLine = line.slice(match[1].length);
        } else if (match) {
            newLine = prefix + line.slice(match[1].length);
        } else {
            newLine = prefix + line;
        }
    } else if (prefix === "> ") {
        newLine = quoteRe.test(line) ? line.replace(quoteRe, "") : "> " + line;
    } else if (prefix === "- ") {
        newLine = listRe.test(line) ? line.replace(listRe, "") : "- " + line;
    } else {
        newLine = prefix + line;
    }

    const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
    const diff = newLine.length - line.length;
    el.value = newValue;
    el.focus();
    el.setSelectionRange(Math.max(lineStart, start + diff), Math.max(lineStart, end + diff));
}

const FORMAT_ACTIONS = {
    h1: (el) => toggleLinePrefix(el, "# "),
    h2: (el) => toggleLinePrefix(el, "## "),
    h3: (el) => toggleLinePrefix(el, "### "),
    quote: (el) => toggleLinePrefix(el, "> "),
    list: (el) => toggleLinePrefix(el, "- "),
    bold: (el) => insertAtCursor(el, "**", "**"),
    italic: (el) => insertAtCursor(el, "*", "*"),
    underline: (el) => insertAtCursor(el, "__", "__"),
    strike: (el) => insertAtCursor(el, "~~", "~~"),
    code: (el) => insertAtCursor(el, "`", "`"),
    spoiler: (el) => insertAtCursor(el, "||", "||"),
    link: (el) => insertAtCursor(el, "[", "](https://)"),
};

document.querySelectorAll(".toolbar").forEach((toolbar) => {
    toolbar.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-fmt]");
        if (!btn) return;
        const targetEl = document.getElementById(btn.dataset.fmtTarget);
        const action = FORMAT_ACTIONS[btn.dataset.fmt];
        if (action && targetEl) {
            action(targetEl);
            targetEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
    });
});

// ==========================================================
// Message preview (to the left of the editor)
// ==========================================================

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// Looks up a role's name by its id in the already-loaded role cache (for previewing mentions)
function findRoleNameById(id) {
    for (const roles of Object.values(roleCache)) {
        const found = roles.find((r) => r.id === id);
        if (found) return found.name;
    }
    return null;
}

// Very simplified rendering of Discord markdown for the preview (doesn't cover everything, but enough for a draft)
function applyInlineMarkdown(escaped) {
    let out = escaped;
    out = out.replace(/&lt;a?:(\w+):(\d+)&gt;/g, (_, name) => `<span class="dp-custom-emoji">:${name}:</span>`);
    out = out.replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => `<span class="dp-role-mention">@${findRoleNameById(id) || "role"}</span>`);
    out = out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    out = out.replace(/__(.+?)__/g, "<u>$1</u>");
    out = out.replace(/~~(.+?)~~/g, "<s>$1</s>");
    out = out.replace(/`(.+?)`/g, '<code class="dp-code">$1</code>');
    out = out.replace(/\*(.+?)\*/g, "<i>$1</i>");
    out = out.replace(/\|\|(.+?)\|\|/g, '<span class="dp-spoiler">$1</span>');
    out = out.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return out;
}

// Each line is rendered as its own block (<div>) so headings/quotes/lists
// wrap correctly without extra <br> tags around them.
function renderMarkdownish(text) {
    if (!text) return "";

    return text
        .split("\n")
        .map((rawLine) => {
            const escaped = escapeHtml(rawLine);
            const h3 = /^###\s(.*)$/.exec(escaped);
            const h2 = /^##\s(.*)$/.exec(escaped);
            const h1 = /^#\s(.*)$/.exec(escaped);
            const quote = /^&gt;\s(.*)$/.exec(escaped);
            const item = /^-\s(.*)$/.exec(escaped);

            if (h3) return `<div class="dp-h3">${applyInlineMarkdown(h3[1])}</div>`;
            if (h2) return `<div class="dp-h2">${applyInlineMarkdown(h2[1])}</div>`;
            if (h1) return `<div class="dp-h1">${applyInlineMarkdown(h1[1])}</div>`;
            if (quote) return `<div class="dp-quote">${applyInlineMarkdown(quote[1])}</div>`;
            if (item) return `<div class="dp-list-item">• ${applyInlineMarkdown(item[1])}</div>`;
            if (!escaped) return `<div>&nbsp;</div>`;
            return `<div>${applyInlineMarkdown(escaped)}</div>`;
        })
        .join("");
}

function resolveImageSrc(fileItem, urlValue) {
    if (fileItem) return fileItem.dataUrl;
    if (urlValue && urlValue.trim()) return urlValue.trim();
    return null;
}

function updatePreview() {
    const content = document.getElementById("embed-content").value;
    const contentEl = document.getElementById("dp-content");
    contentEl.innerHTML = renderMarkdownish(content);
    contentEl.style.display = content ? "block" : "none";

    // Plain attachments
    const attEl = document.getElementById("dp-attachments");
    attEl.innerHTML = "";
    fileState.attachments.forEach((f) => {
        const img = document.createElement("img");
        img.src = f.dataUrl;
        attEl.appendChild(img);
    });
    attEl.style.display = fileState.attachments.length ? "flex" : "none";

    // Embed
    const authorName = document.getElementById("embed-author").value.trim();
    const authorIconSrc = resolveImageSrc(fileState.authorIcon, document.getElementById("embed-author-icon").value);
    const title = document.getElementById("embed-title").value.trim();
    const description = document.getElementById("embed-description").value.trim();
    const imageSrc = resolveImageSrc(fileState.image, document.getElementById("embed-image").value);
    const thumbSrc = resolveImageSrc(fileState.thumbnail, document.getElementById("embed-thumbnail").value);
    const color = document.getElementById("embed-color").value || "#8b5cf6";

    const hasEmbed = authorName || title || description || imageSrc || thumbSrc;
    const embedEl = document.getElementById("dp-embed");
    embedEl.style.display = hasEmbed ? "grid" : "none";
    embedEl.style.borderLeftColor = color;
    embedEl.classList.toggle("no-thumb", !thumbSrc);

    const authorEl = document.getElementById("dp-embed-author");
    if (authorName) {
        authorEl.style.display = "flex";
        authorEl.innerHTML =
            (authorIconSrc ? `<img src="${authorIconSrc}" />` : "") +
            `<span>${escapeHtml(authorName)}</span>`;
    } else {
        authorEl.style.display = "none";
    }

    const titleEl = document.getElementById("dp-embed-title");
    if (title) {
        titleEl.style.display = "block";
        titleEl.textContent = title;
    } else {
        titleEl.style.display = "none";
    }

    const descEl = document.getElementById("dp-embed-desc");
    if (description) {
        descEl.style.display = "block";
        descEl.innerHTML = renderMarkdownish(description);
    } else {
        descEl.style.display = "none";
    }

    const imageEl = document.getElementById("dp-embed-image");
    if (imageSrc) {
        imageEl.style.display = "block";
        imageEl.src = imageSrc;
    } else {
        imageEl.style.display = "none";
    }

    const thumbEl = document.getElementById("dp-embed-thumb");
    if (thumbSrc) {
        thumbEl.style.display = "block";
        thumbEl.src = thumbSrc;
    } else {
        thumbEl.style.display = "none";
    }

    // Reaction
    const reactionEmoji = document.getElementById("reaction-emoji").value.trim();
    const reactionEl = document.getElementById("dp-reaction");
    if (reactionEmoji) {
        reactionEl.style.display = "inline-flex";
        const customMatch = /^<a?:(\w+):(\d+)>$/.exec(reactionEmoji);
        reactionEl.innerHTML = customMatch
            ? `<span class="dp-custom-emoji">:${customMatch[1]}:</span> 1`
            : `${escapeHtml(reactionEmoji)} 1`;
    } else {
        reactionEl.style.display = "none";
    }
}

[
    "embed-content", "embed-author", "embed-author-icon", "embed-title",
    "embed-description", "embed-image", "embed-thumbnail", "embed-color", "reaction-emoji",
].forEach((id) => {
    document.getElementById(id).addEventListener("input", updatePreview);
});

// ==========================================================
// Reset the form
// ==========================================================

document.getElementById("reset-btn").addEventListener("click", () => {
    [
        "embed-content", "embed-author", "embed-author-icon", "embed-title",
        "embed-description", "embed-image", "embed-thumbnail", "reaction-emoji",
    ].forEach((id) => (document.getElementById(id).value = ""));

    document.getElementById("embed-color").value = "#8b5cf6";

    fileState.image = null;
    fileState.thumbnail = null;
    fileState.authorIcon = null;
    fileState.attachments = [];
    refreshSingleFilePreview("image");
    refreshSingleFilePreview("thumbnail");
    refreshAttachmentsPreview();

    document.getElementById("send-result").textContent = "";
    document.getElementById("send-result").className = "result";

    updatePreview();
});

// ==========================================================
// Sending the announcement
// ==========================================================

document.getElementById("send-btn").addEventListener("click", async () => {
    const guildId = document.getElementById("guild-select").value;
    const channelId = document.getElementById("channel-select").value;
    const resultEl = document.getElementById("send-result");
    resultEl.textContent = "";
    resultEl.className = "result";

    if (!guildId || !channelId) {
        resultEl.textContent = "Pick a server and a channel";
        resultEl.className = "result error";
        return;
    }

    const content = document.getElementById("embed-content").value.trim() || undefined;
    const embed = collectEmbed();

    if (!content && !embed && !fileState.attachments.length) {
        resultEl.textContent = "Fill in text, an embed, or add at least one image";
        resultEl.className = "result error";
        return;
    }

    const reactionEmoji = document.getElementById("reaction-emoji").value.trim() || undefined;

    try {
        const data = await apiFetch("/api/send", {
            method: "POST",
            body: JSON.stringify({
                guildId,
                channelId,
                content,
                embed,
                files: fileState.attachments.length ? fileState.attachments : undefined,
                reactionEmoji,
            }),
        });
        resultEl.textContent = data.reactionWarning
            ? `✅ Sent. ⚠️ ${data.reactionWarning}`
            : "✅ Sent";
        resultEl.className = "result";
    } catch (err) {
        resultEl.textContent = "❌ " + err.message;
        resultEl.className = "result error";
    }
});

// ==========================================================
// Collecting the embed from the form
// ==========================================================

function collectEmbed() {
    const embed = {
        authorName: document.getElementById("embed-author").value.trim() || undefined,
        authorIconUrl: fileState.authorIcon ? undefined : (document.getElementById("embed-author-icon").value.trim() || undefined),
        authorIconFile: fileState.authorIcon || undefined,
        title: document.getElementById("embed-title").value.trim() || undefined,
        description: document.getElementById("embed-description").value.trim() || undefined,
        imageUrl: fileState.image ? undefined : (document.getElementById("embed-image").value.trim() || undefined),
        imageFile: fileState.image || undefined,
        thumbnailUrl: fileState.thumbnail ? undefined : (document.getElementById("embed-thumbnail").value.trim() || undefined),
        thumbnailFile: fileState.thumbnail || undefined,
        color: document.getElementById("embed-color").value || undefined,
    };

    const hasContent =
        embed.title || embed.description || embed.imageUrl || embed.imageFile;
    return hasContent ? embed : null;
}

// --- Auto-login if a token is already saved ---
if (getToken()) {
    showApp();
}