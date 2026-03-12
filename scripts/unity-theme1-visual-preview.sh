#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="${UNITY_PROJECT_PATH:-"$ROOT_DIR/Candy"}"
UNITY_BIN="${UNITY_BIN:-}"
LOG_FILE="${UNITY_THEME1_VISUAL_CAPTURE_LOG:-/tmp/unity_theme1_visual_capture.log}"
OUTPUT_PATH="${UNITY_THEME1_VISUAL_CAPTURE_PATH:-"$ROOT_DIR/output/css-preview/images/theme1-unity-capture.png"}"
FULL_FRAME="${UNITY_THEME1_VISUAL_CAPTURE_FULL_FRAME:-0}"
SCENARIO="${UNITY_THEME1_VISUAL_CAPTURE_SCENARIO:-win}"
CAPTURE_WIDTH="${UNITY_THEME1_VISUAL_CAPTURE_WIDTH:-2048}"
CAPTURE_HEIGHT="${UNITY_THEME1_VISUAL_CAPTURE_HEIGHT:-1152}"
REQUEST_PATH="$ROOT_DIR/output/css-preview/theme1-editor-capture-request.txt"
OPEN_COMPARE=false

for arg in "$@"; do
  case "$arg" in
    --open)
      OPEN_COMPARE=true
      ;;
  esac
done

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

if pgrep -af "Unity.*$PROJECT_PATH" >/dev/null; then
  mkdir -p "$(dirname "$OUTPUT_PATH")"
  rm -f "$OUTPUT_PATH"
  printf '%s\n%s\n%s\n' "$OUTPUT_PATH" "$SCENARIO" "$FULL_FRAME" > "$REQUEST_PATH"
  echo "Sent Theme1 visual capture request to the open Unity editor."
  echo "Waiting for capture (scenario=$SCENARIO)..."
  start_epoch="$(date +%s)"
  timeout_seconds=45
  while true; do
    if [[ -s "$OUTPUT_PATH" ]]; then
      output_epoch="$(stat -f %m "$OUTPUT_PATH" 2>/dev/null || echo 0)"
      if [[ "$output_epoch" -ge "$start_epoch" ]]; then
        break
      fi
    fi

    now_epoch="$(date +%s)"
    if (( now_epoch - start_epoch >= timeout_seconds )); then
      echo "Timed out waiting for the open editor to produce $OUTPUT_PATH" >&2
      echo "If Unity is idle, run Tools/Candy/Debug/Capture Theme1 Visual Render once in the editor." >&2
      exit 1
    fi

    sleep 1
  done

  echo "Theme1 visual capture wrote: $OUTPUT_PATH"
  echo "Open compare view: http://127.0.0.1:8765/theme1-unity-compare.html"
  echo "Primary tune file: $ROOT_DIR/Candy/Assets/Script/Theme1BongStyle.cs"
  echo "Structure/layout file: $ROOT_DIR/Candy/Assets/Script/Theme1GameplayViewRepairUtils.cs"
  if [[ "$OPEN_COMPARE" == true ]]; then
    open "http://127.0.0.1:8765/theme1-unity-compare.html"
  fi
  exit 0
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"
rm -f "$OUTPUT_PATH"

echo "Running Theme1 visual capture (scenario=$SCENARIO)..."
"$UNITY_BIN" \
  -batchmode \
  -projectPath "$PROJECT_PATH" \
  -executeMethod Theme1VisualRenderCapture.RunFromCommandLine \
  -theme1CapturePath "$OUTPUT_PATH" \
  -theme1CaptureFullFrame "$FULL_FRAME" \
  -theme1CaptureScenario "$SCENARIO" \
  -theme1CaptureWidth "$CAPTURE_WIDTH" \
  -theme1CaptureHeight "$CAPTURE_HEIGHT" \
  -logFile "$LOG_FILE"

if ! rg -n "\\[Theme1VisualCapture\\] WROTE " "$LOG_FILE" >/dev/null; then
  echo "Theme1 visual capture did not report success. Check log: $LOG_FILE" >&2
  tail -n 120 "$LOG_FILE" >&2 || true
  exit 1
fi

if [[ ! -s "$OUTPUT_PATH" ]]; then
  echo "Theme1 visual capture did not produce an image: $OUTPUT_PATH" >&2
  exit 1
fi

echo "Theme1 visual capture wrote: $OUTPUT_PATH"
echo "Open compare view: http://127.0.0.1:8765/theme1-unity-compare.html"
echo "Primary tune file: $ROOT_DIR/Candy/Assets/Script/Theme1BongStyle.cs"
echo "Structure/layout file: $ROOT_DIR/Candy/Assets/Script/Theme1GameplayViewRepairUtils.cs"

if [[ "$OPEN_COMPARE" == true ]]; then
  open "http://127.0.0.1:8765/theme1-unity-compare.html"
fi
