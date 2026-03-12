# Theme1 Bong Runtime Design Spec

Dette dokumentet beskriver hvordan bong-stateene i CSS-previewen skal oversettes til runtime-data og render-logikk for Theme1.

Relevante designreferanser:
- `/Users/tobiashaugen/Projects/Bingo/output/css-preview/bingobong.css`
- `/Users/tobiashaugen/Projects/Bingo/output/css-preview/bong1togo.css`
- `/Users/tobiashaugen/Projects/Bingo/output/css-preview/bong1vunnet.css`
- `/Users/tobiashaugen/Projects/Bingo/output/css-preview/bong1vunnet1togo2.css`
- `/Users/tobiashaugen/Projects/Bingo/output/css-preview/bong1vunnet2monster.css`
- `/Users/tobiashaugen/Projects/Bingo/output/css-preview/bong1vunnet3monster.css`
- `/Users/tobiashaugen/Projects/Bingo/output/css-preview/bong2vunnet1monster1togo3.css`
- `/Users/tobiashaugen/Projects/Bingo/output/css-preview/index.html`

Kanonisk mønsterkilde:
- `/Users/tobiashaugen/Projects/Bingo/Candy/Assets/Script/PaylineManager.cs`

## 1. Designintensjon

En bong er ikke bare "normal" eller "vunnet". Den viser en progresjon:

1. Nøytral bong
2. Nesten ferdig mønster (`one to go`)
3. Ferdig mønster (`won`)
4. Ferdig mønster + nytt `one to go` på samme bong
5. Flere ferdige mønstre akkumulert på samme bong

Viktig regel:
- Ferdige mønstre forsvinner aldri fra visningen.
- Neste mulige mønster legges oppå eksisterende vinnerstate.
- Bare det aktive `one to go`-målet pulserer.

## 2. Visuell grammatikk

### 2.1 Base bong
- 5x3 grid
- Tall sentrert i cellene
- Font: Fredoka Medium
- Tallfarge: `#84035D`
- Nøytral cellebakgrunn: lys grå

### 2.2 `one to go`
- Celler som allerede inngår i neste mønster: lilla bakgrunn
- Siste manglende celle: gul bakgrunn
- Manglende celle pulserer
- Gevinsttekst for neste mønster vises i samme gule celle
- Glow er synket med puls

### 2.3 `won`
- Celler i ferdig mønster: lilla bakgrunn
- Utløsende celle for mønsteret: gul celle med gevinsttekst
- Ingen puls
- En lilla mønsterstrek tegnes oppå gridet

### 2.4 Flere mønstre på samme bong
- Alle ferdige mønstre beholdes
- Flere streker kan ligge oppå hverandre
- Ny `one to go` kan eksistere samtidig med gamle vinnerstreker
- Gevinsttekst må kunne flyttes per celle for å unngå kollisjon med strek

## 3. Viktig dataregel: mønsterkilde og celleindekser

`PaylineManager.cs` beskriver de ekte Theme1-mønstrene, men mønsterlisten er lagret i kolonne-major rekkefølge:

`[c1r1, c1r2, c1r3, c2r1, c2r2, c2r3, ... c5r3]`

UI-gridet i previewen og visningen er derimot rad-major:

`[r1c1, r1c2, r1c3, r1c4, r1c5, r2c1, ... r3c5]`

Runtime må derfor konvertere mønsterbitmaskene til UI-rekkefølge i state-builderen, én gang, og deretter bruke samme indekskonvensjon hele veien.

Anbefalt UI-indeks:

```text
0  1  2  3  4
5  6  7  8  9
10 11 12 13 14
```

## 4. Anbefalt runtime-modell

```csharp
public sealed class Theme1BongRenderState
{
    public int BongIndex;
    public int[] Numbers; // 15, UI-rekkefølge
    public Theme1BongCellState[] Cells; // 15
    public Theme1CompletedPatternState[] CompletedPatterns;
    public Theme1NearPatternState? ActiveNearPattern;
}

public sealed class Theme1BongCellState
{
    public int CellIndex;
    public int Number;
    public bool IsMatchedByAnyCompletedPattern;
    public bool IsMatchedByActiveNearPattern;
    public bool IsPrizeCell;
    public bool IsNearTargetCell;
    public string? PrizeLabel; // "3 kr", "6 kr", ...
    public Theme1WinLabelAnchor PrizeAnchor; // BottomCenter / BottomLeft / BottomRight
}

public sealed class Theme1CompletedPatternState
{
    public int PatternId;
    public int[] CellIndices;
    public int TriggerCellIndex;
    public int PrizeAmountKr;
    public Theme1PatternOverlayKind OverlayKind;
}

public sealed class Theme1NearPatternState
{
    public int PatternId;
    public int[] MatchedCellIndices;
    public int TargetCellIndex;
    public int PrizeAmountKr;
    public Theme1PatternOverlayKind OverlayKind;
}

public enum Theme1WinLabelAnchor
{
    BottomCenter,
    BottomLeft,
    BottomRight
}

public enum Theme1PatternOverlayKind
{
    None,
    HorizontalLine,
    SvgStroke,
    SvgMask
}
```

## 5. Render-prioritet per celle

En celle kan tilhøre flere mønstre samtidig. Runtime må bruke fast prioritet:

1. `won prize`
2. `one-to-go target`
3. `won hit`
4. `near hit`
5. normal celle

Konsekvens:
- En gevinstcelle skal aldri degraderes til bare lilla hit.
- Et aktivt `one to go` skal ikke overstyre en allerede vunnet gevinstcelle.
- Vanlige lilla progresjonsceller er lavere prioritet enn ferdige gevinster.

## 6. Hva er "trigger cell" / gevinstcelle

Hvert ferdige mønster trenger én utløsende celle.

Regel:
- Den cellen som gjorde at mønsteret ble komplett, blir mønsterets `TriggerCellIndex`.
- Bare denne cellen får gul vinnerbakgrunn og gevinsttekst for akkurat det mønsteret.
- Resten av cellene i mønsteret er bare lilla `won hit`.

Dette er grunnen til at samme mønster ikke viser gevinsttekst i alle tilhørende celler.

## 7. Hvordan velge aktivt `one to go`

Det kan finnes flere mønstre som mangler ett tall samtidig. Runtime må velge ett aktivt mønster for visuell fokus, ellers flimrer bongen.

Anbefalt prioritet:

1. Behold eksisterende aktivt `one to go` hvis det fortsatt er gyldig
2. Høyest premie
3. Lavest `PatternId`

Gyldig betyr:
- mønsteret er ikke allerede utbetalt
- det mangler fortsatt nøyaktig én celle

## 8. Overlay-regler

### 8.1 Ferdige mønstre
- Ferdige mønstre får alltid statiske lilla overlays
- Horisontale streker skal gå gjennom cellesentre
- Vertikale streker skal gå gjennom cellesentre
- Diagonale/V-former skal være én sammenhengende path, ikke løse segmenter
- Ender skal være avrundet

### 8.2 `one to go`
- `one to go` skal ikke tegne ferdig vinnerstrek for mønsteret
- Det viser bare lilla progresjonsceller + gul målcelle med puls

### 8.3 Overlay-type
- Enkle linjemønstre: `HorizontalLine` eller `SvgStroke`
- Andre mønstre: bruk generert SVG-sprite fra:
  - `/Users/tobiashaugen/Projects/Bingo/output/css-preview/theme1-pattern-overlays.svg`

## 9. Gevinsttekstplassering

Gevinsttekst må kunne flyttes der det er plass. Dette er allerede modellert i previewen med:

- `BottomCenter`
- `BottomLeft`
- `BottomRight`

Regel:
- Default er `BottomCenter`
- Hvis overlay krysser teksten, bruk et alternativt anker
- Anker velges per mønster og per triggercelle, ikke globalt

Eksempel:
- `9`-cellen i topprad kan bruke `BottomRight`
- `21` i venstre kolonne kan bruke `BottomLeft`

## 10. State-overganger

### 10.1 Fra normal til `one to go`
- Beregn alle mønstre som ikke er vunnet
- Finn de som mangler én celle
- Velg aktiv kandidat
- Marker kandidatens allerede matchede celler som lilla
- Marker målcellen som gul og pulserende
- Vis forventet gevinsttekst i målcellen

### 10.2 Fra `one to go` til `won`
- Når target-tallet trekkes:
  - stopp puls
  - flytt target-cellen til `won prize`
  - legg til mønsteret i `CompletedPatterns`
  - tegn overlay-strek for mønsteret
  - behold tidligere ferdige mønstre

### 10.3 Fra `won` til nytt `one to go`
- Reberegn resterende mønstre
- Hvis et nytt mønster mangler én celle:
  - behold alle gamle `CompletedPatterns`
  - legg nytt `ActiveNearPattern` oppå eksisterende state

## 11. Mapping til de designene som finnes nå

### Bong 1 to go CSS-element
- Ingen ferdige mønstre
- Ett aktivt `one to go`
- Eksempel: topprad mangler `9`

### Bong 1 vunnet på 1 mønster
- Ett ferdig mønster
- Topprad er vunnet
- `9` er triggercelle med `3 kr`

### Bong 1 vunnet på 1 mønster og one to go for mønster nr 2
- Ett ferdig mønster beholdes
- Ett nytt aktivt `one to go`
- Ny targetcelle pulserer, gammel vinnercelle står statisk

### Bong 1 vunnet på 2 mønster
- To ferdige mønstre
- To overlays synlige samtidig
- To gevinstceller kan eksistere på samme bong

### Bong 1 vunnet på 3 mønster
- Tre ferdige mønstre
- Gevinsttekster bruker ulike ankre for å få plass

### Bong 2 vunnet på 1 mønster og one to go for mønster nr 3
- Ferdige overlays beholdes
- Nytt `one to go` peker ut neste logiske mål på samme bong

## 12. Anbefalt implementasjonsrekkefolge

1. Konverter `PaylineManager`-mønstre til UI-indeksrekkefølge
2. Innfør `TriggerCellIndex` per ferdig mønster
3. Bygg `CompletedPatterns[]` og `ActiveNearPattern`
4. Avled `Cells[]` fra disse to lagene
5. Render celler med prioritetsreglene i seksjon 5
6. Render overlays separat fra cellene
7. Velg `PrizeAnchor` per triggercelle

## 13. Åpen edge case

Hvis ett trekk fullfører flere mønstre i samme celle samtidig:
- runtime bør fortsatt opprette ett `CompletedPatternState` per mønster
- samme `TriggerCellIndex` kan da deles av flere mønstre
- dette designet definerer ikke ennå en full stacked-label-løsning for flere gevinsttekster i nøyaktig samme celle

Anbefalt førsteversjon:
- vis høyeste premie i cellen
- behold alle øvrige mønsteroverlays
- utvid senere med label-stacking hvis det faktisk oppstår i Theme1

## 14. Kort konklusjon

Den riktige mentale modellen er:

- `CompletedPatterns` = historikken som blir værende
- `ActiveNearPattern` = neste fokus
- `Cells` = sammenslått view av begge

Dette gir en stabil runtime som matcher preview-designene og gjør at samme bong kan gå fra:

`one to go -> won -> won + one to go -> multiple won`

uten at UI hopper, mister streker eller plasserer gevinsttekst tilfeldig.
