# IMF — P3 & P4 : Restructuration, Défauts, Provisionnement IFRS 9 & Reporting Réglementaire

> **Version** : Phase IMF P3 & P4  
> **Base URLs** :
> - Counter API : `/api/v1/counter/...` (Session guichet / Business Staff)
> - Business Dashboard API : `/api/v1/business/dashboard/imf/...` (Session Business active)

---

## Sommaire

1. [P3 : Rééchelonnement & Restructuration de Dette](#1-p3--rééchelonnement--restructuration-de-dette)
2. [P3 : Gestion des Défauts & Saisie de Collatéral](#2-p3--gestion-des-défauts--saisie-de-collatéral)
3. [P3 : Calcul des Pénalités Automatiques](#3-p3--calcul-des-pénalités-automatiques)
4. [P4 : Provisionnement Prudentiel & IFRS 9](#4-p4--provisionnement-prudentiel--ifrs-9)
5. [P4 : Reporting Réglementaire Banque Centrale](#5-p4--reporting-réglementaire-banque-centrale)
6. [Matrice des Droits & Codes d'Erreur](#6-matrice-des-droits--codes-derreur)

---

## 1. P3 : Rééchelonnement & Restructuration de Dette

La restructuration de créance permet à l'IMF d'aménager les conditions d'un prêt en difficulté (allongement de maturité, différé d'amortissement / période de grâce, révision du taux, récapitalisation éventuelle des pénalités) tout en traçant l'historique complet pour le régulateur.

### 1.1 Restructurer un prêt

```http
POST /api/v1/counter/loans/:id/restructure
Authorization: Bearer <staff_token>
```

**Corps de la requête**
```json
{
  "new_term_months": 18,
  "new_interest_rate_bps": 1500, // 15% (optionnel)
  "grace_period_months": 2,      // 2 mois de différé avant la prochaine échéance
  "recapitalize_penalties": false, // si true, intègre les pénalités au nouveau principal
  "reason": "Difficultés temporaires de trésorerie suite aux inondations"
}
```

**Effets système** :
- Les anciennes échéances non réglées sont archivées/supprimées et un nouvel échéancier est reconstruit à partir de `(date + grace_period_months)`.
- `loan.is_restructured` passe à `true`, `loan.restructure_count` est incrémenté.
- Un enregistrement immuable est inséré dans `loan_restructurings`.
- Le prêt repasse en statut actif `repaying`.

### 1.2 Historique des restructurations d'un prêt

```http
GET /api/v1/counter/loans/:id/restructurings
Authorization: Bearer <staff_token>
```

**Réponse 200**
```json
{
  "data": [
    {
      "id": 1,
      "loan_id": 42,
      "decided_by": { "id": 5, "role": "branch_manager" },
      "previous_principal_outstanding": "120000",
      "previous_interest_outstanding": "18000",
      "previous_term_months": 12,
      "previous_interest_rate_bps": 2000,
      "new_principal_outstanding": "120000",
      "new_term_months": 18,
      "new_interest_rate_bps": 1500,
      "grace_period_months": 2,
      "reason": "Difficultés temporaires de trésorerie suite aux inondations",
      "restructured_at": "2026-09-23T10:00:00.000Z"
    }
  ]
}
```

---

## 2. P3 : Gestion des Défauts & Saisie de Collatéral

### 2.1 Constater le défaut d'un prêt (avec option de saisie)

```http
POST /api/v1/counter/loans/:id/default
Authorization: Bearer <staff_token>
```

**Corps de la requête**
```json
{
  "reason": "Cessation d'activité de l'emprunteur et refus de conciliation",
  "seize_collateral": true // si true, exécute immédiatement le virement du compte d'épargne vers l'institution
}
```

**Réponse 200**
```json
{
  "data": {
    "id": 42,
    "status": "defaulted",
    "principal_outstanding": "35000",
    "collateral_status": "seized",
    "defaulted_at": "2026-09-23T10:30:00.000Z",
    ...
  }
}
```

### 2.2 Saisir le collatéral d'un prêt déjà en défaut

```http
POST /api/v1/counter/loans/:id/seize-collateral
Authorization: Bearer <staff_token>
```

**Réponse 200**
```json
{
  "data": {
    "loan": { ... },
    "amount_seized": "15000"
  }
}
```

---

## 3. P3 : Calcul des Pénalités Automatiques

Exécute le calcul périodique idempotent des pénalités sur tous les prêts en souffrance hors délai de grâce.

```http
POST /api/v1/counter/penalties/run
Authorization: Bearer <staff_token>
```

**Corps optionnel**
```json
{
  "period": "2026-09" // défaut: mois courant
}
```

**Réponse 200**
```json
{
  "data": {
    "period": "2026-09",
    "loans_considered": 140,
    "loans_charged": 12,
    "total_charged": "185000"
  }
}
```

---

## 4. P4 : Provisionnement Prudentiel & IFRS 9

Classification des actifs selon les normes bancaires et calcul des pertes de crédit attendues (ECL) avec déduction de l'épargne nantie.

```http
GET /api/v1/business/dashboard/imf/provisioning?currency=USD
Authorization: Bearer <business_dashboard_token>
```

**Matrice de provisionnement par bucket de risque** :

| Catégorie | Stage IFRS 9 | Jours de retard | Taux Provision | Déduction Collatéral |
|---|---|---|---|---|
| **Performing (Sain)** | Stage 1 | 0 jour | **1%** | Oui |
| **Watch (Surveillance)** | Stage 2 | 1 à 30 jours | **5%** | Oui |
| **Substandard (Pré-douteux)** | Stage 2 | 31 à 90 jours | **20%** | Oui |
| **Doubtful (Douteux)** | Stage 3 | 91 à 180 jours | **50%** | Oui |
| **Loss (Compromis / Défaut)** | Stage 3 | > 180 jours / default | **100%** | Oui |

**Réponse 200**
```json
{
  "data": {
    "providerId": 1,
    "currencyCode": "USD",
    "asOf": "2026-09-23T03:30:00.000Z",
    "totalLoansCount": 85,
    "totalGrossPrincipal": "45000000",
    "totalCollateralDeducted": "4500000",
    "totalNetExposure": "40500000",
    "totalProvisionRequired": "1850000",
    "overallCoverageRatioBps": 411, // 4.11%
    "categories": [
      {
        "category": "performing",
        "stage": 1,
        "loansCount": 70,
        "grossPrincipal": "38000000",
        "collateralDeducted": "3800000",
        "netExposure": "34200000",
        "provisionRequired": "342000"
      },
      {
        "category": "watch",
        "stage": 2,
        "loansCount": 8,
        "grossPrincipal": "4000000",
        "collateralDeducted": "400000",
        "netExposure": "3600000",
        "provisionRequired": "180000"
      },
      ...
    ],
    "loansDetail": [ ... ]
  }
}
```

---

## 5. P4 : Reporting Réglementaire Banque Centrale

Génère la déclaration prudentielle réglementaire synthétique (BCC, BCEAO, COBAC).

```http
GET /api/v1/business/dashboard/imf/regulatory-report?currency=USD
Authorization: Bearer <business_dashboard_token>
```

**Réponse 200**
```json
{
  "data": {
    "institution": {
      "id": 1,
      "currencyCode": "USD",
      "generatedAt": "2026-09-23T03:30:00.000Z",
      "asOf": "2026-09-23T03:30:00.000Z"
    },
    "portfolioOverview": {
      "grossLoanPortfolio": "45000000",
      "activeBorrowersCount": 82,
      "activeLoansCount": 85,
      "restructuredLoansCount": 4,
      "restructuredPrincipal": "2100000",
      "restructuredShareBps": 466, // 4.66%
      "defaultedLoansCount": 2,
      "defaultedPrincipal": "850000"
    },
    "riskMetrics": {
      "par1Amount": "7000000",
      "par1Bps": 1555,
      "par30Amount": "3000000",
      "par30Bps": 666, // 6.66%
      "par60Amount": "1800000",
      "par60Bps": 400,
      "par90Amount": "850000",
      "par90Bps": 188, // 1.88%
      "nplRatioBps": 188
    },
    "provisioningMetrics": {
      "totalProvisionsRequired": "1850000",
      "provisionCoverageRatioBps": 21764, // 217.64% des créances > 90 jours
      "netLoanPortfolio": "43150000"
    },
    "collateralAndSavings": {
      "totalLockedCollateral": "4500000",
      "collateralizationRatioBps": 1000 // 10.00%
    },
    "lendingMethodology": {
      "individualLoansCount": 55,
      "individualPrincipal": "32000000",
      "groupLoansCount": 30,
      "groupPrincipal": "13000000",
      "activeGroupsCount": 6
    }
  }
}
```

---

## 6. Matrice des Droits & Codes d'Erreur

### Rôles autorisés

| Endpoint | Teller | Credit Officer | Branch Manager | Admin |
|---|:---:|:---:|:---:|:---:|
| `POST .../loans/:id/restructure` | ❌ | ✅ | ✅ | ✅ |
| `POST .../loans/:id/default` | ❌ | ✅ | ✅ | ✅ |
| `POST .../loans/:id/seize-collateral` | ❌ | ✅ | ✅ | ✅ |
| `POST .../penalties/run` | ❌ | ✅ | ✅ | ✅ |
| `GET .../imf/regulatory-report` | ❌ | ❌ | ✅ (Dashboard) | ✅ (Dashboard) |
| `GET .../imf/provisioning` | ❌ | ❌ | ✅ (Dashboard) | ✅ (Dashboard) |

### Codes d'erreur HTTP

| Code d'erreur | HTTP | Signification |
|---|---|---|
| `E_RESTRUCTURE_FAILED` | 409 | Échec de restructuration (prêt inactif, durée invalide, etc.) |
| `E_DEFAULT_FAILED` | 409 | Statut incompatible pour constat de défaut (déjà remboursé / annulé) |
| `E_SEIZURE_FAILED` | 409 | Aucun collatéral verrouillé disponible sur le compte d'épargne |
| `E_NOT_AUTHORIZED` | 403 | Rôle insuffisant pour cette opération sensible |
