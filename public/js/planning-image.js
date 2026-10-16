/**
 * Génère l'image PNG du planning de la semaine, à poster dans le salon
 * #planning du Discord (ou sur X / Instagram).
 *
 * Tout est dessiné à la main sur un <canvas> : rendu net, aucune dépendance,
 * et un résultat identique quel que soit le navigateur.
 */
import { addDays, formatWeekRange, DAY_SHORT, weekday } from "./lib/dates.js";
import { BRAND } from "./lib/icons.js";
import { ownerTwitch } from "./lib/model.js";

const WIDTH = 1200;
const PAD = 64;
const SCALE = 2; // image finale en 2400 px de large : nette même zoomée
const FONT = '"Inter", ui-sans-serif, system-ui, sans-serif';

const COLORS = {
  bg: "#0a0a10",
  text: "#f4f4f7",
  muted: "#a1a1b0",
  faint: "#6c6c7c",
  card: "rgba(255,255,255,0.04)",
  cardLine: "rgba(255,255,255,0.08)"
};

const font = (weight, size) => `${weight} ${size}px ${FONT}`;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (hex, alpha) => `rgba(${hexToRgb(hex).join(",")},${alpha})`;

/** Mélange une couleur avec du blanc (pour un texte d'accent lisible sur fond sombre). */
function lighten(hex, amount) {
  const [r, g, b] = hexToRgb(hex).map(c => Math.round(c + (255 - c) * amount));
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Coupe un texte en lignes, avec « … » si on dépasse maxLines. */
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    // Mot plus long que la ligne entière : coupé au caractère.
    while (ctx.measureText(line).width > maxWidth && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

function setSpacing(ctx, px) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

function drawBrandIcon(ctx, name, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(BRAND[name]));
  ctx.restore();
}

/**
 * Dessine (ou mesure seulement, si draw = false) le planning.
 * Renvoie la hauteur totale utilisée : on appelle d'abord en mode mesure
 * pour dimensionner le canvas, puis en mode dessin.
 */
function paint(ctx, data, draw) {
  const { settings, monday, events, hideEmpty, avatar } = data;
  const accent = settings.accent;
  const accentText = lighten(accent, 0.45);
  const contentW = WIDTH - PAD * 2;
  let y = PAD;

  /* ---------- en-tête ---------- */
  const AVATAR = 92;
  if (draw) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(PAD + AVATAR / 2, y + AVATAR / 2, AVATAR / 2, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) {
      const side = Math.min(avatar.width, avatar.height);
      ctx.drawImage(avatar, (avatar.width - side) / 2, (avatar.height - side) / 2, side, side, PAD, y, AVATAR, AVATAR);
    } else {
      const grad = ctx.createLinearGradient(PAD, y, PAD + AVATAR, y + AVATAR);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, rgba(accent, 0.55));
      ctx.fillStyle = grad;
      ctx.fillRect(PAD, y, AVATAR, AVATAR);
      ctx.fillStyle = "#fff";
      ctx.font = font(800, 40);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText([...settings.displayName][0]?.toUpperCase() ?? "?", PAD + AVATAR / 2, y + AVATAR / 2 + 2);
      ctx.textAlign = "left";
    }
    ctx.restore();

    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(accent, 0.6);
    ctx.beginPath();
    ctx.arc(PAD + AVATAR / 2, y + AVATAR / 2, AVATAR / 2 + 1.5, 0, Math.PI * 2);
    ctx.stroke();

    const textX = PAD + AVATAR + 26;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.text;
    ctx.font = font(800, 38);
    setSpacing(ctx, -0.8);
    ctx.fillText(settings.displayName, textX, y + 50);
    setSpacing(ctx, 0);

    const login = ownerTwitch(settings);
    if (login) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = font(500, 22);
      ctx.fillText(`twitch.tv/${login}`, textX, y + 82);
    }

    // Titre à droite
    ctx.textAlign = "right";
    ctx.fillStyle = accentText;
    ctx.font = font(750, 17);
    setSpacing(ctx, 4);
    ctx.fillText("PLANNING DES LIVES", WIDTH - PAD, y + 36);
    setSpacing(ctx, 0);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(800, 34);
    ctx.fillText(formatWeekRange(monday), WIDTH - PAD, y + 80);
    ctx.textAlign = "left";
  }
  y += AVATAR + 40;

  /* ---------- jours ---------- */
  const LEFT = 132;          // colonne du jour
  const CARD_PAD = 26;
  const textX = PAD + CARD_PAD + LEFT;
  const textW = contentW - CARD_PAD * 2 - LEFT;

  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const dayEvents = events.filter(e => e.date === date);
    if (hideEmpty && !dayEvents.length) continue;

    const top = y;
    let inner = top + CARD_PAD;

    // Mesure du contenu de la carte
    const blocks = dayEvents.map(event => {
      ctx.font = font(700, 28);
      const titleLines = wrapText(ctx, event.title, textW, 2);
      const metaParts = [];
      if (event.game) metaParts.push(event.game);
      if (event.guests.length) metaParts.push(`avec ${event.guests.map(g => g.name).join(", ")}`);
      ctx.font = font(500, 21);
      const metaLines = metaParts.length ? wrapText(ctx, metaParts.join("  ·  "), textW, 2) : [];
      const height = 30 + titleLines.length * 36 + (metaLines.length ? 6 + metaLines.length * 28 : 0);
      return { event, titleLines, metaLines, height };
    });

    const contentH = dayEvents.length
      ? blocks.reduce((sum, b) => sum + b.height, 0) + (blocks.length - 1) * 30
      : 34;
    const cardH = Math.max(contentH + CARD_PAD * 2, 104);

    if (draw) {
      const hasEvents = dayEvents.length > 0;

      roundRect(ctx, PAD, top, contentW, cardH, 20);
      ctx.fillStyle = hasEvents ? COLORS.card : "rgba(255,255,255,0.02)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = hasEvents ? rgba(accent, 0.28) : COLORS.cardLine;
      ctx.stroke();

      if (hasEvents) {
        roundRect(ctx, PAD, top + 22, 5, 46, [0, 4, 4, 0]);
        ctx.fillStyle = accent;
        ctx.fill();
      }

      // Jour : « LUN. » + numéro
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = hasEvents ? accentText : COLORS.faint;
      ctx.font = font(750, 18);
      setSpacing(ctx, 2.5);
      ctx.fillText(DAY_SHORT[weekday(date)].replace(".", "").toUpperCase(), PAD + CARD_PAD + 4, top + CARD_PAD + 18);
      setSpacing(ctx, 0);
      ctx.fillStyle = hasEvents ? COLORS.text : COLORS.faint;
      ctx.font = font(800, 38);
      ctx.fillText(String(Number(date.slice(8))), PAD + CARD_PAD + 2, top + CARD_PAD + 58);

      if (!hasEvents) {
        ctx.fillStyle = COLORS.faint;
        ctx.font = `italic ${font(500, 22)}`;
        ctx.fillText("Pas de live", textX, top + cardH / 2 + 8);
      }

      blocks.forEach((block, index) => {
        if (index > 0) {
          ctx.fillStyle = COLORS.cardLine;
          ctx.fillRect(textX, inner - 15, textW, 1.5);
        }
        const { event } = block;
        let by = inner;

        ctx.fillStyle = accentText;
        ctx.font = font(700, 21);
        ctx.fillText(`${event.start} – ${event.end}`, textX, by + 21);
        by += 30;

        ctx.fillStyle = COLORS.text;
        ctx.font = font(700, 28);
        for (const line of block.titleLines) {
          ctx.fillText(line, textX, by + 29);
          by += 36;
        }

        if (block.metaLines.length) {
          by += 6;
          ctx.fillStyle = COLORS.muted;
          ctx.font = font(500, 21);
          for (const line of block.metaLines) {
            ctx.fillText(line, textX, by + 21);
            by += 28;
          }
        }
        inner += block.height + 30;
      });
    }

    y += cardH + 14;
  }

  if (hideEmpty && !events.length) {
    if (draw) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = font(600, 26);
      ctx.textAlign = "center";
      ctx.fillText("Pas de live prévu cette semaine", WIDTH / 2, y + 50);
      ctx.textAlign = "left";
    }
    y += 100;
  }

  /* ---------- pied ---------- */
  y += 18;
  if (draw) {
    const login = ownerTwitch(settings);
    if (login) {
      drawBrandIcon(ctx, "twitch", PAD, y, 26, accentText);
      ctx.fillStyle = COLORS.text;
      ctx.font = font(650, 22);
      ctx.textBaseline = "middle";
      ctx.fillText(`twitch.tv/${login}`, PAD + 40, y + 14);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.faint;
    ctx.font = font(500, 19);
    ctx.fillText("Heures de Paris", WIDTH - PAD, y + 14);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  y += 28 + PAD;

  return y;
}

function paintBackground(ctx, height, accent) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  const glow1 = ctx.createRadialGradient(WIDTH * 0.2, -40, 0, WIDTH * 0.2, -40, 720);
  glow1.addColorStop(0, rgba(accent, 0.30));
  glow1.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, WIDTH, height);

  const glow2 = ctx.createRadialGradient(WIDTH, height, 0, WIDTH, height, 640);
  glow2.addColorStop(0, "rgba(60,120,255,0.16)");
  glow2.addColorStop(1, "rgba(60,120,255,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, WIDTH, height);

  // Grille discrète, comme sur le site
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= WIDTH; x += 48) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, height); }
  for (let y = 0; y <= height; y += 48) { ctx.moveTo(0, y + 0.5); ctx.lineTo(WIDTH, y + 0.5); }
  ctx.stroke();
}

async function loadAvatar(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {object} options.settings  profil public (displayName, accent, links, avatarUrl)
 * @param {string} options.monday    lundi de la semaine (YYYY-MM-DD)
 * @param {Array}  options.events    lives de la semaine
 * @param {boolean} options.hideEmpty masquer les jours sans live
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderPlanningImage({ settings, monday, events, hideEmpty = false }) {
  // La police doit être chargée avant de dessiner, sinon le canvas utilise la police de secours.
  await Promise.all([font(800, 38), font(700, 28), font(500, 21), `italic ${font(500, 22)}`]
    .map(f => document.fonts.load(f).catch(() => null)));

  const data = { settings, monday, events, hideEmpty, avatar: await loadAvatar(settings.avatarUrl) };

  const measure = document.createElement("canvas").getContext("2d");
  const height = Math.ceil(paint(measure, data, false));

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  paintBackground(ctx, height, settings.accent);
  paint(ctx, data, true);
  return canvas;
}

export const canvasToBlob = canvas => new Promise((resolve, reject) => {
  canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("Export PNG impossible."))), "image/png");
});
