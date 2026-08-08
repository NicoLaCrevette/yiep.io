# Site vitrine — Nicooow

Page unique (style guns.lol / linktree) avec les liens vers les réseaux et le planning des lives.

- **Un seul fichier** : `index.html` (HTML + CSS + JS inclus, aucune dépendance à installer).
- Fonctionne en ouvrant simplement le fichier dans un navigateur.

## Voir la page

- En local : double-clic sur `site/index.html`
- Via le serveur du projet : `npm run dev` puis http://localhost:3000/links

## Modifier le planning

Tout se passe dans le bloc `const SCHEDULE = [...]` en bas de `index.html` :

```js
const SCHEDULE = [
  { day:1, off:true },                                          // lundi : repos
  { day:2, start:"21:00", end:"00:00", game:"Just Chatting" },  // mardi 21h -> minuit
  { day:5, start:"21:00", end:"00:30", game:"Gaming" },         // live qui déborde après minuit
];
```

| Champ   | Rôle |
|---------|------|
| `day`   | 0 = dimanche, 1 = lundi … 6 = samedi |
| `start` | heure de début `"HH:MM"` (24 h, **heure de Paris**) |
| `end`   | heure de fin — peut passer minuit (`"01:30"`) |
| `game`  | texte affiché à droite (facultatif) |
| `off`   | `true` pour un jour sans stream |

La page calcule automatiquement, à l'heure de Paris quel que soit le fuseau du visiteur :
le jour en cours (surligné), le badge « Stream prévu maintenant », et le bandeau « Prochain live ».
Elle se met à jour toute seule chaque minute.

## Autres personnalisations

- **Photo de profil** : remplace `<div class="avatar avatar-fallback">N</div>` par
  `<img class="avatar" src="avatar.png" alt="Nicooow">` et dépose l'image dans ce dossier.
- **Bio / pseudo** : balises `<h1>`, `.handle` et `.bio` dans le bloc `<header class="profile">`.
- **Couleurs** : variables CSS dans `:root` (`--accent` = violet Twitch).
- **Ajouter un réseau** : duplique un bloc `<a class="link …">` et ajoute sa couleur de marque
  dans la section « couleurs de marque » du CSS.

> ⚠️ Le badge « Stream prévu maintenant » se base sur le planning, pas sur l'API Twitch.
> Pour un vrai statut live il faut une clé API Twitch (client ID + token) et un appel côté serveur.

## Mettre en ligne

Le dossier `site/` est un site statique : il se déploie tel quel sur GitHub Pages, Netlify,
Vercel ou Cloudflare Pages.
