# Candy Unity Save-Checklist (før WebGL build)

Bruk denne hver gang før vi bygger/deployer WebGL, så builden matcher det du ser i Unity.

## 1) Lagre scene + prosjekt
1. Åpne Candy-prosjektet i Unity.
2. Gå til scenen du tester (`Theme1` eller `Theme2`).
3. Trykk `Cmd+S` (lagrer aktiv scene).
4. Velg `File -> Save`.
5. Velg `File -> Save Project`.

## 2) Lagre Prefab-endringer
1. Hvis du er i Prefab Mode: klikk `Overrides` i Inspector.
2. Klikk `Apply All`.
3. Gjenta for alle prefabs med overrides.

## 3) Sjekk at ingenting er usavet
1. Ingen `*` på scene-tabber.
2. Ikke stå i Play Mode.
3. Kjør `File -> Save Project` én gang til.

## 4) Verifisering i terminal (valgfritt, men anbefalt)
Kjør fra repo-roten:

```bash
git status --short Candy/Assets/Scenes Candy/Assets/Script Candy/Assets/Prefab
```

Hvis du forventer endringer, må de vises her før build (da er de skrevet til disk).

## 5) Klar for build
Når stegene over er gjort, kan WebGL bygges/deployes, og vi får samme versjon som i Unity-editoren.
