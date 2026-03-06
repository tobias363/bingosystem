#!/usr/bin/env bash
set -euo pipefail

: "${CANDY_BUILD_DIR:?CANDY_BUILD_DIR is required}"
: "${RELEASE_VERSION:?RELEASE_VERSION is required}"
: "${EXPECTED_RELEASE_COMMIT:?EXPECTED_RELEASE_COMMIT is required}"

PROJECT_PATH="${PROJECT_PATH:-Candy}"
PROJECT_VERSION_FILE="${PROJECT_PATH}/ProjectSettings/ProjectVersion.txt"

if [[ ! -f "${PROJECT_VERSION_FILE}" ]]; then
  echo "[build-candy-webgl-local] Missing ${PROJECT_VERSION_FILE}" >&2
  exit 1
fi

UNITY_VERSION="$(sed -n 's/^m_EditorVersion:[[:space:]]*//p' "${PROJECT_VERSION_FILE}" | head -n 1)"
if [[ -z "${UNITY_VERSION}" ]]; then
  echo "[build-candy-webgl-local] Could not parse Unity version from ${PROJECT_VERSION_FILE}" >&2
  exit 1
fi

UNITY_BIN="${UNITY_BIN:-/Applications/Unity/Hub/Editor/${UNITY_VERSION}/Unity.app/Contents/MacOS/Unity}"
if [[ ! -x "${UNITY_BIN}" ]]; then
  echo "[build-candy-webgl-local] Unity binary not executable: ${UNITY_BIN}" >&2
  echo "[build-candy-webgl-local] Set UNITY_BIN explicitly if Unity is installed elsewhere." >&2
  exit 1
fi

mkdir -p "${CANDY_BUILD_DIR}"

echo "[build-candy-webgl-local] Building with ${UNITY_BIN}"
echo "[build-candy-webgl-local] Output: ${CANDY_BUILD_DIR}"

"${UNITY_BIN}" \
  -batchmode \
  -nographics \
  -quit \
  -logFile - \
  -projectPath "${PWD}/${PROJECT_PATH}" \
  -buildTarget WebGL \
  -executeMethod WebGLBuild.BuildWebGLFromCommandLine \
  -customBuildPath "${CANDY_BUILD_DIR}" \
  -releaseVersion "${RELEASE_VERSION}" \
  -releaseCommit "${EXPECTED_RELEASE_COMMIT}"

echo "[build-candy-webgl-local] Build completed"
