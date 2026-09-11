# API Dashboard Business — Documentation complète

Toutes les routes ci-dessous sont préfixées par `/api/v1`. Le dashboard business est un **compte unique par entreprise** (email + mot de passe), distinct de la clé API serveur-à-serveur (les deux accèdent au même compte, voir §0).

---

## 0. Deux façons d'accéder au compte business

| Accès | Identifiant | Middleware | Usage |
|---|---|---|---|
| **Clé API** | `Authorization: Bearer biz_live_...` / `biz_sandbox_...` | `businessApiKey` | Intégration serveur-à-serveur (backend e-commerce tiers) |
| **Session dashboard** | `Authorization: Bearer <token>` obtenu via login | `auth({guards:['businessDashboard']})` + `businessDashboard` | Humain connecté à l'interface web du dashboard |

Les deux chemins posent `ctx.business` de la même façon et **exécutent exactement les mêmes contrôleurs** pour dépôt/retrait/wallet/transactions/webhooks — aucune logique métier dupliquée. Seuls les endpoints `overview`, `api-keys` (self-service) et `profile` sont propres au dashboard.

Le token de session dashboard expire après **1h** (`expires_in: 3600`) — utiliser `/business/auth/refresh` pour en obtenir un nouveau.

---

## 1. Authentification (`/business/auth/*`)

### 1.1 `POST /api/v1/business/auth/signup`
Inscription autonome, publique (aucune authentification requise). Crée le compte en statut `pending_approval` — **connexion impossible tant qu'un admin n'a pas approuvé** (`POST /api/v1/businesses/:id/approve`, réservé aux `internal_user`).

**Body**
```json
{
  "name": "Ma Boutique SARL",
  "email": "contact@maboutique.com",
  "phone": "260763456789",
  "password": "motdepasse123",
  "code": "MABOUTIQUE"
}
```
| Champ | Type | Requis | Règles |
|---|---|---|---|
| `name` | string | oui | 2–255 caractères |
| `email` | string | oui | format email, **unique** |
| `phone` | string | oui | 8–20 caractères |
| `password` | string | oui | min 8 caractères |
| `code` | string | non | 2–20 caractères, **unique** ; auto-généré (`BIZ...`) si omis |

**Réponse `201`**
```json
{
  "data": {
    "id": 9,
    "code": "MABOUTIQUE",
    "name": "Ma Boutique SARL",
    "email": "contact@maboutique.com",
    "status": "pending_approval",
    "message": "Account created. It must be approved before you can log in."
  }
}
```
**Erreurs** : `422` si email/code déjà pris ou champs invalides.

---

### 1.2 `POST /api/v1/business/auth/login`
**Body**
```json
{ "email": "contact@maboutique.com", "password": "motdepasse123" }
```
**Réponse `200`**
```json
{
  "data": {
    "business": { "id": 9, "code": "MABOUTIQUE", "name": "Ma Boutique SARL", "email": "contact@maboutique.com" },
    "token": "oat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "expires_in": 3600
  }
}
```
**Erreurs**
- `400` — identifiants invalides (message générique, ne révèle pas si l'email existe). Incrémente le compteur d'échecs.
- `403` — compte pas encore `active` (`pending_approval`, `suspended`, `terminated`) : `{"message": "Business account is pending_approval"}`.
- `429` — verrouillé après **5 échecs** consécutifs, pour **15 minutes** : `{"message": "Account locked for N more minutes due to too many failed login attempts"}`.

---

### 1.3 `POST /api/v1/business/auth/refresh` 🔒
Auth : session dashboard requise. Émet un nouveau token (1h) et révoque l'ancien.

**Réponse `200`**
```json
{ "data": { "token": "oat_yyyy...", "expires_in": 3600 } }
```
`400` si aucun token courant (ne devrait pas arriver via un appel authentifié normal).

---

### 1.4 `POST /api/v1/business/auth/logout` 🔒
Révoque le token courant. **Réponse `200`** : `{"message": "Logged out successfully"}`.

---

### 1.5 `POST /api/v1/business/auth/change-password` 🔒
**Body**
```json
{ "current_password": "ancien123", "new_password": "nouveaupass123" }
```
`new_password` min 8 caractères. **`401`** si `current_password` incorrect. **`200`** sinon : `{"message": "Password changed successfully"}`. Action auditée (`business.password_changed`).

---

## 2. Dashboard — argent et transactions (mêmes contrôleurs que la clé API)

Toutes ces routes existent en double : sous `/business/*` (clé API) et sous `/business/dashboard/*` (session). Comportement strictement identique, scope automatique sur `ctx.business.id` dans les deux cas.

🔒 = nécessite `Authorization: Bearer <token dashboard>` (ou une clé API sur le groupe `/business/*`).

### 2.1 `POST /api/v1/business/dashboard/mobile-money/deposits` 🔒
Déclenche un dépôt mobile money (encaissement) directement depuis le dashboard, sans écrire de code.

**Body**
```json
{
  "amount": "10000",
  "currency_code": "ZMW",
  "phone_number": "260763456789",
  "provider": "MTN_MOMO_ZMB",
  "pin": "0000",
  "idempotency_key": "b3f1c2a0-1234-4abc-9def-0123456789ab"
}
```
| Champ | Type | Requis | Règles |
|---|---|---|---|
| `amount` | string | oui | entier positif, **en plus petite unité** (pas de décimales, pas de zéro initial) |
| `currency_code` | string | oui | 3 lettres (ex. `ZMW`, `USD`) |
| `phone_number` | string | oui | MSISDN, chiffres uniquement, 8–15 chiffres, sans zéro initial |
| `provider` | string | oui | code opérateur PawaPay (ex. `MTN_MOMO_ZMB`), 3–40 caractères `[A-Z0-9_]` |
| `pin` | string | oui | 4 chiffres — **champ hérité du validateur partagé avec le flux utilisateur final ; non utilisé pour authentifier l'appel business** (la clé API / le token dashboard est le seul credential). Envoyer n'importe quelle valeur à 4 chiffres, ex. `"0000"`. |
| `idempotency_key` | string (UUID) | oui | un UUID unique par tentative logique — un retry avec la même clé rejoue la même réponse |

**Réponse `202`**
```json
{ "data": { "deposit_id": 42, "status": "initiated", "created_at": "2026-08-30T10:00:00.000Z" } }
```
**Erreurs**
- `409` — conflit d'idempotency key (même clé, payload différent)
- `422` — devise/provider non supportés, ou montant hors des bornes `min`/`max` renvoyées par PawaPay pour ce provider
- `404` — pas de wallet actif pour cette devise (le wallet est créé automatiquement à l'onboarding du business, une devise à la fois)
- `503` — fournisseur mobile money temporairement indisponible

### 2.2 `GET /api/v1/business/dashboard/mobile-money/deposits/:id` 🔒
**Réponse `200`**
```json
{ "data": { "deposit_id": 42, "status": "completed", "created_at": "...", "completed_at": "..." } }
```
`403` si le dépôt appartient à un autre business (IDOR bloqué), `404` sinon.

### 2.3 `POST /api/v1/business/dashboard/mobile-money/payouts` 🔒
Déclenche un retrait mobile money (décaissement) — même body que 2.1, mêmes champs/règles.

**Réponse `202`**
```json
{ "data": { "payout_id": 17, "status": "initiated", "created_at": "..." } }
```
**Erreurs supplémentaires par rapport au dépôt** :
- `402` — solde insuffisant sur le wallet business
- `400` — limite de transaction dépassée (`TransactionLimitExceededException`)

### 2.4 `GET /api/v1/business/dashboard/mobile-money/payouts/:id` 🔒
Identique à 2.2 pour un payout.

### 2.5 `GET /api/v1/business/dashboard/wallet` 🔒
Liste tous les wallets du business (un par devise).

**Réponse `200`**
```json
{
  "data": [
    { "id": 5, "currency_code": "ZMW", "balance": "150000", "status": "active", "created_at": "...", "updated_at": "..." }
  ]
}
```
`balance` est en **plus petite unité**, sous forme de string (bigint).

### 2.6 `GET /api/v1/business/dashboard/wallet/:currency` 🔒
Détail d'un wallet (ex. `:currency = ZMW`).

**Réponse `200`**
```json
{
  "data": {
    "id": 5, "currency_code": "ZMW", "balance": "150000", "status": "active",
    "per_transaction_limit": "50000", "daily_limit": "500000", "monthly_limit": "5000000",
    "created_at": "...", "updated_at": "..."
  }
}
```
`404` si aucun wallet pour cette devise.

### 2.7 `GET /api/v1/business/dashboard/transactions` 🔒
Historique paginé des transactions mobile money (dépôts + retraits) de ce business.

**Query params**
| Param | Type | Défaut |
|---|---|---|
| `page` | number ≥ 1 | 1 |
| `limit` | number, 1–100 | 20 |

**Réponse `200`**
```json
{
  "data": [
    { "transaction_id": 42, "type": "mobile_money_deposit", "status": "completed", "provider": "MTN_MOMO_ZMB", "metadata": {}, "created_at": "...", "completed_at": "..." }
  ],
  "meta": { "total": 37, "page": 1, "limit": 20 }
}
```

### 2.8 `GET /api/v1/business/dashboard/webhooks` 🔒
Liste les abonnements webhook du business.

**Réponse `200`**
```json
{ "data": [ { "id": 3, "url": "https://maboutique.com/webhooks/tumaplus", "events": ["mobile_money_deposit.completed"], "active": true, "created_at": "..." } ] }
```

### 2.9 `POST /api/v1/business/dashboard/webhooks` 🔒
**Body**
```json
{
  "url": "https://maboutique.com/webhooks/tumaplus",
  "events": ["mobile_money_deposit.completed", "mobile_money_payout.failed"]
}
```
`events` : tableau, valeurs possibles : `mobile_money_deposit.completed`, `mobile_money_deposit.failed`, `mobile_money_payout.completed`, `mobile_money_payout.failed`.

**Réponse `201`**
```json
{
  "data": {
    "url": "https://maboutique.com/webhooks/tumaplus",
    "events": ["mobile_money_deposit.completed", "mobile_money_payout.failed"],
    "active": true,
    "secret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "message": "Webhook subscribed. Store the secret securely — used to verify X-Webhook-Signature on delivery."
  }
}
```
⚠️ Le `secret` n'est renvoyé qu'à la création — il sert à vérifier l'en-tête `X-Webhook-Signature` (HMAC) sur chaque livraison. Le stocker immédiatement, il n'est pas récupérable ensuite.

### 2.10 `DELETE /api/v1/business/dashboard/webhooks/:id` 🔒
**Réponse `200`** : `{"message": "Webhook unsubscribed"}`. `404` si l'abonnement n'appartient pas à ce business.

### 2.11 `GET /api/v1/business/dashboard/webhooks/:id/deliveries` 🔒
Historique des 50 dernières tentatives de livraison pour un abonnement.

**Réponse `200`**
```json
{
  "data": [
    { "id": 100, "event_type": "mobile_money_deposit.completed", "status": "delivered", "retry_count": 0, "last_error": null, "created_at": "...", "updated_at": "..." }
  ]
}
```
`404` si l'abonnement n'appartient pas à ce business.

---

## 3. Dashboard — endpoints propres (pas d'équivalent côté clé API)

### 3.1 `GET /api/v1/business/dashboard/overview` 🔒
Agrégats chiffrés (aucune nouvelle table — calculé à la volée sur `ledger_transactions`).

**Réponse `200`**
```json
{
  "data": {
    "all_time": {
      "deposits": { "completed": 120, "failed": 3, "pending": 1, "total": 124 },
      "payouts": { "completed": 45, "failed": 2, "pending": 0, "total": 47 },
      "deposit_success_rate_percent": 96.77,
      "payout_success_rate_percent": 95.74
    },
    "last_30_days": {
      "deposits": { "completed": 20, "failed": 1, "pending": 0, "total": 21 },
      "payouts": { "completed": 8, "failed": 0, "pending": 0, "total": 8 },
      "deposit_success_rate_percent": 95.24,
      "payout_success_rate_percent": 100
    }
  }
}
```
`*_success_rate_percent` vaut `null` si `total === 0` (évite une division par zéro).

### 3.2 `GET /api/v1/business/dashboard/api-keys` 🔒
Liste les clés API du business (self-service). **La clé en clair n'est jamais renvoyée ici.**

**Réponse `200`**
```json
{
  "data": [
    { "id": 1, "key_prefix": "biz_sandbox_a1b2c3d4", "status": "active", "last_used_at": "...", "created_at": "...", "revoked_at": null }
  ]
}
```

### 3.3 `POST /api/v1/business/dashboard/api-keys` 🔒
Génère une nouvelle clé API. **La clé en clair n'est renvoyée qu'ici, une seule fois.**

**Réponse `201`**
```json
{
  "data": {
    "key_id": 4,
    "api_key": "biz_sandbox_9f8e7d6c5b4a...",
    "message": "Store this key now — it cannot be retrieved again. Only its hash is kept."
  }
}
```
Cette clé peut ensuite être utilisée directement sur les routes `POST /api/v1/business/*` (groupe clé API, §2 avec préfixe `/business/` au lieu de `/business/dashboard/`).

### 3.4 `DELETE /api/v1/business/dashboard/api-keys/:id` 🔒
Révoque immédiatement une clé (elle échouera avec `401` dès le prochain appel). `404` si elle n'appartient pas à ce business.

**Réponse `200`** : `{"message": "API key revoked"}`.

### 3.5 `GET /api/v1/business/dashboard/profile` 🔒
**Réponse `200`**
```json
{
  "data": {
    "id": 9, "code": "MABOUTIQUE", "name": "Ma Boutique SARL", "email": "contact@maboutique.com",
    "phone": "260763456789", "status": "active", "webhook_url": null, "created_at": "..."
  }
}
```

### 3.6 `PATCH /api/v1/business/dashboard/profile` 🔒
**Body** (tous les champs optionnels)
```json
{ "name": "Ma Boutique SARL v2", "phone": "260763456780", "webhook_url": "https://maboutique.com/hook" }
```
⚠️ **`email` n'est volontairement pas modifiable ici** — un changement d'email reste une action admin (`internal_user`), pour éviter qu'un token dashboard compromis serve à rediriger silencieusement la récupération de compte.

**Réponse `200`**
```json
{ "data": { "id": 9, "name": "Ma Boutique SARL v2", "phone": "260763456780", "webhook_url": "https://maboutique.com/hook", "updated_at": "..." } }
```
Action auditée (`business.profile_updated`, avant/après).

---

## 4. Cycle de vie du compte (rappel — admin uniquement, `internal_user`)

Ces routes ne font pas partie du dashboard business (réservées au staff interne), mais conditionnent l'accès au dashboard :

| Route | Effet sur le statut |
|---|---|
| `POST /api/v1/businesses` | Crée un business (statut `pending_approval`) — alternative admin au self-signup §1.1 |
| `POST /api/v1/businesses/:id/approve` | `pending_approval` → `active` (le login dashboard devient possible) |
| `POST /api/v1/businesses/:id/suspend` | → `suspended` (login bloqué, `403`) |
| `POST /api/v1/businesses/:id/activate` | `suspended` → `active` |
| `POST /api/v1/businesses/:id/deactivate` | → `terminated` |
| `POST /api/v1/businesses/:id/api-keys` | Émet une clé API pour ce business (côté admin) |
| `DELETE /api/v1/businesses/:id/api-keys/:keyId` | Révoque une clé (côté admin) |

**Un business ne peut jamais se connecter au dashboard tant que `status !== 'active'`** (`403 Business account is <status>` sur `/business/auth/login`).

---

## 5. Codes d'erreur — récapitulatif transverse

| Code | Signification |
|---|---|
| `400` | Payload invalide, ou identifiants de login incorrects |
| `401` | Token/clé API absent, invalide ou révoqué |
| `402` | Solde insuffisant (payout) |
| `403` | Compte pas `active`, ou tentative d'accès à une ressource d'un autre business (IDOR bloqué) |
| `404` | Ressource introuvable (ou appartenant à un autre business — pas de fuite d'existence) |
| `409` | Conflit d'idempotency key |
| `422` | Validation métier (devise/provider non supportés, montant hors bornes) |
| `429` | Compte verrouillé après 5 échecs de connexion (15 min) |
| `503` | Fournisseur mobile money (PawaPay) temporairement indisponible |

---

## 6. Sécurité — points clés pour un intégrateur dashboard

1. **Table de tokens dédiée** (`business_access_tokens`) — aucun partage avec les tokens `User`/`InternalUser`.
2. **Verrouillage anti-bruteforce** : 5 échecs → 15 minutes de blocage, par email.
3. **Clé API et mot de passe dashboard affichés une seule fois** — ni l'un ni l'autre n'est récupérable après coup, seul un hash est conservé.
4. **Email non modifiable en self-service** — protection contre la prise de compte via un token compromis.
5. **Idempotency obligatoire** sur dépôt/retrait (`idempotency_key` UUID) — un retry réseau ne double-jamais l'opération.
6. **Isolation stricte par `business.id`** sur toutes les lectures/écritures (wallet, transactions, webhooks, clés) — vérifié par tests fonctionnels dédiés.
7. **Audit** systématique : login, changement de mot de passe, émission/révocation de clé, édition de profil.
