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

// Mirrors lib/tournaments.js's DASHBOARD_STATUS_LABELS / dashboardStatusKey —
// this file can't require() them. Shows "In Progress"/"Finalized" once a
// linked Matcherino bracket reports one of those, instead of just
// registration open/closed.
const DASHBOARD_STATUS_LABELS = { ...STATUS_LABELS, in_progress: "In Progress", finalized: "Finalized" };

function matcherinoStatusCategory(status) {
    if (!status) return null;
    const s = status.toLowerCase();
    if (s.includes("progress") || s.includes("active") || s.includes("live")) return "in_progress";
    if (s.includes("complet") || s.includes("final") || s.includes("finish") || s.includes("ended")) return "finalized";
    return null;
}

function dashboardStatusKey(t) {
    if (t.status === "draft") return "draft";
    return matcherinoStatusCategory(t.matcherino_status) || t.status;
}

// =========================================================================
// Settings: theme + language (i18n covers the panel's own static chrome —
// tabs, section titles, field labels, buttons, modals — not user-authored
// tournament content, which always stays exactly as typed) + delete-all.
// =========================================================================

const TRANSLATIONS = {
    en: {
        "whatsNew.title": "✨ What's New",
        "login.title": "🏆 Tournament Bot",
        "login.hint": "Sign in with Discord to manage tournaments on servers where you're an organizer (Manage Server permission).",
        "login.button": "Log in with Discord",
        "header.addToServer": "Add to another server",
        "header.settings": "Settings",
        "header.logout": "Log out",
        "tabs.dashboard": "Dashboard",
        "tabs.newTournament": "＋ New tournament",
        "dashboard.tournaments": "Tournaments",
        "dashboard.exportCsv": "Export CSV",
        "dashboard.user": "User",
        "dashboard.registered": "Registered",
        "dashboard.noRegistrations": "No registrations yet.",
        "editor.livePreview": "Live preview",
        "editor.clear": "Clear",
        "editor.newTournament": "New tournament",
        "editor.section.basics": "Basics",
        "editor.section.description": "Description",
        "editor.section.ai": "AI Description Generator",
        "editor.section.branding": "Branding",
        "editor.section.notifications": "Notifications & Engagement",
        "editor.field.channel": "Channel to announce in",
        "editor.field.name": "Tournament name/organization name",
        "editor.field.game": "Game",
        "editor.field.format": "Format",
        "editor.field.startsAt": "Start date/time",
        "editor.field.max": "Max participants",
        "editor.field.externalUrl": "External tournament link (optional)",
        "editor.field.banner": "Banner image (large image at the bottom)",
        "editor.field.thumbnail": "Tournament icon (small thumbnail, top-right corner, optional)",
        "editor.field.authorName": "Author name (small line above the title, optional)",
        "editor.field.authorIcon": "Author mini icon",
        "editor.field.color": "Embed color",
        "editor.field.pingRole": "Ping role (optional)",
        "editor.field.reminderAt": "Send a reminder DM at (optional)",
        "editor.field.reaction": "Auto-react emoji (optional)",
        "editor.save": "Save draft",
        "settings.theme": "Theme",
        "settings.dark": "Dark",
        "settings.light": "Light",
        "settings.language": "Language",
        "settings.languageHint": "Translates the panel's menus and labels. Tournament content you write stays as you typed it.",
        "settings.dangerZone": "Danger Zone",
        "settings.deleteAllHint": "Permanently deletes every tournament on the currently selected server — drafts, published and closed alike. This cannot be undone.",
        "settings.deleteAll": "Delete all tournaments",
        "clearModal.title": "Clear this form?",
        "clearModal.body": "Any unsaved changes will be lost. This doesn't delete a saved tournament, only the current editor form.",
        "common.cancel": "Cancel",
        "common.confirm": "Confirm",
        "common.continue": "Continue",
        "deleteAll.title1": "Delete all tournaments?",
        "deleteAll.body1": "This permanently deletes every tournament on this server — drafts, published and closed. This cannot be undone.",
        "deleteAll.title2": "Are you absolutely sure?",
        "deleteAll.body2": "Last chance — this is final and cannot be recovered.",
        "deleteAll.confirm": "Yes, delete everything",
        "republish.title": "Republish in another channel",
        "republish.newChannel": "New channel",
        "action.edit": "Edit",
        "action.publish": "Publish",
        "action.close": "Close",
        "action.participants": "Participants",
        "action.republish": "Republish",
        "action.sync": "Sync",
        "action.clone": "Clone",
        "action.delete": "Delete",
    },
    ru: {
        "whatsNew.title": "✨ Что нового",
        "login.title": "🏆 Турнирный бот",
        "login.hint": "Войдите через Discord, чтобы управлять турнирами на серверах, где вы организатор (право Manage Server).",
        "login.button": "Войти через Discord",
        "header.addToServer": "Добавить на другой сервер",
        "header.settings": "Настройки",
        "header.logout": "Выйти",
        "tabs.dashboard": "Дашборд",
        "tabs.newTournament": "＋ Новый турнир",
        "dashboard.tournaments": "Турниры",
        "dashboard.exportCsv": "Экспорт CSV",
        "dashboard.user": "Пользователь",
        "dashboard.registered": "Зарегистрирован",
        "dashboard.noRegistrations": "Пока никто не зарегистрировался.",
        "editor.livePreview": "Живой предпросмотр",
        "editor.clear": "Очистить",
        "editor.newTournament": "Новый турнир",
        "editor.section.basics": "Основное",
        "editor.section.description": "Описание",
        "editor.section.ai": "ИИ-генератор описания",
        "editor.section.branding": "Оформление",
        "editor.section.notifications": "Уведомления и вовлечение",
        "editor.field.channel": "Канал для анонса",
        "editor.field.name": "Название турнира/организации",
        "editor.field.game": "Игра",
        "editor.field.format": "Формат",
        "editor.field.startsAt": "Дата/время начала",
        "editor.field.max": "Макс. участников",
        "editor.field.externalUrl": "Внешняя ссылка на турнир (опционально)",
        "editor.field.banner": "Баннер (большое изображение внизу)",
        "editor.field.thumbnail": "Иконка турнира (маленькая, в углу, опционально)",
        "editor.field.authorName": "Имя автора (строка над заголовком, опционально)",
        "editor.field.authorIcon": "Мини-иконка автора",
        "editor.field.color": "Цвет embed",
        "editor.field.pingRole": "Роль для пинга (опционально)",
        "editor.field.reminderAt": "Отправить напоминание в ЛС (опционально)",
        "editor.field.reaction": "Авто-реакция эмодзи (опционально)",
        "editor.save": "Сохранить черновик",
        "settings.theme": "Тема",
        "settings.dark": "Тёмная",
        "settings.light": "Светлая",
        "settings.language": "Язык",
        "settings.languageHint": "Переводит меню и подписи панели. Текст турниров, который вы сами написали, остаётся как есть.",
        "settings.dangerZone": "Опасная зона",
        "settings.deleteAllHint": "Безвозвратно удаляет все турниры на текущем выбранном сервере — черновики, опубликованные и закрытые. Это нельзя отменить.",
        "settings.deleteAll": "Удалить все турниры",
        "clearModal.title": "Очистить форму?",
        "clearModal.body": "Все несохранённые изменения будут потеряны. Сохранённый турнир при этом не удаляется — очищается только текущая форма.",
        "common.cancel": "Отмена",
        "common.confirm": "Подтвердить",
        "common.continue": "Продолжить",
        "deleteAll.title1": "Удалить все турниры?",
        "deleteAll.body1": "Это безвозвратно удалит все турниры на этом сервере — черновики, опубликованные и закрытые. Это нельзя отменить.",
        "deleteAll.title2": "Вы абсолютно уверены?",
        "deleteAll.body2": "Последний шанс передумать — дальше отменить будет нельзя.",
        "deleteAll.confirm": "Да, удалить всё",
        "republish.title": "Переопубликовать в другом канале",
        "republish.newChannel": "Новый канал",
        "action.edit": "Изменить",
        "action.publish": "Опубликовать",
        "action.close": "Закрыть",
        "action.participants": "Участники",
        "action.republish": "Переопубликовать",
        "action.sync": "Синхр.",
        "action.clone": "Клонировать",
        "action.delete": "Удалить",
    },
    es: {
        "whatsNew.title": "✨ Novedades",
        "login.title": "🏆 Bot de Torneos",
        "login.hint": "Inicia sesión con Discord para gestionar torneos en los servidores donde eres organizador (permiso de Gestionar servidor).",
        "login.button": "Iniciar sesión con Discord",
        "header.addToServer": "Añadir a otro servidor",
        "header.settings": "Ajustes",
        "header.logout": "Cerrar sesión",
        "tabs.dashboard": "Panel",
        "tabs.newTournament": "＋ Nuevo torneo",
        "dashboard.tournaments": "Torneos",
        "dashboard.exportCsv": "Exportar CSV",
        "dashboard.user": "Usuario",
        "dashboard.registered": "Registrado",
        "dashboard.noRegistrations": "Aún no hay inscripciones.",
        "editor.livePreview": "Vista previa en vivo",
        "editor.clear": "Borrar",
        "editor.newTournament": "Nuevo torneo",
        "editor.section.basics": "Datos básicos",
        "editor.section.description": "Descripción",
        "editor.section.ai": "Generador de descripción con IA",
        "editor.section.branding": "Imagen",
        "editor.section.notifications": "Notificaciones y participación",
        "editor.field.channel": "Canal para anunciar",
        "editor.field.name": "Nombre del torneo/organización",
        "editor.field.game": "Juego",
        "editor.field.format": "Formato",
        "editor.field.startsAt": "Fecha/hora de inicio",
        "editor.field.max": "Máximo de participantes",
        "editor.field.externalUrl": "Enlace externo del torneo (opcional)",
        "editor.field.banner": "Imagen de banner (imagen grande en la parte inferior)",
        "editor.field.thumbnail": "Icono del torneo (miniatura, esquina superior derecha, opcional)",
        "editor.field.authorName": "Nombre del autor (línea pequeña sobre el título, opcional)",
        "editor.field.authorIcon": "Mini icono del autor",
        "editor.field.color": "Color del embed",
        "editor.field.pingRole": "Rol a mencionar (opcional)",
        "editor.field.reminderAt": "Enviar un recordatorio por MD a las (opcional)",
        "editor.field.reaction": "Emoji de reacción automática (opcional)",
        "editor.save": "Guardar borrador",
        "settings.theme": "Tema",
        "settings.dark": "Oscuro",
        "settings.light": "Claro",
        "settings.language": "Idioma",
        "settings.languageHint": "Traduce los menús y las etiquetas del panel. El contenido del torneo que escribas se mantiene tal cual.",
        "settings.dangerZone": "Zona de peligro",
        "settings.deleteAllHint": "Elimina permanentemente todos los torneos del servidor seleccionado actualmente: borradores, publicados y cerrados. Esto no se puede deshacer.",
        "settings.deleteAll": "Eliminar todos los torneos",
        "clearModal.title": "¿Borrar este formulario?",
        "clearModal.body": "Se perderán los cambios no guardados. Esto no elimina un torneo guardado, solo borra el formulario actual.",
        "common.cancel": "Cancelar",
        "common.confirm": "Confirmar",
        "common.continue": "Continuar",
        "deleteAll.title1": "¿Eliminar todos los torneos?",
        "deleteAll.body1": "Esto eliminará permanentemente todos los torneos de este servidor: borradores, publicados y cerrados. Esto no se puede deshacer.",
        "deleteAll.title2": "¿Estás completamente seguro?",
        "deleteAll.body2": "Última oportunidad: esto es definitivo y no se puede recuperar.",
        "deleteAll.confirm": "Sí, eliminar todo",
        "republish.title": "Volver a publicar en otro canal",
        "republish.newChannel": "Nuevo canal",
        "action.edit": "Editar",
        "action.publish": "Publicar",
        "action.close": "Cerrar",
        "action.participants": "Participantes",
        "action.republish": "Volver a publicar",
        "action.sync": "Sincronizar",
        "action.clone": "Clonar",
        "action.delete": "Eliminar",
    },
    ro: {
        "whatsNew.title": "✨ Noutăți",
        "login.title": "🏆 Bot de Turnee",
        "login.hint": "Conectează-te cu Discord pentru a gestiona turnee pe serverele unde ești organizator (permisiunea Manage Server).",
        "login.button": "Conectare cu Discord",
        "header.addToServer": "Adaugă pe alt server",
        "header.settings": "Setări",
        "header.logout": "Deconectare",
        "tabs.dashboard": "Panou",
        "tabs.newTournament": "＋ Turneu nou",
        "dashboard.tournaments": "Turnee",
        "dashboard.exportCsv": "Exportă CSV",
        "dashboard.user": "Utilizator",
        "dashboard.registered": "Înregistrat",
        "dashboard.noRegistrations": "Încă nu există înscrieri.",
        "editor.livePreview": "Previzualizare live",
        "editor.clear": "Golește",
        "editor.newTournament": "Turneu nou",
        "editor.section.basics": "Informații de bază",
        "editor.section.description": "Descriere",
        "editor.section.ai": "Generator de descriere AI",
        "editor.section.branding": "Aspect",
        "editor.section.notifications": "Notificări și implicare",
        "editor.field.channel": "Canal pentru anunț",
        "editor.field.name": "Numele turneului/organizației",
        "editor.field.game": "Joc",
        "editor.field.format": "Format",
        "editor.field.startsAt": "Data/ora de început",
        "editor.field.max": "Participanți maximi",
        "editor.field.externalUrl": "Link extern al turneului (opțional)",
        "editor.field.banner": "Imagine banner (imagine mare în partea de jos)",
        "editor.field.thumbnail": "Pictogramă turneu (miniatură mică, colțul din dreapta sus, opțional)",
        "editor.field.authorName": "Numele autorului (linie mică deasupra titlului, opțional)",
        "editor.field.authorIcon": "Mini pictogramă autor",
        "editor.field.color": "Culoarea embed-ului",
        "editor.field.pingRole": "Rol de menționat (opțional)",
        "editor.field.reminderAt": "Trimite un memento prin DM la (opțional)",
        "editor.field.reaction": "Emoji de reacție automată (opțional)",
        "editor.save": "Salvează ciorna",
        "settings.theme": "Temă",
        "settings.dark": "Întunecată",
        "settings.light": "Deschisă",
        "settings.language": "Limbă",
        "settings.languageHint": "Traduce meniurile și etichetele panoului. Conținutul turneului scris de tine rămâne neschimbat.",
        "settings.dangerZone": "Zonă periculoasă",
        "settings.deleteAllHint": "Șterge permanent toate turneele de pe serverul selectat în prezent — ciorne, publicate și închise deopotrivă. Aceasta nu poate fi anulată.",
        "settings.deleteAll": "Șterge toate turneele",
        "clearModal.title": "Golești acest formular?",
        "clearModal.body": "Modificările nesalvate se vor pierde. Aceasta nu șterge un turneu salvat, ci doar golește formularul curent.",
        "common.cancel": "Anulează",
        "common.confirm": "Confirmă",
        "common.continue": "Continuă",
        "deleteAll.title1": "Ștergi toate turneele?",
        "deleteAll.body1": "Aceasta va șterge permanent toate turneele de pe acest server — ciorne, publicate și închise. Aceasta nu poate fi anulată.",
        "deleteAll.title2": "Ești absolut sigur?",
        "deleteAll.body2": "Ultima șansă — aceasta este finală și nu poate fi recuperată.",
        "deleteAll.confirm": "Da, șterge tot",
        "republish.title": "Republică pe alt canal",
        "republish.newChannel": "Canal nou",
        "action.edit": "Editează",
        "action.publish": "Publică",
        "action.close": "Închide",
        "action.participants": "Participanți",
        "action.republish": "Republică",
        "action.sync": "Sincronizează",
        "action.clone": "Clonează",
        "action.delete": "Șterge",
    },
    it: {
        "whatsNew.title": "✨ Novità",
        "login.title": "🏆 Bot Tornei",
        "login.hint": "Accedi con Discord per gestire i tornei sui server in cui sei organizzatore (permesso Gestisci server).",
        "login.button": "Accedi con Discord",
        "header.addToServer": "Aggiungi a un altro server",
        "header.settings": "Impostazioni",
        "header.logout": "Esci",
        "tabs.dashboard": "Dashboard",
        "tabs.newTournament": "＋ Nuovo torneo",
        "dashboard.tournaments": "Tornei",
        "dashboard.exportCsv": "Esporta CSV",
        "dashboard.user": "Utente",
        "dashboard.registered": "Registrato",
        "dashboard.noRegistrations": "Ancora nessuna iscrizione.",
        "editor.livePreview": "Anteprima live",
        "editor.clear": "Cancella",
        "editor.newTournament": "Nuovo torneo",
        "editor.section.basics": "Informazioni di base",
        "editor.section.description": "Descrizione",
        "editor.section.ai": "Generatore di descrizione IA",
        "editor.section.branding": "Aspetto",
        "editor.section.notifications": "Notifiche e coinvolgimento",
        "editor.field.channel": "Canale per l'annuncio",
        "editor.field.name": "Nome del torneo/organizzazione",
        "editor.field.game": "Gioco",
        "editor.field.format": "Formato",
        "editor.field.startsAt": "Data/ora di inizio",
        "editor.field.max": "Partecipanti massimi",
        "editor.field.externalUrl": "Link esterno del torneo (opzionale)",
        "editor.field.banner": "Immagine banner (immagine grande in basso)",
        "editor.field.thumbnail": "Icona del torneo (miniatura piccola, angolo in alto a destra, opzionale)",
        "editor.field.authorName": "Nome autore (piccola riga sopra il titolo, opzionale)",
        "editor.field.authorIcon": "Mini icona autore",
        "editor.field.color": "Colore dell'embed",
        "editor.field.pingRole": "Ruolo da menzionare (opzionale)",
        "editor.field.reminderAt": "Invia un promemoria in DM alle (opzionale)",
        "editor.field.reaction": "Emoji di reazione automatica (opzionale)",
        "editor.save": "Salva bozza",
        "settings.theme": "Tema",
        "settings.dark": "Scuro",
        "settings.light": "Chiaro",
        "settings.language": "Lingua",
        "settings.languageHint": "Traduce i menu e le etichette del pannello. Il contenuto del torneo che scrivi resta invariato.",
        "settings.dangerZone": "Zona pericolosa",
        "settings.deleteAllHint": "Elimina permanentemente tutti i tornei del server attualmente selezionato — bozze, pubblicati e chiusi. Non può essere annullato.",
        "settings.deleteAll": "Elimina tutti i tornei",
        "clearModal.title": "Cancellare questo modulo?",
        "clearModal.body": "Le modifiche non salvate andranno perse. Questo non elimina un torneo salvato, cancella solo il modulo corrente.",
        "common.cancel": "Annulla",
        "common.confirm": "Conferma",
        "common.continue": "Continua",
        "deleteAll.title1": "Eliminare tutti i tornei?",
        "deleteAll.body1": "Questo eliminerà permanentemente tutti i tornei di questo server — bozze, pubblicati e chiusi. Non può essere annullato.",
        "deleteAll.title2": "Sei assolutamente sicuro?",
        "deleteAll.body2": "Ultima possibilità: questa azione è definitiva e non può essere recuperata.",
        "deleteAll.confirm": "Sì, elimina tutto",
        "republish.title": "Ripubblica in un altro canale",
        "republish.newChannel": "Nuovo canale",
        "action.edit": "Modifica",
        "action.publish": "Pubblica",
        "action.close": "Chiudi",
        "action.participants": "Partecipanti",
        "action.republish": "Ripubblica",
        "action.sync": "Sincronizza",
        "action.clone": "Clona",
        "action.delete": "Elimina",
    },
    nl: {
        "whatsNew.title": "✨ Wat is er nieuw",
        "login.title": "🏆 Toernooibot",
        "login.hint": "Log in met Discord om toernooien te beheren op servers waar je organisator bent (Server beheren-rechten).",
        "login.button": "Inloggen met Discord",
        "header.addToServer": "Toevoegen aan een andere server",
        "header.settings": "Instellingen",
        "header.logout": "Uitloggen",
        "tabs.dashboard": "Dashboard",
        "tabs.newTournament": "＋ Nieuw toernooi",
        "dashboard.tournaments": "Toernooien",
        "dashboard.exportCsv": "CSV exporteren",
        "dashboard.user": "Gebruiker",
        "dashboard.registered": "Geregistreerd",
        "dashboard.noRegistrations": "Nog geen aanmeldingen.",
        "editor.livePreview": "Live voorbeeld",
        "editor.clear": "Wissen",
        "editor.newTournament": "Nieuw toernooi",
        "editor.section.basics": "Basisgegevens",
        "editor.section.description": "Beschrijving",
        "editor.section.ai": "AI-beschrijvingsgenerator",
        "editor.section.branding": "Vormgeving",
        "editor.section.notifications": "Meldingen & betrokkenheid",
        "editor.field.channel": "Kanaal voor aankondiging",
        "editor.field.name": "Naam toernooi/organisatie",
        "editor.field.game": "Spel",
        "editor.field.format": "Formaat",
        "editor.field.startsAt": "Startdatum/-tijd",
        "editor.field.max": "Max. aantal deelnemers",
        "editor.field.externalUrl": "Externe toernooilink (optioneel)",
        "editor.field.banner": "Bannerafbeelding (grote afbeelding onderaan)",
        "editor.field.thumbnail": "Toernooi-icoon (kleine miniatuur, rechtsboven, optioneel)",
        "editor.field.authorName": "Auteursnaam (kleine regel boven de titel, optioneel)",
        "editor.field.authorIcon": "Mini-icoon auteur",
        "editor.field.color": "Embedkleur",
        "editor.field.pingRole": "Rol om te pingen (optioneel)",
        "editor.field.reminderAt": "Stuur een herinnering per DM om (optioneel)",
        "editor.field.reaction": "Automatische reactie-emoji (optioneel)",
        "editor.save": "Concept opslaan",
        "settings.theme": "Thema",
        "settings.dark": "Donker",
        "settings.light": "Licht",
        "settings.language": "Taal",
        "settings.languageHint": "Vertaalt de menu's en labels van het paneel. Toernooi-inhoud die je zelf schrijft, blijft ongewijzigd.",
        "settings.dangerZone": "Gevarenzone",
        "settings.deleteAllHint": "Verwijdert permanent alle toernooien op de momenteel geselecteerde server — concepten, gepubliceerde en gesloten. Dit kan niet ongedaan worden gemaakt.",
        "settings.deleteAll": "Alle toernooien verwijderen",
        "clearModal.title": "Dit formulier wissen?",
        "clearModal.body": "Niet-opgeslagen wijzigingen gaan verloren. Dit verwijdert geen opgeslagen toernooi, alleen het huidige formulier wordt gewist.",
        "common.cancel": "Annuleren",
        "common.confirm": "Bevestigen",
        "common.continue": "Doorgaan",
        "deleteAll.title1": "Alle toernooien verwijderen?",
        "deleteAll.body1": "Dit verwijdert permanent alle toernooien op deze server — concepten, gepubliceerde en gesloten. Dit kan niet ongedaan worden gemaakt.",
        "deleteAll.title2": "Weet je het absoluut zeker?",
        "deleteAll.body2": "Laatste kans — dit is definitief en kan niet worden hersteld.",
        "deleteAll.confirm": "Ja, verwijder alles",
        "republish.title": "Opnieuw publiceren in een ander kanaal",
        "republish.newChannel": "Nieuw kanaal",
        "action.edit": "Bewerken",
        "action.publish": "Publiceren",
        "action.close": "Sluiten",
        "action.participants": "Deelnemers",
        "action.republish": "Opnieuw publiceren",
        "action.sync": "Synchroniseren",
        "action.clone": "Klonen",
        "action.delete": "Verwijderen",
    },
    pt: {
        "whatsNew.title": "✨ Novidades",
        "login.title": "🏆 Bot de Torneios",
        "login.hint": "Entra com o Discord para geres torneios nos servidores onde és organizador (permissão Gerir Servidor).",
        "login.button": "Entrar com o Discord",
        "header.addToServer": "Adicionar a outro servidor",
        "header.settings": "Definições",
        "header.logout": "Terminar sessão",
        "tabs.dashboard": "Painel",
        "tabs.newTournament": "＋ Novo torneio",
        "dashboard.tournaments": "Torneios",
        "dashboard.exportCsv": "Exportar CSV",
        "dashboard.user": "Utilizador",
        "dashboard.registered": "Registado",
        "dashboard.noRegistrations": "Ainda não há inscrições.",
        "editor.livePreview": "Pré-visualização em direto",
        "editor.clear": "Limpar",
        "editor.newTournament": "Novo torneio",
        "editor.section.basics": "Informações básicas",
        "editor.section.description": "Descrição",
        "editor.section.ai": "Gerador de descrição com IA",
        "editor.section.branding": "Aspeto",
        "editor.section.notifications": "Notificações e envolvimento",
        "editor.field.channel": "Canal para o anúncio",
        "editor.field.name": "Nome do torneio/organização",
        "editor.field.game": "Jogo",
        "editor.field.format": "Formato",
        "editor.field.startsAt": "Data/hora de início",
        "editor.field.max": "Máximo de participantes",
        "editor.field.externalUrl": "Link externo do torneio (opcional)",
        "editor.field.banner": "Imagem de banner (imagem grande na parte inferior)",
        "editor.field.thumbnail": "Ícone do torneio (miniatura pequena, canto superior direito, opcional)",
        "editor.field.authorName": "Nome do autor (linha pequena acima do título, opcional)",
        "editor.field.authorIcon": "Mini ícone do autor",
        "editor.field.color": "Cor do embed",
        "editor.field.pingRole": "Cargo a mencionar (opcional)",
        "editor.field.reminderAt": "Enviar um lembrete por DM às (opcional)",
        "editor.field.reaction": "Emoji de reação automática (opcional)",
        "editor.save": "Guardar rascunho",
        "settings.theme": "Tema",
        "settings.dark": "Escuro",
        "settings.light": "Claro",
        "settings.language": "Idioma",
        "settings.languageHint": "Traduz os menus e rótulos do painel. O conteúdo do torneio que escreves mantém-se como está.",
        "settings.dangerZone": "Zona de perigo",
        "settings.deleteAllHint": "Elimina permanentemente todos os torneios do servidor atualmente selecionado — rascunhos, publicados e fechados. Isto não pode ser desfeito.",
        "settings.deleteAll": "Eliminar todos os torneios",
        "clearModal.title": "Limpar este formulário?",
        "clearModal.body": "As alterações não guardadas serão perdidas. Isto não elimina um torneio guardado, apenas limpa o formulário atual.",
        "common.cancel": "Cancelar",
        "common.confirm": "Confirmar",
        "common.continue": "Continuar",
        "deleteAll.title1": "Eliminar todos os torneios?",
        "deleteAll.body1": "Isto eliminará permanentemente todos os torneios deste servidor — rascunhos, publicados e fechados. Isto não pode ser desfeito.",
        "deleteAll.title2": "Tens a certeza absoluta?",
        "deleteAll.body2": "Última oportunidade — isto é final e não pode ser recuperado.",
        "deleteAll.confirm": "Sim, eliminar tudo",
        "republish.title": "Republicar noutro canal",
        "republish.newChannel": "Novo canal",
        "action.edit": "Editar",
        "action.publish": "Publicar",
        "action.close": "Fechar",
        "action.participants": "Participantes",
        "action.republish": "Republicar",
        "action.sync": "Sincronizar",
        "action.clone": "Clonar",
        "action.delete": "Eliminar",
    },
    el: {
        "whatsNew.title": "✨ Τι νέο υπάρχει",
        "login.title": "🏆 Bot Τουρνουά",
        "login.hint": "Συνδέσου με το Discord για να διαχειρίζεσαι τουρνουά στους διακομιστές όπου είσαι διοργανωτής (δικαίωμα Manage Server).",
        "login.button": "Σύνδεση με Discord",
        "header.addToServer": "Προσθήκη σε άλλον διακομιστή",
        "header.settings": "Ρυθμίσεις",
        "header.logout": "Αποσύνδεση",
        "tabs.dashboard": "Πίνακας ελέγχου",
        "tabs.newTournament": "＋ Νέο τουρνουά",
        "dashboard.tournaments": "Τουρνουά",
        "dashboard.exportCsv": "Εξαγωγή CSV",
        "dashboard.user": "Χρήστης",
        "dashboard.registered": "Εγγεγραμμένος",
        "dashboard.noRegistrations": "Δεν υπάρχουν ακόμα εγγραφές.",
        "editor.livePreview": "Προεπισκόπηση σε πραγματικό χρόνο",
        "editor.clear": "Καθαρισμός",
        "editor.newTournament": "Νέο τουρνουά",
        "editor.section.basics": "Βασικά στοιχεία",
        "editor.section.description": "Περιγραφή",
        "editor.section.ai": "Δημιουργός περιγραφής AI",
        "editor.section.branding": "Εμφάνιση",
        "editor.section.notifications": "Ειδοποιήσεις & αλληλεπίδραση",
        "editor.field.channel": "Κανάλι ανακοίνωσης",
        "editor.field.name": "Όνομα τουρνουά/οργανισμού",
        "editor.field.game": "Παιχνίδι",
        "editor.field.format": "Μορφή",
        "editor.field.startsAt": "Ημερομηνία/ώρα έναρξης",
        "editor.field.max": "Μέγιστοι συμμετέχοντες",
        "editor.field.externalUrl": "Εξωτερικός σύνδεσμος τουρνουά (προαιρετικό)",
        "editor.field.banner": "Εικόνα banner (μεγάλη εικόνα στο κάτω μέρος)",
        "editor.field.thumbnail": "Εικονίδιο τουρνουά (μικρή μικρογραφία, πάνω δεξιά γωνία, προαιρετικό)",
        "editor.field.authorName": "Όνομα συντάκτη (μικρή γραμμή πάνω από τον τίτλο, προαιρετικό)",
        "editor.field.authorIcon": "Μίνι εικονίδιο συντάκτη",
        "editor.field.color": "Χρώμα embed",
        "editor.field.pingRole": "Ρόλος για ειδοποίηση (προαιρετικό)",
        "editor.field.reminderAt": "Αποστολή υπενθύμισης με DM στις (προαιρετικό)",
        "editor.field.reaction": "Emoji αυτόματης αντίδρασης (προαιρετικό)",
        "editor.save": "Αποθήκευση προσχεδίου",
        "settings.theme": "Θέμα",
        "settings.dark": "Σκούρο",
        "settings.light": "Ανοιχτό",
        "settings.language": "Γλώσσα",
        "settings.languageHint": "Μεταφράζει τα μενού και τις ετικέτες του πίνακα. Το περιεχόμενο τουρνουά που γράφεις παραμένει όπως το έγραψες.",
        "settings.dangerZone": "Ζώνη κινδύνου",
        "settings.deleteAllHint": "Διαγράφει μόνιμα όλα τα τουρνουά στον τρέχοντα επιλεγμένο διακομιστή — προσχέδια, δημοσιευμένα και κλειστά. Αυτό δεν μπορεί να αναιρεθεί.",
        "settings.deleteAll": "Διαγραφή όλων των τουρνουά",
        "clearModal.title": "Καθαρισμός αυτής της φόρμας;",
        "clearModal.body": "Οι μη αποθηκευμένες αλλαγές θα χαθούν. Αυτό δεν διαγράφει ένα αποθηκευμένο τουρνουά, απλώς καθαρίζει την τρέχουσα φόρμα.",
        "common.cancel": "Ακύρωση",
        "common.confirm": "Επιβεβαίωση",
        "common.continue": "Συνέχεια",
        "deleteAll.title1": "Διαγραφή όλων των τουρνουά;",
        "deleteAll.body1": "Αυτό θα διαγράψει μόνιμα όλα τα τουρνουά σε αυτόν τον διακομιστή — προσχέδια, δημοσιευμένα και κλειστά. Αυτό δεν μπορεί να αναιρεθεί.",
        "deleteAll.title2": "Είσαι απολύτως σίγουρος/η;",
        "deleteAll.body2": "Τελευταία ευκαιρία — αυτό είναι οριστικό και δεν μπορεί να ανακτηθεί.",
        "deleteAll.confirm": "Ναι, διαγραφή όλων",
        "republish.title": "Επανέκδοση σε άλλο κανάλι",
        "republish.newChannel": "Νέο κανάλι",
        "action.edit": "Επεξεργασία",
        "action.publish": "Δημοσίευση",
        "action.close": "Κλείσιμο",
        "action.participants": "Συμμετέχοντες",
        "action.republish": "Επανέκδοση",
        "action.sync": "Συγχρονισμός",
        "action.clone": "Κλωνοποίηση",
        "action.delete": "Διαγραφή",
    },
    fr: {
        "whatsNew.title": "✨ Nouveautés",
        "login.title": "🏆 Bot de Tournois",
        "login.hint": "Connectez-vous avec Discord pour gérer des tournois sur les serveurs où vous êtes organisateur (permission Gérer le serveur).",
        "login.button": "Se connecter avec Discord",
        "header.addToServer": "Ajouter à un autre serveur",
        "header.settings": "Paramètres",
        "header.logout": "Déconnexion",
        "tabs.dashboard": "Tableau de bord",
        "tabs.newTournament": "＋ Nouveau tournoi",
        "dashboard.tournaments": "Tournois",
        "dashboard.exportCsv": "Exporter en CSV",
        "dashboard.user": "Utilisateur",
        "dashboard.registered": "Inscrit",
        "dashboard.noRegistrations": "Aucune inscription pour le moment.",
        "editor.livePreview": "Aperçu en direct",
        "editor.clear": "Effacer",
        "editor.newTournament": "Nouveau tournoi",
        "editor.section.basics": "Informations de base",
        "editor.section.description": "Description",
        "editor.section.ai": "Générateur de description par IA",
        "editor.section.branding": "Habillage",
        "editor.section.notifications": "Notifications et engagement",
        "editor.field.channel": "Salon pour l'annonce",
        "editor.field.name": "Nom du tournoi/de l'organisation",
        "editor.field.game": "Jeu",
        "editor.field.format": "Format",
        "editor.field.startsAt": "Date/heure de début",
        "editor.field.max": "Participants maximum",
        "editor.field.externalUrl": "Lien externe du tournoi (optionnel)",
        "editor.field.banner": "Image de bannière (grande image en bas)",
        "editor.field.thumbnail": "Icône du tournoi (petite miniature, coin supérieur droit, optionnel)",
        "editor.field.authorName": "Nom de l'auteur (petite ligne au-dessus du titre, optionnel)",
        "editor.field.authorIcon": "Mini icône de l'auteur",
        "editor.field.color": "Couleur de l'embed",
        "editor.field.pingRole": "Rôle à notifier (optionnel)",
        "editor.field.reminderAt": "Envoyer un rappel en MP à (optionnel)",
        "editor.field.reaction": "Emoji de réaction automatique (optionnel)",
        "editor.save": "Enregistrer le brouillon",
        "settings.theme": "Thème",
        "settings.dark": "Sombre",
        "settings.light": "Clair",
        "settings.language": "Langue",
        "settings.languageHint": "Traduit les menus et les libellés du panneau. Le contenu du tournoi que vous rédigez reste tel quel.",
        "settings.dangerZone": "Zone de danger",
        "settings.deleteAllHint": "Supprime définitivement tous les tournois du serveur actuellement sélectionné — brouillons, publiés et fermés. Cette action est irréversible.",
        "settings.deleteAll": "Supprimer tous les tournois",
        "clearModal.title": "Effacer ce formulaire ?",
        "clearModal.body": "Les modifications non enregistrées seront perdues. Cela ne supprime pas un tournoi enregistré, cela efface uniquement le formulaire actuel.",
        "common.cancel": "Annuler",
        "common.confirm": "Confirmer",
        "common.continue": "Continuer",
        "deleteAll.title1": "Supprimer tous les tournois ?",
        "deleteAll.body1": "Cela supprimera définitivement tous les tournois de ce serveur — brouillons, publiés et fermés. Cette action est irréversible.",
        "deleteAll.title2": "Êtes-vous absolument sûr(e) ?",
        "deleteAll.body2": "Dernière chance — c'est définitif et irrécupérable.",
        "deleteAll.confirm": "Oui, tout supprimer",
        "republish.title": "Republier dans un autre salon",
        "republish.newChannel": "Nouveau salon",
        "action.edit": "Modifier",
        "action.publish": "Publier",
        "action.close": "Fermer",
        "action.participants": "Participants",
        "action.republish": "Republier",
        "action.sync": "Synchroniser",
        "action.clone": "Cloner",
        "action.delete": "Supprimer",
    },
};

function getLanguage() {
    try {
        return localStorage.getItem("panel-lang") || "en";
    } catch (err) {
        return "en";
    }
}

// Translates a dynamic (JS-generated) string by key — used by the dashboard's
// per-tournament action buttons, which data-i18n can't reach since they're
// rebuilt from a template string on every render. Named `tr` (not the more
// conventional `t`) because `t` is already used everywhere as the loop
// variable for "the tournament being rendered".
function tr(key) {
    const lang = getLanguage();
    return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

function applyTranslations() {
    const lang = getLanguage();
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const text = tr(el.dataset.i18n);
        if (text) el.textContent = text;
    });
    document.querySelectorAll("[data-lang-choice]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.langChoice === lang);
    });
    renderTournamentList(); // action buttons are template strings, not data-i18n
}

function setLanguage(lang) {
    try {
        localStorage.setItem("panel-lang", lang);
    } catch (err) {
        // localStorage can throw in a private window with blocked storage — the
        // choice just won't persist across reloads, not worth failing over.
    }
    applyTranslations();
}

document.querySelectorAll("[data-lang-choice]").forEach((btn) => {
    btn.addEventListener("click", () => setLanguage(btn.dataset.langChoice));
});

function getTheme() {
    try {
        return localStorage.getItem("panel-theme") || "dark";
    } catch (err) {
        return "dark";
    }
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.themeChoice === theme);
    });
}

function setTheme(theme) {
    try {
        localStorage.setItem("panel-theme", theme);
    } catch (err) {
        // see setLanguage — persistence is best-effort only
    }
    applyTheme(theme);
}

document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.themeChoice));
});

// --- Settings icon menu (replaces the old standalone Log out button) ---
document.getElementById("settings-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("settings-menu").classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
    const menu = document.getElementById("settings-menu");
    if (!menu.classList.contains("hidden") && !menu.contains(e.target) && e.target.id !== "settings-menu-btn") {
        menu.classList.add("hidden");
    }
});

document.getElementById("settings-menu-settings").addEventListener("click", () => {
    document.getElementById("settings-menu").classList.add("hidden");
    document.querySelector('.tab-btn[data-tab="settings"]').click();
});

document.getElementById("settings-menu-logout").addEventListener("click", async () => {
    document.getElementById("settings-menu").classList.add("hidden");
    await apiFetch("/api/logout", { method: "POST" }).catch(() => {});
    showLogin();
});

// --- Clear-form confirmation (the editor's Clear button is destructive to
// unsaved edits, so it asks before wiping the form instead of acting instantly) ---
document.getElementById("editor-reset-btn").addEventListener("click", () => {
    document.getElementById("clear-confirm-modal").classList.remove("hidden");
});
document.getElementById("clear-cancel-btn").addEventListener("click", () => {
    document.getElementById("clear-confirm-modal").classList.add("hidden");
});
document.getElementById("clear-confirm-btn").addEventListener("click", () => {
    document.getElementById("clear-confirm-modal").classList.add("hidden");
    resetEditorForm();
});

// --- Delete all tournaments (two sequential confirmations, since it's both
// irreversible and scoped to every tournament on the currently selected
// server — not just one) ---
document.getElementById("delete-all-btn").addEventListener("click", () => {
    document.getElementById("delete-all-modal-1").classList.remove("hidden");
});
document.getElementById("delete-all-cancel-1").addEventListener("click", () => {
    document.getElementById("delete-all-modal-1").classList.add("hidden");
});
document.getElementById("delete-all-next-btn").addEventListener("click", () => {
    document.getElementById("delete-all-modal-1").classList.add("hidden");
    document.getElementById("delete-all-result").textContent = "";
    document.getElementById("delete-all-modal-2").classList.remove("hidden");
});
document.getElementById("delete-all-cancel-2").addEventListener("click", () => {
    document.getElementById("delete-all-modal-2").classList.add("hidden");
});
document.getElementById("delete-all-confirm-btn").addEventListener("click", async () => {
    const resultEl = document.getElementById("delete-all-result");
    resultEl.textContent = "…";
    try {
        await apiFetch(`/api/tournaments?guildId=${state.guildId}`, { method: "DELETE" });
        document.getElementById("delete-all-modal-2").classList.add("hidden");
        await loadTournaments();
    } catch (err) {
        resultEl.textContent = "❌ " + err.message;
    }
});

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
        document.getElementById("invite-bot-link-app").href = url;
    } catch (err) {
        // non-critical — the buttons just stay pointed at "#"
    }
}

// =========================================================================
// "What's New" popup — shown once per browser after a deploy that bumps
// WHATS_NEW.version, never again until the next bump. Bump the version and
// add a short line here whenever a change is worth telling organizers about.
// English-only by design — keeping a running changelog translated into all
// 9 panel languages isn't realistic to maintain, so this one part stays English.
// =========================================================================

const WHATS_NEW = {
    version: "2026.02.1",
    items: [
        "Editor redesigned into collapsible sections (Basics, Description, Branding, Notifications...)",
        "Republish an announcement to a different channel",
        "New Settings tab: light/dark theme, 9 languages, delete all tournaments",
        "Custom reminder DM text, plus a button to insert a date/time into the description",
        "Saving a draft now keeps you in the editor instead of jumping to the dashboard",
    ],
};

function checkWhatsNew() {
    let seenVersion = null;
    try {
        seenVersion = localStorage.getItem("whats-new-seen");
    } catch (err) {
        return; // no localStorage access (e.g. blocked in a private window) — just skip it
    }
    if (seenVersion === WHATS_NEW.version) return;

    document.getElementById("whats-new-list").innerHTML = WHATS_NEW.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    document.getElementById("whats-new-modal").classList.remove("hidden");
}

function dismissWhatsNew() {
    try {
        localStorage.setItem("whats-new-seen", WHATS_NEW.version);
    } catch (err) {
        // best-effort — if it can't persist, the popup just shows again next visit
    }
    document.getElementById("whats-new-modal").classList.add("hidden");
}

document.getElementById("whats-new-close-btn").addEventListener("click", dismissWhatsNew);
document.getElementById("whats-new-modal").addEventListener("click", (e) => {
    if (e.target.id === "whats-new-modal") dismissWhatsNew();
});

async function init() {
    loadInviteLink();
    try {
        const me = await apiFetch("/api/me");
        state.user = me.user;
        state.guilds = me.guilds;
        document.getElementById("user-tag").textContent = me.user.username;
        showApp();
        checkWhatsNew();
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
                actions.push(`<button data-action="edit" data-id="${t.id}">${tr("action.edit")}</button>`);
                actions.push(`<button data-action="publish" data-id="${t.id}">${tr("action.publish")}</button>`);
            }
            if (t.status === "published") {
                actions.push(`<button data-action="edit" data-id="${t.id}">${tr("action.edit")}</button>`);
                actions.push(`<button data-action="close" data-id="${t.id}">${tr("action.close")}</button>`);
            }
            if (t.status !== "draft") {
                actions.push(`<button data-action="participants" data-id="${t.id}" class="secondary-btn">${tr("action.participants")}</button>`);
                actions.push(`<button data-action="republish" data-id="${t.id}" class="secondary-btn" title="Move the announcement to another channel">${tr("action.republish")}</button>`);
            }
            if (t.matcherino_bounty_id) {
                actions.push(`<button data-action="matcherino-sync" data-id="${t.id}" class="secondary-btn" title="Re-check Matcherino now">${tr("action.sync")}</button>`);
            }
            actions.push(`<button data-action="clone" data-id="${t.id}" class="secondary-btn" title="Duplicate as a new draft">${tr("action.clone")}</button>`);
            actions.push(`<button data-action="delete" data-id="${t.id}" class="secondary-btn">${tr("action.delete")}</button>`);

            // Once a Matcherino link exists, the count only ever moves via the
            // sync — Discord Join/Leave clicks never bump it, even before the
            // first successful sync (shows 0 until then).
            const hasMatcherinoReading = t.matcherino_bounty_id && t.matcherino_entrants !== null && t.matcherino_entrants !== undefined;
            const slots = t.matcherino_bounty_id ? t.matcherino_entrants ?? 0 : t.activeCount;
            const hasPrizePool = t.matcherino_prize_pool !== null && t.matcherino_prize_pool !== undefined;
            const matcherinoLine = t.matcherino_bounty_id
                ? `<div class="tournament-meta">🔗 Matcherino #${escapeHtml(t.matcherino_bounty_id)}${
                      t.matcherino_status ? ` — ${escapeHtml(capitalize(t.matcherino_status))}` : ""
                  }${
                      hasPrizePool ? ` — ${formatPrizePool(t.matcherino_prize_pool)} prize pool` : ""
                  }${
                      hasMatcherinoReading
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
                    <span class="badge badge-${dashboardStatusKey(t)}">${DASHBOARD_STATUS_LABELS[dashboardStatusKey(t)]}</span>
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
    if (action === "clone") return cloneTournament(id, btn);
    if (action === "republish") return openRepublishModal(tournament);
});

// --- "Republish in another channel" modal ---
function openRepublishModal(tournament) {
    const select = document.getElementById("republish-channel-select");
    select.innerHTML = state.channels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join("");
    select.value = tournament.channel_id || "";
    document.getElementById("republish-modal-hint").textContent = `Posts a fresh announcement in the channel you pick and marks the one in #${
        state.channels.find((c) => c.id === tournament.channel_id)?.name || "the current channel"
    } as moved.`;
    document.getElementById("republish-result").textContent = "";
    document.getElementById("republish-modal").dataset.tournamentId = tournament.id;
    document.getElementById("republish-modal").classList.remove("hidden");
}

function closeRepublishModal() {
    document.getElementById("republish-modal").classList.add("hidden");
}

document.getElementById("republish-cancel-btn").addEventListener("click", closeRepublishModal);
document.getElementById("republish-modal").addEventListener("click", (e) => {
    if (e.target.id === "republish-modal") closeRepublishModal();
});

document.getElementById("republish-confirm-btn").addEventListener("click", async () => {
    const id = document.getElementById("republish-modal").dataset.tournamentId;
    const channelId = document.getElementById("republish-channel-select").value;
    if (!channelId) return;
    const resultEl = document.getElementById("republish-result");
    resultEl.textContent = "Posting…";
    try {
        await apiFetch(`/api/tournaments/${id}/republish`, { method: "POST", body: JSON.stringify({ channelId }) });
        await loadTournaments();
        closeRepublishModal();
    } catch (err) {
        resultEl.textContent = "❌ " + err.message;
    }
});

async function cloneTournament(id, btn) {
    const originalText = btn.textContent;
    btn.textContent = "⏳ …";
    btn.disabled = true;
    try {
        const { tournament } = await apiFetch(`/api/tournaments/${id}/clone`, { method: "POST" });
        await loadTournaments();
        editTournament(tournament); // jump straight into the new draft to fill in start time etc.
    } catch (err) {
        alert(err.message);
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

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
remindAtPicker.onChange = () => updateSectionBadges();

// Reuses the same calendar UI as a one-shot "insert a Discord timestamp into
// the description" tool — it never keeps a value, it just writes <t:...:F>
// at the cursor and resets itself back to the 🕒 icon.
const descTimePicker = createDateTimePicker(document.querySelector('.dt-field[data-dt="desc-time"]'), "Time");
descTimePicker.onChange = (ms) => {
    if (!ms) return;
    insertAtCursor(document.getElementById("f-description"), `<t:${Math.floor(ms / 1000)}:F>`);
    descTimePicker.set(null);
};

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
    document.getElementById("f-author-name").value = t.author_name || "";
    remindAtPicker.set(t.reminder_at || null);
    document.getElementById("f-reminder-message").value = t.reminder_message || "";
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
    document.getElementById("f-author-name").value = "";
    remindAtPicker.set(null);
    document.getElementById("f-reminder-message").value = "";
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

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
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
document.getElementById("f-external-url").addEventListener("input", updateSectionBadges);
document.getElementById("channel-select").addEventListener("change", updateSectionBadges);

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
        pingOnPublish: Boolean(document.getElementById("f-ping-role").value),
        reminderAt: remindAtPicker.get(),
        reminderMessage: document.getElementById("f-reminder-message").value.trim() || null,
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
        let saved;
        if (id) {
            ({ tournament: saved } = await apiFetch(`/api/tournaments/${id}`, { method: "PATCH", body: JSON.stringify(data) }));
        } else {
            ({ tournament: saved } = await apiFetch("/api/tournaments", { method: "POST", body: JSON.stringify({ guildId: state.guildId, ...data }) }));
        }
        resultEl.textContent = "✅ Saved";
        await loadTournaments();
        // Stay on the editor instead of jumping to the dashboard — saving a
        // draft is something you do mid-edit, not a sign you're done with it.
        // A brand-new tournament's id/heading do need to switch over to "Edit"
        // mode though, so the next save PATCHes it instead of creating a duplicate.
        document.getElementById("tournament-id").value = saved.id;
        document.getElementById("editor-heading").textContent = `Edit: ${saved.name}`;
        renderPreview();
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
    "f-reminder-message",
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
    // Once a Matcherino link exists, the shown count only ever comes from the
    // sync — Join/Leave clicks never move it, even before the first sync.
    const activeCount = existing && existing.matcherino_bounty_id ? existing.matcherino_entrants ?? 0 : existing ? existing.activeCount : 0;

    // Message content sits above the embed — only real notification the bot
    // sends, since embeds never ping even with a mention inside them.
    const contentEl = document.getElementById("pv-content");
    if (data.pingRoleId) {
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
    registerBtn.textContent = isFull ? "Full" : "Join";
    registerBtn.style.opacity = status === "published" && !isFull ? "1" : "0.5";

    updateSectionBadges();
}

// --- Editor accordion: collapsible sections + at-a-glance fill status ---
document.querySelectorAll("[data-section-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".form-section").classList.toggle("collapsed"));
});

function setSectionBadge(section, text, variant) {
    const el = document.querySelector(`.form-section[data-section="${section}"] [data-section-badge]`);
    if (!el) return;
    el.textContent = text;
    el.classList.remove("badge-ready", "badge-warn", "badge-active");
    if (variant) el.classList.add(variant);
}

function updateSectionBadges() {
    const name = document.getElementById("f-name").value.trim();
    const channel = document.getElementById("channel-select").value;
    setSectionBadge("basics", name && channel ? "✓ Ready" : "⚠ Incomplete", name && channel ? "badge-ready" : "badge-warn");

    const descLen = document.getElementById("f-description").value.trim().length;
    setSectionBadge("description", descLen ? `${descLen} chars` : "Empty");

    setSectionBadge("integrations", "Unavailable", "badge-warn");

    let brandingCount = 0;
    if (state.bannerOverride || document.getElementById("f-banner").value.trim()) brandingCount++;
    if (state.thumbnailOverride || document.getElementById("f-thumbnail").value.trim()) brandingCount++;
    if (document.getElementById("f-author-name").value.trim()) brandingCount++;
    if (state.authorIconOverride || document.getElementById("f-author-icon").value.trim()) brandingCount++;
    setSectionBadge("branding", `${brandingCount}/4 set`, brandingCount ? "badge-active" : null);

    let notifCount = 0;
    if (document.getElementById("f-ping-role").value) notifCount++;
    if (remindAtPicker.get()) notifCount++;
    if (state.reactionEmoji) notifCount++;
    setSectionBadge("notifications", `${notifCount}/3 active`, notifCount ? "badge-active" : null);
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

    // Discord timestamp tags <t:unix:style> — the 🕒 toolbar button inserts
    // these as <t:...:F>, but render whatever style shows up.
    html = html.replace(/&lt;t:(\d+):([tTdDfFR])&gt;/g, (_, unix, style) => {
        return `<span class="dp-mention">${escapeHtml(formatDiscordTimestamp(parseInt(unix, 10) * 1000, style))}</span>`;
    });

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

// Mirrors how Discord itself renders <t:unix:style> tags — see
// https://discord.com/developers/docs/reference#message-formatting-timestamp-styles
function formatDiscordTimestamp(ms, style) {
    const d = new Date(ms);
    switch (style) {
        case "t":
            return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        case "T":
            return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
        case "d":
            return d.toLocaleDateString([], { month: "numeric", day: "numeric", year: "numeric" });
        case "D":
            return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
        case "F":
            return d.toLocaleString([], { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
        case "R":
            return formatRelativeTime(ms);
        case "f":
        default:
            return d.toLocaleString([], { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    }
}

function formatRelativeTime(ms) {
    const diffSeconds = Math.round((ms - Date.now()) / 1000);
    const units = [
        ["year", 31536000],
        ["month", 2592000],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
        ["second", 1],
    ];
    for (const [unit, secondsInUnit] of units) {
        if (Math.abs(diffSeconds) >= secondsInUnit || unit === "second") {
            return new Intl.RelativeTimeFormat([], { numeric: "auto" }).format(Math.round(diffSeconds / secondsInUnit), unit);
        }
    }
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
    // Clicking back into the description to reposition the cursor (e.g. before
    // inserting another emoji) shouldn't close the picker sitting above it.
    if (e.target.id === "f-description") return;
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
function wireEmojiPicker(dropdownEl, triggerBtn, onPick, { closeOnPick = true, ignoreClicksOn = [], skipOutsideClickHandler = false } = {}) {
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
                if (closeOnPick) close();
            });
            dropdownEl.appendChild(btn);
        }
    });

    document.addEventListener("click", (e) => {
        if (skipOutsideClickHandler) return; // another listener already owns closing this one (see below)
        if (triggerBtn.contains(e.target) || dropdownEl.contains(e.target)) return;
        if (ignoreClicksOn.some((el) => el && el.contains(e.target))) return;
        close();
    });
}

wireEmojiPicker(
    formatDropdown,
    document.getElementById("emoji-picker-btn"),
    (emoji) => {
        insertAtCursor(document.getElementById("f-description"), emoji.tag);
    },
    {
        closeOnPick: false, // stays open across picks and while repositioning the cursor
        // format-dropdown is shared with the @Role/#Chan/@User buttons, whose own
        // document-click listener (above) already knows about all four triggers
        // and the textarea exemption — a second, narrower one here would fight it
        // and close the dropdown the instant one of those other buttons is clicked.
        skipOutsideClickHandler: true,
    }
);

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
    updateSectionBadges();
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

applyTheme(getTheme());
applyTranslations();
init();
