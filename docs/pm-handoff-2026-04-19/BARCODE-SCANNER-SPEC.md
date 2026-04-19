# BarcodeScanner — komponent-spec (for PR-B1)

**Status:** Research-artefakt. Ingen kode skrevet. Venter PR-A1.
**Mål:** 1:1 port av legacy `on_scanner()` fra [sell_ticket.html:216-250](legacy/unity-backend/App/Views/cash-inout/sell_ticket.html).

---

## 1. Legacy-atferd (verifisert)

```js
function on_scanner(id) {
  let is_event = false;
  let input = document.getElementById(id);
  input.addEventListener("focus", function () {
    if (!is_event) {
      is_event = true;
      input.addEventListener("keypress", function (e) {
        setTimeout(function () {
          if (e.keyCode == 13) { // ENTER
            if (input.value != "") {
              if (input.value.toString().length >= 22) {
                let scanned_value = input.value.toString();
                if (scanned_value.length > 22) {
                  scanned_value = scanned_value.toString().slice(-22);
                }
                input.value = +scanned_value.substr(14, 7); // trekk ut posisjon 14..20
                // fokuserer neste felt
                if ($('#initialId').val()) {
                  if (!$('#finalId').val()) $('#finalId').focus();
                } else {
                  $('#initialId').focus();
                }
              }
            }
          }
        }, 250);
      });
    }
  });
}
```

### Observasjoner

- USB-barcode-reader emulerer tastatur og sender ENTER (`keyCode 13`) som final-signal
- Streng ≥ 22 tegn → tar de siste 22 (trimmer prefix hvis reader prepender)
- Ekstraherer `substr(14, 7)` — 7 siffer fra posisjon 14 = billett-ID (andre 14 tegn er header/hall-kode/dato)
- `setTimeout(..., 250)` defer debouncer for å sikre at alle keypress-events har kommet før vi leser `input.value`
- Fokuserer neste felt automatisk (`initialId` → `finalId`)
- `is_event`-guard hindrer dobbel-binding

---

## 2. Ny TypeScript-komponent (spec, IKKE kode)

**Fil:** `apps/admin-web/src/components/BarcodeScanner.ts`

### API

```ts
export interface BarcodeScannerOptions {
  /** Input element som mottar scan-data */
  input: HTMLInputElement;
  /** Minimum lengde for å regnes som gyldig scan (default: 22) */
  minLength?: number;
  /** Start-posisjon for ticket-ID-ekstraksjon (default: 14) */
  extractStart?: number;
  /** Lengde på ticket-ID (default: 7) */
  extractLength?: number;
  /** Debounce i ms før keypress-buffer leses (default: 250) */
  debounceMs?: number;
  /** Callback med ekstrahert ticket-ID (som number) */
  onScan: (ticketId: number, rawValue: string) => void;
  /** Valgfri: neste felt som skal få fokus etter vellykket scan */
  nextFocus?: HTMLElement;
}

export function attachBarcodeScanner(opts: BarcodeScannerOptions): () => void;
// Returns detach-funksjon (cleanup for route-unmount)
```

### Atferd

1. Lytter `keypress` på `opts.input` — kun når input har fokus
2. Ved `Enter` (event.key === 'Enter', ikke keyCode 13 — moderne standard):
   - `setTimeout(..., debounceMs)` for å la alle buffer-tegn lande
   - Les `input.value`, trim hvis > minLength (behold siste `minLength` tegn)
   - Hvis fortsatt < minLength → ignorér (brukeren trykte bare Enter)
   - Ellers: ekstrahér `value.substr(extractStart, extractLength)`, parse som int
   - Kall `onScan(ticketId, rawValue)`
   - Hvis `nextFocus` gitt: fokusér det feltet
3. Cleanup: remove event-listener

### Hvorfor ikke bruke legacy-koden direkte

- Legacy: jQuery-avhengig, global DOM-lookup via `$('#id')`, multiple attach = dobbel-event-risk
- Nytt: pure DOM-API, explicit ownership, return-detach for route-lifecycle
- Legacy: `keyCode 13` deprecated → bruk `event.key === 'Enter'`
- Legacy: `is_event`-flagg er hack — ny returnerer detach-funksjon

---

## 3. Tester (Vitest)

```
describe('BarcodeScanner', () => {
  it('ekstraherer 7-sifret ID fra 22-tegn streng ved Enter')
  it('trimmer prefix hvis streng > 22 tegn, tar siste 22')
  it('ignorerer Enter hvis streng < 22 tegn')
  it('kaller onScan med parsed number, ikke string')
  it('debouncer: onScan fyrer først etter 250ms')
  it('detach-retur fjerner listener (neste Enter → ingen callback)')
  it('nextFocus: flytter fokus etter vellykket scan')
  it('flere attach på samme input → ingen dobbel-callback (explicit detach-kontrakt)')
})
```

### Manuell test (e2e)

- Koble USB-reader til agent-terminal
- Skann fysisk bingobillett på `sell_ticket`-siden
- Verifisér at `finalId`-input får 7-sifret tall + `#initialId` får fokus
- Skann igjen → `#finalId` får fokus

---

## 4. Bruk i PR-B1

### sell_ticket.ts
```ts
// pseudokode, ikke endelig
const finalIdInput = form.querySelector<HTMLInputElement>('#finalId')!;
const initialIdInput = form.querySelector<HTMLInputElement>('#initialId')!;

const detach = attachBarcodeScanner({
  input: finalIdInput,
  onScan: (ticketId) => { finalIdInput.value = String(ticketId); },
  nextFocus: initialIdInput.value ? finalIdInput : initialIdInput,
});

// ved page-unmount: detach()
```

### cash_in-out/index.ts
- Scanner unique-id → `POST /api/agent/players/lookup` → åpne player-modal
- Bruker samme `BarcodeScanner` men med annet `onScan` (API-lookup + modal-open)

---

## 5. Åpne spørsmål (ikke-blokkerende)

- **Keyboard-layout:** Norske readere bruker AZERTY? Trenger vi normalisering av siffer-tegn? (Antakelse: nei, alle hall-readere er numeriske-only.)
- **Concurrent scanners:** Kan to readere koble til samtidig (dual-USB)? Legacy støtter ikke → ikke scope.
- **Metronia/OkBingo ticket-format:** Bruker de også 22-tegn / `substr(14, 7)`? Verifisér i B3.4 og B3.6-endpoint-dokumentasjon før PR-B1-implementasjon.
