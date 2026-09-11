# API Panel Admin — Documentation complète

Toutes les routes ci-dessous sont préfixées par `/api/v1`. Elles sont réservées au personnel interne (support, compliance, finance, admin) — **guard `internal`**, distinct du guard des users (`api`) et de celui des businesses (`businessDashboard`). Il n'y a **aucun système de rôles** : tout `internal_user` actif a les mêmes droits sur tous les endpoints ci-dessous.

**Middleware systématique** sur chaque route (sauf mention contraire) :
```
auth({ guards: ['internal'] })   →  token Bearer valide, obtenu via /internal/auth/login
isInternalUser()                 →  vérifie que le principal authentifié est bien un InternalUser
```

---

## 0. Authentification (`/internal/auth/*`)

### 0.1 `POST /api/v1/internal/auth/login`
Public (aucune auth requise). Rate-limité à 5 tentatives / 15 min par IP.

**Body**
```json
{ "email": "admin@internal.test", "password": "..." }
```
**Réponse `200`**
```json
{
  "data": {
    "user": { "id": 1, "email": "admin@internal.test", "full_name": "..." },
    "token": "oat_...",
    "expires_in": 3600,
    "must_change_password": false
  }
}
```
Le token expire au bout de **1h** — pas de refresh dédié pour l'instant, il faut se reloguer.

**Erreurs**
- `400` — identifiants invalides.
- `403` — compte pas `active` (`inactive` ou `suspended`) : `{"message": "Account is suspended"}`.
- `429` — verrouillé après 5 échecs consécutifs pendant 15 min.

### 0.2 `POST /api/v1/internal/auth/logout`
Auth requise. Révoque le token courant.

### 0.3 `POST /api/v1/internal/auth/change-password`
Auth requise — self-service, pour un staff qui veut changer son propre mot de passe (typiquement après un `reset-password` admin, voir §1.7, qui pose `must_change_password: true`).

**Body**
```json
{ "current_password": "ancien", "new_password": "nouveau_8_caracteres_min" }
```
**Réponse `200`** : `{"message": "Password changed successfully"}`
**Erreur `401`** : mot de passe actuel incorrect.

---

## 1. Gestion des comptes staff (`/internal-users`)

Avant ces routes, la seule façon de créer/gérer un compte admin était un accès direct à la base — aucune API n'existait.

### 1.1 `GET /api/v1/internal-users`
Liste tous les comptes staff (pas de pagination, pas de filtre).

**Réponse `200`**
```json
{
  "data": [
    {
      "id": 1,
      "email": "admin@internal.test",
      "full_name": "...",
      "status": "active",
      "must_change_password": false,
      "mfa_enabled": false,
      "created_at": "..."
    }
  ]
}
```
`status` : `active` | `inactive` | `suspended`.

### 1.2 `GET /api/v1/internal-users/:id`
Même forme que ci-dessus + `updated_at`. `404` si introuvable.

### 1.3 `POST /api/v1/internal-users`
Crée un compte staff.

**Body**
```json
{ "email": "new@internal.test", "full_name": "Jane Doe", "password": "optionnel_min_8" }
```
Si `password` est omis, un mot de passe est **généré et renvoyé une seule fois** dans la réponse, avec `must_change_password: true` forcé.

**Réponse `201`**
```json
{
  "data": {
    "id": 25,
    "email": "new@internal.test",
    "full_name": "Jane Doe",
    "status": "active",
    "generated_password": "hTnFtaHPPgXy9tfd",
    "message": "Store this password now — it cannot be retrieved again."
  }
}
```
(le bloc `generated_password`/`message` n'apparaît que si le mot de passe a été généré)

### 1.4 `POST /api/v1/internal-users/:id/activate`
Réactive un compte `suspended`/`inactive`. `{"data": {"id": 25, "status": "active"}}`

### 1.5 `POST /api/v1/internal-users/:id/suspend`
Suspension **temporaire** (ex. enquête en cours).

**Body** : `{"reason": "min 10 caractères"}`
**Erreur `400`** : `{"message": "Cannot suspend or deactivate your own account"}` — un admin ne peut pas s'auto-suspendre.

### 1.6 `POST /api/v1/internal-users/:id/deactivate`
Départ **définitif** du staff. Même body/erreurs que suspend.

### 1.7 `POST /api/v1/internal-users/:id/reset-password`
Reset admin (le staff est verrouillé et n'a pas de flow self-service de récupération). Retourne le nouveau mot de passe **une seule fois**, force `must_change_password: true`.

**Réponse `200`**
```json
{ "data": { "new_password": "mTquOn2kp_aXDk7e", "message": "Store this password now — it cannot be retrieved again. The user must change it on next login." } }
```

---

## 2. Businesses (`/businesses`)

### 2.1 `GET /api/v1/businesses`
```json
{
  "data": [
    { "id": 9, "code": "MABOUTIQUE", "name": "...", "email": "...", "status": "active",
      "plan": { "id": 4, "code": "growth", "name": "Growth" }, "created_at": "..." }
  ]
}
```
`status` : `pending_approval` | `active` | `suspended` | `terminated`. `plan` est `null` si aucun plan assigné (fail-open, voir §4).

### 2.2 `POST /api/v1/businesses`
Création admin d'un business (alternative au self-signup public `/business/auth/signup`).

**Body**
```json
{ "name": "...", "email": "...", "phone": "...", "code": "optionnel (auto-généré BIZ-... sinon)", "password": "optionnel (généré sinon)" }
```
**Réponse `201`** : mêmes champs que le signup, + `generated_password`/`message` si mot de passe généré. Statut initial `pending_approval`.

### 2.3 `GET /api/v1/businesses/:id`
```json
{
  "data": {
    "id": 9, "code": "...", "name": "...", "email": "...", "phone": "...", "status": "active",
    "webhook_url": null,
    "plan": { "id": 4, "code": "growth", "name": "Growth", "features": ["mobile_money.deposits", "..."] },
    "created_at": "...", "updated_at": "..."
  }
}
```

### 2.4 `POST /api/v1/businesses/:id/approve`
`pending_approval → active`. **Bloque avec une erreur explicite si la KYC (KYB) du business n'est pas `approved`** (voir §6) — c'est un hard gate côté service, pas juste une convention.

### 2.5 `POST /api/v1/businesses/:id/suspend`
Body : `{"reason": "min 10 car."}`. `active → suspended`.

### 2.6 `POST /api/v1/businesses/:id/activate`
`suspended → active` (retour après suspension).

### 2.7 `POST /api/v1/businesses/:id/deactivate`
Body : `{"reason": "..."}`. Terminaison définitive (`→ terminated`).

### 2.8 `POST /api/v1/businesses/:id/api-keys`
Émet une clé API serveur-à-serveur pour ce business. **Nécessite `status === active`.** La clé complète n'est renvoyée **qu'une fois** :
```json
{ "data": { "key_id": 3, "api_key": "biz_live_...", "message": "Store this key now — it cannot be retrieved again. Only its hash is kept." } }
```

### 2.9 `DELETE /api/v1/businesses/:id/api-keys/:keyId`
Révoque une clé (effet immédiat, pas de cache).

### 2.10 `POST /api/v1/businesses/:id/plan`
Assigne un plan **gratuitement** (override support/commercial — pas de débit, contrairement au self-service `subscribe`, voir §4 et la doc business elle-même).

**Body** : `{"plan_id": 4}`
**Réponse `200`** : `{"data": {"id": 9, "plan": {"id": 4, "code": "growth", "name": "Growth"}}}`
**Erreur `404`** si `plan_id` inexistant.

---

## 3. Agents (`/agents`)

Mêmes conventions que Businesses (lifecycle identique), sans plan/api-keys.

| Endpoint | Body | Notes |
|---|---|---|
| `GET /agents` | — | `{id, full_name, email, status, created_at}` par agent |
| `POST /agents` | `{user_id, full_name, email, phone, region?, code?, commission_rate?}` | `user_id` doit référencer un `User` existant et pas déjà agent |
| `GET /agents/:id` | — | détail complet |
| `PATCH /agents/:id` | `{full_name?, email?, phone?, region?}` | |
| `POST /agents/:id/approve` | — | `pending_approval → active` |
| `POST /agents/:id/activate` | — | `suspended → active` |
| `POST /agents/:id/suspend` | `{reason}` | |
| `POST /agents/:id/deactivate` | `{reason}` | terminaison définitive |

---

## 4. Plans (`/plans`)

Tarification qui contrôle quelles APIs un business peut appeler (`business_plan_middleware.ts`) — voir aussi la doc business pour le flow de souscription self-service (`POST business/dashboard/plan/subscribe`).

### 4.1 `GET /api/v1/plans`
```json
{
  "data": [
    { "id": 1, "code": "default", "name": "Default", "description": "...",
      "features": ["mobile_money.deposits", "mobile_money.payouts", "webhooks", "wallet.multi_currency", "mobile_money.toolkit"],
      "price": "0", "maintenance_price": "0", "currency_code": "USD", "status": "active", "created_at": "..." }
  ]
}
```
`price`/`maintenance_price` sont des **strings** (unités les plus petites de la devise, ex. centimes) — jamais des `number` JS, pour ne pas perdre de précision sur de gros montants. `price` = frais unique à la souscription ; `maintenance_price` = frais récurrent mensuel (0 = pas de récurrence).

**Feature keys existantes** (chaque clé ne fait quelque chose que si une route est réellement gatée dessus dans `start/routes.ts`) :
`mobile_money.deposits`, `mobile_money.payouts`, `webhooks`, `wallet.multi_currency`, `mobile_money.toolkit`

### 4.2 `POST /api/v1/plans`
**Body**
```json
{
  "code": "pro", "name": "Pro", "description": "optionnel",
  "features": ["mobile_money.deposits", "mobile_money.payouts"],
  "price": "5000", "maintenance_price": "1000", "currency_code": "USD"
}
```
Tous les champs pricing sont optionnels (défaut `0`/`USD`). `code` doit être unique (`409` sinon).

### 4.3 `GET /api/v1/plans/:id`
Même forme + `updated_at`.

### 4.4 `PATCH /api/v1/plans/:id`
**Body** (tout optionnel) : `{name?, description?, features?, price?, maintenance_price?}`. Ne permet pas de changer `code` ni `currency_code` après création.

### 4.5 `POST /api/v1/plans/:id/archive`
Archive (jamais de suppression physique). `{"data": {"id": 4, "status": "archived"}}`

**Règles métier à connaître pour l'UI** (appliquées côté `business/dashboard/plan/subscribe`, pas ici) :
- Un business ne peut pas re-souscrire au plan déjà actif (`409`).
- Un business ne peut pas "souscrire" à un plan moins cher que l'actuel — le tarif classe les plans par `price` croissant, un downgrade payant n'a pas de sens. Seul `POST /businesses/:id/plan` (§2.10, gratuit) permet un downgrade.
- Un business sans plan assigné (`plan: null`) a **accès complet, fail-open** — ce n'est pas un bug, c'est voulu pour ne jamais bloquer un client sur une mauvaise config.

---

## 5. KYC (`/kyc`)

### 5.1 `GET /api/v1/kyc?status=pending&subject_type=business`
Découverte des dossiers KYC — sans ça, un admin ne pouvait agir que sur un `kyc_id` déjà connu. Les deux filtres sont optionnels.

- `status` : `not_started` | `pending` | `in_review` | `approved` | `rejected` | `expired`
- `subject_type` : `user` | `agent` | `business`

**Réponse `200`**
```json
{
  "data": [
    {
      "id": "KYC-XXXXXXXX", "subject_type": "business", "subject_id": 84,
      "verification_type": "identity", "provider": null, "status": "pending",
      "submitted_at": "...", "decided_at": null, "decision_reason": null, "reviewed_by": null,
      "created_at": "..."
    }
  ]
}
```
`400` si un filtre a une valeur invalide.

### 5.2 `GET /api/v1/kyc/:kyc_id/documents`
Liste les documents attachés (types + ids), sans leur contenu.

### 5.3 `GET /api/v1/kyc/:kyc_id/documents/:document_id`
Télécharge un document précis (binaire, `Content-Type: application/octet-stream`). **Chaque accès est audité** (PII).

### 5.4 `POST /api/v1/kyc/:kyc_id/approve`
Passe le dossier en `approved`. `400` si déjà décidé (`status !== 'pending'`).

### 5.5 `POST /api/v1/kyc/:kyc_id/reject`
**Body** : `{"reason": "min 10 caractères"}`. Passe en `rejected`.

---

## 6. Disputes (`/disputes`)

### 6.1 `GET /api/v1/disputes/all?status=opened&raised_by_type=user`
**⚠️ Chemin exact `/disputes/all`, pas `/disputes`** — `GET /disputes` (sans `/all`) est une route différente qui ne montre que les disputes du user connecté (guard `api`, pas `internal` — inutilisable depuis le panel admin).

- `status` : `opened` | `investigating` | `approved` | `rejected` | `resolved`
- `raised_by_type` : `user` | `agent` | `internal_user`

**Réponse `200`**
```json
{
  "data": [
    {
      "id": "DSP-XXXXXXXX", "ledger_transaction_id": "TXN-XXXXXXXX",
      "raised_by_type": "user", "raised_by_id": 1, "reason": "...",
      "status": "opened", "assigned_to": null, "resolution_notes": null,
      "opened_at": "...", "resolved_at": null
    }
  ]
}
```

### 6.2 `POST /api/v1/disputes/:id/close`
**Body**
```json
{ "outcome": "approved", "resolution_notes": "min 10 caractères" }
```
`outcome`:
- `"approved"` → la transaction d'origine est **réellement inversée** dans le ledger (double-entrée), `status → resolved`.
- `"rejected"` → aucun mouvement d'argent, `status → rejected`.

`400` si déjà fermée (`resolved`/`rejected`).

---

## 7. Users (`/users`)

Un `User` classique **n'a pas de statut de compte** (pas de suspend/deactivate possible sur le compte lui-même) — tout se passe au niveau du **wallet** (`active` | `frozen` | `closed`), déjà vérifié par tous les chemins qui bougent de l'argent (dépôts, cash-in/out, transferts, P2P). Ces routes sont le seul moyen de piloter ça depuis une API.

### 7.1 `GET /api/v1/users?search=jane`
`search` (optionnel) filtre sur email, nom complet ou code (`ILIKE`, insensible à la casse).

```json
{
  "data": [
    { "id": 1, "code": null, "email": "...", "full_name": "...", "login_attempts": 0, "login_locked_until": null, "created_at": "..." }
  ]
}
```

### 7.2 `GET /api/v1/users/:id`
Ajoute les wallets et le dernier statut KYC :
```json
{
  "data": {
    "id": 1, "code": null, "email": "...", "full_name": "...",
    "login_attempts": 0, "login_locked_until": null, "created_at": "...",
    "wallets": [ { "id": 9, "currency_code": "USD", "balance": "50000", "status": "active" } ],
    "kyc": { "id": "KYC-...", "status": "approved", "verification_type": "identity", "decided_at": "..." }
  }
}
```
`kyc` est `null` si le user n'a jamais soumis de KYC.

### 7.3 `POST /api/v1/users/:id/wallets/:walletId/freeze`
**Body** : `{"reason": "min 10 caractères"}`. Bloque tout dépôt/retrait/transfert sur ce wallet.
`400` si déjà `frozen`, ou si `closed` (on ne gèle pas un wallet fermé).
`404` si `:walletId` n'appartient pas à `:id` (vérification de propriété).

### 7.4 `POST /api/v1/users/:id/wallets/:walletId/unfreeze`
Repasse le wallet à `active`. `400` si le wallet n'était pas `frozen`.

---

## 8. Admin — vue plateforme (`/admin/*`)

Contrairement aux sections précédentes (chacune scopée à une ressource métier), ce préfixe regroupe les vues **transversales** que nulle autre route n'offre : toutes les transactions du ledger (peu importe qui les a initiées), le journal d'audit complet, toutes les cartes tous propriétaires confondus, le plan comptable interne (chart of accounts), et des rapports comptables agrégés. Même middleware que le reste (`auth({guards:['internal']})` + `isInternalUser()`).

Pagination : `transactions` et `audit-logs` sont paginés (`page`, `limit` max `100`, défaut `25`) — volume potentiellement énorme. `cards` et `ledger-accounts` aussi paginés/non-paginés selon la taille attendue de la liste — voir chaque sous-section.

### 8.1 Transactions (`/admin/transactions`)

#### `GET /api/v1/admin/transactions`
Liste **toutes** les transactions du ledger, tous initiateurs confondus (user, agent, business, system, internal_user) — contrairement à `business/transactions` (scopé à un seul business) ou aux transactions vues depuis les wallets/cartes.

**Query params (tous optionnels)**
| Param | Valeurs | Notes |
|---|---|---|
| `page`, `limit` | entiers | `limit` max `100`, défaut `25` |
| `status` | `initiated`\|`pending`\|`processing`\|`completed`\|`failed`\|`reversed`\|`reserved`\|`settled`\|`cancelled`\|`rejected` | `400` si invalide |
| `type` | libre | type de transaction (`p2p_transfer`, `mobile_money_deposit`, ...) |
| `initiated_by_type` | `user`\|`agent`\|`system`\|`internal_user`\|`business` | `400` si invalide |
| `initiated_by_id` | entier | à combiner avec `initiated_by_type` |
| `provider` | libre | ex. `pawapay`, `payscribe` |
| `currency_code` | ex. `USD` | filtre sur la colonne dénormalisée, avec fallback via jointure `ledger_entries` pour les vieilles lignes non backfillées |
| `payment_method` | libre | |
| `has_failure_reason` | `1`/`true`/... (tronqué en booléen) | ne montre que les transactions échouées avec une raison enregistrée |
| `date_from`, `date_to` | ISO 8601 | sur `created_at` — `400` si non parsable |
| `q` | libre | recherche `ilike` sur `id`, `uuid`, `correlation_id` |

**Réponse `200`**
```json
{
  "data": [
    {
      "id": "TXN-XXXXXXXX", "uuid": "...", "type": "p2p_transfer", "status": "completed",
      "initiated_by_type": "user", "initiated_by_id": 1, "initiated_by_name": "Jane Doe",
      "amount": "50000", "currency_code": "USD", "payment_method": null, "payment_channel": null,
      "fee": "0", "failure_reason": null, "related_transaction_id": null,
      "provider": null, "provider_reference_id": null, "description": "...",
      "created_at": "...", "completed_at": "...", "reversed_at": null
    }
  ],
  "meta": { "total": 1204, "page": 1, "limit": 25, "last_page": 49 }
}
```
`initiated_by_name` résout l'id vers un nom lisible (`fullName`/`email`/`name` selon le type) pour éviter d'avoir à recouper manuellement — `"System"` si `system`, sinon `"<type> #<id>"` si l'entité n'existe plus.

**Erreurs** : `400` — `status`, `initiated_by_type`, `date_from` ou `date_to` invalide (message précise le champ fautif).

#### `GET /api/v1/admin/transactions/:id`
Détail complet + tout ce qu'il faut pour investiguer sans changer d'écran : les `ledger_entries` en double-entrée, la transaction liée (ex. la ligne "posted" d'un dépôt mobile money dont `:id` est la ligne "tracking"), et le dispute éventuel.

**Réponse `200`**
```json
{
  "data": {
    "id": "TXN-XXXXXXXX", "uuid": "...", "type": "mobile_money_deposit", "status": "completed",
    "idempotency_key": "...", "correlation_id": "...",
    "initiated_by_type": "user", "initiated_by_id": 1, "initiated_by_name": "Jane Doe",
    "amount": "50000", "currency_code": "USD", "payment_method": "mobile_money", "payment_channel": "MTN_MOMO_COD",
    "counterparty_phone": "+243...", "fee": "500",
    "failure_reason": null,
    "related_transaction": { "id": "TXN-YYYYYYYY", "type": "mobile_money_deposit", "status": "completed" },
    "reversal_of_transaction_id": null,
    "description": "...", "metadata": {},
    "provider": "pawapay", "provider_reference_id": "...",
    "created_at": "...", "completed_at": "...", "reversed_at": null,
    "entries": [
      {
        "id": 501, "ledger_account_id": 12, "account_code": "USER_WALLET.9", "account_name": "...",
        "owner_type": "user_wallet", "owner_id": 9, "direction": "credit",
        "amount": "50000", "currency_code": "USD", "balance_after": "125000", "created_at": "..."
      }
    ],
    "dispute": null
  }
}
```
`related_transaction` et `dispute` sont `null` s'il n'y en a pas. Pas de `risk_assessment` — la table existe mais n'est plus jamais écrite (colonne d'FK legacy, voir §9).

**Erreurs** : `404` si `:id` inexistant.

### 8.2 Audit logs (`/admin/audit-logs`)

Vue en lecture seule sur `AuditLog` — quasiment chaque action admin ci-dessus (agents, businesses, kyc, disputes, plans, internal-users, cartes...) y écrit déjà via `AuditLoggerService.record()`; ces deux routes sont le seul moyen de la relire.

#### `GET /api/v1/admin/audit-logs`
**Query params (tous optionnels)**
| Param | Valeurs |
|---|---|
| `page`, `limit` | `limit` max `100`, défaut `25` |
| `actor_type` | `user`\|`agent`\|`internal_user`\|`system`\|`business` (`400` si invalide) |
| `actor_id` | entier |
| `resource_type` | libre (ex. `card`, `business`, `kyc_verification`) |
| `resource_id` | libre (string — certains ids sont des `TXN-...`/`KYC-...`) |
| `action` | libre, recherche `ilike` partielle (ex. `freeze` matche `card.admin_frozen`) |
| `date_from`, `date_to` | ISO 8601 sur `created_at` |

**Réponse `200`**
```json
{
  "data": [
    {
      "id": 88, "actor_type": "internal_user", "actor_id": 1, "action": "card.admin_frozen",
      "resource_type": "card", "resource_id": "42", "ip_address": "203.0.113.10",
      "correlation_id": "...", "created_at": "..."
    }
  ],
  "meta": { "total": 3021, "page": 1, "limit": 25, "last_page": 121 }
}
```
Le détail `before`/`after` (diff) n'est **volontairement pas** dans la liste (taille) — voir `show` ci-dessous.

**Erreurs** : `400` — `actor_type`, `date_from` ou `date_to` invalide.

#### `GET /api/v1/admin/audit-logs/:id`
Même forme + `before`, `after` (diff JSON), `user_agent`, `device_id`.
```json
{
  "data": {
    "id": 88, "actor_type": "internal_user", "actor_id": 1, "action": "card.admin_frozen",
    "resource_type": "card", "resource_id": "42",
    "before": null, "after": { "reason": "compte compromis, min 10 caractères" },
    "ip_address": "203.0.113.10", "user_agent": "...", "device_id": null,
    "correlation_id": "...", "created_at": "..."
  }
}
```
**Erreurs** : `404` si `:id` inexistant.

### 8.3 Cartes — vue plateforme (`/admin/cards`)

`cards_controller.ts` (self-service) est scopé au porteur authentifié (`auth.user`) et son freeze/unfreeze/terminate refusent toute carte qui ne lui appartient pas. Ces routes admin résolvent d'abord le vrai propriétaire (`user` ou `business`) puis appellent le **même** `CardService`, donc mêmes règles métier, sans bypass de sécurité ajouté au service partagé avec le code qui bouge de l'argent.

#### `GET /api/v1/admin/cards`
**Query params (optionnels)** : `page`, `limit` (max `100`, défaut `25`), `status` (`pending`\|`active`\|`frozen`\|`terminated`\|`failed`, `400` si invalide), `owner_type` (`user`\|`business`, `400` si invalide), `brand`, `currency_code`.

**Réponse `200`**
```json
{
  "data": [
    {
      "id": 42, "owner_type": "user", "owner_id": 9, "brand": "visa", "card_type": "virtual",
      "currency_code": "USD", "status": "active", "masked": "4111 **** **** 1111",
      "balance": "10000", "created_at": "..."
    }
  ],
  "meta": { "total": 57, "page": 1, "limit": 25, "last_page": 3 }
}
```

#### `GET /api/v1/admin/cards/:id`
Même forme + `wallet_id`, `provider`, `first_six`, `last_four`, `failure_reason`, `updated_at`. **Jamais** le PAN complet ni le CVV (chiffrés séparément, voir `card_detail_crypto_service.ts` — aucune route admin n'y donne accès). `404` si `:id` inexistant.

#### `POST /api/v1/admin/cards/:id/freeze`
Gèle la carte quel qu'en soit le propriétaire. Audité deux fois : une fois par `CardService` (attribué au propriétaire de la carte, comme pour un freeze self-service), une fois par le contrôleur admin lui-même sous l'action `card.admin_frozen` avec le **vrai** acteur (l'internal user).

**Réponse `200`** : `{"data": {"id": 42, "status": "frozen"}}`
**Erreurs** : `404` si carte introuvable, `400` si transition invalide (ex. déjà `terminated`).

#### `POST /api/v1/admin/cards/:id/unfreeze`
Symétrique, action auditée `card.admin_unfrozen`. Mêmes erreurs.

#### `POST /api/v1/admin/cards/:id/terminate`
**Body** : `{"reason": "min 10 caractères"}` (mirroring agents/businesses suspend). Action irréversible, auditée `card.admin_terminated` avec `after: {reason}`.

**Réponse `200`** : `{"data": {"id": 42, "status": "terminated"}}`
**Erreurs** : `422` si `reason` absent/trop court, `404` si carte introuvable, `400` si déjà `terminated`/`failed`.

### 8.4 Plan comptable (`/admin/ledger-accounts`)

Vue en lecture seule du chart of accounts — un compte `platform_internal` (clearing, fees, equity, ...) par type, plus un compte lié par wallet. Liste **non paginée** (mirrors `/agents`, `/plans` — taille attendue petite), contrairement à `/admin/transactions`. Le solde n'est pas une colonne stockée sur `LedgerAccount` : il est dérivé du dernier `LedgerEntry.balance_after`, la même source de vérité que `LedgerService` utilise en interne.

#### `GET /api/v1/admin/ledger-accounts?owner_type=platform_internal`
`owner_type` optionnel (`platform_internal`\|`user_wallet`\|`agent_wallet`\|`business_wallet`).

**Réponse `200`**
```json
{
  "data": [
    {
      "id": 3, "code": "PLATFORM_FEES.USD", "name": "Platform Fees (USD)", "account_type": "revenue",
      "owner_type": "platform_internal", "owner_id": null, "currency_code": "USD",
      "status": "active", "balance": "125000"
    }
  ]
}
```
`balance` = `"0"` si le compte n'a encore aucune entrée.

#### `GET /api/v1/admin/ledger-accounts/:id`
Même forme + `recent_entries` (50 dernières, plus récentes d'abord) :
```json
{
  "data": {
    "id": 3, "code": "PLATFORM_FEES.USD", "name": "Platform Fees (USD)", "account_type": "revenue",
    "owner_type": "platform_internal", "owner_id": null, "currency_code": "USD",
    "status": "active", "balance": "125000",
    "recent_entries": [
      { "id": 9012, "ledger_transaction_id": "TXN-XXXXXXXX", "direction": "credit", "amount": "500", "balance_after": "125000", "created_at": "..." }
    ]
  }
}
```
**Erreurs** : `404` si `:id` inexistant.

### 8.5 Comptabilité (`/admin/accounting`)

Rapports en lecture seule construits sur ce que `LedgerService` calcule déjà (convention débit/crédit de `getAccountBalance()`, invariants d'intégrité de `reconcileBalances()`) — aucune nouvelle règle de comptabilisation, juste l'agrégation pour l'affichage.

#### `GET /api/v1/admin/accounting/balance-sheet?currency=USD`
Actif vs Passif+Capitaux propres pour **une seule devise** (`currency` optionnel, défaut `USD` — les devises ne se somment pas entre elles). Les comptes de wallet (`user_wallet`/`agent_wallet`/`business_wallet`) sont reclassés en **passif** ici (ce que la plateforme doit à ses détenteurs), même si leur `account_type` stocké est `asset` (correct du point de vue du détenteur, pas de la plateforme). Les comptes `platform_internal` gardent leur `account_type` stocké tel quel.

**Réponse `200`**
```json
{
  "data": {
    "currency_code": "USD",
    "assets": "500000", "liabilities": "480000", "equity": "10000",
    "revenue": "15000", "expense": "5000",
    "balanced": true
  }
}
```
`balanced` = `assets === liabilities + equity` — `false` signale une incohérence comptable à investiguer (idéalement toujours `true`).

#### `GET /api/v1/admin/accounting/revenue?currency=USD&date_from=&date_to=`
Frais réellement encaissés (crédités sur un compte `revenue`) sur la période, ventilés par compte (ex. `PLAN_SUBSCRIPTION_FEES`, `PLATFORM_FEES.USD` — créé paresseusement au premier frais > 0). `currency` optionnel (défaut `USD`), `date_from`/`date_to` optionnels (ISO 8601, sur `ledger_entries.created_at`).

**Réponse `200`**
```json
{
  "data": {
    "currency_code": "USD", "total": "15000",
    "by_account": [
      { "code": "PLATFORM_FEES.USD", "name": "Platform Fees (USD)", "total": "12000", "entry_count": 340 },
      { "code": "PLAN_SUBSCRIPTION_FEES", "name": "Plan Subscription Fees", "total": "3000", "entry_count": 6 }
    ]
  }
}
```
**Erreurs** : `400` si `date_from`/`date_to` non parsable.

#### `POST /api/v1/admin/accounting/reconcile`
Déclenche `LedgerService.reconcileBalances()` **à la demande** (pas planifié — itère tous les wallets, coûteux) : deux contrôles d'intégrité indépendants — (1) par wallet, `balance_cache` vs somme réelle de ses `ledger_entries` ; (2) global par devise, total débits vs total crédits (l'invariant fondamental de la double-entrée, censé toujours être vrai en pratique).

**Réponse `200`**
```json
{
  "data": {
    "walletsChecked": 412,
    "walletMismatches": [
      { "walletId": 9, "expected": "125000", "actual": "124500" }
    ],
    "balancedByCurrency": { "USD": true, "CDF": true },
    "totalsByCurrency": { "USD": { "debits": "9800000", "credits": "9800000" } }
  }
}
```
`walletMismatches` vide = tout est cohérent. Aucun paramètre requis — pas de body.

---

## 9. Ce qui n'existe PAS encore (à ne pas essayer d'appeler)

- **Risk assessments** — table en base, aucun contrôleur ; `risk_assessments.ledger_transaction_id` est resté un entier après la migration des ids de transaction vers `varchar`, donc même une lecture directe y comparant un `TXN-...` casserait (erreur de type Postgres).
- **Déclenchement API de la réconciliation PawaPay** (`node ace mobile-money:reconcile`) ou de la facturation de maintenance des plans (`node ace plans:bill-maintenance`) — CLI uniquement, pas de route admin.
- **Rôles/permissions granulaires** — rappel : tout `internal_user` actif a les mêmes droits sur 100% des endpoints ci-dessus (§0 en préambule).

Si le panel a besoin de l'un de ces trois, il faut le demander pour qu'il soit construit avant de commencer l'écran correspondant.

---

## 10. Codes d'erreur — récapitulatif transverse

| Code | Signification | Où |
|---|---|---|
| `400` | Payload/filtre invalide (`status`, `initiated_by_type`, `owner_type`, dates non parsables...), ou transition d'état illégale (ex. suspendre un compte déjà suspendu, freezer une carte déjà `terminated`) | Partout |
| `401` | Token `internal` absent, invalide ou expiré (1h, pas de refresh — voir §0.1) | Partout (sauf `POST /internal/auth/login`) |
| `403` | Token valide mais pas un `InternalUser` (`isInternalUser()`), ou compte staff pas `active` | Partout / `POST /internal/auth/login` |
| `404` | Ressource introuvable, ou relation possédée par une autre entité (ex. `:walletId` n'appartenant pas à `:id`) | Partout |
| `409` | Conflit métier (ex. `code` de plan déjà pris) | Plans, Businesses |
| `422` | Validation VineJS échouée sur le body (`reason` trop court, champs requis manquants) — forme `{"errors": [{"message": "...", "rule": "...", "field": "..."}]}` | Toute route avec un body validé |
| `429` | Rate limit dépassé (`POST /internal/auth/login` : 5 tentatives / 15 min par IP) | `internal/auth/login` |
| `500` | Erreur serveur non gérée (bug, contrainte DB) — ne devrait jamais arriver en usage normal | Partout |

**Astuce debug** : chaque réponse porte un `correlation_id` implicite (header `x-correlation-id` en retour, voir `correlation_id_middleware.ts`) — le même identifiant apparaît dans les lignes d'audit log correspondantes (§8.2), pratique pour relier une erreur signalée par un utilisateur au trail admin.
