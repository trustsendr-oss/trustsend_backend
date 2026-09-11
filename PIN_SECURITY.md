# PIN Security: Protection des Transactions

## Vue d'ensemble

**Toute opération de déplacement de fonds DEMANDE UN CODE PIN.**

- Retrait (cash-out)
- Dépôt (cash-in)
- Transfert P2P
- Tout mouvement d'argent

---

## Format du PIN

```
- Exactement 4 chiffres
- Numérique pur (0-9)
- Exemple: 1234, 5678, 0000, 9999
- Hashé en base de données (jamais en texte clair)
```

---

## Flux: Première Utilisation

### 1. Utilisateur crée un compte
```bash
POST /api/v1/auth/signup
{
  "full_name": "Alice",
  "email": "alice@gmail.com",
  "password": "MyPassword123"
}

Response:
{
  "user": {
    "id": 7,
    "code": "864352109",
    "email": "alice@gmail.com",
    "pin_set": false  ← PIN pas encore défini
  }
}
```

### 2. Alice doit définir un PIN avant de faire une transaction
```bash
POST /api/v1/account/set-pin
Authorization: Bearer <token_alice>
{
  "pin": "1234"
}

Response:
{
  "message": "PIN set successfully"
}
```

### 3. Maintenant Alice peut retirer
```bash
POST /api/v1/cash-out
Authorization: Bearer <token_alice>
{
  "agent_code": "123456789",
  "amount": "5000",
  "pin": "1234"  ← PIN requis
}

Response:
{
  "data": {
    "transaction_id": 999,
    "status": "completed"
  }
}
```

---

## Schéma PIN en Base de Données

```sql
ALTER TABLE users ADD COLUMN (
  pin_hash VARCHAR(255),           -- Hashed PIN (scrypt)
  pin_attempts INT DEFAULT 0,      -- Nombre de tentatives échouées
  pin_locked_until TIMESTAMP NULL  -- Compte verrouillé jusqu'à...
);
```

---

## Sécurité: Anti-Brute Force

### Limitation de Tentatives

```
Tentative 1 échouée: Message "Invalid PIN. 2 attempts remaining"
Tentative 2 échouée: Message "Invalid PIN. 1 attempt remaining"
Tentative 3 échouée: 
  → Compte verrouillé pour 15 minutes
  → Message "PIN locked for 15 minutes"
  → Impossible de faire de transactions
```

### Après 15 Minutes
```
Le compte est automatiquement déverrouillé
pinAttempts reset à 0
```

---

## Endpoints PIN

### 1. Définir un PIN (Première Fois)
```bash
POST /api/v1/account/set-pin
Authorization: Bearer <token>
{
  "pin": "1234"
}

Response: 200 OK
{
  "message": "PIN set successfully"
}
```

### 2. Changer le PIN
```bash
POST /api/v1/account/change-pin
Authorization: Bearer <token>
{
  "current_pin": "1234",
  "new_pin": "5678"
}

Response: 200 OK
{
  "message": "PIN changed successfully"
}
```

### 3. Réinitialiser le PIN (Oublié)
```bash
POST /api/v1/account/reset-pin
{
  "email": "alice@gmail.com"
}

Response: 200 OK
{
  "message": "PIN reset link sent to email"
}
```

---

## Validation du PIN

### Format Valide
```
✅ "1234"     (exactement 4 chiffres)
✅ "0000"     (OK, exactement 4 chiffres)
✅ "9999"     (OK, exactement 4 chiffres)
```

### Format Invalide
```
❌ "123"      (3 chiffres - trop court)
❌ "12345"    (5 chiffres - trop long)
❌ "12a4"     (contient lettre)
❌ ""         (vide)
```

### Erreur de Validation
```bash
POST /api/v1/cash-out
{
  "agent_code": "123456789",
  "amount": "5000",
  "pin": "123"  # ❌ Pas exactement 4 chiffres
}

Response: 422 Unprocessable Entity
{
  "message": "PIN must be exactly 4 digits"
}
```

---

## Transactions Sécurisées

### Cash-Out
```bash
POST /api/v1/cash-out
{
  "agent_code": "123456789",
  "amount": "5000",
  "currency_code": "USD",
  "pin": "1234"  # ✅ Toujours requis
}
```

### Cash-In
```bash
POST /api/v1/cash-in
{
  "amount": "3000",
  "currency_code": "USD",
  "pin": "1234"  # ✅ Toujours requis
}
```

### P2P Transfer (À Faire)
```bash
POST /api/v1/transfers/p2p
{
  "recipient_code": "987654321",
  "amount": "2000",
  "currency_code": "USD",
  "pin": "1234"  # ✅ Toujours requis
}
```

---

## Erreurs Possibles

### PIN Incorrect
```bash
POST /api/v1/cash-out
{
  "agent_code": "123456789",
  "amount": "5000",
  "pin": "9999"  # ❌ Mauvais PIN
}

Response: 401 Unauthorized
{
  "message": "Invalid PIN. 2 attempts remaining."
}
```

### Compte Verrouillé
```bash
POST /api/v1/cash-out
{
  "agent_code": "123456789",
  "amount": "5000",
  "pin": "1234"
}

Response: 401 Unauthorized
{
  "message": "PIN locked for 14 minutes due to too many failed attempts"
}
```

### PIN Pas Défini
```bash
POST /api/v1/cash-out
{
  "agent_code": "123456789",
  "amount": "5000",
  "pin": "1234"
}

Response: 401 Unauthorized
{
  "message": "PIN not set. Please set a PIN first."
}
```

---

## Audit Log

Chaque tentative est enregistrée:

```sql
SELECT * FROM audit_logs WHERE action LIKE 'pin%';

│ action            │ actor_id │ result  │ message         │
├──────────────────┼──────────┼─────────┼─────────────────┤
│ pin.verified     │ 7        │ success │ PIN correct     │
│ pin.failed       │ 7        │ failure │ Invalid PIN     │
│ pin.locked       │ 7        │ failure │ Account locked  │
│ pin.set          │ 7        │ success │ PIN created     │
│ pin.changed      │ 7        │ success │ PIN changed     │
```

---

## Architecture Interne

### PinService

```typescript
// Vérifier PIN
await PinService.verifyPin(user, "1234")
→ { valid: true/false, message: "..." }

// Définir PIN
await PinService.setPin(user, "1234")

// Vérifier si PIN est défini
PinService.isPinSet(user)
→ true/false

// Réinitialiser compteur de tentatives
await PinService.resetAttempts(user)
```

---

## Flux Complet: Retrait Sécurisé

```
Alice veut retirer 5000 USD
        │
        ├─ 1. Authentification
        │   ✅ Token valide
        │
        ├─ 2. Validation des paramètres
        │   ✅ agent_code valide
        │   ✅ amount valide
        │   ✅ pin format valide (4 chiffres)
        │
        ├─ 3. Vérification du PIN
        │   ├─ Compte verrouillé? ❌
        │   ├─ PIN hashé en DB? ✅
        │   ├─ PIN correspond? ✅
        │   └─ Reset tentatives
        │
        ├─ 4. Validation agent
        │   ✅ Agent existe
        │   ✅ Agent actif
        │
        ├─ 5. Validation portefeuille
        │   ✅ Portefeuille existe
        │   ✅ Solde suffisant
        │
        ├─ 6. Créer transaction
        │   ✅ Débite Alice
        │   ✅ Crédite Bob's float
        │   ✅ Applique commission
        │
        ├─ 7. Audit log
        │   ✅ Enregistre action
        │   ✅ Enregistre vérification PIN
        │
        └─ 8. Réponse
            201 Created
            {
              "transaction_id": 999,
              "status": "completed"
            }
```

---

## Bonnes Pratiques

### 🔒 Pour l'Utilisateur
- ✅ Choisir un PIN difficile à deviner (ne pas utiliser 0000, 1111, etc.)
- ✅ Ne pas partager le PIN
- ✅ Utiliser un PIN différent du password
- ✅ Si verrouillé, attendre 15 minutes ou contacter support

### 🛡️ Pour le Système
- ✅ PIN hashé (jamais en texte clair)
- ✅ Anti-brute force (3 tentatives max)
- ✅ Audit logging complet
- ✅ Lockout temporaire (15 minutes)
- ✅ Audit trail de chaque tentative

---

## Résumé

| Aspect | Détail |
|--------|--------|
| **Format** | 4 chiffres |
| **Obligatoire pour** | Toute transaction |
| **Tentatives max** | 3 avant verrouillage |
| **Verrouillage** | 15 minutes |
| **Stockage** | Hashé en scrypt (config/hash.ts) |
| **Audit** | Enregistré pour chaque tentative |
| **Reset** | Email link ou par admin |

---

**Last Updated**: 2026-08-28
**Status**: Implementation complete
**Security**: Production-ready
