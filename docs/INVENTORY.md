# Documentation Inventory

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen
**Formål:** Oversikt over alle docs i repoet, deres status, og når de bør konsolideres.

> **Til ny PM:** Dette er ikke for daglig bruk. Bruk [`MASTER_README.md`](../MASTER_README.md) som
> startpunkt. Dette dokumentet er for **vedlikehold** av docs-katalogen.

---

## Totaler

- 216 markdown-filer i `docs/`
- 56 i `docs/architecture/`
- 42 i `docs/operations/`
- 32 i `docs/engineering/`
- 18 i `docs/audit/`
- 15 i `docs/compliance/`
- Resterende fordelt på `docs/runbooks/`, `docs/handoff/`, `docs/qa/`, `docs/wireframes/`, `docs/archive/`

---

## Klassifisering

### A — Sannhets-kilder (autoritative)

Disse er **levende dokumenter** som oppdateres ved hver relevant endring. ALDRI lag duplikat — endre disse.

| Dokument | Eier | Beskrivelse |
|---|---|---|
| `MASTER_README.md` | Tobias | Hva er Spillorama, hvor finner du svar |
| `docs/SYSTEM_DESIGN_PRINCIPLES.md` | Tobias | Design-filosofi, "true north" |
| `docs/SESSION_HANDOFF_PROTOCOL.md` | Tobias | Hvordan skrive handoff |
| `BACKLOG.md` | Tobias | Åpne pilot-blokkere + waves |
| `docs/decisions/README.md` | Tobias | ADR-katalog |
| `docs/architecture/SPILLKATALOG.md` | Tobias | Autoritativ spill-klassifisering |
| `docs/architecture/ARKITEKTUR.md` | Tobias | Hovedsystem-arkitektur |
| `docs/architecture/MODULES.md` | Tobias | Master-modul-index |
| `docs/architecture/EVENT_PROTOCOL.md` | Tobias | Socket.IO event-katalog |
| `docs/architecture/WIRE_CONTRACT.md` | Tobias | Wire-format spec |
| `docs/engineering/ENGINEERING_WORKFLOW.md` | Tobias | PR-flyt + Done-policy |
| `docs/compliance/SPILLVETT_HANDOVER_CHECKLIST_2026-04-11.md` | Tobias | Compliance-krav |
| `apps/backend/openapi.yaml` | Tobias | API-spec |

### B — Decision Records (immutable)

`docs/decisions/ADR-NNNN-*.md` — én per arkitektonisk beslutning. Endres ikke etter merge (jf. ADR-katalog).

10 ADR-er (per 2026-05-06).

### C — Modul-dokumentasjon (per-modul)

Hver større modul har README.md i kode-katalogen. Detaljert per-fil-doc i `docs/architecture/modules/`.

### D — Diagrammer (Mermaid)

`docs/diagrams/01-05` — 5 hovedflows. Oppdateres ved arkitektur-endring.

### E — Operasjonelle runbooks

`docs/operations/*_RUNBOOK*.md` — gjeldende prosedyrer for ops-tasks. Disse må holdes synced med
faktisk praksis.

| Dokument | Funksjon |
|---|---|
| `PILOT_CUTOVER_RUNBOOK.md` | Pilot-launch prosedyre |
| `PILOT_RUNBOOK_SPILL2_3_2026-05-05.md` | Spill 2/3 pilot |
| `PILOT_4HALL_DEMO_RUNBOOK.md` | 4-hall demo |
| `MIGRATION_DEPLOY_RUNBOOK.md` | DB migrations |
| `ROLLBACK_RUNBOOK.md` | Rollback-prosedyre |
| `DISASTER_RECOVERY_PLAN_2026-04-25.md` | DR-plan |
| `OBSERVABILITY_RUNBOOK.md` | Sentry, logs, debugging |
| `RENDER_ENV_VAR_RUNBOOK.md` | Env-vars management |
| `RENDER_GITHUB_SETUP.md` | Render + GitHub |

### F — PM-handoffs (historikk, immutable)

`docs/operations/PM_HANDOFF_*.md` — historikk over hver PM-sesjon. Aldri rediger, kun add.

Per 2026-05-06: 9 handoffs (2026-04-23 til 2026-05-05_spill2-3-pilot-ready).

### G — Audits og research (tidsstemplet)

`docs/architecture/*_AUDIT_*.md`, `docs/architecture/*_RESEARCH_*.md`. Disse er snapshots av en tilstand
og vil bli utdatert med tid. Når en audit-rapport er overstyrt av nyere arbeid, legg
DEPRECATED-marker øverst.

### H — Wireframes og spec

`docs/wireframes/` — PDF-er fra legacy-team. Read-only.
`docs/architecture/WIREFRAME_*.md` — analyse + paritet.

### I — Compliance og regulatorisk

`docs/compliance/` — regulatoriske krav, RNG-sertifisering, audit. Sjelden endring; krever Tobias-godkjennelse.

### J — Arkiv

`docs/archive/` — eksplisitt arkivert materiale. Ikke aktiv.

---

## Vedlikehold-rutiner

### Ved hver PR
- Hvis arkitektonisk beslutning: skriv ADR
- Hvis ny modul: skriv README.md
- Oppdater `apps/backend/openapi.yaml` ved API-endring
- Oppdater modul-README ved invariant-endring

### Ved hver sesjons-slutt (jf. `SESSION_HANDOFF_PROTOCOL.md`)
- Skriv handoff i `docs/operations/`
- Oppdater BACKLOG.md hvis pilot-blokker-status endret seg
- Oppdater MASTER_README.md hvis ny seksjon i docs

### Månedlig (eller ved ny PM)
- Sjekk om audit-rapporter er deprecated av nyere arbeid
- Konsolider duplikater
- Verifiser at MASTER_README links fungerer

### Ved arkitektur-skifte
- Oppdater `SYSTEM_DESIGN_PRINCIPLES.md`
- Skriv ADR for selve endringen
- Marker overstyrte ADR-er som `Superseded by: ADR-NNNN`
- Oppdater diagrammer i `docs/diagrams/`

---

## Forslag til konsolidering (lav prioritet)

Disse er kandidater for opprydning, men ikke pilot-blokkere:

| Doc | Status | Handling |
|---|---|---|
| `docs/architecture/CHIP_DESYNC_DIAG_2026-04-26.md` | Spesifikk bug-diag | Behold som arkiv, ikke deprecated |
| `docs/architecture/REFACTOR_PLAN_2026-04-23.md` | Pågående | Hold synced med BACKLOG |
| `docs/engineering/ADMIN_UI_PARITY_AUDIT_2026-04-18.md` | Audit-snapshot | Sjekk om gjeldende, deprecate hvis nei |
| `docs/architecture/RESEARCH_*_2026-04-24.md` (3 stk) | Research-rapporter | Beholde som kontekst — ikke arbeids-doc |

---

## Kjør validation

```bash
npm run docs:check
```

Sjekker:
- Core docs eksisterer
- ADR-numbering er kontinuerlig
- Mermaid-diagrammer eksisterer
- Per-modul README for store moduler

---

**Dette dokumentet er for vedlikehold av docs-katalogen. Det er ikke lese-stoff for ny PM.**
