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
  const message = document.getElementById("message-input").value.trim();
  const resultEl = document.getElementById("send-result");
  resultEl.textContent = "";

  if (!guildId || !channelId || !message) {
    resultEl.textContent = "Заполни все поля";
    resultEl.className = "result error";
    return;
  }

  try {
    await apiFetch("/api/send", {
      method: "POST",
      body: JSON.stringify({ guildId, channelId, message }),
    });
    resultEl.textContent = "✅ Отправлено";
    resultEl.className = "result";
    document.getElementById("message-input").value = "";
  } catch (err) {
    resultEl.textContent = "❌ " + err.message;
    resultEl.className = "result error";
  }
});

// Блок ИИ-вопросов временно убран из панели, см. NOTES.md

// --- Автовход, если токен уже сохранён ---
if (getToken()) {
  showApp();
}
