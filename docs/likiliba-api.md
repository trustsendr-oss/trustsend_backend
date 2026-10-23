# Likiliba — API (tontine rotative privée)

Base : `/api/v1/likilibas`, authentification utilisateur (`Authorization: Bearer`). Montants en
**unités mineures** (centimes), en chaîne. Devises : **CDF ou USD uniquement**, fixées à la création.

## Cycle de vie

```
recruiting ──lock──▶ locked ──(tous signent)──start──▶ active ──(dernier tour)──▶ completed
    │                  │ (un membre quitte : retour à recruiting, cautions rendues)
    └──cancel──────────┴──▶ cancelled                  active ◀──resume── suspended (escalade / support)
```

| Étape | Qui | Route | PIN |
|---|---|---|---|
| Créer | organisateur | `POST /` | — |
| Modifier les règles (nouvelle version) | organisateur, `recruiting` | `PATCH /:id` | — |
| Inviter (compte, téléphone, lien) | organisateur | `POST /:id/invitations` | — |
| Mes invitations (tous groupes) | invité | `GET /invitations` | — |
| Accepter / refuser | invité | `POST /invitations/:invId/accept` · `/decline` · `POST /invitations/accept-link {token}` | — |
| Admettre / rejeter | organisateur | `POST /invitations/:invId/admit` · `/reject` | — |
| Révoquer | organisateur | `DELETE /invitations/:invId` | — |
| Retirer un membre | organisateur, `recruiting` | `DELETE /:id/members/:memberId` | — |
| Verrouiller (ordre manuel : `order`) | organisateur | `POST /:id/lock` | oui |
| Signer les règles (+ caution, + mandat) | chaque membre | `POST /:id/commit {rules_hash, auto_debit, idempotency_key}` | oui |
| Démarrer (tirage révélé) | organisateur | `POST /:id/start` | oui |
| Annuler (avant démarrage) | organisateur | `POST /:id/cancel {reason}` | oui |
| Quitter (avant démarrage) | membre | `POST /:id/leave` | oui |
| Cotiser | membre | `POST /:id/contributions {idempotency_key}` | oui |
| Rembourser ses dettes | membre | `POST /:id/debts/repay {idempotency_key}` | oui |
| Prélèvement automatique | membre | `PUT /:id/mandate {enabled}` | oui |

## Lecture

- `GET /` — mes groupes · `GET /:id` — détail (membres, tours, cagnotte, mon statut)
- `GET /:id/rules` — version, empreinte (`hash`) et clauses en français, **à afficher avant la signature**
- `GET /:id/penalties[?mine=true]` — liste détaillée : membre, tour, cotisation, jour, montant, cumul, plafond, motif, statut, bénéficiaire
- `GET /:id/me` — mes cotisations et mes dettes · `GET /:id/history` — journal complet · `GET /:id/draw` — vérification du tirage

Un non-membre reçoit `404` sur toutes ces routes.

## Règles appliquées

- Le bénéficiaire ne cotise pas pour son propre tour : brut = (N − 1) × C, commission 1 % (arrondie à l'inférieur, figée dans les règles signées).
- **Aucun versement partiel** : versement à la date du tour, cagnotte complète uniquement.
- Après le délai de grâce :
  - avec caution : la caution du membre en retard, puis celles des autres au prorata → dette ;
  - sans caution : le tour attend, puis escalade (suspension) après `escalation_days`.
- Pénalités par jour après le délai de grâce, plafonnées à 10 % de C par cotisation, versées au bénéficiaire du tour, sinon dette.
- Dettes : remboursement manuel, retenue sur le versement du débiteur, ou prise sur sa caution en fin de cycle.
- Tour versé après son délai de grâce : le calendrier suivant est décalé d'autant.

## Erreurs

`{ code, message }` — ex. `CURRENCY_NOT_ALLOWED`, `KYC_REQUIRED` (403), `RULES_CHANGED` (409), `INSUFFICIENT_FUNDS` (402),
`FUNDS_RESERVED` (402), `LIMIT_EXCEEDED` (400), `ORGANISER_FIRST`, `NOT_ORGANISER` (403), `PIN_INVALID` (401).

## Notifications

Événements outbox `likiliba.notification` → notification in-app + push pour chaque membre concerné, et e-mail
(gabarit `likiliba_receipt`) pour les mouvements d'argent. Types : `likiliba.invitation_received`,
`likiliba.locked`, `likiliba.round_opened`, `likiliba.contribution_reminder`, `likiliba.contribution_late`,
`likiliba.auto_debit_failed`, `likiliba.contribution_covered`, `likiliba.caution_used`, `likiliba.penalty_assessed`,
`likiliba.penalty_received`, `likiliba.payout_delayed`, `likiliba.payout_received`, `likiliba.suspended`,
`likiliba.caution_released`, `likiliba.completed`, etc.

## Admin (`/api/v1/admin/likilibas`, internal_user)

`GET /` (`?status=`), `GET /:id`, `GET /:id/history`, `GET /:id/penalties`, `POST /:id/suspend {reason}`,
`POST /:id/resume {note}`, `POST /penalties/:penaltyId/waive {reason}` (pénalité encore due uniquement).

## Exploitation

- Job `likiliba_cycle`, toutes les 5 min (`app/queue/workers.ts`).
- `node ace ledger:reconcile` vérifie aussi que chaque cagnotte égale ses cotisations confirmées.
- Bornes (montants, taille, délais, pénalités, KYC) : `config/likiliba.ts`.
