# Diagram 1: System Tiers

**Sist oppdatert:** 2026-05-06

Spillorama er tre-tier:
1. **Klient** — Pixi.js game-client + admin-web + agent-portal
2. **Backend** — Express + Socket.IO på Node.js 22
3. **Infrastruktur** — Postgres 16 + Redis 7

```mermaid
graph TB
    subgraph "Klienter"
        Player["Spiller<br/>(web/iOS/Android)"]
        Admin["Hall-operatør<br/>admin-web"]
        Agent["Agent/Bingovert<br/>agent-portal"]
        TV["TV-skjerm<br/>view-game"]
    end

    subgraph "Backend (apps/backend)"
        Express["Express HTTP<br/>port 4000"]
        Socket["Socket.IO<br/>real-time events"]
        Engine["BingoEngine<br/>Game1/2/3/Engine"]
        Wallet["WalletService<br/>+ outbox"]
        Compliance["ComplianceManager<br/>+ AuditLog"]
        Auth["AuthTokenService<br/>+ TOTP 2FA"]
    end

    subgraph "Infra (Frankfurt, Render.com)"
        Postgres[("PostgreSQL 16<br/>System of Record")]
        Redis[("Redis 7<br/>RoomState cache<br/>+ rate limiting")]
        S3["S3-kompatibelt<br/>(receipts, exports)"]
    end

    subgraph "Eksternt"
        Candy["Candy<br/>(tredjeparts iframe)"]
        SwedbankPay["Swedbank Pay<br/>(payments)"]
        BankID["BankID<br/>(KYC)"]
        FCM["Firebase FCM<br/>(push)"]
    end

    Player -->|"HTTPS + Socket.IO"| Express
    Player -->|"HTTPS + Socket.IO"| Socket
    Admin -->|"HTTPS"| Express
    Agent -->|"HTTPS"| Express
    TV -->|"Socket.IO read-only"| Socket

    Express --> Auth
    Express --> Wallet
    Express --> Compliance
    Socket --> Engine
    Engine --> Wallet
    Engine --> Compliance

    Auth --> Postgres
    Wallet --> Postgres
    Wallet --> Redis
    Compliance --> Postgres
    Engine --> Redis
    Engine --> Postgres

    Compliance -->|"daily report"| S3
    Wallet -->|"webhook"| SwedbankPay
    Auth -->|"BankID handshake"| BankID
    Engine -->|"push notif"| FCM

    Player -.->|"iframe"| Candy
    Candy -->|"/api/ext-wallet/*"| Express
```

## Nøkkel-elementer

- **Frontmost prinsipp:** Server er sannhets-kilde. Klienter er view.
- **Postgres:** System of Record for alt regulatorisk
- **Redis:** Ephemeral cache for RoomState, sessions, rate-limits
- **Socket.IO:** Real-time event-fan-out til klienter
- **Candy:** Tredjeparts iframe — vi eier kun launch + wallet-bro

## Skalering

- 36 000 samtidige Socket.IO-tilkoblinger på pilot-skala
- Postgres connection-pool tunet for 200 konkurrente queries
- Redis pub/sub for cross-instance bredkast (når vi går horizontal)
