#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "[publish-candygame] jq is required." >&2
  exit 1
fi

BUILD_DIR="${CANDY_BUILD_DIR:-}"
REPO_PUSH_TOKEN="${CANDYGAME_REPO_PUSH_TOKEN:-}"
CLONE_URL="${CANDYGAME_REPO_CLONE_URL:-}"
TARGET_BRANCH="${CANDYGAME_REPO_BRANCH:-main}"
EXPECTED_RELEASE_COMMIT_RAW="${EXPECTED_RELEASE_COMMIT:-}"
GIT_USER_NAME="${CANDYGAME_GIT_USER_NAME:-candygame-bot}"
GIT_USER_EMAIL="${CANDYGAME_GIT_USER_EMAIL:-candygame-bot@users.noreply.github.com}"

if [[ -z "${BUILD_DIR}" ]]; then
  echo "[publish-candygame] Missing CANDY_BUILD_DIR." >&2
  exit 1
fi
if [[ ! -d "${BUILD_DIR}" ]]; then
  echo "[publish-candygame] Build directory does not exist: ${BUILD_DIR}" >&2
  exit 1
fi
if [[ -z "${REPO_PUSH_TOKEN}" ]]; then
  echo "[publish-candygame] Missing CANDYGAME_REPO_PUSH_TOKEN." >&2
  exit 1
fi
if [[ -z "${CLONE_URL}" ]]; then
  echo "[publish-candygame] Missing CANDYGAME_REPO_CLONE_URL." >&2
  exit 1
fi

release_json="${BUILD_DIR}/release.json"
if [[ ! -f "${release_json}" ]]; then
  echo "[publish-candygame] release.json missing in build directory." >&2
  exit 1
fi

release_version="$(jq -r '.releaseVersion // empty' "${release_json}")"
release_commit="$(jq -r '.releaseCommit // empty' "${release_json}")"
if [[ -z "${release_version}" || -z "${release_commit}" ]]; then
  echo "[publish-candygame] release.json missing releaseVersion/releaseCommit." >&2
  exit 1
fi

expected_release_commit=""
if [[ -n "${EXPECTED_RELEASE_COMMIT_RAW}" ]]; then
  expected_release_commit="$(printf '%s' "${EXPECTED_RELEASE_COMMIT_RAW}" | tr '[:upper:]' '[:lower:]')"
  expected_release_commit="${expected_release_commit:0:8}"
fi

if [[ -n "${expected_release_commit}" && "${release_commit}" != "${expected_release_commit}" ]]; then
  echo "[publish-candygame] Refusing publish. releaseCommit=${release_commit}, expected=${expected_release_commit}" >&2
  exit 1
fi

if [[ "${CLONE_URL}" != https://* ]]; then
  echo "[publish-candygame] CANDYGAME_REPO_CLONE_URL must be https://..." >&2
  exit 1
fi

auth_clone_url="${CLONE_URL/https:\/\//https://x-access-token:${REPO_PUSH_TOKEN}@}"
workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT
repo_dir="${workdir}/candygame-repo"

echo "[publish-candygame] Cloning ${CLONE_URL} (${TARGET_BRANCH})"
git clone --depth 1 --branch "${TARGET_BRANCH}" "${auth_clone_url}" "${repo_dir}"

git -C "${repo_dir}" config user.name "${GIT_USER_NAME}"
git -C "${repo_dir}" config user.email "${GIT_USER_EMAIL}"

for required_file in index.html release.json; do
  if [[ ! -f "${BUILD_DIR}/${required_file}" ]]; then
    echo "[publish-candygame] Missing build file ${required_file}" >&2
    exit 1
  fi
done

for required_dir in Build TemplateData; do
  if [[ ! -d "${BUILD_DIR}/${required_dir}" ]]; then
    echo "[publish-candygame] Missing build directory ${required_dir}" >&2
    exit 1
  fi
done

cp "${BUILD_DIR}/index.html" "${repo_dir}/index.html"
cp "${BUILD_DIR}/release.json" "${repo_dir}/release.json"
rm -rf "${repo_dir}/Build" "${repo_dir}/TemplateData"
mkdir -p "${repo_dir}/Build" "${repo_dir}/TemplateData"
cp -R "${BUILD_DIR}/Build/." "${repo_dir}/Build/"
cp -R "${BUILD_DIR}/TemplateData/." "${repo_dir}/TemplateData/"

git -C "${repo_dir}" add index.html release.json Build TemplateData

if git -C "${repo_dir}" diff --cached --quiet; then
  echo "[publish-candygame] No deploy file changes detected; skipping commit/push."
else
  git -C "${repo_dir}" commit -m "build(webgl): publish ${release_version} (${release_commit})"
  git -C "${repo_dir}" push origin "${TARGET_BRANCH}"
  echo "[publish-candygame] Pushed release ${release_version} (${release_commit})"
fi

published_repo_commit="$(git -C "${repo_dir}" rev-parse --short=8 HEAD)"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "release_version=${release_version}"
    echo "release_commit=${release_commit}"
    echo "published_repo_commit=${published_repo_commit}"
  } >>"${GITHUB_OUTPUT}"
fi
