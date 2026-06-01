# Tracky

Tracky est une PWA calendrier privée pour deux personnes, construite avec React, TypeScript, Vite et Supabase.

## Backend Supabase

Le backend attendu par l’application est défini dans [supabase/migrations/001_tracky_backend.sql](supabase/migrations/001_tracky_backend.sql).

Ce script crée:
- la table `public.events`
- les index utiles
- les politiques RLS pour l’utilisateur connecté
- le trigger `updated_at`
- l’ajout de `public.events` à `supabase_realtime`

## Ce qu’il faut configurer dans Supabase

- Activer l’auth email/mot de passe dans Supabase Auth.
- Créer les deux comptes `adam@tracky.app` et `sofiane@tracky.app`.
- Exécuter le SQL de migration dans l’éditeur SQL Supabase.
- Vérifier que `public.events` est bien exposée au realtime.

## Test automatique du backend

Le plus simple est d’utiliser le script local prévu pour ça:

```bash
npm run test:backend
```

Variables d’environnement requises:

- `TRACKY_TEST_EMAIL`
- `TRACKY_TEST_PASSWORD`
- `SUPABASE_URL` ou `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY` ou `VITE_SUPABASE_ANON_KEY`

Exemple PowerShell:

```powershell
$env:TRACKY_TEST_EMAIL="adam@tracky.app"
$env:TRACKY_TEST_PASSWORD="ton-mot-de-passe"
$env:SUPABASE_URL="https://bzqaixheecoqhuzqhhpz.supabase.co/rest/v1/"
$env:SUPABASE_ANON_KEY="<anon-key>"
npm run test:backend
```

Le script teste automatiquement:

- la connexion Auth
- `GET /rest/v1/events`
- `POST /rest/v1/events`
- `PATCH /rest/v1/events`
- `DELETE /rest/v1/events`

## Test avec Postman

Tu peux aussi tester le backend directement via l’API REST PostgREST de Supabase.

### 1. Se connecter et récupérer un token

Fais un `POST` vers:

```http
https://bzqaixheecoqhuzqhhpz.supabase.co/auth/v1/token?grant_type=password
```

Headers:

```http
apikey: <VITE_SUPABASE_ANON_KEY>
Content-Type: application/json
```

Body:

```json
{
  "email": "adam@tracky.app",
  "password": "ton-pin-ou-mot-de-passe"
}
```

Récupère `access_token` dans la réponse.

### 2. Lire les événements du jour

Fais un `GET` vers:

```http
https://bzqaixheecoqhuzqhhpz.supabase.co/rest/v1/events?select=*&user_id=eq.<USER_UUID>&created_at=gte.2026-06-01T00:00:00Z&created_at=lt.2026-06-02T00:00:00Z&order=created_at.asc
```

Headers:

```http
apikey: <VITE_SUPABASE_ANON_KEY>
Authorization: Bearer <access_token>
Accept: application/json
```

### 3. Créer un événement

Fais un `POST` vers:

```http
https://bzqaixheecoqhuzqhhpz.supabase.co/rest/v1/events
```

Headers:

```http
apikey: <VITE_SUPABASE_ANON_KEY>
Authorization: Bearer <access_token>
Content-Type: application/json
Prefer: return=representation
```

Body:

```json
{
  "user_id": "<USER_UUID>",
  "title": "Rendez-vous",
  "created_at": "2026-06-01T14:00:00.000Z"
}
```

### 4. Modifier un événement

Fais un `PATCH` vers:

```http
https://bzqaixheecoqhuzqhhpz.supabase.co/rest/v1/events?id=eq.<EVENT_UUID>
```

Headers:

```http
apikey: <VITE_SUPABASE_ANON_KEY>
Authorization: Bearer <access_token>
Content-Type: application/json
Prefer: return=representation
```

Body:

```json
{
  "title": "Rendez-vous mis à jour",
  "created_at": "2026-06-01T15:00:00.000Z"
}
```

### 5. Supprimer un événement

Fais un `DELETE` vers:

```http
https://bzqaixheecoqhuzqhhpz.supabase.co/rest/v1/events?id=eq.<EVENT_UUID>
```

Headers:

```http
apikey: <VITE_SUPABASE_ANON_KEY>
Authorization: Bearer <access_token>
```

## Lancer l’app

```bash
npm run dev
```

## Vérifier la build

```bash
npm run build
```
