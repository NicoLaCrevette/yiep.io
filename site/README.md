# Site vitrine — Nicooow

Page unique (style guns.lol / linktree) avec les liens vers les réseaux et le planning des lives,
plus une page d'admin pour gérer le planning sans toucher au code.

| Fichier | Rôle |
|---------|------|
| `index.html` | la page publique (HTML + CSS + JS inclus, aucune dépendance) |
| `admin.html` | l'éditeur de planning, protégé par mot de passe |
| `schedule.json` | les créneaux — lu par la page publique, écrit par l'admin |

## Lancer le site

```bash
npm install
ADMIN_PASSWORD="ton-mot-de-passe" npm run dev
```

- Page publique : http://localhost:3000/links
- Admin : http://localhost:3000/links/admin.html

`index.html` s'ouvre aussi en double-clic, mais sans serveur il affiche le planning de secours
codé en dur (le navigateur bloque la lecture de `schedule.json` en `file://`).

## Gérer le planning depuis l'admin

1. Va sur `/links/admin.html` et entre le mot de passe.
2. Chaque jour a un bouton **+ Ajouter** : un créneau apparaît avec début, fin et jeu/thème.
   Un jour peut contenir **plusieurs streams**.
3. La corbeille supprime un créneau, **Annuler** recharge le dernier planning enregistré.
4. **Enregistrer** écrit dans `schedule.json` — la page publique est à jour au rechargement suivant.

Les heures sont en **heure de Paris**. Une fin plus petite que le début signifie que le live passe
minuit (`21:00 → 00:30`). Le champ jeu/thème est facultatif ; un jour sans créneau s'affiche « Repos ».

Le bouton **Exporter** donne le contenu de `schedule.json` à copier ou télécharger : c'est la solution
de repli si le site est hébergé en statique, sans serveur Node.

### Mot de passe

Il se définit par variable d'environnement, jamais dans le code :

```bash
ADMIN_PASSWORD="ton-mot-de-passe" npm run dev
```

Sans cette variable, le serveur **refuse toute écriture** (l'admin affiche le message correspondant) :
le planning reste modifiable à la main dans `schedule.json`. Après 10 mauvais mots de passe, l'IP est
bloquée 15 minutes.

> ⚠️ `admin.html` est une page accessible à tout le monde — c'est l'API qui est protégée, pas l'URL.
> Sans le mot de passe, personne ne peut enregistrer quoi que ce soit. Sers le site en HTTPS en
> production, sinon le mot de passe circule en clair.

## Autres personnalisations

- **Photo de profil** : dans `index.html`, remplace `<div class="avatar avatar-fallback">N</div>` par
  `<img class="avatar" src="avatar.png" alt="Nicooow">` et dépose l'image dans ce dossier.
- **Bio / pseudo** : balises `<h1>`, `.handle` et `.bio` dans le bloc `<header class="profile">`.
- **Couleurs** : variables CSS dans `:root` (`--accent` = violet Twitch).
- **Ajouter un réseau** : duplique un bloc `<a class="link …">` et ajoute sa couleur de marque
  dans la section « couleurs de marque » du CSS.

> ⚠️ Le badge « Stream prévu maintenant » se base sur le planning, pas sur l'API Twitch.
> Pour un vrai statut live il faudrait une clé API Twitch (client ID + token) et un appel côté serveur.

## Mettre en ligne

- **Avec le serveur Node** (recommandé) : l'admin fonctionne et enregistre directement.
- **En statique** (GitHub Pages, Netlify, Vercel, Cloudflare Pages) : le dossier `site/` se déploie
  tel quel, mais `/api/schedule` n'existe pas. Utilise alors **Exporter** dans l'admin et remplace
  `schedule.json` à la main.
