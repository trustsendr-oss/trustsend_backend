# IMF — P1 / P2 : Circuit Comité, Épargne Nantie, Groupes Solidaires & Portefeuilles Agents

> **Version** : Phase IMF P1-P2  
> **Base URL** : `POST /api/v1/counter/...`  
> **Auth** : `Authorization: Bearer <staff_token>` (session guichet + `middleware.businessStaff()`)

---

## Sommaire

1. [Circuit du Comité de Crédit (P1)](#1-circuit-du-comité-de-crédit-p1)
2. [Épargne Nantie / Collatéral (P1)](#2-épargne-nantie--collatéral-p1)
3. [Groupes Solidaires (P2)](#3-groupes-solidaires-p2)
4. [Portefeuilles des Agents de Crédit (P2)](#4-portefeuilles-des-agents-de-crédit-p2)
5. [Cycle de vie complet d'un prêt IMF](#5-cycle-de-vie-complet-dun-prêt-imf)
6. [Codes d'erreur](#6-codes-derreur)

---

## 1. Circuit du Comité de Crédit (P1)

### Contexte

Dans une microfinance, le chargé de dossier qui instruit un crédit n'est généralement pas celui qui l'approuve. Un **comité de crédit** (au moins deux personnes habilitées) examine le dossier et prend une décision collégiale. Ce circuit est modélisé par le champ `stage` sur le prêt, distinct du champ `status` (état financier).

| Champ | Rôle |
|-------|------|
| `status` | État financier : `requested → approved → disbursed → repaying → repaid` |
| `stage` | Circuit comité : `requested → under_review → committee_approved → disbursed` |

Le décaissement (`disburse`) **bloque** si `stage` est `under_review` — les deux dimensions doivent être satisfaites.

### 1.1 Soumettre un dossier au comité

```
POST /api/v1/counter/loans/:id/submit
```

**Rôles autorisés** : `credit_officer`, `branch_manager`, `admin`

**Réponse 200**
```json
{
  "data": {
    "id": 42,
    "status": "requested",
    "stage": "under_review",
    "assigned_loan_officer_id": 7,
    ...
  }
}
```

**Règles**
- Le prêt doit être en `status = 'requested'`.
- S'il est déjà `under_review` ou au-delà → `409 E_COMMITTEE_RULE`.

---

### 1.2 Approbation par le comité

```
POST /api/v1/counter/loans/:id/committee-approve
```

**Corps (optionnel)**
```json
{
  "approved_principal": "80000",   // montant approuvé (≤ montant demandé), en centimes
  "notes": "Approuvé après examen du plan de remboursement"
}
```

**Réponse 200**
```json
{
  "data": {
    "id": 42,
    "status": "approved",
    "stage": "committee_approved",
    "principal": "80000",
    "approved_principal": "80000",
    "committee_decision_at": "2026-09-23T10:30:00.000Z",
    "committee_notes": "Approuvé après examen du plan de remboursement",
    ...
  }
}
```

**Règles**
- Le prêt doit être en `stage = 'under_review'`.
- `approved_principal` ≤ `principal` demandé (le comité ne peut pas augmenter le montant).
- Si `approved_principal` est fourni et inférieur, `loan.principal` est ajusté.
- Après approbation, le prêt passe en `status = 'approved'` → prêt à décaisser.

---

### 1.3 Rejet par le comité

```
POST /api/v1/counter/loans/:id/committee-reject
```

**Corps**
```json
{
  "notes": "Capacité de remboursement insuffisante (ratio > 40%)"
}
```

**Réponse 200**
```json
{
  "data": {
    "id": 42,
    "status": "rejected",
    "stage": "rejected",
    "committee_notes": "Capacité de remboursement insuffisante (ratio > 40%)",
    ...
  }
}
```

**Règles**
- `notes` est obligatoire (≥ 10 caractères) — la raison est requise pour le dossier réglementaire.

---

### 1.4 Décaissement après approbation comité

Le décaissement utilise l'endpoint **existant** :

```
POST /api/v1/counter/loans/:id/disburse
```

Aucun changement de contrat. La vérification du stage est automatique : si `stage = 'under_review'`, le décaissement est bloqué avec `409 E_LOAN_STATE`.

---

## 2. Épargne Nantie / Collatéral (P1)

### Contexte

Les IMF utilisent souvent l'**épargne obligatoire** comme garantie implicite : le produit de crédit spécifie un `mandatory_savings_bps` (points de base du principal à conserver bloqués pendant la vie du prêt). À la remise des fonds, `CollateralService.lockCollateral()` gèle automatiquement le montant calculé sur le compte d'épargne de l'emprunteur.

### Comportement automatique au décaissement

Lorsque `financial_product.mandatory_savings_bps > 0` :

1. Après écriture du ledger de décaissement, le service appelle `CollateralService.lockCollateral()`.
2. Celui-ci trouve le compte d'épargne actif de l'emprunteur dans l'institution.
3. Il vérifie que `solde_disponible ≥ montant_à_bloquer` (= `principal × mandatory_savings_bps / 10000`).
4. Il enregistre `loan.mandatory_savings_locked = true`, `loan.collateral_savings_account_id`, `loan.collateral_status = 'locked'`.
5. Il incrémente `savings_account.locked_collateral_amount`.

> **Important** : un échec de verrouillage du collatéral **ne rollback pas** le décaissement. L'argent a déjà bougé. L'échec est journalisé (`loan.collateral.lock_failed`) pour traitement manuel.

### Libération automatique au remboursement intégral

`CollateralService.releaseCollateral()` est à appeler depuis le service métier lors du passage du prêt en `status = 'repaid'`. La méthode débloque les fonds et remet `collateral_status = 'released'`.

### Saisie (défaut)

`CollateralService.seizeCollateral()` transfère les fonds bloqués vers le wallet de l'institution. À appeler lors du passage en `status = 'defaulted'` (Phase 5).

---

## 3. Groupes Solidaires (P2)

### Contexte

Le **crédit de groupe** (solidaire) lie les membres d'un groupe : si l'un est en retard, aucun autre membre ne peut obtenir un nouveau crédit. `GroupLendingService.assertGroupEligibleForLoan()` applique cette règle.

### 3.1 Lister les groupes

```
GET /api/v1/counter/groups
```

**Réponse 200**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Groupe Espoir Kinshasa",
      "status": "active",
      "member_count": 5,
      "members": [...]
    }
  ]
}
```

---

### 3.2 Créer un groupe

```
POST /api/v1/counter/groups
```

**Corps**
```json
{
  "name": "Groupe Espoir Kinshasa",
  "external_reference": "GRP-2026-001"    // optionnel: référence interne IMF
}
```

**Réponse 201**
```json
{
  "data": { "id": 1, "name": "Groupe Espoir Kinshasa", "status": "active", ... }
}
```

---

### 3.3 Détail + résumé financier

```
GET /api/v1/counter/groups/:id
```

**Réponse 200**
```json
{
  "data": {
    "id": 1,
    "name": "Groupe Espoir Kinshasa",
    "members": [...],
    "summary": {
      "total_members": 5,
      "active_loans": 3,
      "total_outstanding": "450000",
      "has_overdue_member": false
    }
  }
}
```

---

### 3.4 Résumé financier seul

```
GET /api/v1/counter/groups/:id/summary
```

---

### 3.5 Ajouter un membre

```
POST /api/v1/counter/groups/:id/members
```

**Corps**
```json
{
  "user_id": 123,
  "role": "leader"   // "leader" | "officer" | "member" (défaut: "member")
}
```

**Réponse 200** — groupe avec membres mis à jour.

**Règles**
- Un utilisateur ne peut être membre que d'un seul groupe actif à la fois dans la même institution.

---

### 3.6 Retirer un membre

```
DELETE /api/v1/counter/groups/:id/members/:userId
```

**Règles**
- Impossible de retirer un membre avec un prêt actif (`status IN ('disbursed', 'repaying')`).

---

## 4. Portefeuilles des Agents de Crédit (P2)

### Contexte

Chaque agent de crédit (`credit_officer`) gère un portefeuille d'emprunteurs et de prêts qui lui sont affectés. Les indicateurs **PAR30** et **PAR90** (Portfolio at Risk) sont les métriques réglementaires standard pour les IMF.

### 4.1 Consulter le portefeuille d'un agent

```
GET /api/v1/counter/staff/:id/portfolio
```

**Droits** : Un `credit_officer` ne peut consulter que son propre portefeuille. Un `branch_manager` ou `admin` peut consulter n'importe quel agent.

**Réponse 200**
```json
{
  "data": {
    "officer_id": 7,
    "officer_name": "Marie Dupont",
    "total_loans": 45,
    "active_loans": 32,
    "total_outstanding": "14500000",
    "par30": 0.08,          // 8% : encours en retard > 30 jours / encours total
    "par90": 0.02,          // 2% : encours en retard > 90 jours / encours total
    "recovery_rate": 0.94,  // 94% : principal remboursé / principal décaissé
    "loans": [...]
  }
}
```

---

### 4.2 Affecter un prêt à un agent

```
POST /api/v1/counter/loans/:id/assign
```

**Rôles autorisés** : `branch_manager`, `admin`

**Corps**
```json
{
  "officer_id": 7
}
```

**Réponse 200** — prêt mis à jour avec `assigned_loan_officer_id`.

---

### 4.3 Affecter un emprunteur à un agent (affectation permanente)

```
POST /api/v1/counter/borrowers/assign
```

**Rôles autorisés** : `branch_manager`, `admin`

**Corps**
```json
{
  "officer_id": 7,
  "user_id": 123
}
```

**Réponse 200**
```json
{
  "message": "Borrower assigned to officer",
  "officer_id": 7,
  "user_id": 123
}
```

Cette affectation est persistée sur `users.assigned_loan_officer_id`. Elle s'applique à tous les prêts futurs de cet emprunteur dans cette institution.

---

## 5. Cycle de vie complet d'un prêt IMF

```
Emprunteur              Agent de crédit           Comité             Système
    │                         │                      │                  │
    │── POST /finance/loans ──▶│                      │                  │
    │                         │── POST .../submit ───▶│                  │
    │                         │                      │ (examen dossier)  │
    │                         │                      │── committee-approve ──▶│
    │                         │── POST .../disburse ─────────────────────▶│
    │                         │                      │                  │ (lock collateral)
    │◀── argent reçu ─────────│                      │                  │
    │                         │                      │                  │
    │── POST /finance/loans/:id/repay ────────────────────────────────▶│
    │                         │                      │                  │ (release collateral si soldé)
```

---

## 6. Codes d'erreur

| Code | HTTP | Signification |
|------|------|---------------|
| `E_COMMITTEE_RULE` | 409 | Règle comité violée (mauvais stage, principal trop élevé, notes manquantes) |
| `E_LOAN_STATE` | 409 | Transition de statut invalide (ex: décaisser un prêt `under_review`) |
| `E_NOT_A_COMMITTEE_MEMBER` | 403 | Le membre du personnel n'a pas le rôle requis pour siéger au comité |
| `E_NOT_A_MANAGER` | 403 | Seul un branch_manager ou admin peut affecter des portefeuilles |
| `E_OWN_PORTFOLIO_ONLY` | 403 | Un credit_officer ne peut consulter que son propre portefeuille |
| `E_GROUP_MEMBERSHIP` | 409 | Règle de membership (déjà membre, retrait impossible car prêt actif) |
| `E_LENDER_FUNDS` | 409 | L'institution n'a pas les fonds pour décaisser |
