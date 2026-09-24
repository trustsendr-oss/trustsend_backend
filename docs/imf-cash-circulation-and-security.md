# Architecture & Sécurité de la Circulation Monétaire : IMF ⇄ Utilisateur ⇄ Réseau d'Agents TumaPlus / TrustSend

> **Document de référence pour la trésorerie et la gestion des flux physiques & numériques.**

---

## 1. Vue d'Ensemble des Flux Financiers

L'écosystème TumaPlus unifie deux mondes :
1. **L'Institution de Microfinance (IMF)** : prêteur institutionnel, collecteur d'épargne avec coffres-forts physiques (Vault) et comptoirs (Counters).
2. **Le Réseau d'Agents TumaPlus / TrustSend** : commerçants de proximité et kiosques équipés de Float numérique effectuant du Cash-In et Cash-Out.
3. **L'Utilisateur (Emprunteur / Épargnant)** : détenteur d'un wallet multi-devises dans l'application mobile.

```
                  ┌──────────────────────────────────────────────────┐
                  │                 TUMAPLUS CORE                    │
                  │             (Double-Entry Ledger)                │
                  └───────▲──────────────────────────▲───────────────┘
                          │                          │
              (Décaissement / Épargne)          (Cash-Out / P2P)
                          │                          │
                          ▼                          ▼
                 ┌─────────────────┐       ┌──────────────────┐
                 │   WALLET IMF    │       │ WALLET EMISSAIRE │
                 │  (Institution)  │       │  (Utilisateur)   │
                 └────────▲────────┘       └─────────┬────────┘
                          │                          │
                   (Cash physique)            (Cash physique)
                          ▼                          ▼
                 ┌─────────────────┐       ┌──────────────────┐
                 │  COFFRE CENTRAL │       │  AGENT TUMAPLUS  │
                 │     (VAULT)     │       │  (Point Relais)  │
                 └─────────────────┘       └──────────────────┘
```

---

## 2. Parcours Utilisateur & Mécanique de Compensation (Settlement)

### Scénario 1 : L'utilisateur emprunte auprès de l'IMF et retire son cash chez un Agent TumaPlus
1. **Demande & Approbation** : L'emprunteur demande 1 000 USD via l'app ou au comptoir. Le comité valide.
2. **Décaissement (`LoanService.disburse`)** :
   - Débit immédiat du compte Ledger de l'IMF (`business_wallet` -1 000 USD).
   - Crédit du compte Ledger de l'emprunteur (`user_wallet` +1 000 USD).
   - *Sécurité* : L'IMF doit avoir les fonds préfinancés sur son wallet TumaPlus.
3. **Retrait Cash chez l'Agent TumaPlus (`CashOutService`)** :
   - L'emprunteur se présente chez un agent de quartier indépendant.
   - Il valide le retrait par PIN/OTP dans son application.
   - Débit du wallet utilisateur (-1 000 USD), Crédit du wallet Float de l'Agent (+1 000 USD + commission).
   - L'Agent remet 1 000 USD en billets physiques à l'emprunteur.
4. **Position Nette** :
   - L'emprunteur a reçu ses billets.
   - L'agent a monétisé son cash physique en liquidité numérique (Float).
   - L'IMF a octroyé son crédit sans avoir eu besoin de manipuler des billets au guichet !

---

### Scénario 2 : Synergie de Liquidité (L'IMF comme Super-Agent de Rechargement)
Les agents de quartier qui font beaucoup de Cash-Out accumulent du Float numérique et manquent de cash physique. À l'inverse, l'IMF collecte beaucoup de cash physique (remboursements et dépôts d'épargne au guichet).

**La boucle d'équilibrage parfaite** :
1. L'Agent TumaPlus se rend au guichet/coffre de l'IMF.
2. Il transfère son **Float numérique TumaPlus vers le wallet de l'IMF**.
3. Le chef d'agence de l'IMF lui remet les **billets physiques depuis le Coffre Central (Vault)**.
4. **Bénéfices** :
   - L'Agent reconstitue son tiroir-caisse en billets physiques.
   - L'IMF convertit son cash physique encombrant en solde numérique disponible pour décaisser de nouveaux prêts dans l'app, évitant les frais de transport de fonds bancaire !

---

## 3. Gestion Interne de la Caisse : Coffre Central (Vault) ⇄ Tiroir Guichetier (Till)

Pour éviter les fraudes et vols au sein des agences de l'IMF :

```
[Coffre Central (Vault)]
       │   ▲
(1)    │   │ (2)
       ▼   │
[Tiroir Caisse (Till)] ──▶ (3) Opérations clients (Dépôt / Retrait / Remboursement)
```

1. **Dotation du matin (`POST /api/v1/counter/vaults/replenish`)** :
   - Le guichetier demande par exemple 3 000 USD au coffre central pour démarrer sa journée.
   - Le chef d'agence / responsable de coffre **valide la sortie** (Principe des 4 yeux / Dual Control).
2. **Délestage en cours ou fin de journée (`POST /api/v1/counter/vaults/sweep`)** :
   - Dès que le guichetier dépasse le plafond d'assurance (ex: 5 000 USD) ou à la clôture de session, il reverse le cash collecté dans le coffre central.
3. **Contrôle Dual & Audit** :
   - L'initiateur d'un transfert ne peut pas s'auto-approuver (`Dual control violation`).
   - Toutes les dotations/délestages sont journalisés dans la table immuable `vault_transfers` et dans l'audit trail.

---

## 4. Mesures de Sécurité & Prévention de Fraude

| Risque | Mesure de Protection TumaPlus |
|---|---|
| **Décaissement sans provision de l'IMF** | Blocage strict par `LenderFundsException` vérifiant `balanceCache` dans une transaction SQL verrouillée (`forUpdate`). |
| **Vol de caisse / détournement guichetier** | Séparation stricte Vault / Till avec validation par le responsable de coffre, plafonds d'encaisse et réconciliation de fin de shift. |
| **Retrait frauduleux chez l'Agent** | Confirmation par code OTP à usage unique ou signature cryptographique PIN, avec contrôle des plafonds journaliers KYC. |
| **Double dépense / Crash réseau** | Idempotence obligatoire (`X-Correlation-ID`) et grand livre double-entrée (`LedgerService`) garantissant la balance Débit = Crédit. |
| **Garantie sur crédit non honoré** | Verrouillage automatique de l'épargne nantie (`CollateralService.lockCollateral`) empêchant tout retrait de l'épargne gagée. |
