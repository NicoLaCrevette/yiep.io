import {
  addDays, formatDayLong, formatDayShort, formatWeekRange, mondayOf, toMinutes, zonedNow
} from "./lib/dates.js";
import { NETWORKS, LIMITS, normalizeTwitch, validateEvent, validateSettings } from "./lib/model.js";
import { svgIcon } from "./lib/icons.js";
import { renderPlanningImage, canvasToBlob } from "./planning-image.js";

const $ = id => document.getElementById(id);

const ACCENT_PRESETS = ["#9146ff", "#6366f1", "#0ea5e9", "#10b981", "#f97316", "#ff4757", "#e0457b"];
const DEFAULT_TIMES = { start: "21:00", end: "00:00" };

const state = {
  settings: null,
  today: zonedNow().date,
  monday: mondayOf(zonedNow().date),
  events: [],
  editing: null // live en cours d'édition (null = création)
};

/* ==========================================================================
   Outils
   ========================================================================== */

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(method, url, body, { raw = false } = {}) {
  const options = { method, headers: {}, credentials: "same-origin" };
  if (body !== undefined) {
    if (raw) {
      options.body = body;
      options.headers["Content-Type"] = body.type;
    } else {
      options.body = JSON.stringify(body);
      options.headers["Content-Type"] = "application/json";
    }
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new ApiError("Serveur injoignable. Vérifie ta connexion.", 0);
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && url !== "/api/login") {
    showLogin("Ta session a expiré, reconnecte-toi.");
  }
  if (!res.ok) throw new ApiError(data?.error ?? `Erreur ${res.status}`, res.status);
  return data;
}

function toast(message, { error = false } = {}) {
  const el = document.createElement("div");
  el.className = `toast${error ? " is-error" : ""}`;
  el.setAttribute("role", error ? "alert" : "status");
  el.append(svgIcon(error ? "close" : "check"), message);
  $("toasts").appendChild(el);
  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 300);
  }, error ? 5000 : 3200);
}

/** Petit localStorage tolérant (navigation privée, stockage bloqué…). */
const memory = {
  get(key) { try { return JSON.parse(localStorage.getItem(`yiep:${key}`)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`yiep:${key}`, JSON.stringify(value)); } catch { /* ignoré */ } }
};

function setButton(button, iconName, label) {
  const span = document.createElement("span");
  span.textContent = label;
  button.replaceChildren(...(iconName ? [svgIcon(iconName)] : []), span);
}

function busy(button, isBusy) {
  button.disabled = isBusy;
  button.setAttribute("aria-busy", String(isBusy));
}

/* ==========================================================================
   Connexion
   ========================================================================== */

function showLogin(message = "") {
  document.querySelectorAll("dialog[open]").forEach(d => d.close());
  $("app").hidden = true;
  $("login").hidden = false;
  $("login-error").textContent = message;
  $("password").value = "";
  $("password").focus();
}

$("login").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("login-submit");
  $("login-error").textContent = "";
  busy(button, true);
  try {
    await api("POST", "/api/login", { password: $("password").value });
    await openApp();
  } catch (err) {
    $("login-error").textContent = err.message;
    $("password").select();
  } finally {
    busy(button, false);
  }
});

$("logout").addEventListener("click", async () => {
  await api("POST", "/api/logout").catch(() => null);
  showLogin();
});

async function openApp() {
  const { settings } = await api("GET", "/api/settings");
  applySettings(settings);
  $("login").hidden = true;
  $("app").hidden = false;
  selectTab(location.hash === "#profil" ? "profile" : "planning");
  await loadWeek(state.monday);
}

function applySettings(settings) {
  state.settings = settings;
  document.documentElement.style.setProperty("--accent", settings.accent);
  $("brand-name").textContent = settings.displayName;

  const mark = $("brand-mark");
  mark.replaceChildren();
  if (settings.avatarUrl) {
    const img = document.createElement("img");
    img.src = settings.avatarUrl;
    img.alt = "";
    mark.appendChild(img);
  } else {
    mark.textContent = [...settings.displayName][0]?.toUpperCase() ?? "?";
  }
}

/* ==========================================================================
   Onglets
   ========================================================================== */

function selectTab(name) {
  for (const tab of ["planning", "profile"]) {
    const active = tab === name;
    $(`tab-${tab}`).setAttribute("aria-selected", String(active));
    $(`view-${tab}`).hidden = !active;
  }
  history.replaceState(null, "", name === "profile" ? "#profil" : location.pathname);
  if (name === "profile") fillProfileForm();
  // Annule l'aperçu de couleur d'un profil non enregistré.
  else document.documentElement.style.setProperty("--accent", state.settings.accent);
}

$("tab-planning").addEventListener("click", () => selectTab("planning"));
$("tab-profile").addEventListener("click", () => selectTab("profile"));

/* ==========================================================================
   Semaine
   ========================================================================== */

async function loadWeek(monday) {
  state.monday = monday;
  renderWeekHeader();
  try {
    const { events } = await api("GET", `/api/events?from=${monday}&to=${addDays(monday, 6)}`);
    if (state.monday !== monday) return; // l'utilisateur a déjà changé de semaine
    state.events = events;
  } catch (err) {
    if (err.status !== 401) toast(err.message, { error: true });
    state.events = [];
  }
  renderDays();
}

function renderWeekHeader() {
  const current = mondayOf(state.today);
  const diff = Math.round((Date.parse(state.monday) - Date.parse(current)) / (7 * 86_400_000));
  $("week-kicker").textContent =
    diff === 0 ? "Cette semaine"
      : diff === 1 ? "Semaine prochaine"
        : diff === -1 ? "Semaine dernière"
          : diff > 0 ? `Dans ${diff} semaines` : `Il y a ${-diff} semaines`;
  $("week-range").textContent = formatWeekRange(state.monday);
  $("this-week").hidden = diff === 0;
}

function eventCard(event) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "event-card";
  card.addEventListener("click", () => openEventDialog(event));

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = `${event.start} – ${event.end}`;

  const info = document.createElement("span");
  info.className = "info";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = event.title;
  info.appendChild(title);

  const meta = [event.game, event.guests.length ? `avec ${event.guests.map(g => g.name).join(", ")}` : ""]
    .filter(Boolean).join(" · ");
  if (meta) {
    const metaEl = document.createElement("span");
    metaEl.className = "meta";
    metaEl.textContent = meta;
    info.appendChild(metaEl);
  }

  const chev = document.createElement("span");
  chev.className = "chev";
  chev.appendChild(svgIcon("chevronRight"));

  card.append(time, info, chev);
  return card;
}

function renderDays() {
  const container = $("days");
  container.replaceChildren();

  for (let i = 0; i < 7; i++) {
    const date = addDays(state.monday, i);
    const events = state.events.filter(e => e.date === date);

    const day = document.createElement("section");
    day.className = "day";
    day.classList.toggle("is-today", date === state.today);
    day.classList.toggle("is-past", date < state.today);

    const head = document.createElement("div");
    head.className = "day-head";
    const [name, ...rest] = formatDayLong(date).split(" ");
    const strong = document.createElement("strong");
    strong.textContent = name;
    const sub = document.createElement("span");
    sub.textContent = rest.join(" ");
    head.append(strong, sub);
    if (date === state.today) {
      const badge = document.createElement("span");
      badge.className = "today-badge";
      badge.textContent = "Aujourd'hui";
      head.appendChild(badge);
    }

    const body = document.createElement("div");
    body.className = "day-body";
    events.forEach(e => body.appendChild(eventCard(e)));

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-event";
    add.append(svgIcon("plus"), events.length ? "Ajouter" : "Ajouter un live");
    add.addEventListener("click", () => openEventDialog(null, date));
    body.appendChild(add);

    day.append(head, body);
    container.appendChild(day);
  }

  $("copy-week").disabled = state.events.length === 0;
}

$("prev-week").addEventListener("click", () => loadWeek(addDays(state.monday, -7)));
$("next-week").addEventListener("click", () => loadWeek(addDays(state.monday, 7)));
$("this-week").addEventListener("click", () => loadWeek(mondayOf(state.today)));

// Flèches du clavier pour changer de semaine (hors saisie et hors fenêtre ouverte).
document.addEventListener("keydown", event => {
  if ($("app").hidden || $("view-planning").hidden || document.querySelector("dialog[open]")) return;
  if (event.target.closest("input, textarea, select") || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "ArrowLeft") loadWeek(addDays(state.monday, -7));
  if (event.key === "ArrowRight") loadWeek(addDays(state.monday, 7));
});

$("copy-week").addEventListener("click", async () => {
  const button = $("copy-week");
  busy(button, true);
  try {
    const { created, skipped } = await api("POST", "/api/events/copy-week", { week: state.monday });
    const target = formatWeekRange(addDays(state.monday, 7));
    if (created === 0) toast(`Rien à copier : la semaine du ${target} contient déjà ces lives.`);
    else toast(`${created} live${created > 1 ? "s" : ""} copié${created > 1 ? "s" : ""} vers la semaine du ${target}${skipped ? ` (${skipped} déjà présent${skipped > 1 ? "s" : ""})` : ""}.`);
  } catch (err) {
    if (err.status !== 401) toast(err.message, { error: true });
  } finally {
    busy(button, false);
    $("copy-week").disabled = state.events.length === 0;
  }
});

/* ==========================================================================
   Fenêtre d'édition d'un live
   ========================================================================== */

const eventDialog = $("event-dialog");
const eventForm = $("event-form");

function guestRow(guest = { name: "", twitch: "" }) {
  const row = document.createElement("div");
  row.className = "guest-row";

  const name = document.createElement("input");
  name.type = "text";
  name.placeholder = "Nom";
  name.maxLength = LIMITS.guestName;
  name.value = guest.name;
  name.dataset.role = "name";
  name.setAttribute("aria-label", "Nom de l'invité");

  const twitchWrap = document.createElement("div");
  twitchWrap.className = "guest-twitch";
  const twitch = document.createElement("input");
  twitch.type = "text";
  twitch.placeholder = "Pseudo ou lien Twitch";
  twitch.value = guest.twitch;
  twitch.dataset.role = "twitch";
  twitch.autocapitalize = "off";
  twitch.spellcheck = false;
  twitch.setAttribute("aria-label", "Twitch de l'invité");
  // Un lien collé (https://twitch.tv/xxx) est réduit au pseudo, qui sert aussi de nom par défaut.
  twitch.addEventListener("change", () => {
    const login = normalizeTwitch(twitch.value);
    if (!login) return;
    twitch.value = login;
    if (!name.value.trim()) name.value = login;
  });
  twitchWrap.append(svgIcon("twitch"), twitch);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn btn-ghost btn-icon";
  remove.setAttribute("aria-label", "Retirer cet invité");
  remove.appendChild(svgIcon("close"));
  remove.addEventListener("click", () => {
    row.remove();
    updateGuestButton();
  });

  row.append(name, twitchWrap, remove);
  return row;
}

function updateGuestButton() {
  $("add-guest").hidden = $("guest-list").children.length >= LIMITS.guests;
}

$("add-guest").addEventListener("click", () => {
  const row = guestRow();
  $("guest-list").appendChild(row);
  updateGuestButton();
  row.querySelector("input").focus();
});

function updateOvernightHint() {
  const { start, end } = eventForm.elements;
  $("overnight-hint").hidden = !(start.value && end.value && toMinutes(end.value) < toMinutes(start.value));
}
eventForm.elements.start.addEventListener("input", updateOvernightHint);
eventForm.elements.end.addEventListener("input", updateOvernightHint);

let deleteArmed = null;
function resetDeleteButton() {
  clearTimeout(deleteArmed);
  deleteArmed = null;
  setButton($("event-delete"), "trash", "Supprimer");
}

function openEventDialog(event, date) {
  state.editing = event;
  const times = event ?? memory.get("lastTimes") ?? DEFAULT_TIMES;
  const f = eventForm.elements;

  $("event-dialog-title").textContent = event ? "Modifier le live" : "Nouveau live";
  f.title.value = event?.title ?? "";
  f.date.value = event?.date ?? date;
  f.start.value = times.start;
  f.end.value = times.end;
  f.game.value = event?.game ?? "";

  const list = $("guest-list");
  list.replaceChildren(...(event?.guests ?? []).map(guestRow));
  updateGuestButton();

  $("event-error").textContent = "";
  $("event-delete").hidden = !event;
  $("event-duplicate").hidden = !event;
  resetDeleteButton();
  updateOvernightHint();

  eventDialog.showModal();
  f.title.focus();
}

function readEventForm() {
  const f = eventForm.elements;
  return {
    title: f.title.value,
    date: f.date.value,
    start: f.start.value,
    end: f.end.value,
    game: f.game.value,
    guests: [...$("guest-list").children].map(row => ({
      name: row.querySelector('[data-role="name"]').value,
      twitch: row.querySelector('[data-role="twitch"]').value
    }))
  };
}

/** Après un enregistrement : recharge la semaine du live (et y va si on l'a déplacé). */
async function afterSave(date) {
  eventDialog.close();
  await loadWeek(mondayOf(date));
}

eventForm.addEventListener("submit", async submitEvent => {
  submitEvent.preventDefault();
  const { value, error } = validateEvent(readEventForm());
  if (error) {
    $("event-error").textContent = error;
    return;
  }

  const button = $("event-save");
  busy(button, true);
  try {
    if (state.editing) {
      await api("PUT", `/api/events/${encodeURIComponent(state.editing.id)}`, value);
      toast("Live modifié.");
    } else {
      await api("POST", "/api/events", value);
      toast(`Live ajouté le ${formatDayShort(value.date)}.`);
    }
    memory.set("lastTimes", { start: value.start, end: value.end });
    await afterSave(value.date);
  } catch (err) {
    $("event-error").textContent = err.message;
  } finally {
    busy(button, false);
  }
});

$("event-delete").addEventListener("click", async () => {
  // Premier clic : on arme ; second clic dans les 4 s : on supprime.
  if (!deleteArmed) {
    setButton($("event-delete"), "trash", "Confirmer ?");
    deleteArmed = setTimeout(resetDeleteButton, 4000);
    return;
  }
  resetDeleteButton();
  try {
    await api("DELETE", `/api/events/${encodeURIComponent(state.editing.id)}`);
    toast("Live supprimé.");
    await afterSave(state.editing.date);
  } catch (err) {
    $("event-error").textContent = err.message;
  }
});

$("event-duplicate").addEventListener("click", async () => {
  const { value, error } = validateEvent(readEventForm());
  if (error) {
    $("event-error").textContent = error;
    return;
  }
  const copy = { ...value, date: addDays(value.date, 7) };
  try {
    await api("POST", "/api/events", copy);
    toast(`Copié au ${formatDayShort(copy.date)}.`);
    eventDialog.close();
    await loadWeek(state.monday);
  } catch (err) {
    $("event-error").textContent = err.message;
  }
});

/* ==========================================================================
   Image du planning
   ========================================================================== */

const imageDialog = $("image-dialog");
let imageCanvas = null;
let imageUrl = null;

async function generateImage() {
  const preview = $("image-preview");
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  preview.replaceChildren(spinner);
  $("image-copy").disabled = $("image-download").disabled = true;

  try {
    imageCanvas = await renderPlanningImage({
      settings: state.settings,
      monday: state.monday,
      events: state.events,
      hideEmpty: $("hide-empty").checked
    });
    const blob = await canvasToBlob(imageCanvas);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(blob);

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = `Planning de la semaine du ${formatWeekRange(state.monday)}`;
    preview.replaceChildren(img);
    $("image-copy").disabled = $("image-download").disabled = false;
  } catch (err) {
    preview.replaceChildren(document.createTextNode(`Impossible de générer l'image : ${err.message}`));
  }
}

$("open-image").addEventListener("click", () => {
  $("image-subtitle").textContent = `Semaine du ${formatWeekRange(state.monday)} · prête pour Discord`;
  $("hide-empty").checked = memory.get("hideEmpty") ?? false;
  imageDialog.showModal();
  generateImage();
});

$("hide-empty").addEventListener("change", () => {
  memory.set("hideEmpty", $("hide-empty").checked);
  generateImage();
});

$("image-download").addEventListener("click", () => {
  if (!imageUrl) return;
  const a = document.createElement("a");
  a.href = imageUrl;
  a.download = `planning-${state.monday}.png`;
  a.click();
});

$("image-copy").addEventListener("click", async () => {
  if (!imageCanvas) return;
  try {
    // On passe une promesse (et pas le blob) : requis par Safari.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasToBlob(imageCanvas) })]);
    toast("Image copiée — colle-la dans Discord avec Ctrl+V.");
  } catch {
    toast("Copie impossible dans ce navigateur : utilise « Télécharger ».", { error: true });
  }
});

// Clic sur le fond sombre : ferme la fenêtre d'image (pas celle d'édition, pour ne rien perdre).
imageDialog.addEventListener("click", event => {
  if (event.target === imageDialog) imageDialog.close();
});

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

/* ==========================================================================
   Profil & liens
   ========================================================================== */

const profileForm = $("profile-form");

function setAccentSelection(color) {
  profileForm.elements.accent.value = color;
  document.documentElement.style.setProperty("--accent", color);
  document.querySelectorAll(".swatch").forEach(s => s.setAttribute("aria-pressed", String(s.dataset.color === color)));
}

function buildProfileForm() {
  const swatches = $("swatches");
  for (const color of ACCENT_PRESETS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.dataset.color = color;
    swatch.style.background = color;
    swatch.setAttribute("aria-label", `Couleur ${color}`);
    swatch.addEventListener("click", () => setAccentSelection(color));
    swatches.insertBefore(swatch, $("accent-input"));
  }
  $("accent-input").addEventListener("input", event => setAccentSelection(event.target.value));

  const fields = $("network-fields");
  for (const network of NETWORKS) {
    const row = document.createElement("label");
    row.className = "network-field";
    const icon = document.createElement("span");
    icon.className = "network-icon";
    icon.style.background = `color-mix(in srgb, ${network.color} 16%, transparent)`;
    icon.style.color = network.color;
    icon.appendChild(svgIcon(network.key));
    const input = document.createElement("input");
    input.type = "url";
    input.name = `link-${network.key}`;
    input.placeholder = `Lien ${network.label}`;
    input.inputMode = "url";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", `Lien ${network.label}`);
    row.append(icon, input);
    fields.appendChild(row);
  }

  const bio = profileForm.elements.bio;
  const counter = () => { $("bio-counter").textContent = `${bio.value.length}/${LIMITS.bio}`; };
  bio.addEventListener("input", counter);
  counter();
}

function renderAvatarPreview() {
  const preview = $("avatar-preview");
  preview.replaceChildren();
  if (state.settings.avatarUrl) {
    const img = document.createElement("img");
    img.src = state.settings.avatarUrl;
    img.alt = "Photo de profil";
    preview.appendChild(img);
  } else {
    preview.textContent = [...state.settings.displayName][0]?.toUpperCase() ?? "?";
  }
  $("avatar-remove").hidden = !state.settings.avatarUrl;
}

function fillProfileForm() {
  const s = state.settings;
  const f = profileForm.elements;
  f.displayName.value = s.displayName;
  f.bio.value = s.bio;
  f.bio.dispatchEvent(new Event("input"));
  for (const network of NETWORKS) f[`link-${network.key}`].value = s.links[network.key] ?? "";
  setAccentSelection(s.accent);
  renderAvatarPreview();
  $("profile-error").textContent = "";
}

profileForm.addEventListener("submit", async event => {
  event.preventDefault();
  const f = profileForm.elements;
  const payload = {
    displayName: f.displayName.value,
    bio: f.bio.value,
    accent: f.accent.value,
    links: Object.fromEntries(NETWORKS.map(n => [n.key, f[`link-${n.key}`].value]))
  };

  const { error } = validateSettings(payload);
  if (error) {
    $("profile-error").textContent = error;
    return;
  }

  const button = $("profile-save");
  busy(button, true);
  $("profile-error").textContent = "";
  try {
    const { settings } = await api("PUT", "/api/settings", payload);
    applySettings(settings);
    fillProfileForm();
    toast("Profil enregistré.");
  } catch (err) {
    $("profile-error").textContent = err.message;
  } finally {
    busy(button, false);
  }
});

/** Recadre l'image en carré (512 px max) et la compresse avant l'envoi. */
async function prepareAvatar(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(512, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d").drawImage(
    bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size
  );
  const toBlob = (type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob("image/webp", 0.9);
  // Certains navigateurs (Safari) ne savent pas encoder en WebP et renvoient du PNG.
  return webp?.type === "image/webp" ? webp : toBlob("image/jpeg", 0.9);
}

$("avatar-input").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const blob = await prepareAvatar(file);
    const { settings } = await api("PUT", "/api/avatar", blob, { raw: true });
    applySettings(settings);
    renderAvatarPreview();
    toast("Photo de profil mise à jour.");
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Image illisible.", { error: true });
  }
});

$("avatar-remove").addEventListener("click", async () => {
  try {
    const { settings } = await api("DELETE", "/api/avatar");
    applySettings(settings);
    renderAvatarPreview();
    toast("Photo retirée.");
  } catch (err) {
    toast(err.message, { error: true });
  }
});

/* ==========================================================================
   Démarrage
   ========================================================================== */

$("prev-week").appendChild(svgIcon("chevronLeft"));
$("next-week").appendChild(svgIcon("chevronRight"));
setButton($("copy-week"), "duplicate", "Copier vers la semaine suivante");
setButton($("open-image"), "image", "Image pour Discord");
setButton($("view-site"), "external", "Voir le site");
$("logout").appendChild(svgIcon("logout"));
setButton($("add-guest"), "plus", "Ajouter un invité");
setButton($("event-duplicate"), "duplicate", "+7 jours");
setButton($("image-copy"), "copy", "Copier");
setButton($("image-download"), "download", "Télécharger PNG");
document.querySelectorAll("[data-close].btn-icon").forEach(b => b.appendChild(svgIcon("close")));
buildProfileForm();

(async () => {
  try {
    const session = await api("GET", "/api/session");
    if (!session.enabled) {
      showLogin("L'admin est désactivée : définis ADMIN_PASSWORD sur le serveur (voir README).");
      $("login-submit").disabled = true;
      return;
    }
    if (session.authenticated) await openApp();
    else showLogin();
  } catch (err) {
    showLogin(err.message);
  }
})();
