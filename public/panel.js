const state = {
    user: null,
    guilds: [],
    guildId: null,
    channels: [],
    roles: [],
    tournaments: [],
    bannerOverride: null, // dataURL from a local upload, takes precedence over the f-banner text field
    pollTimer: null,
};

const FORMAT_LABELS = {
    single_elim: "Single Elimination",
    double_elim: "Double Elimination",
    round_robin: "Round Robin",
};

const STATUS_LABELS = { draft: "Draft", published: "Registration Open", closed: "Registration Closed" };

async function apiFetch(url, opts = {}) {
    const res = await fetch(url, {
        ...opts,
        headers: { "content-type": "application/json", ...(opts.headers || {}) },
    });
    if (res.status === 401) {
        showLogin();
        throw new Error("Not logged in");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

function showLogin() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app-screen").classList.add("hidden");
}

function showApp() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");
}

// =========================================================================
// Bootstrap
// =========================================================================

async function init() {
    try {
        const me = await apiFetch("/api/me");
        state.user = me.user;
        state.guilds = me.guilds;
        document.getElementById("user-tag").textContent = me.user.username;
        showApp();
        populateGuildSelect();
        if (state.guilds.length) await switchGuild(state.guilds[0].id);
        pollStatus();
        setInterval(pollStatus, 10_000);
    } catch (err) {
        showLogin();
    }
}

async function pollStatus() {
    try {
        const { ready, tag } = await apiFetch("/api/status");
        const el = document.getElementById("bot-status");
        el.textContent = ready ? `● online (${tag})` : "● offline";
        el.classList.toggle("offline", !ready);
    } catch (err) {
        // status endpoint doesn't require auth; ignore transient errors
    }
}

document.getElementById("logout-btn").addEventListener("click", async () => {
    await apiFetch("/api/logout", { method: "POST" }).catch(() => {});
    showLogin();
});

// =========================================================================
// Guild switching
// =========================================================================

function populateGuildSelect() {
    const select = document.getElementById("guild-select");
    select.innerHTML = "";
    if (!state.guilds.length) {
        select.innerHTML = `<option value="">No servers available — add the bot first</option>`;
        return;
    }
    for (const g of state.guilds) {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.name;
        select.appendChild(opt);
    }
}

document.getElementById("guild-select").addEventListener("change", (e) => {
    if (e.target.value) switchGuild(e.target.value);
});

async function switchGuild(guildId) {
    state.guildId = guildId;
    document.getElementById("guild-select").value = guildId;
    try {
        const { channels, roles } = await apiFetch(`/api/guilds/${guildId}`);
        state.channels = channels;
        state.roles = roles;
        populateChannelAndRoleSelects();
    } catch (err) {
        state.channels = [];
        state.roles = [];
    }
    await loadTournaments();
}

function populateChannelAndRoleSelects() {
    const channelSelect = document.getElementById("channel-select");
    channelSelect.innerHTML = state.channels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join("");

    const roleSelect = document.getElementById("f-ping-role");
    roleSelect.innerHTML =
        `<option value="">— none —</option>` + state.roles.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("");
}

// =========================================================================
// Tabs
// =========================================================================

document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
        btn.classList.add("active");
        document.getElementById(`${btn.dataset.tab}-tab`).classList.remove("hidden");

        if (btn.dataset.tab === "dashboard") {
            startPolling();
        } else {
            stopPolling();
        }
        if (btn.dataset.tab === "editor" && !document.getElementById("tournament-id").value) {
            resetEditorForm();
        }
    });
});

function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(loadTournaments, 5000);
}
function stopPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
}

// =========================================================================
// Dashboard: tournament list
// =========================================================================

async function loadTournaments() {
    if (!state.guildId) return;
    try {
        const { tournaments } = await apiFetch(`/api/tournaments?guildId=${state.guildId}`);
        state.tournaments = tournaments;
        renderTournamentList();
    } catch (err) {
        // transient — keep showing the last known list
    }
}

function renderTournamentList() {
    const container = document.getElementById("tournament-list");
    if (!state.tournaments.length) {
        container.innerHTML = `<p class="hint">No tournaments yet — create one in the "New tournament" tab.</p>`;
        return;
    }

    container.innerHTML = state.tournaments
        .map((t) => {
            const meta = [t.game, FORMAT_LABELS[t.format] || t.format, t.starts_at ? new Date(t.starts_at).toLocaleString() : "no start time set"]
                .filter(Boolean)
                .join(" · ");
            const actions = [];
            if (t.status === "draft") {
                actions.push(`<button data-action="edit" data-id="${t.id}">Edit</button>`);
                actions.push(`<button data-action="publish" data-id="${t.id}">Publish</button>`);
            }
            if (t.status === "published") {
                actions.push(`<button data-action="edit" data-id="${t.id}">Edit</button>`);
                actions.push(`<button data-action="close" data-id="${t.id}">Close</button>`);
            }
            if (t.status !== "draft") {
                actions.push(`<button data-action="participants" data-id="${t.id}" class="secondary-btn">Participants</button>`);
            }
            actions.push(`<button data-action="delete" data-id="${t.id}" class="secondary-btn">Delete</button>`);

            return `
                <div class="tournament-row">
                    <div>
                        <div class="tournament-name">${escapeHtml(t.name)}</div>
                        <div class="tournament-meta">${escapeHtml(meta)}</div>
                    </div>
                    <div class="tournament-meta">${t.activeCount}/${t.max_participants} slots</div>
                    <span class="badge badge-${t.status}">${STATUS_LABELS[t.status]}</span>
                    <div class="row-actions">${actions.join("")}</div>
                </div>`;
        })
        .join("");
}

document.getElementById("tournament-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    const tournament = state.tournaments.find((t) => t.id === id);

    if (action === "edit") return editTournament(tournament);
    if (action === "publish") return publishTournament(id);
    if (action === "close") return closeTournament(id);
    if (action === "delete") return deleteTournament(id);
    if (action === "participants") return showParticipants(tournament);
});

async function publishTournament(id) {
    try {
        await apiFetch(`/api/tournaments/${id}/publish`, { method: "POST" });
        await loadTournaments();
    } catch (err) {
        alert(err.message);
    }
}

async function closeTournament(id) {
    if (!confirm("Close registration for this tournament?")) return;
    try {
        await apiFetch(`/api/tournaments/${id}/close`, { method: "POST" });
        await loadTournaments();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteTournament(id) {
    if (!confirm("Delete this tournament? This can't be undone.")) return;
    try {
        await apiFetch(`/api/tournaments/${id}`, { method: "DELETE" });
        await loadTournaments();
    } catch (err) {
        alert(err.message);
    }
}

async function showParticipants(tournament) {
    const card = document.getElementById("participants-card");
    card.classList.remove("hidden");
    document.getElementById("participants-title").textContent = `Participants — ${tournament.name}`;
    document.getElementById("csv-export-link").href = `/api/tournaments/${tournament.id}/participants.csv`;

    const { participants } = await apiFetch(`/api/tournaments/${tournament.id}/participants`);
    const body = document.getElementById("participants-body");
    const empty = document.getElementById("participants-empty");
    if (!participants.length) {
        body.innerHTML = "";
        empty.classList.remove("hidden");
    } else {
        empty.classList.add("hidden");
        body.innerHTML = participants
            .map((p) => `<tr><td>${escapeHtml(p.username || p.user_id)}</td><td>${new Date(p.registered_at).toLocaleString()}</td></tr>`)
            .join("");
    }
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// =========================================================================
// Editor: constructor form + live preview
// =========================================================================

function editTournament(t) {
    document.querySelector('.tab-btn[data-tab="editor"]').click();
    document.getElementById("editor-heading").textContent = `Edit: ${t.name}`;
    document.getElementById("tournament-id").value = t.id;
    document.getElementById("channel-select").value = t.channel_id || "";
    document.getElementById("f-name").value = t.name || "";
    document.getElementById("f-game").value = t.game || "";
    document.getElementById("f-format").value = t.format || "single_elim";
    document.getElementById("f-starts-at").value = msToLocalInputValue(t.starts_at);
    document.getElementById("f-max").value = t.max_participants || 32;
    document.getElementById("f-description").value = t.description || "";
    document.getElementById("f-color").value = t.color || "#8b5cf6";
    document.getElementById("f-ping-role").value = t.ping_role_id || "";
    document.getElementById("f-reminder").value = t.reminder_hours || "";
    state.bannerOverride = null;
    document.getElementById("f-banner").value = t.banner && !t.banner.startsWith("data:") ? t.banner : "";
    if (t.banner && t.banner.startsWith("data:")) state.bannerOverride = t.banner;
    renderPreview();
}

function resetEditorForm() {
    document.getElementById("editor-heading").textContent = "New tournament";
    document.getElementById("tournament-id").value = "";
    document.getElementById("f-name").value = "";
    document.getElementById("f-game").value = "";
    document.getElementById("f-format").value = "single_elim";
    document.getElementById("f-starts-at").value = "";
    document.getElementById("f-max").value = 32;
    document.getElementById("f-description").value = "";
    document.getElementById("f-color").value = "#8b5cf6";
    document.getElementById("f-ping-role").value = "";
    document.getElementById("f-reminder").value = "";
    document.getElementById("f-banner").value = "";
    document.getElementById("ai-prize").value = "";
    document.getElementById("ai-result").textContent = "";
    state.bannerOverride = null;
    renderPreview();
}

document.getElementById("editor-reset-btn").addEventListener("click", resetEditorForm);

function msToLocalInputValue(ms) {
    if (!ms) return "";
    const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
}

function localInputValueToMs(value) {
    return value ? new Date(value).getTime() : null;
}

function collectFormData() {
    return {
        channelId: document.getElementById("channel-select").value || null,
        name: document.getElementById("f-name").value.trim(),
        game: document.getElementById("f-game").value.trim() || null,
        format: document.getElementById("f-format").value,
        startsAt: localInputValueToMs(document.getElementById("f-starts-at").value),
        maxParticipants: parseInt(document.getElementById("f-max").value, 10) || 32,
        description: document.getElementById("f-description").value.trim() || null,
        banner: state.bannerOverride || document.getElementById("f-banner").value.trim() || null,
        color: document.getElementById("f-color").value,
        pingRoleId: document.getElementById("f-ping-role").value || null,
        reminderHours: document.getElementById("f-reminder").value ? parseInt(document.getElementById("f-reminder").value, 10) : null,
    };
}

document.getElementById("save-btn").addEventListener("click", async () => {
    const data = collectFormData();
    if (!data.name) return (document.getElementById("save-result").textContent = "❌ Name is required");
    if (!data.channelId) return (document.getElementById("save-result").textContent = "❌ Pick a channel");

    const id = document.getElementById("tournament-id").value;
    const resultEl = document.getElementById("save-result");
    resultEl.textContent = "Saving…";
    try {
        if (id) {
            await apiFetch(`/api/tournaments/${id}`, { method: "PATCH", body: JSON.stringify(data) });
        } else {
            await apiFetch("/api/tournaments", { method: "POST", body: JSON.stringify({ guildId: state.guildId, ...data }) });
        }
        resultEl.textContent = "✅ Saved";
        await loadTournaments();
        document.querySelector('.tab-btn[data-tab="dashboard"]').click();
    } catch (err) {
        resultEl.textContent = "❌ " + err.message;
    }
});

// --- Live preview (debounced, fully local — no network calls per keystroke) ---
let previewDebounce = null;
function schedulePreview() {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(renderPreview, 150);
}

["f-name", "f-game", "f-format", "f-starts-at", "f-max", "f-description", "f-banner", "f-color", "tournament-id"].forEach((id) => {
    document.getElementById(id).addEventListener("input", schedulePreview);
    document.getElementById(id).addEventListener("change", schedulePreview);
});

function renderPreview() {
    const data = collectFormData();
    const isEditing = Boolean(document.getElementById("tournament-id").value);
    const existing = isEditing ? state.tournaments.find((t) => t.id === document.getElementById("tournament-id").value) : null;
    const status = existing ? existing.status : "draft";
    const activeCount = existing ? existing.activeCount : 0;

    document.getElementById("pv-title").textContent = data.name || "Tournament name";
    const descEl = document.getElementById("pv-desc");
    descEl.textContent = data.description || "";
    descEl.classList.toggle("hidden", !data.description);

    const fields = [];
    if (data.game) fields.push(["Game", data.game]);
    fields.push(["Format", FORMAT_LABELS[data.format] || data.format]);
    fields.push(["Slots", `${activeCount}/${data.maxParticipants}`]);
    if (data.startsAt) fields.push(["Starts", new Date(data.startsAt).toLocaleString()]);
    document.getElementById("pv-fields").innerHTML = fields
        .map(([name, value]) => `<div class="dp-field"><span class="dp-field-name">${escapeHtml(name)}</span> — <span class="dp-field-value">${escapeHtml(value)}</span></div>`)
        .join("");

    const imgEl = document.getElementById("pv-image");
    if (data.banner) {
        imgEl.src = data.banner;
        imgEl.classList.remove("hidden");
    } else {
        imgEl.classList.add("hidden");
    }

    document.getElementById("pv-footer").textContent = STATUS_LABELS[status];
    document.querySelector(".dp-embed").style.borderLeftColor = data.color;

    const registerBtn = document.getElementById("pv-register-btn");
    const isFull = activeCount >= data.maxParticipants;
    registerBtn.textContent = isFull ? "Slots full" : "✅ Register";
    registerBtn.style.opacity = status === "published" && !isFull ? "1" : "0.5";
}

// --- Banner upload (drag & drop or click) ---
const bannerDropzone = document.getElementById("banner-dropzone");
const bannerFileInput = document.getElementById("banner-file");

bannerDropzone.addEventListener("click", () => bannerFileInput.click());
bannerDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    bannerDropzone.classList.add("dragover");
});
bannerDropzone.addEventListener("dragleave", () => bannerDropzone.classList.remove("dragover"));
bannerDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    bannerDropzone.classList.remove("dragover");
    if (e.dataTransfer.files[0]) handleBannerFile(e.dataTransfer.files[0]);
});
bannerFileInput.addEventListener("change", () => {
    if (bannerFileInput.files[0]) handleBannerFile(bannerFileInput.files[0]);
});

function handleBannerFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        state.bannerOverride = reader.result;
        document.getElementById("f-banner").value = "";
        renderPreview();
    };
    reader.readAsDataURL(file);
}

document.getElementById("f-banner").addEventListener("input", () => {
    state.bannerOverride = null;
});

// --- AI description generator ---
document.getElementById("ai-generate-btn").addEventListener("click", async () => {
    const resultEl = document.getElementById("ai-result");
    resultEl.textContent = "Thinking…";
    try {
        const { description } = await apiFetch("/api/ai/generate-description", {
            method: "POST",
            body: JSON.stringify({
                game: document.getElementById("f-game").value.trim(),
                format: FORMAT_LABELS[document.getElementById("f-format").value],
                prize: document.getElementById("ai-prize").value.trim(),
            }),
        });
        document.getElementById("f-description").value = description;
        resultEl.textContent = "✅ Generated — feel free to edit it";
        renderPreview();
    } catch (err) {
        resultEl.textContent = "❌ " + err.message;
    }
});

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

init();
