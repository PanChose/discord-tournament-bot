const state = {
    user: null,
    guilds: [],
    guildId: null,
    channels: [],
    roles: [],
    tournaments: [],
    bannerOverride: null, // dataURL from a local upload, takes precedence over the f-banner text field
    thumbnailOverride: null,
    authorIconOverride: null,
    reactionEmoji: null, // null, or { id: string|null, name: string }
    pollTimer: null,
    emojis: null, // cached custom emojis for the current guild, fetched lazily on first use
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

async function loadInviteLink() {
    try {
        const { url } = await apiFetch("/api/bot-invite-url");
        document.getElementById("invite-bot-link").href = url;
        document.getElementById("invite-bot-link-app").href = url;
    } catch (err) {
        // non-critical — the buttons just stay pointed at "#"
    }
}

async function init() {
    loadInviteLink();
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
    state.emojis = null; // custom emojis are per-guild — drop the old server's cache
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
            if (t.matcherino_bounty_id) {
                actions.push(`<button data-action="matcherino-sync" data-id="${t.id}" class="secondary-btn" title="Re-check Matcherino now">🔄 Sync</button>`);
            }
            actions.push(`<button data-action="delete" data-id="${t.id}" class="secondary-btn">Delete</button>`);

            const usingMatcherino = t.matcherino_bounty_id && t.matcherino_entrants !== null && t.matcherino_entrants !== undefined;
            const slots = usingMatcherino ? t.matcherino_entrants : t.activeCount;
            const hasPrizePool = t.matcherino_prize_pool !== null && t.matcherino_prize_pool !== undefined;
            const matcherinoLine = t.matcherino_bounty_id
                ? `<div class="tournament-meta">🔗 Matcherino #${escapeHtml(t.matcherino_bounty_id)}${
                      hasPrizePool ? ` — ${formatPrizePool(t.matcherino_prize_pool)} prize pool` : ""
                  }${
                      usingMatcherino
                          ? ` — last checked ${t.matcherino_checked_at ? timeAgo(t.matcherino_checked_at) : "just now"}`
                          : " — not checked yet"
                  }</div>`
                : "";

            return `
                <div class="tournament-row">
                    <div>
                        <div class="tournament-name">${escapeHtml(t.name)}</div>
                        <div class="tournament-meta">${escapeHtml(meta)}</div>
                        ${matcherinoLine}
                    </div>
                    <div class="tournament-meta">${slots}/${t.max_participants} teams</div>
                    <span class="badge badge-${t.status}">${STATUS_LABELS[t.status]}</span>
                    <div class="row-actions">${actions.join("")}</div>
                </div>`;
        })
        .join("");
}

function timeAgo(ms) {
    const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
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
    if (action === "matcherino-sync") return syncMatcherino(id, btn);
});

async function syncMatcherino(id, btn) {
    const originalText = btn.textContent;
    btn.textContent = "⏳ …";
    btn.disabled = true;
    try {
        await apiFetch(`/api/tournaments/${id}/matcherino-sync`, { method: "POST" });
        await loadTournaments();
    } catch (err) {
        alert(err.message);
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

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
// Custom date/time picker — a small calendar + 12-hour time picker that
// replaces the browser's native <input type="datetime-local"> popup, which
// renders in the OS's own (usually light) theme and clashes with the rest
// of the dark UI. Used for both "Starts" and "Remind at".
// =========================================================================

function createDateTimePicker(root, defaultLabel) {
    const toggle = root.querySelector("[data-dt-toggle]");
    const label = root.querySelector("[data-dt-label]");
    const panel = root.querySelector("[data-dt-panel]");

    const picker = { value: null, onChange: null };
    let viewYear, viewMonth, hour12, minute, ampm;

    function formatLabel(ms) {
        if (!ms) return defaultLabel;
        return new Date(ms).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    }

    // Loads viewYear/viewMonth/hour12/minute/ampm from the current value (or
    // "now, rounded to noon" when nothing's picked yet) whenever the panel opens.
    function syncTimeFromValue() {
        const d = picker.value ? new Date(picker.value) : new Date(new Date().setHours(12, 0, 0, 0));
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
        const h24 = d.getHours();
        hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
        ampm = h24 < 12 ? "AM" : "PM";
        minute = d.getMinutes();
    }

    function hour24() {
        const h = hour12 % 12;
        return ampm === "AM" ? h : h + 12;
    }

    function setValue(ms) {
        picker.value = ms || null;
        label.textContent = formatLabel(picker.value);
        toggle.classList.toggle("has-value", Boolean(picker.value));
        if (picker.onChange) picker.onChange(picker.value);
    }

    function applyDay(day) {
        setValue(new Date(viewYear, viewMonth, day, hour24(), minute, 0, 0).getTime());
        renderCalendar();
    }

    function applyTimeChange() {
        const base = picker.value ? new Date(picker.value) : new Date(viewYear, viewMonth, new Date().getDate());
        setValue(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour24(), minute, 0, 0).getTime());
    }

    function shiftMonth(delta) {
        viewMonth += delta;
        if (viewMonth < 0) {
            viewMonth = 11;
            viewYear -= 1;
        } else if (viewMonth > 11) {
            viewMonth = 0;
            viewYear += 1;
        }
        renderCalendar();
    }

    function renderCalendar() {
        const monthLabel = panel.querySelector('[data-el="month-label"]');
        const grid = panel.querySelector('[data-el="grid"]');
        monthLabel.textContent = new Date(viewYear, viewMonth, 1).toLocaleString([], { month: "long", year: "numeric" });

        const startOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday-first
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const selected = picker.value ? new Date(picker.value) : null;
        const today = new Date();

        let html = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => `<div class="dt-cal-dow">${d}</div>`).join("");
        for (let i = 0; i < startOffset; i++) html += `<div class="dt-cal-day empty"></div>`;
        for (let day = 1; day <= daysInMonth; day++) {
            const isSelected = selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day;
            const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
            html += `<button type="button" class="dt-cal-day${isSelected ? " selected" : ""}${isToday ? " today" : ""}" data-day="${day}">${day}</button>`;
        }
        grid.innerHTML = html;
        grid.querySelectorAll("[data-day]").forEach((btn) => {
            btn.addEventListener("click", () => applyDay(parseInt(btn.dataset.day, 10)));
        });
    }

    function syncControls() {
        panel.querySelector('[data-el="hour"]').value = String(hour12);
        panel.querySelector('[data-el="minute"]').value = String(minute);
        panel.querySelectorAll("[data-ampm]").forEach((btn) => btn.classList.toggle("active", btn.dataset.ampm === ampm));
    }

    function renderPanel() {
        const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1)
            .map((h) => `<option value="${h}">${String(h).padStart(2, "0")}</option>`)
            .join("");
        const minuteOptions = Array.from({ length: 60 }, (_, i) => i)
            .map((m) => `<option value="${m}">${String(m).padStart(2, "0")}</option>`)
            .join("");

        panel.innerHTML = `
            <div class="dt-cal-header">
                <button type="button" data-act="prev">‹</button>
                <span data-el="month-label"></span>
                <button type="button" data-act="next">›</button>
            </div>
            <div class="dt-cal-grid" data-el="grid"></div>
            <div class="dt-time-row">
                <select data-el="hour">${hourOptions}</select>
                <span>:</span>
                <select data-el="minute">${minuteOptions}</select>
                <div class="dt-ampm">
                    <button type="button" data-ampm="AM">AM</button>
                    <button type="button" data-ampm="PM">PM</button>
                </div>
            </div>
            <div class="dt-actions">
                <button type="button" class="secondary-btn" data-act="clear">Clear</button>
                <button type="button" class="secondary-btn" data-act="today">Today</button>
            </div>`;

        panel.querySelector('[data-act="prev"]').addEventListener("click", () => shiftMonth(-1));
        panel.querySelector('[data-act="next"]').addEventListener("click", () => shiftMonth(1));
        panel.querySelector('[data-act="clear"]').addEventListener("click", () => {
            setValue(null);
            closePanel();
        });
        panel.querySelector('[data-act="today"]').addEventListener("click", () => {
            const now = new Date();
            viewYear = now.getFullYear();
            viewMonth = now.getMonth();
            applyDay(now.getDate());
        });
        panel.querySelector('[data-el="hour"]').addEventListener("change", (e) => {
            hour12 = parseInt(e.target.value, 10);
            applyTimeChange();
        });
        panel.querySelector('[data-el="minute"]').addEventListener("change", (e) => {
            minute = parseInt(e.target.value, 10);
            applyTimeChange();
        });
        panel.querySelectorAll("[data-ampm]").forEach((btn) => {
            btn.addEventListener("click", () => {
                ampm = btn.dataset.ampm;
                applyTimeChange();
                syncControls();
            });
        });

        renderCalendar();
        syncControls();
    }

    function openPanel() {
        closeAllPopovers(panel);
        syncTimeFromValue();
        renderPanel();
        panel.classList.remove("hidden");
    }

    function closePanel() {
        panel.classList.add("hidden");
    }

    toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        if (panel.classList.contains("hidden")) openPanel();
        else closePanel();
    });

    document.addEventListener("click", (e) => {
        if (!root.contains(e.target)) closePanel();
    });

    picker.set = setValue;
    picker.get = () => picker.value;
    return picker;
}

const startsAtPicker = createDateTimePicker(document.querySelector('.dt-field[data-dt="starts"]'), "Pick a date & time");
const remindAtPicker = createDateTimePicker(document.querySelector('.dt-field[data-dt="remind"]'), "No reminder");
startsAtPicker.onChange = schedulePreview;

// =========================================================================
// Editor: constructor form + live preview
// =========================================================================

// Banner/thumbnail/author-icon all store either a pasted URL (goes in the
// text input) or a local upload (goes in state as a data: URL, text input
// stays empty) — this fills both correctly from whichever the DB has.
function setImageField(textInputId, overrideKey, value) {
    const isUpload = Boolean(value) && value.startsWith("data:");
    state[overrideKey] = isUpload ? value : null;
    document.getElementById(textInputId).value = isUpload ? "" : value || "";
}

function editTournament(t) {
    document.querySelector('.tab-btn[data-tab="editor"]').click();
    document.getElementById("editor-heading").textContent = `Edit: ${t.name}`;
    document.getElementById("tournament-id").value = t.id;
    document.getElementById("channel-select").value = t.channel_id || "";
    document.getElementById("f-name").value = t.name || "";
    document.getElementById("f-game").value = t.game || "";
    document.getElementById("f-format").value = t.format || "single_elim";
    startsAtPicker.set(t.starts_at || null);
    document.getElementById("f-max").value = t.max_participants || 32;
    document.getElementById("f-description").value = t.description || "";
    document.getElementById("f-external-url").value = t.external_url || "";
    document.getElementById("f-color").value = t.color || "#8b5cf6";
    document.getElementById("f-ping-role").value = t.ping_role_id || "";
    document.getElementById("f-ping-on-publish").checked = Boolean(t.ping_on_publish);
    document.getElementById("f-author-name").value = t.author_name || "";
    remindAtPicker.set(t.reminder_at || null);
    setImageField("f-banner", "bannerOverride", t.banner);
    setImageField("f-thumbnail", "thumbnailOverride", t.thumbnail);
    setImageField("f-author-icon", "authorIconOverride", t.author_icon);
    setReactionEmoji(t.reaction_emoji_name ? { id: t.reaction_emoji_id, name: t.reaction_emoji_name } : null);
    updateMatcherinoStatus();
    renderPreview();
}

function resetEditorForm() {
    document.getElementById("editor-heading").textContent = "New tournament";
    document.getElementById("tournament-id").value = "";
    document.getElementById("f-name").value = "";
    document.getElementById("f-game").value = "";
    document.getElementById("f-format").value = "single_elim";
    startsAtPicker.set(null);
    document.getElementById("f-max").value = 32;
    document.getElementById("f-description").value = "";
    document.getElementById("f-external-url").value = "";
    document.getElementById("f-color").value = "#8b5cf6";
    document.getElementById("f-ping-role").value = "";
    document.getElementById("f-ping-on-publish").checked = false;
    document.getElementById("f-author-name").value = "";
    remindAtPicker.set(null);
    setImageField("f-banner", "bannerOverride", null);
    setImageField("f-thumbnail", "thumbnailOverride", null);
    setImageField("f-author-icon", "authorIconOverride", null);
    setReactionEmoji(null);
    document.getElementById("ai-prize").value = "";
    document.getElementById("ai-result").textContent = "";
    updateMatcherinoStatus();
    renderPreview();
}

// Mirrors lib/matcherino.js's regex so the organizer sees this before saving.
const MATCHERINO_URL_RE = /matcherino\.com\/(?:[^/?#]+\/)?tournaments\/(\d+)/i;

// Mirrors lib/tournaments.js's formatPrizePool — this file can't require() it.
function formatPrizePool(amount) {
    const rounded = Math.round(amount * 100) / 100;
    return `$${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

function updateMatcherinoStatus() {
    const statusEl = document.getElementById("matcherino-status");
    const url = document.getElementById("f-external-url").value.trim();
    const match = MATCHERINO_URL_RE.exec(url);
    if (!match) {
        statusEl.classList.add("hidden");
        return;
    }

    const id = document.getElementById("tournament-id").value;
    const existing = id ? state.tournaments.find((t) => t.id === id) : null;
    const known = existing && existing.matcherino_bounty_id === match[1] && existing.matcherino_entrants !== null && existing.matcherino_entrants !== undefined;
    const hasPrizePool = existing && existing.matcherino_prize_pool !== null && existing.matcherino_prize_pool !== undefined;
    const prizeSuffix = hasPrizePool ? `, ${formatPrizePool(existing.matcherino_prize_pool)} prize pool` : "";

    statusEl.classList.remove("hidden");
    statusEl.classList.toggle("stale", !known);
    statusEl.textContent = known
        ? `🔗 Matcherino tournament #${match[1]} — ${existing.matcherino_entrants} teams registered right now${prizeSuffix} (auto-refreshes every ~4 min).`
        : `🔗 Matcherino tournament #${match[1]} detected — the team count will start syncing automatically once this is published.`;
}

document.getElementById("f-external-url").addEventListener("input", updateMatcherinoStatus);

document.getElementById("editor-reset-btn").addEventListener("click", resetEditorForm);

function collectFormData() {
    return {
        channelId: document.getElementById("channel-select").value || null,
        name: document.getElementById("f-name").value.trim(),
        game: document.getElementById("f-game").value.trim() || null,
        format: document.getElementById("f-format").value,
        startsAt: startsAtPicker.get(),
        maxParticipants: parseInt(document.getElementById("f-max").value, 10) || 32,
        description: document.getElementById("f-description").value.trim() || null,
        externalUrl: document.getElementById("f-external-url").value.trim() || null,
        banner: state.bannerOverride || document.getElementById("f-banner").value.trim() || null,
        thumbnail: state.thumbnailOverride || document.getElementById("f-thumbnail").value.trim() || null,
        authorName: document.getElementById("f-author-name").value.trim() || null,
        authorIcon: state.authorIconOverride || document.getElementById("f-author-icon").value.trim() || null,
        color: document.getElementById("f-color").value,
        pingRoleId: document.getElementById("f-ping-role").value || null,
        pingOnPublish: document.getElementById("f-ping-on-publish").checked,
        reminderAt: remindAtPicker.get(),
        reactionEmojiId: state.reactionEmoji ? state.reactionEmoji.id : null,
        reactionEmojiName: state.reactionEmoji ? state.reactionEmoji.name : null,
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

[
    "f-name",
    "f-game",
    "f-format",
    "f-max",
    "f-description",
    "f-banner",
    "f-thumbnail",
    "f-author-name",
    "f-author-icon",
    "f-color",
    "f-ping-role",
    "f-ping-on-publish",
    "tournament-id",
].forEach((id) => {
    document.getElementById(id).addEventListener("input", schedulePreview);
    document.getElementById(id).addEventListener("change", schedulePreview);
});

function renderPreview() {
    const data = collectFormData();
    const isEditing = Boolean(document.getElementById("tournament-id").value);
    const existing = isEditing ? state.tournaments.find((t) => t.id === document.getElementById("tournament-id").value) : null;
    const status = existing ? existing.status : "draft";
    const usingMatcherino = existing && existing.matcherino_bounty_id && existing.matcherino_entrants !== null && existing.matcherino_entrants !== undefined;
    const activeCount = usingMatcherino ? existing.matcherino_entrants : existing ? existing.activeCount : 0;

    // Message content sits above the embed — only real notification the bot
    // sends, since embeds never ping even with a mention inside them.
    const contentEl = document.getElementById("pv-content");
    if (data.pingOnPublish && data.pingRoleId) {
        const role = state.roles.find((r) => r.id === data.pingRoleId);
        contentEl.textContent = `@${role ? role.name : "role"}`;
        contentEl.classList.remove("hidden");
    } else {
        contentEl.classList.add("hidden");
    }

    const authorEl = document.getElementById("pv-author");
    if (data.authorName) {
        document.getElementById("pv-author-name").textContent = data.authorName;
        const authorIconEl = document.getElementById("pv-author-icon");
        if (data.authorIcon) {
            authorIconEl.src = data.authorIcon;
            authorIconEl.classList.remove("hidden");
        } else {
            authorIconEl.classList.add("hidden");
        }
        authorEl.classList.remove("hidden");
    } else {
        authorEl.classList.add("hidden");
    }

    const thumbnailEl = document.getElementById("pv-thumbnail");
    if (data.thumbnail) {
        thumbnailEl.src = data.thumbnail;
        thumbnailEl.classList.remove("hidden");
    } else {
        thumbnailEl.classList.add("hidden");
    }

    document.getElementById("pv-title").textContent = data.name || "Tournament name";
    const descEl = document.getElementById("pv-desc");
    descEl.innerHTML = renderDiscordMarkup(data.description || "");
    descEl.classList.toggle("hidden", !data.description);

    const fields = [];
    if (data.game) fields.push(["Game", data.game]);
    fields.push(["Format", FORMAT_LABELS[data.format] || data.format]);
    fields.push(["Teams Registered", `${activeCount}/${data.maxParticipants}`]);
    if (existing && existing.matcherino_prize_pool !== null && existing.matcherino_prize_pool !== undefined) {
        fields.push(["Prize Pool", formatPrizePool(existing.matcherino_prize_pool)]);
    }
    if (data.startsAt) {
        fields.push([
            "Starts",
            new Date(data.startsAt).toLocaleString([], { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
        ]);
    }
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

    // Mirrors how a real Discord embed footer looks with .setTimestamp() —
    // the status text plus a live "Today at HH:MM" clock.
    const nowLabel = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    document.getElementById("pv-footer").textContent = `${STATUS_LABELS[status]} • Today at ${nowLabel}`;
    document.querySelector(".dp-embed").style.borderLeftColor = data.color;

    const registerBtn = document.getElementById("pv-register-btn");
    const isFull = activeCount >= data.maxParticipants;
    registerBtn.textContent = isFull ? "Full" : "✅ Join";
    registerBtn.style.opacity = status === "published" && !isFull ? "1" : "0.5";
}

// --- Image uploads (drag & drop or click) — banner, thumbnail, author icon ---
// All three behave identically (a local upload becomes a data: URL that takes
// precedence over the paired text input's pasted link), so one factory wires
// each instead of repeating the same dropzone plumbing three times.
function wireImageDropzone(dropzoneId, fileInputId, textInputId, overrideKey) {
    const dropzone = document.getElementById(dropzoneId);
    const fileInput = document.getElementById(fileInputId);
    const textInput = document.getElementById(textInputId);

    function handleFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            state[overrideKey] = reader.result;
            textInput.value = "";
            renderPreview();
        };
        reader.readAsDataURL(file);
    }

    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener("change", () => {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });
    textInput.addEventListener("input", () => {
        state[overrideKey] = null;
    });
}

wireImageDropzone("banner-dropzone", "banner-file", "f-banner", "bannerOverride");
wireImageDropzone("thumbnail-dropzone", "thumbnail-file", "f-thumbnail", "thumbnailOverride");
wireImageDropzone("author-icon-dropzone", "author-icon-file", "f-author-icon", "authorIconOverride");

// =========================================================================
// Description toolbar: Discord markdown shortcuts + role/channel/user mention
// pickers + a custom-emoji picker pulled live from the selected server.
// =========================================================================

const FORMAT_MAP = {
    bold: ["**", "**", "bold text"],
    italic: ["*", "*", "italic text"],
    underline: ["__", "__", "underlined text"],
    strike: ["~~", "~~", "strikethrough"],
    spoiler: ["||", "||", "spoiler"],
    code: ["`", "`", "code"],
    codeblock: ["```\n", "\n```", "code block"],
    quote: ["> ", "", "quote"],
    bullet: ["- ", "", "list item"],
    header: ["# ", "", "header"],
};

// Turns the raw markdown typed into the description into the same HTML shape
// Discord itself renders, so the "Live preview" actually looks like the real
// embed instead of showing raw ** and <:emoji:id> syntax. Best-effort — it
// covers the toolbar's own formatting plus emoji/mention tags, not the full
// breadth of Discord's markdown grammar.
function renderDiscordMarkup(raw) {
    if (!raw) return "";
    let html = escapeHtml(raw);

    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<div class="dp-code-block">${code}</div>`);
    html = html.replace(/`([^`]+)`/g, (_, code) => `<span class="dp-code">${code}</span>`);

    // Custom emoji <:name:id> / <a:name:id> — Discord's CDN serves these
    // straight from the id, no need to look them up in the fetched emoji list.
    html = html.replace(/&lt;(a?):(\w+):(\d+)&gt;/g, (_, animated, name, id) => {
        const ext = animated ? "gif" : "png";
        return `<img class="dp-emoji" src="https://cdn.discordapp.com/emojis/${id}.${ext}" alt=":${name}:" title=":${name}:" />`;
    });

    // Role / channel / user mentions — resolved against the currently loaded
    // guild data where possible, since we only have an id at this point.
    html = html.replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => {
        const role = state.roles.find((r) => r.id === id);
        return `<span class="dp-mention">@${escapeHtml(role ? role.name : "role")}</span>`;
    });
    html = html.replace(/&lt;#(\d+)&gt;/g, (_, id) => {
        const channel = state.channels.find((c) => c.id === id);
        return `<span class="dp-mention">#${escapeHtml(channel ? channel.name : "channel")}</span>`;
    });
    html = html.replace(/&lt;@(\d+)&gt;/g, () => `<span class="dp-mention">@user</span>`);
    html = html.replace(/(^|\s)@(everyone|here)\b/g, (_, pre, kw) => `${pre}<span class="dp-mention">@${kw}</span>`);

    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, "<b><i>$1</i></b>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    html = html.replace(/__([^_]+)__/g, "<u>$1</u>");
    html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
    html = html.replace(/\|\|([^|]+)\|\|/g, '<span class="dp-spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
    html = html.replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
    html = html.replace(/(?<![\w:])_([^_\n]+)_(?![\w:])/g, "<i>$1</i>");

    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    html = html
        .split("\n")
        .map((line) => {
            const header = /^(#{1,3})\s+(.*)$/.exec(line);
            if (header) return `<div class="dp-h${header[1].length}">${header[2]}</div>`;
            if (/^&gt;\s?/.test(line)) return `<div class="dp-quote">${line.replace(/^&gt;\s?/, "")}</div>`;
            if (/^-\s+/.test(line)) return `<div class="dp-bullet">• ${line.replace(/^-\s+/, "")}</div>`;
            return line;
        })
        .join("\n");

    return html;
}

function wrapSelection(textarea, prefix, suffix, placeholder) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selected = value.slice(start, end) || placeholder;
    textarea.value = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    const selStart = start + prefix.length;
    textarea.focus();
    textarea.setSelectionRange(selStart, selStart + selected.length);
    schedulePreview();
}

function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    const pos = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
    schedulePreview();
}

document.getElementById("desc-toolbar").addEventListener("click", (e) => {
    const fmtBtn = e.target.closest("button[data-fmt]");
    if (!fmtBtn) return;
    const textarea = document.getElementById("f-description");

    if (fmtBtn.dataset.fmt === "link") {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const label = textarea.value.slice(start, end) || "link text";
        const url = prompt("Link URL:", "https://");
        if (!url) return;
        wrapSelection(textarea, "[", `](${url})`, label);
        return;
    }

    const [prefix, suffix, placeholder] = FORMAT_MAP[fmtBtn.dataset.fmt];
    wrapSelection(textarea, prefix, suffix, placeholder);
});

// --- Shared popover for the mention/emoji buttons below the toolbar ---
const formatDropdown = document.getElementById("format-dropdown");

function closeDropdown() {
    formatDropdown.classList.add("hidden");
    formatDropdown.innerHTML = "";
    delete formatDropdown.dataset.for;
}

function toggleDropdown(name, renderFn) {
    if (!formatDropdown.classList.contains("hidden") && formatDropdown.dataset.for === name) {
        closeDropdown();
        return;
    }
    closeAllPopovers(formatDropdown);
    formatDropdown.dataset.for = name;
    formatDropdown.innerHTML = "";
    renderFn(formatDropdown);
    formatDropdown.classList.remove("hidden");
}

document.addEventListener("click", (e) => {
    const triggerIds = ["mention-role-btn", "mention-channel-btn", "mention-user-btn", "emoji-picker-btn"];
    if (triggerIds.includes(e.target.closest("button")?.id) || formatDropdown.contains(e.target)) return;
    closeDropdown();
});

function renderMentionList(container, items) {
    if (!items.length) {
        container.innerHTML = `<div class="dd-empty">Nothing to show.</div>`;
        return;
    }
    for (const item of items) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dd-item";
        btn.textContent = item.label;
        btn.addEventListener("click", () => {
            insertAtCursor(document.getElementById("f-description"), item.value);
            closeDropdown();
        });
        container.appendChild(btn);
    }
}

document.getElementById("mention-role-btn").addEventListener("click", () => {
    toggleDropdown("role", (container) => {
        const items = [
            { label: "@everyone", value: "@everyone" },
            { label: "@here", value: "@here" },
            ...state.roles.map((r) => ({ label: `@${r.name}`, value: `<@&${r.id}>` })),
        ];
        renderMentionList(container, items);
    });
});

document.getElementById("mention-channel-btn").addEventListener("click", () => {
    toggleDropdown("channel", (container) => {
        renderMentionList(container, state.channels.map((c) => ({ label: `#${c.name}`, value: `<#${c.id}>` })));
    });
});

document.getElementById("mention-user-btn").addEventListener("click", () => {
    toggleDropdown("user", (container) => {
        container.innerHTML = `
            <div class="dd-form">
                <input type="text" id="mention-user-id" placeholder="User ID (Developer Mode → right-click → Copy User ID)" />
                <button type="button" id="mention-user-insert">Insert</button>
            </div>`;
        container.querySelector("#mention-user-insert").addEventListener("click", () => {
            const id = container.querySelector("#mention-user-id").value.trim();
            if (!/^\d{5,25}$/.test(id)) return alert("That doesn't look like a valid Discord user ID.");
            insertAtCursor(document.getElementById("f-description"), `<@${id}>`);
            closeDropdown();
        });
    });
});

// Closes every other popover (the mention/emoji dropdown, both date/time
// pickers, and the reaction-emoji dropdown) except the one just opened —
// keeps only one of these open at a time.
function closeAllPopovers(exceptEl) {
    document.querySelectorAll(".dt-panel:not(.hidden)").forEach((p) => p.classList.add("hidden"));
    document.querySelectorAll(".dropdown-menu").forEach((d) => {
        if (d === exceptEl) return;
        d.classList.add("hidden");
        d.innerHTML = "";
        delete d.dataset.for;
    });
}

// Fetches (and caches) the guild's custom emojis and renders them as a grid
// inside dropdownEl, calling onPick(emoji) when one is clicked — shared by
// the description's emoji button and the auto-react emoji button below.
function wireEmojiPicker(dropdownEl, triggerBtn, onPick) {
    function close() {
        dropdownEl.classList.add("hidden");
        dropdownEl.innerHTML = "";
    }

    triggerBtn.addEventListener("click", async () => {
        const wasOpen = !dropdownEl.classList.contains("hidden");
        closeAllPopovers(dropdownEl);
        if (wasOpen) return close();

        dropdownEl.innerHTML = `<div class="dd-empty">Loading…</div>`;
        dropdownEl.classList.remove("hidden");

        if (state.emojis === null) {
            try {
                const { emojis } = await apiFetch(`/api/guilds/${state.guildId}/emojis`);
                state.emojis = emojis;
            } catch (err) {
                state.emojis = [];
            }
        }
        if (dropdownEl.classList.contains("hidden")) return; // closed while that fetch was in flight

        dropdownEl.innerHTML = "";
        if (!state.emojis.length) {
            dropdownEl.innerHTML = `<div class="dd-empty">No custom emojis on this server.</div>`;
            return;
        }
        for (const emoji of state.emojis) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "dd-item dd-emoji-item";
            btn.title = `:${emoji.name}:`;
            btn.innerHTML = `<img src="${emoji.url}" alt="${escapeHtml(emoji.name)}" />`;
            btn.addEventListener("click", () => {
                onPick(emoji);
                close();
            });
            dropdownEl.appendChild(btn);
        }
    });

    document.addEventListener("click", (e) => {
        if (!triggerBtn.contains(e.target) && !dropdownEl.contains(e.target)) close();
    });
}

wireEmojiPicker(formatDropdown, document.getElementById("emoji-picker-btn"), (emoji) => {
    insertAtCursor(document.getElementById("f-description"), emoji.tag);
});

// --- Auto-react emoji: either a custom server emoji (picked below) or any
// pasted/typed standard unicode emoji — mutually exclusive with each other.
function setReactionEmoji(value, { syncUnicodeInput = true } = {}) {
    state.reactionEmoji = value;
    const chip = document.getElementById("reaction-chip");
    const content = document.getElementById("reaction-chip-content");

    if (!value) {
        content.textContent = "— none —";
        chip.classList.remove("has-value");
    } else if (value.id) {
        content.innerHTML = `<img src="https://cdn.discordapp.com/emojis/${value.id}.png" alt="${escapeHtml(value.name)}" /> :${escapeHtml(value.name)}:`;
        chip.classList.add("has-value");
    } else {
        content.textContent = value.name;
        chip.classList.add("has-value");
    }

    if (syncUnicodeInput) {
        document.getElementById("f-reaction-unicode").value = value && !value.id ? value.name : "";
    }
}

document.getElementById("reaction-chip").addEventListener("click", () => setReactionEmoji(null));

document.getElementById("f-reaction-unicode").addEventListener("input", (e) => {
    const value = e.target.value.trim();
    setReactionEmoji(value ? { id: null, name: value } : null, { syncUnicodeInput: false });
});

wireEmojiPicker(document.getElementById("reaction-dropdown"), document.getElementById("reaction-emoji-btn"), (emoji) => {
    setReactionEmoji({ id: emoji.id, name: emoji.name });
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
