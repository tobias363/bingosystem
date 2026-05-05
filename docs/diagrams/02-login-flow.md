# Diagram 2: Login Flow

**Sist oppdatert:** 2026-05-06

Spiller-autentisering ende-til-ende. Støtter både e-post + passord OG telefon + PIN (REQ-130).
TOTP 2FA er valgfritt (REQ-129).

```mermaid
sequenceDiagram
    autonumber
    participant U as Spiller
    participant W as Web shell
    participant A as Backend Auth
    participant DB as Postgres
    participant R as Redis
    participant Sentry

    U->>W: Åpner /web/
    W->>A: GET /api/auth/me<br/>(med eksisterende token, hvis finnes)
    alt Token gyldig
        A->>R: Validere session-token
        R-->>A: Session OK
        A-->>W: 200 + user-profile
        W-->>U: Vis lobby
    else Token ugyldig eller mangler
        A-->>W: 401 Unauthorized
        W-->>U: Vis login-form
    end

    U->>W: Skriver email + passord
    W->>A: POST /api/auth/login<br/>{ email, password }
    A->>DB: SELECT user WHERE email=...
    DB-->>A: User row + hash

    A->>A: bcrypt.compare(password, hash)

    alt Passord OK + 2FA aktivt
        A->>A: Generer challenge-id
        A->>R: Lagre challenge (15 min TTL)
        A-->>W: 200 { requires2FA: true, challengeId }
        W-->>U: Be om TOTP-kode
        U->>W: Skriver 6-sifret kode
        W->>A: POST /api/auth/2fa/login<br/>{ challengeId, code }
        A->>R: Hent challenge
        A->>A: Verifiser TOTP mot user.totp_secret
        alt Kode OK
            A->>DB: INSERT app_session
            A->>R: Cache session (8h TTL)
            A-->>W: 200 + Session
        else Kode feil
            A-->>W: 400 INVALID_TOTP_CODE
            W-->>U: "Feil kode"
        end
    else Passord OK + ingen 2FA
        A->>DB: INSERT app_session
        A->>R: Cache session (8h TTL)
        A-->>W: 200 + Session
        W-->>U: Vis lobby
    else Passord feil
        A->>DB: INCREMENT failed_login_attempts
        A->>Sentry: breadcrumb (login_failed)
        A-->>W: 401 INVALID_CREDENTIALS
        W-->>U: "Feil epost eller passord"
    end

    Note over W,U: Session er nå aktiv,<br/>token i sessionStorage
```

## Sikkerhets-tiltak

- **Rate-limit:** 5 forsøk per IP per 15 min på login
- **Brute-force-lock:** etter 10 feilet forsøk per bruker, lås i 30 min
- **Bcrypt cost-faktor:** 12 (justert ved CPU-oppgradering)
- **TOTP backup-codes:** 10 stk single-use, generert ved 2FA-setup
- **Session-revoke:** logout invalidate token i Redis + DB

## REQ-referanser

- REQ-129: TOTP 2FA
- REQ-130: Phone + PIN login
- REQ-132: Active sessions listing + logout-all

## Feilkoder

- `INVALID_CREDENTIALS` — feil email/passord
- `INVALID_TOTP_CODE` — feil 2FA-kode
- `INVALID_TWO_FA_CHALLENGE` — utløpt 2FA-challenge
- `ACCOUNT_LOCKED` — låst etter for mange forsøk
- `KYC_REQUIRED` — bruker må fullføre KYC før spill
