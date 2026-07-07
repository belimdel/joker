# Déploiement Joker en auto-hébergement (mini PC Windows + Docker Desktop)

Ce guide décrit l'installation du jeu Joker sur un mini PC Windows sous Docker
Desktop, accessible depuis internet en HTTPS via un domaine DuckDNS, avec Caddy
comme reverse proxy TLS automatique.

L'architecture : un conteneur **`joker`** (Express + Socket.IO qui sert le
client React buildé) derrière un conteneur **`caddy`** (HTTPS + Let's Encrypt).
Seul Caddy expose des ports vers l'extérieur (80/443).

---

## 1. Prérequis

- **Docker Desktop** installé et démarré sur le mini PC (déjà le cas : il sert
  RustDesk).
- Le PC reste **allumé H24** (déjà le cas pour RustDesk) → résilience acquise.
- Un compte **DuckDNS** (déjà utilisé pour RustDesk).
- Accès à l'**interface de la box Bouygues** (port forwarding).
- Une base **PostgreSQL Neon** (branche de production) et, optionnellement, des
  identifiants **SMTP Gmail** pour l'envoi des e-mails de vérification.

---

## 2. Créer le 2e domaine DuckDNS

1. Se connecter sur https://www.duckdns.org.
2. Créer un **nouveau sous-domaine** dédié au jeu, ex. `joker-xxxx` →
   `joker-xxxx.duckdns.org` (distinct de celui de RustDesk).
3. Le faire pointer sur l'**IP publique** de la box (DuckDNS le met à jour
   automatiquement si le client DuckDNS tourne déjà sur le PC ; sinon, mettre
   l'IP publique manuellement).

> Note : une seule IP publique pour plusieurs domaines DuckDNS, c'est normal.
> C'est le port forwarding + Caddy (qui route selon le domaine demandé) qui
> distingue les services.

---

## 3. Ouvrir les ports sur la box Bouygues (NAT / port forwarding)

Dans l'interface de la box, ajouter **2 règles** pointant vers l'**IP locale du
mini PC** (ex. `192.168.1.50` — la fixer en DHCP statique si possible) :

| Service | Port externe | Protocole | Port interne | IP destination     |
|---------|-------------|-----------|--------------|--------------------|
| HTTP    | 80          | TCP       | 80           | IP locale du mini PC |
| HTTPS   | 443         | TCP       | 443          | IP locale du mini PC |

- Le port **80** est requis par Let's Encrypt (challenge HTTP-01) et pour la
  redirection vers HTTPS.
- Le port **443** sert le trafic HTTPS réel.

> ⚠️ Ne pas confondre avec les ports déjà forwardés pour RustDesk : ce sont des
> ports différents, les deux services cohabitent.

---

## 4. Récupérer le code sur le mini PC

```powershell
git clone <URL_DU_REPO> Joker
cd Joker
```

(ou `git pull` si le dépôt est déjà présent).

---

## 5. Remplir le fichier `.env`

Copier le modèle et l'éditer :

```powershell
Copy-Item .env.example .env
notepad .env
```

Renseigner :

| Clé            | Valeur                                                        |
|----------------|--------------------------------------------------------------|
| `DATABASE_URL` | Chaîne de connexion Neon (branche **production**).           |
| `SMTP_USER`    | Adresse Gmail d'envoi (ou vide = codes loggués).             |
| `SMTP_PASS`    | Mot de passe d'application Gmail (ou vide).                  |
| `JOKER_DOMAIN` | `joker-xxxx.duckdns.org` (sans `https://`).                 |
| `CLIENT_URL`   | `https://joker-xxxx.duckdns.org` (URL complète).            |
| `PORT`         | `3001` (laisser tel quel sauf besoin).                       |
| `NODE_ENV`     | `production` (ne pas changer).                               |

> Le `.env` est **gitignoré** : il ne sera jamais committé. Aucun secret n'est
> présent dans l'image Docker ni dans les fichiers versionnés.

---

## 6. Lancer la pile

```powershell
docker compose up -d --build
```

- `--build` construit l'image du jeu depuis le `Dockerfile`.
- `-d` lance en arrière-plan.
- Au premier démarrage, Caddy demande le certificat TLS à Let's Encrypt
  (quelques secondes ; nécessite que le domaine public résolve déjà vers la box
  et que les ports 80/443 soient ouverts).

Vérifier que les deux conteneurs tournent :

```powershell
docker compose ps
```

Les deux (`joker`, `caddy`) doivent être `Up`.

---

## 7. Vérifier les logs

```powershell
docker compose logs -f joker    # logs de l'app (démarrage serveur, parties)
docker compose logs -f caddy    # logs du proxy (obtention du certificat TLS)
```

Dans les logs `joker`, on doit voir : `🚀 Serveur Joker démarré sur le port 3001`.
Dans les logs `caddy`, l'obtention réussie du certificat pour le domaine.

Puis tester dans un navigateur : `https://joker-xxxx.duckdns.org` → la page
d'accueil du jeu doit charger, le cadenas HTTPS doit être valide, et une partie
doit pouvoir démarrer (le WebSocket Socket.IO passe nativement par Caddy).

---

## 8. Mettre à jour le jeu

```powershell
cd Joker
git pull
docker compose up -d --build
```

L'image est reconstruite avec le nouveau code, puis les conteneurs sont
recréés. Les certificats Caddy sont **persistés** dans les volumes
(`caddy_data`, `caddy_config`) → pas de nouvelle demande de certificat, pas de
risque de rate-limit Let's Encrypt.

---

## 9. Dépannage rapide

| Symptôme                                   | Piste                                                        |
|--------------------------------------------|-------------------------------------------------------------|
| Certificat TLS non obtenu                  | Vérifier que le domaine résout vers la box et que 80/443 sont forwardés. |
| Page charge mais pas de temps réel         | Vérifier `CLIENT_URL` = URL HTTPS exacte du domaine.        |
| « persistance BDD désactivée » dans logs   | `DATABASE_URL` vide ou invalide dans `.env`.                |
| Codes de vérif dans les logs au lieu de mails | `SMTP_USER`/`SMTP_PASS` vides ou incorrects.             |

Redémarrer proprement :

```powershell
docker compose down     # arrête (garde les volumes/certs)
docker compose up -d --build
```
