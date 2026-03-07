#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="${UNITY_PROJECT_PATH:-"$ROOT_DIR/Candy"}"
UNITY_BIN="${UNITY_BIN:-}"
LOG_FILE="${UNITY_TYPOGRAPHY_VALIDATE_LOG:-/tmp/unity_typography_validate.log}"

if [[ -z "$UNITY_BIN" ]]; then
  PROJECT_VERSION_FILE="$PROJECT_PATH/ProjectSettings/ProjectVersion.txt"
  DETECTED_UNITY_VERSION=""
  if [[ -f "$PROJECT_VERSION_FILE" ]]; then
    DETECTED_UNITY_VERSION="$(awk -F': ' '/^m_EditorVersion:/{print $2; exit}' "$PROJECT_VERSION_FILE" || true)"
  fi

  if [[ -n "$DETECTED_UNITY_VERSION" ]]; then
    CANDIDATE_BIN="/Applications/Unity/Hub/Editor/$DETECTED_UNITY_VERSION/Unity.app/Contents/MacOS/Unity"
    if [[ -x "$CANDIDATE_BIN" ]]; then
      UNITY_BIN="$CANDIDATE_BIN"
      echo "Auto-detektert Unity-bin fra ProjectVersion: $UNITY_BIN"
    fi
  fi
fi

if [[ -z "$UNITY_BIN" ]]; then
  UNITY_BIN="/Applications/Unity/Hub/Editor/2021.3.8f1/Unity.app/Contents/MacOS/Unity"
  echo "Fallback Unity-bin i bruk: $UNITY_BIN"
fi

if [[ ! -x "$UNITY_BIN" ]]; then
  echo "Unity binary not found or not executable: $UNITY_BIN" >&2
  exit 1
fi

if [[ ! -d "$PROJECT_PATH" ]]; then
  echo "Unity project path not found: $PROJECT_PATH" >&2
  exit 1
fi

echo "Running gameplay typography validation..."
"$UNITY_BIN" \
  -batchmode \
  -nographics \
  -quit \
  -projectPath "$PROJECT_PATH" \
  -executeMethod CandyGameplayTypographyTools.ValidateGameplayTypographyCli \
  -logFile "$LOG_FILE"

echo "Gameplay typography validation passed."
