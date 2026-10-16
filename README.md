# yiep.io

Le site de **Nicooow** : une page façon guns.lol avec les liens Twitch / Discord / X / Instagram,
le planning des lives et une admin pour tout gérer sans toucher au code.
Le jeu multijoueur d'origine est toujours là, sur `/jeu`.

| Adresse  | Contenu |
|----------|---------|
| `/`      | page publique : profil, boutons réseaux, planning de la semaine |
| `/admin` | admin protégée par mot de passe : planning, image Discord, profil & liens |
| `/jeu`   | le jeu multijoueur (Phaser + Socket.IO) |

## Démarrer

Il faut Node.js 20.12 ou plus récent.

```bash
npm install
cp .env.example .env      # puis mets ton mot de passe dans ADMIN_PASSWORD
npm start                 # ou « npm run dev » pour relancer à chaque modification
```

Puis ouvre http://localhost:3000 et http://localhost:3000/admin.

Sans `ADMIN_PASSWORD`, le site fonctionne mais l'admin est désactivée.
Choisis un mot de passe d'au moins 10 caractères.

## L'admin

### Planning

- **← / →** (ou les flèches du clavier) pour changer de semaine.
- **Ajouter un live** sur un jour : titre, date, heure de début et de fin, jeu (facultatif) et
  **invités**. Pour chaque invité, colle son pseudo ou directement le lien de sa chaîne Twitch :
  il est converti en pseudo et devient un bouton cliquable sur le site.
- Clique sur un live pour le modifier, le supprimer (deux clics pour confirmer) ou le
  **dupliquer à +7 jours**.
- **Copier vers la semaine suivante** recopie toute la semaine affichée (les lives déjà
  présents ne sont pas dupliqués) : pratique quand le planning se répète.
- Un live dont l'heure de fin est plus petite que celle du début se termine le lendemain
  (`21:00 → 01:00`).

Toutes les heures sont en **heure de Paris**, quel que soit le pays du visiteur.

### Image pour Discord

Le bouton **Image pour Discord** génère une image PNG du planning de la semaine affichée :
photo, nom, dates, horaires, titres, jeux et invités. Deux options :

- **Copier** puis `Ctrl+V` directement dans ton salon `#planning` ;
- **Télécharger PNG** pour la poster ailleurs (X, Instagram…).

La case « Masquer les jours sans live » donne une version plus compacte.

### Profil & liens

Nom, bio, photo (recadrée en carré automatiquement), couleur principale du site, et les liens
Twitch, Discord, X, Instagram, YouTube, TikTok, Kick. Un champ vide masque le bouton.

## Mettre en ligne

Le site a besoin de Node.js (l'admin enregistre sur le serveur). Il marche sur n'importe quel
hébergeur Node : Render, Railway, Fly.io, un VPS…

1. Commande de démarrage : `npm start`.
2. Variables d'environnement :

   | Variable | Rôle |
   |----------|------|
   | `ADMIN_PASSWORD` | mot de passe de l'admin (obligatoire pour l'admin) |
   | `DATA_DIR` | dossier des données ; **doit être sur un disque persistant** |
   | `SITE_URL` | adresse publique, ex. `https://yiep.io` (aperçus Discord / X) |
   | `TRUST_PROXY` | `1` derrière un proxy (Render, Railway, Nginx…) |
   | `PORT` | fourni automatiquement par la plupart des hébergeurs |

3. Utilise **HTTPS** (activé d'office sur Render, Railway et Fly.io).

> ⚠️ Sur les offres gratuites sans disque persistant, le dossier de données est effacé à chaque
> redéploiement : planning et profil seraient perdus. Monte un disque et pointe `DATA_DIR` dessus.

### Les données

Tout est dans `data/` (ou `DATA_DIR`) — c'est le seul dossier à sauvegarder :

| Fichier | Contenu |
|---------|---------|
| `events.json` | les lives du planning |
| `settings.json` | profil, couleur, liens |
| `avatar.img` | la photo de profil |
| `secret.key` | clé de signature des sessions (générée automatiquement) |

Ce dossier n'est pas versionné dans git : un `git pull` n'écrase jamais ton planning.

## Sécurité

- Session admin dans un cookie `HttpOnly` + `SameSite=Strict`, signé par HMAC ; valable 30 jours.
  Changer `ADMIN_PASSWORD` déconnecte toutes les sessions.
- 10 mots de passe faux depuis la même IP → blocage 15 minutes.
- Les écritures venant d'un autre site sont refusées (protection CSRF).
- Toutes les données sont validées côté serveur (dates, heures, longueurs, liens `https` uniquement).
- Content-Security-Policy stricte : aucun script externe, aucun script inline.
- La photo de profil est vérifiée à ses premiers octets (PNG, JPEG ou WebP uniquement).
- Police Inter hébergée sur le site : aucune requête vers Google Fonts (RGPD).

## Développement

```bash
npm test     # 25 tests : API, sécurité, validation, dates et fuseau horaire
```

```
server.js            démarrage : HTTP + Socket.IO (jeu)
app.js               application Express : pages, API, sécurité
lib/store.js         stockage JSON (écritures atomiques)
lib/auth.js          connexion et sessions
views/               gabarits HTML (page publique, admin)
public/
  css/               styles (base commune, site, admin)
  js/lib/            code partagé navigateur + serveur : dates, validation, icônes
  js/site.js         page publique
  js/admin.js        admin
  js/planning-image.js  génération de l'image du planning
  fonts/             police Inter (licence OFL)
game/                le jeu multijoueur
test/                tests (node --test)
```

La validation (`public/js/lib/model.js`) et les calculs de dates (`public/js/lib/dates.js`) sont
partagés entre le navigateur et le serveur : l'admin affiche exactement les mêmes erreurs que l'API.
