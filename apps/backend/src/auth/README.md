# Module: `apps/backend/src/auth`

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen
**LOC:** ~1 845

## Ansvar

Autentisering og session-styring:
- Login/logout (email+passord, telefon+PIN)
- TOTP 2FA (REQ-129)
- Session-token (JWT + refresh)
- Active sessions (REQ-132) — listing, logout-all, per-session-logout
- Password reset + email verify
- BankID-handshake (delvis)
- Inactivity timeout (30 min)

## Ikke-ansvar

- KYC-status (delegert til `platform/`, men auth skriver ved verifisering)
- Spiller-profil (delegert til `routes/players.ts`)
- Wallet (delegert til `wallet/`)

## Public API

| Service | Funksjon |
|---|---|
| `AuthTokenService` | JWT-generering + verifisering |
| `SessionService` | Active session-tracking |
| `TwoFactorService` | TOTP setup + verify + backup-codes |
| `PinAuthService` | Phone+PIN autentisering (REQ-130) |
| `PasswordResetService` | Reset-tokens med one-shot consume |

HTTP-endepunkter:
- `POST /api/auth/login`, `/login-phone`
- `POST /api/auth/logout`, `/refresh`
- `GET /api/auth/me`, `PUT /api/auth/me`
- `POST /api/auth/2fa/setup`, `/verify`, `/login`, `/disable`
- `GET /api/auth/sessions`, `POST /api/auth/sessions/logout-all`

## Avhengigheter

- Postgres (`app_users`, `app_session`, `app_user_two_fa`, `app_user_pin`)
- Redis (session cache, rate-limit, 2FA-challenges)
- Bcrypt for password hashing
- `otplib` for TOTP

## Invariants

1. **Bcrypt cost ≥ 12** for passord-hashes
2. **JWT signed with HS256** + `JWT_SECRET` env
3. **Session-token i Redis + DB** (cache + persistence)
4. **Inactivity timeout:** 30 min for player, 8 hr for admin
5. **Rate-limit:** 5 forsøk per IP per 15 min på login
6. **2FA backup-codes:** single-use, hashed i DB
7. **Audit-logging** for alle auth-events (`auth.login`, `auth.failed`, `auth.logout`)

## Bug-testing-guide

### "Login feiler tilfeldig"
- Sjekk Redis-tilkobling
- Sjekk `app_session` for orphan rows
- Sjekk om bcrypt-cost har endret seg uten re-hash

### "Session timeout for fort"
- Sjekk `inactivityTimeoutMs` config
- Sjekk om `touchActivity` kalles ved hver request

### "2FA-kode aksepteres ikke"
- Sjekk klokke-skew (TOTP toleranse er ±30 sek)
- Sjekk `app_user_two_fa.totp_secret` ikke er korrupt
- Sjekk om det er backup-code (5+5 sifre format)

## Operasjonelle notater

### Error-codes
| Code | Betydning |
|---|---|
| `INVALID_CREDENTIALS` | Feil email/passord |
| `INVALID_TOTP_CODE` | Feil 2FA-kode |
| `ACCOUNT_LOCKED` | Brute-force-lock aktiv |
| `KYC_REQUIRED` | Bruker må fullføre KYC |
| `PIN_LOCKED` | 5 feilete PIN-forsøk |

### Migrasjoner
- `app_users` — kjerne-tabell
- `app_session` — aktive sesjoner
- `app_user_two_fa` — TOTP secrets + backup codes
- `app_user_pin` — phone+PIN (REQ-130)

## Referanser

- REQ-129 (2FA), REQ-130 (PIN), REQ-132 (active sessions)
- `docs/architecture/modules/backend/AuthTokenService.md`
- `docs/architecture/modules/backend/SessionService.md`
- `docs/architecture/modules/backend/TwoFactorService.md`
- `docs/diagrams/02-login-flow.md`
