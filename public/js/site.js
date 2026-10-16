import {
  addDays, daysBetween, eventSpan, formatDelay, formatWeekRange, mondayOf,
  wallMinutes, zonedNow, DAY_NAMES, DAY_SHORT, MONTHS_SHORT, weekday
} from "./lib/dates.js";
import { NETWORKS, linkSubtitle, ownerTwitch } from "./lib/model.js";
import { svgIcon } from "./lib/icons.js";

const $ = id => document.getElementById(id);

const initial = JSON.parse($("initial-data").textContent);
const settings = initial.settings;
const twitchLogin = ownerTwitch(settings);
const twitchUrl = settings.links.twitch || null;

/** Lives déjà chargés, regroupés par lundi de semaine. */
const weeks = new Map();
const currentMonday = mondayOf(initial.today);
let shownMonday = currentMonday;

function storeRange(from, to, events) {
  for (let monday = mondayOf(from); monday <= to; monday = addDays(monday, 7)) weeks.set(monday, []);
  for (const event of events) weeks.get(mondayOf(event.date))?.push(event);
}
storeRange(initial.loaded.from, initial.loaded.to, initial.events);
// Lives de la veille (hors semaine affichée) : utiles seulement pour le statut « en live ».
const earlier = initial.events.filter(e => e.date < initial.loaded.from);

/* ==========================================================================
   Profil et liens
   ========================================================================== */

function renderProfile() {
  const avatar = $("avatar");
  if (settings.avatarUrl) {
    const img = document.createElement("img");
    img.src = settings.avatarUrl;
    img.alt = settings.displayName;
    img.width = img.height = 108;
    avatar.appendChild(img);
  } else {
    const initialEl = document.createElement("div");
    initialEl.className = "avatar-initial";
    initialEl.setAttribute("aria-hidden", "true");
    initialEl.textContent = [...settings.displayName][0]?.toUpperCase() ?? "?";
    avatar.appendChild(initialEl);
  }

  $("name").textContent = settings.displayName;
  $("footer-name").textContent = settings.displayName;
  $("year").textContent = new Date().getFullYear();

  if (twitchLogin) {
    $("handle").textContent = `@${twitchLogin}`;
    $("handle").hidden = false;
  }
  if (settings.bio) {
    $("bio").textContent = settings.bio;
    $("bio").hidden = false;
  }
  if (twitchUrl) {
    $("status").href = twitchUrl;
    $("status").hidden = false;
  }
}

function renderLinks() {
  const nav = $("links");
  for (const network of NETWORKS) {
    const url = settings.links[network.key];
    if (!url) continue;

    const a = document.createElement("a");
    a.className = `link${network.key === "twitch" ? " is-featured" : ""}`;
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener me";
    a.dataset.network = network.key;
    a.style.setProperty("--brand", network.color);

    const icon = document.createElement("span");
    icon.className = "link-icon";
    icon.appendChild(svgIcon(network.key));

    const text = document.createElement("span");
    text.className = "link-text";
    const label = document.createElement("span");
    label.className = "link-label";
    label.textContent = network.label;
    const sub = document.createElement("span");
    sub.className = "link-sub";
    sub.textContent = linkSubtitle(network.key, url);
    text.append(label, sub);

    const arrow = document.createElement("span");
    arrow.className = "link-arrow";
    arrow.appendChild(svgIcon("arrow"));

    a.append(icon, text, arrow);
    nav.appendChild(a);
  }
}

/* ==========================================================================
   Planning
   ========================================================================== */

const nowWall = () => {
  const now = zonedNow();
  return { date: now.date, wall: wallMinutes(now.date, "00:00") + now.minutes };
};

function guestChip(guest) {
  const chip = document.createElement(guest.twitch ? "a" : "span");
  chip.className = "guest";
  if (guest.twitch) {
    chip.href = `https://www.twitch.tv/${guest.twitch}`;
    chip.target = "_blank";
    chip.rel = "noopener";
    chip.title = `twitch.tv/${guest.twitch}`;
    chip.appendChild(svgIcon("twitch"));
  }
  chip.append(guest.name);
  return chip;
}

function eventElement(event, now) {
  const { start, end } = eventSpan(event);
  const el = document.createElement("div");
  el.className = "event";

  const top = document.createElement("div");
  top.className = "event-top";
  const time = document.createElement("span");
  time.className = "event-time";
  time.textContent = `${event.start} – ${event.end}`;
  const title = document.createElement("span");
  title.className = "event-title";
  title.textContent = event.title;
  top.append(time, title);

  if (now.wall >= start && now.wall < end) {
    const tag = document.createElement("span");
    tag.className = "tag-live";
    tag.textContent = "En live";
    top.appendChild(tag);
  }
  el.appendChild(top);

  if (event.game || event.guests.length) {
    const meta = document.createElement("div");
    meta.className = "event-meta";
    if (event.game) {
      const game = document.createElement("span");
      game.className = "event-game";
      game.textContent = event.game;
      meta.appendChild(game);
    }
    if (event.guests.length) {
      const span = text => Object.assign(document.createElement("span"), { textContent: text });
      if (event.game) meta.appendChild(span("·"));
      meta.appendChild(span("avec"));
      event.guests.forEach(g => meta.appendChild(guestChip(g)));
    }
    el.appendChild(meta);
  }
  return el;
}

function renderWeek() {
  const container = $("week");
  const events = weeks.get(shownMonday);
  const now = nowWall();

  $("week-label").textContent = shownMonday === currentMonday ? "Cette semaine" : formatWeekRange(shownMonday);
  $("prev-week").disabled = shownMonday <= currentMonday;
  container.classList.toggle("is-loading", !events);
  if (!events) return;

  container.replaceChildren();

  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "week-empty";
    const strong = document.createElement("strong");
    strong.textContent = "Pas encore de lives prévus";
    empty.append(strong, shownMonday === currentMonday
      ? "Le planning arrive bientôt, passe sur le Discord pour être prévenu."
      : `Semaine du ${formatWeekRange(shownMonday)}.`);
    container.appendChild(empty);
    return;
  }

  for (let i = 0; i < 7; i++) {
    const date = addDays(shownMonday, i);
    const dayEvents = events.filter(e => e.date === date);

    const row = document.createElement("div");
    row.className = "day";
    row.classList.toggle("is-empty", !dayEvents.length);
    row.classList.toggle("is-today", date === now.date);
    // Les jours passés sans live en cours sont estompés.
    row.classList.toggle("is-past", date < now.date && !dayEvents.some(e => eventSpan(e).end > now.wall));

    const name = document.createElement("div");
    name.className = "day-name";
    const [, month, day] = date.split("-").map(Number);
    name.append(DAY_NAMES[weekday(date)]);
    const small = document.createElement("small");
    small.textContent = `${day} ${MONTHS_SHORT[month - 1]}`;
    name.appendChild(small);

    const list = document.createElement("div");
    list.className = "day-events";
    if (dayEvents.length) {
      dayEvents.forEach(e => list.appendChild(eventElement(e, now)));
    } else {
      const empty = document.createElement("span");
      empty.className = "day-empty";
      empty.textContent = "Pas de live";
      list.appendChild(empty);
    }

    row.append(name, list);
    container.appendChild(row);
  }
}

/** Badge du profil + bandeau « prochain live », calculés sur tous les lives chargés. */
function renderStatus() {
  const now = nowWall();
  const all = [...earlier, ...weeks.values()].flat();

  const live = all.find(e => {
    const { start, end } = eventSpan(e);
    return now.wall >= start && now.wall < end;
  });
  const next = all
    .map(e => ({ event: e, start: eventSpan(e).start }))
    .filter(x => x.start > now.wall)
    .sort((a, b) => a.start - b.start)[0];

  const status = $("status");
  status.classList.toggle("is-live", Boolean(live));
  $("status-text").textContent = live ? "Live prévu en ce moment" : "Hors ligne";

  const banner = $("next-up");
  banner.classList.toggle("is-live", Boolean(live));
  banner.replaceChildren();
  if (twitchUrl) banner.href = twitchUrl;

  const what = document.createElement("span");
  what.className = "what";
  const strong = document.createElement("strong");
  const when = document.createElement("span");
  when.className = "when";

  if (live) {
    strong.textContent = "En live";
    what.append(strong, ` — ${live.title}`);
    when.textContent = `jusqu'à ${live.end}`;
  } else if (next) {
    const e = next.event;
    strong.textContent = "Prochain live";
    what.append(strong, ` — ${DAY_SHORT[weekday(e.date)].replace(".", "")} ${e.start} · ${e.title}`);
    when.textContent = formatDelay(next.start - now.wall, daysBetween(now.date, e.date));
  } else {
    banner.hidden = true;
    return;
  }

  banner.append(svgIcon("bolt"), what, when);
  banner.hidden = false;
}

async function showWeek(monday) {
  shownMonday = monday;
  renderWeek();
  if (weeks.has(monday)) return;

  try {
    const to = addDays(monday, 6);
    const res = await fetch(`/api/events?from=${monday}&to=${to}`);
    if (!res.ok) throw new Error(res.status);
    const { events } = await res.json();
    storeRange(monday, to, events);
  } catch {
    weeks.set(monday, []);
  }
  if (shownMonday === monday) renderWeek();
}

/* ==========================================================================
   Démarrage
   ========================================================================== */

$("prev-week").appendChild(svgIcon("chevronLeft"));
$("next-week").appendChild(svgIcon("chevronRight"));
$("prev-week").addEventListener("click", () => showWeek(addDays(shownMonday, -7)));
$("next-week").addEventListener("click", () => showWeek(addDays(shownMonday, 7)));

const copyButton = $("copy-link");
const copyLabel = document.createElement("span");
copyLabel.textContent = "Copier le lien";
copyButton.append(svgIcon("link"), copyLabel);
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.origin + location.pathname);
    copyLabel.textContent = "Lien copié !";
  } catch {
    copyLabel.textContent = location.host;
  }
  setTimeout(() => { copyLabel.textContent = "Copier le lien"; }, 2000);
});

renderProfile();
renderLinks();
renderWeek();
renderStatus();

// Rafraîchit le statut chaque minute ; recharge si le jour a changé (nouvelle semaine…).
setInterval(() => {
  if (zonedNow().date !== initial.today && mondayOf(zonedNow().date) !== currentMonday) {
    location.reload();
    return;
  }
  renderWeek();
  renderStatus();
}, 60_000);
