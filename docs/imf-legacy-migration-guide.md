# Guide de Migration Manuelle & Onboarding Legacy pour les IMF (Excel / Registres Papier ➔ TumaPlus)

> **Document opérationnel pour la bascule (cut-over) d'une IMF existante vers TumaPlus Core.**

---

## 1. Principe & Mécanique Financière

Lors de la migration, les soldes existants des clients (épargne et crédits en cours) sont injectés dans le grand livre en double-entrée avec un compte de contrepartie de bilan d'ouverture :

- **Épargne existante (Passif)** :
  - **Débit** : `LEGACY_MIGRATION.<DEV>` (Compte de compensation d'ouverture de l'IMF)
  - **Crédit** : `USER_WALLET.<ID>.<DEV>` (Wallet de l'utilisateur)
- **Crédit en cours (Actif)** :
  - Création du prêt avec statut `repaying` (en cours de remboursement).
  - Génération automatique des échéances futures restantes (`LoanSchedule`).

---

## 2. Format de Fichier d'Import (JSON / CSV)

Chaque ligne représente un membre avec son épargne d'ouverture et son crédit éventuel :

```json
{
  "records": [
    {
      "full_name": "Maman Marie Kabila",
      "phone": "+243810000001",
      "email": "marie@example.com",
      "opening_savings_balance": "50000", // 500.00 USD (en centimes)
      "locked_collateral": "10000",       // 100.00 USD (nantissement épargne)
      "currency_code": "USD",
      "group_name": "Groupe Étoile Kinshasa",
      "existing_loan": {
        "product_id": 1,
        "original_principal": "100000",    // 1 000.00 USD
        "principal_outstanding": "70000",  // 700.00 USD restant dû
        "interest_outstanding": "10500",   // 105.00 USD intérêts restants
        "term_months": 10,
        "remaining_months": 7,
        "interest_rate_bps": 1500,         // 15%
        "interest_method": "flat",
        "first_future_due_date": "2026-10-15"
      }
    }
  ]
}
```

---

## 3. Déroulement de la Bascule en 2 Étapes

### Étape 1 : Validation à blanc (Dry-Run)
Permet de tester le fichier sans écrire en base de données pour détecter d'éventuelles erreurs (doublons, formats, incohérences de montants) :

```http
POST /api/v1/business/dashboard/imf/migration/validate
Authorization: Bearer <business_dashboard_token>
```

**Réponse 200**
```json
{
  "data": {
    "valid": true,
    "total_members": 250,
    "total_opening_savings": "12500000", // 125 000.00 USD
    "total_opening_loans": "87500000",    // 875 000.00 USD
    "errors": []
  }
}
```

---

### Étape 2 : Exécution de la Bascule (Commit)
Crée en une transaction atomique les utilisateurs, les wallets, les comptes d'épargne avec leur écriture d'ouverture et les crédits en cours :

```http
POST /api/v1/business/dashboard/imf/migration/commit
Authorization: Bearer <business_dashboard_token>
```

**Réponse 201**
```json
{
  "data": {
    "success": true,
    "members_created": 250,
    "savings_accounts_created": 250,
    "loans_created": 140,
    "groups_created": 15,
    "total_savings_migrated": "12500000",
    "total_loans_migrated": "87500000",
    "migration_batch_id": "mig-batch-2026-09-23"
  }
}
```

---

## 4. Utilisation Immédiate du Float & du Réseau d'Agents

Dès que la bascule est terminée :
1. **Les membres reçoivent leur identifiant/code d'accès TumaPlus**.
2. **Leur épargne est immédiatement visible et disponible** dans leur wallet numérique.
3. Ils peuvent **rembourser leur prêt via l'app ou chez n'importe quel agent**, ou **retirer leur argent liquide auprès du réseau d'Agents TumaPlus / TrustSend** via l'opération standard de Cash-Out.
