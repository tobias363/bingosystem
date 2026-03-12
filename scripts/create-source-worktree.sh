#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/create-source-worktree.sh <branch-suffix> [destination]

Examples:
  bash scripts/create-source-worktree.sh candy-purple-overlays
  bash scripts/create-source-worktree.sh candy-purple-overlays ../Bingo-candy-purple-overlays
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
base_branch="codex/source-of-truth"
branch_suffix="${1#codex/}"
branch_name="codex/${branch_suffix}"
default_destination="$(cd "${repo_root}/.." && pwd)/Bingo-${branch_suffix//\//-}"
destination="${2:-${default_destination}}"

if ! git -C "${repo_root}" rev-parse --verify "${base_branch}" >/dev/null 2>&1; then
  echo "Base branch ${base_branch} finnes ikke." >&2
  exit 1
fi

if git -C "${repo_root}" rev-parse --verify "${branch_name}" >/dev/null 2>&1; then
  echo "Branch ${branch_name} finnes allerede." >&2
  exit 1
fi

if [[ -e "${destination}" ]]; then
  echo "Mappen finnes allerede: ${destination}" >&2
  exit 1
fi

git -C "${repo_root}" worktree add -b "${branch_name}" "${destination}" "${base_branch}"

cat <<EOF
Opprettet ny worktree.
Branch: ${branch_name}
Mappe:  ${destination}

Neste steg:
  cd "${destination}"
  git status
EOF
