# Lokal source-of-truth workflow

Dette repoet bruker en fast lokal integrasjons-worktree for Candy/Unity:

- mappe: `../Bingo-source-of-truth`
- branch: `codex/source-of-truth`

Maalet er at det alltid finnes ett sted som er siste testbare lokale sannhet for Candy før noe pushes eller merges videre.

## Regler

1. Test alltid Unity i `Bingo-source-of-truth/Candy`.
2. Ikke jobb direkte i `codex/source-of-truth` for vanlige features.
3. Opprett en ny `git worktree` per oppgave, per chat, eller per utvikler.
4. Integrer ferdige endringer tilbake til `codex/source-of-truth`.
5. Kjor smoke eller relevant Unity-sjekk i source-of-truth etter hver integrasjon.

## Opprett ny arbeids-worktree

Fra repo-root:

```bash
bash scripts/create-source-worktree.sh candy-fix-navn
```

Det lager:

- branch: `codex/candy-fix-navn`
- mappe: `../Bingo-candy-fix-navn`

Du kan ogsa velge egen mappe:

```bash
bash scripts/create-source-worktree.sh candy-fix-navn ../Bingo-candy-fix-navn-2
```

## Anbefalt flyt

1. Opprett ny worktree fra `codex/source-of-truth`.
2. Gjør endringer bare i den nye worktreeen.
3. Kjor relevante tester der underveis.
4. Naar oppgaven er klar, merge eller cherry-pick tilbake til `codex/source-of-truth`.
5. Aapne `../Bingo-source-of-truth/Candy` i Unity og kjor verifisering pa nytt.

## Nyttige kommandoer

Se aktive worktrees:

```bash
git worktree list
```

Eksempel pa integrasjon tilbake til source-of-truth:

```bash
git switch codex/source-of-truth
git cherry-pick <commit>
```

Eksempel pa ny verifisering:

```bash
bash scripts/unity-theme1-smoke.sh
```
