#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR="${1:-${CANDY_BUILD_DIR:-}}"
EXPECTED_RELEASE_COMMIT_RAW="${2:-${EXPECTED_RELEASE_COMMIT:-}}"
EXPECTED_RELEASE_VERSION_RAW="${3:-${EXPECTED_RELEASE_VERSION:-}}"

if [[ -z "${BUILD_DIR}" ]]; then
  echo "[verify-webgl-release] Missing build directory (arg1 or CANDY_BUILD_DIR)." >&2
  exit 1
fi
if [[ ! -d "${BUILD_DIR}" ]]; then
  echo "[verify-webgl-release] Build directory does not exist: ${BUILD_DIR}" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "[verify-webgl-release] jq is required." >&2
  exit 1
fi

index_file="${BUILD_DIR}/index.html"
release_file="${BUILD_DIR}/release.json"
build_subdir="${BUILD_DIR}/Build"
template_subdir="${BUILD_DIR}/TemplateData"

for required in "${index_file}" "${release_file}"; do
  if [[ ! -f "${required}" ]]; then
    echo "[verify-webgl-release] Missing required file: ${required}" >&2
    exit 1
  fi
done

for required_dir in "${build_subdir}" "${template_subdir}"; do
  if [[ ! -d "${required_dir}" ]]; then
    echo "[verify-webgl-release] Missing required directory: ${required_dir}" >&2
    exit 1
  fi
done

release_version="$(jq -r '.releaseVersion // empty' "${release_file}")"
release_commit="$(jq -r '.releaseCommit // empty' "${release_file}")"

if [[ -z "${release_version}" ]]; then
  echo "[verify-webgl-release] release.json is missing releaseVersion." >&2
  exit 1
fi
if [[ -z "${release_commit}" ]]; then
  echo "[verify-webgl-release] release.json is missing releaseCommit." >&2
  exit 1
fi

expected_release_commit=""
if [[ -n "${EXPECTED_RELEASE_COMMIT_RAW}" ]]; then
  expected_release_commit="$(printf '%s' "${EXPECTED_RELEASE_COMMIT_RAW}" | tr '[:upper:]' '[:lower:]')"
  expected_release_commit="${expected_release_commit:0:8}"
fi

if [[ -n "${expected_release_commit}" && "${release_commit}" != "${expected_release_commit}" ]]; then
  echo "[verify-webgl-release] releaseCommit mismatch. expected=${expected_release_commit} actual=${release_commit}" >&2
  exit 1
fi

if [[ -n "${EXPECTED_RELEASE_VERSION_RAW}" && "${release_version}" != "${EXPECTED_RELEASE_VERSION_RAW}" ]]; then
  echo "[verify-webgl-release] releaseVersion mismatch. expected=${EXPECTED_RELEASE_VERSION_RAW} actual=${release_version}" >&2
  exit 1
fi

echo "[verify-webgl-release] releaseVersion=${release_version}"
echo "[verify-webgl-release] releaseCommit=${release_commit}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "release_version=${release_version}"
    echo "release_commit=${release_commit}"
  } >>"${GITHUB_OUTPUT}"
fi
