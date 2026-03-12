using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using SimpleJSON;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;

public static class Theme1VisualRenderCapture
{
    private enum CaptureScenario
    {
        NearWin,
        Win
    }

    private const string ScenePath = "Assets/Scenes/Theme1.unity";
    private const string PlayerId = "theme1-visual-capture";
    private const double TimeoutSeconds = 10.0;
    private const int DefaultCaptureWidth = 2048;
    private const int DefaultCaptureHeight = 1152;
    private const int CaptureBetLevel = 1;
    private const int CapturePatternIndex = 13;
    private const string DefaultScenarioName = "win";
    private static string DefaultOutputPath => Path.GetFullPath(Path.Combine(
        Application.dataPath,
        "..",
        "..",
        "output",
        "css-preview",
        "images",
        "theme1-unity-capture.png"));

    private static readonly List<int[]> TicketSets = new()
    {
        new[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 },
        new[] { 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 },
        new[] { 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45 },
        new[] { 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60 },
    };

    private static readonly int[] NearWinDraws = { 1, 4, 7, 10, 13, 25, 31, 44, 59 };
    private static readonly int[] WinDraws = { 1, 4, 7, 10, 13 };
    private static readonly int[] PreviewTicketNumbers =
    {
        26, 21, 3,
        36, 18, 7,
        16, 21, 45,
        5, 54, 3,
        9, 45, 3
    };

    private static bool isRunning;
    private static bool shouldExitOnFinish;
    private static bool captureFullFrame;
    private static CaptureScenario captureScenario = CaptureScenario.Win;
    private static int captureWidth = DefaultCaptureWidth;
    private static int captureHeight = DefaultCaptureHeight;
    private static double deadlineAt;
    private static string outputPath = DefaultOutputPath;
    private static bool previousEnterPlayModeOptionsEnabled;
    private static EnterPlayModeOptions previousEnterPlayModeOptions;
    private static MethodInfo handleRealtimeRoomUpdateMethod;
    private static FieldInfo activePlayerIdField;
    private static FieldInfo processedDrawCountField;
    private static FieldInfo activeTicketSetsField;
    private static FieldInfo theme1RealtimeViewModeField;
    private readonly struct CanvasCaptureState
    {
        public readonly Canvas Canvas;
        public readonly RenderMode RenderMode;
        public readonly Camera WorldCamera;
        public readonly float PlaneDistance;

        public CanvasCaptureState(Canvas canvas)
        {
            Canvas = canvas;
            RenderMode = canvas != null ? canvas.renderMode : RenderMode.ScreenSpaceOverlay;
            WorldCamera = canvas != null ? canvas.worldCamera : null;
            PlaneDistance = canvas != null ? canvas.planeDistance : 0f;
        }

        public void Restore()
        {
            if (Canvas == null)
            {
                return;
            }

            Canvas.renderMode = RenderMode;
            Canvas.worldCamera = WorldCamera;
            Canvas.planeDistance = PlaneDistance;
        }
    }

    [MenuItem("Tools/Candy/Debug/Capture Theme1 Visual Render")]
    public static void RunFromMenu()
    {
        Start(DefaultOutputPath, DefaultScenarioName, exitOnFinish: false);
    }

    public static void RunFromEditorRequest(string requestedOutputPath, string requestedScenario = null, bool? requestedFullFrame = null)
    {
        if (requestedFullFrame.HasValue)
        {
            captureFullFrame = requestedFullFrame.Value;
        }

        Start(requestedOutputPath, requestedScenario, exitOnFinish: false);
    }

    public static void RunFromCommandLine()
    {
        string requestedOutput = GetCommandLineArgValue("-theme1CapturePath", DefaultOutputPath);
        captureFullFrame = string.Equals(GetCommandLineArgValue("-theme1CaptureFullFrame", "0"), "1", StringComparison.Ordinal);
        string requestedScenario = GetCommandLineArgValue("-theme1CaptureScenario", DefaultScenarioName);
        captureWidth = ParsePositiveInt(GetCommandLineArgValue("-theme1CaptureWidth", DefaultCaptureWidth.ToString(CultureInfo.InvariantCulture)), DefaultCaptureWidth);
        captureHeight = ParsePositiveInt(GetCommandLineArgValue("-theme1CaptureHeight", DefaultCaptureHeight.ToString(CultureInfo.InvariantCulture)), DefaultCaptureHeight);
        Start(requestedOutput, requestedScenario, exitOnFinish: true);
    }

    private static void Start(string requestedOutputPath, string requestedScenario, bool exitOnFinish)
    {
        if (isRunning)
        {
            return;
        }

        CandyTheme1BindingTools.InstallOrRefreshTheme1BindingsCli();
        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        outputPath = string.IsNullOrWhiteSpace(requestedOutputPath) ? DefaultOutputPath : requestedOutputPath.Trim();
        captureScenario = ParseCaptureScenario(requestedScenario);
        captureWidth = Mathf.Max(1, captureWidth);
        captureHeight = Mathf.Max(1, captureHeight);
        shouldExitOnFinish = exitOnFinish;
        isRunning = true;
        deadlineAt = EditorApplication.timeSinceStartup + TimeoutSeconds;
        previousEnterPlayModeOptionsEnabled = EditorSettings.enterPlayModeOptionsEnabled;
        previousEnterPlayModeOptions = EditorSettings.enterPlayModeOptions;
        EditorSettings.enterPlayModeOptionsEnabled = true;
        EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;

        Application.logMessageReceived += HandleLogMessage;
        EditorApplication.playModeStateChanged += HandlePlayModeStateChanged;
        EditorApplication.update += Tick;
        Debug.Log($"[Theme1VisualCapture] START scenario={captureScenario}");
        EditorApplication.isPlaying = true;
    }

    private static void Tick()
    {
        if (!isRunning || !EditorApplication.isPlaying)
        {
            return;
        }

        if (EditorApplication.timeSinceStartup > deadlineAt)
        {
            Fail("timeout");
            return;
        }

        if (handleRealtimeRoomUpdateMethod == null)
        {
            if (!TryBindRuntime(out string bindError))
            {
                Fail(bindError);
                return;
            }
        }

        EditorApplication.update -= Tick;
        EditorApplication.delayCall += CaptureOnceReady;
    }

    private static void CaptureOnceReady()
    {
        if (!isRunning || !EditorApplication.isPlaying)
        {
            return;
        }

        APIManager apiManager = UnityEngine.Object.FindFirstObjectByType<APIManager>(FindObjectsInactive.Include);
        Theme1GameplayViewRoot viewRoot = UnityEngine.Object.FindFirstObjectByType<Theme1GameplayViewRoot>(FindObjectsInactive.Include);
        Camera camera = UnityEngine.Object.FindFirstObjectByType<Camera>(FindObjectsInactive.Include);
        if (apiManager == null || viewRoot == null || camera == null)
        {
            Fail("APIManager, Theme1GameplayViewRoot eller Camera mangler.");
            return;
        }

        ConfigureCaptureBet();
        ConfigureCapturePatterns();
        int previousRoundWinnings = GameManager.instance != null ? GameManager.instance.RoundWinnings : 0;
        string previousHudWinnings = ReadText(viewRoot?.HudBar?.WinningsText);

        activePlayerIdField.SetValue(apiManager, PlayerId);
        processedDrawCountField.SetValue(apiManager, 0);
        activeTicketSetsField.SetValue(apiManager, new List<List<int>>());
        theme1RealtimeViewModeField.SetValue(apiManager, Enum.ToObject(theme1RealtimeViewModeField.FieldType, 2));
        handleRealtimeRoomUpdateMethod.Invoke(apiManager, new object[] { BuildSnapshot(GetScenarioGameId(), GetScenarioDraws()) });

        viewRoot.EnsurePresentationInitialized();
        if (captureScenario == CaptureScenario.NearWin)
        {
            ApplyBongOneToGoPreviewState(viewRoot);
        }

        EditorApplication.delayCall += () => CaptureGameView(camera, viewRoot, previousRoundWinnings, previousHudWinnings);
    }

    private static void CaptureGameView(
        Camera camera,
        Theme1GameplayViewRoot viewRoot,
        int previousRoundWinnings,
        string previousHudWinnings)
    {
        try
        {
            if (camera == null || viewRoot == null)
            {
                Fail("Camera eller Theme1GameplayViewRoot forsvant før capture.");
                return;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? "/tmp");
            viewRoot.SetResponsiveViewportOverride(new Vector2(captureWidth, captureHeight));
            ForceCaptureHudState(viewRoot);
            Canvas.ForceUpdateCanvases();
            if (captureScenario == CaptureScenario.Win &&
                !TryValidateWinState(viewRoot, previousRoundWinnings, previousHudWinnings, out string validationError))
            {
                Fail(validationError);
                return;
            }

            TMPLog(viewRoot);
            Canvas.ForceUpdateCanvases();
            if (File.Exists(outputPath))
            {
                File.Delete(outputPath);
            }

            CaptureCameraViewToPng(camera, captureFullFrame ? null : ResolvePrimaryBoardRect(viewRoot));
            Debug.Log("[Theme1VisualCapture] WROTE " + outputPath);
            Complete();
        }
        catch (Exception ex)
        {
            Fail(ex.ToString());
        }
        finally
        {
            viewRoot?.ClearResponsiveViewportOverride();
        }
    }

    private static void ForceCaptureHudState(Theme1GameplayViewRoot viewRoot)
    {
        if (viewRoot?.HudBar?.CountdownText != null)
        {
            viewRoot.HudBar.CountdownText.text = "00:45";
        }

        if (viewRoot?.HudBar?.RoomPlayerCountText != null)
        {
            viewRoot.HudBar.RoomPlayerCountText.text = string.Empty;
        }

        Theme1HudTextMirror[] mirrors = UnityEngine.Object.FindObjectsByType<Theme1HudTextMirror>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        for (int i = 0; i < mirrors.Length; i++)
        {
            if (mirrors[i] != null)
            {
                mirrors[i].SyncNow();
            }
        }
    }

    private static void ConfigureCaptureBet()
    {
        if (GameManager.instance == null)
        {
            return;
        }

        GameManager.instance.ApplyBetLevel(CaptureBetLevel);
    }

    private static void ConfigureCapturePatterns()
    {
        NumberGenerator generator = UnityEngine.Object.FindFirstObjectByType<NumberGenerator>(FindObjectsInactive.Include);
        if (generator != null)
        {
            generator.totalSelectedPatterns ??= new List<int>();
            generator.totalSelectedPatterns.Clear();
            generator.totalSelectedPatterns.Add(CapturePatternIndex);
        }

        if (NumberManager.instance == null)
        {
            return;
        }

        NumberManager.instance.currentPatternIndex ??= new List<int>();
        NumberManager.instance.currentPatternIndex.Clear();
        NumberManager.instance.currentPatternIndex.Add(CapturePatternIndex);
    }

    private static bool TryValidateWinState(
        Theme1GameplayViewRoot viewRoot,
        int previousRoundWinnings,
        string previousHudWinnings,
        out string error)
    {
        error = string.Empty;
        GameManager gameManager = GameManager.instance;
        Theme1CardGridView cardView = viewRoot?.Cards != null && viewRoot.Cards.Length > 0
            ? viewRoot.Cards[0]
            : null;
        if (gameManager == null || cardView == null)
        {
            error = "[Theme1VisualCapture] Win scenario mangler GameManager eller first card view.";
            return false;
        }

        int cardWinAmount = gameManager.GetCardWinAmount(0);
        int roundWinnings = gameManager.RoundWinnings;
        string expectedHudWinnings = GameManager.FormatWholeNumber(roundWinnings);
        string actualHudWinnings = ReadText(viewRoot.HudBar?.WinningsText);
        string expectedCardWinLabel = gameManager.FormatCardWinLabel(cardWinAmount);
        string actualCardWinLabel = ReadText(cardView.WinLabel);
        bool cardWinLabelVisible = cardView.WinLabel != null && cardView.WinLabel.gameObject.activeSelf;
        int activePaylines = CountActivePaylines(cardView);
        int matchedTopperSlots = CountMatchedTopperSlots(viewRoot);
        int visiblePrizeLabelCount = CountVisibleCardPrizeLabels(cardView, out List<string> visiblePrizeLabels);
        string expectedPrizeLabel = GameManager.FormatKrAmount(roundWinnings);
        bool hasExpectedPrizeLabel = visiblePrizeLabels.Contains(expectedPrizeLabel);
        bool winningsUpdatedLive =
            previousRoundWinnings <= 0 &&
            roundWinnings > 0 &&
            !string.Equals((previousHudWinnings ?? string.Empty).Trim(), actualHudWinnings, StringComparison.Ordinal);

        Debug.Log(
            "[Theme1VisualCapture] win-state " +
            $"roundWinnings={roundWinnings} previousRoundWinnings={previousRoundWinnings} " +
            $"hud='{actualHudWinnings}' cardWin={cardWinAmount} cardLabel='{actualCardWinLabel}' " +
            $"cardLabelDetails={DescribeTextTarget(cardView.WinLabel)} " +
            $"paylines={activePaylines} topperMatched={matchedTopperSlots} " +
            $"prizeLabels=[{string.Join(", ", visiblePrizeLabels)}] " +
            $"prizeDetails={DescribePrizeLabels(cardView)}");

        if (cardWinAmount <= 0 ||
            roundWinnings != cardWinAmount ||
            !cardWinLabelVisible ||
            !string.Equals(actualCardWinLabel, expectedCardWinLabel, StringComparison.Ordinal) ||
            !string.Equals(actualHudWinnings, expectedHudWinnings, StringComparison.Ordinal) ||
            activePaylines < 1 ||
            matchedTopperSlots < 1 ||
            visiblePrizeLabelCount < 1 ||
            !hasExpectedPrizeLabel ||
            !winningsUpdatedLive)
        {
            error =
                "[Theme1VisualCapture] Win scenario ble ikke rendret som forventet. " +
                $"previousRoundWinnings={previousRoundWinnings} previousHud='{previousHudWinnings}' " +
                $"roundWinnings={roundWinnings} hud='{actualHudWinnings}' cardWin={cardWinAmount} " +
                $"cardLabelVisible={cardWinLabelVisible} cardLabel='{actualCardWinLabel}' " +
                $"paylines={activePaylines} topperMatched={matchedTopperSlots} expectedPrize='{expectedPrizeLabel}' " +
                $"prizeLabels=[{string.Join(", ", visiblePrizeLabels)}]";
            return false;
        }

        return true;
    }

    private static void TMPLog(Theme1GameplayViewRoot viewRoot)
    {
        Theme1CardCellView cell = viewRoot.Cards != null &&
                                  viewRoot.Cards.Length > 0 &&
                                  viewRoot.Cards[0] != null &&
                                  viewRoot.Cards[0].Cells != null &&
                                  viewRoot.Cards[0].Cells.Length > 0
            ? viewRoot.Cards[0].Cells[0]
            : null;
        TMP_Text label = cell?.NumberLabel;
        if (label == null)
        {
            Debug.LogWarning("[Theme1VisualCapture] First card label missing.");
            return;
        }

        RectTransform rect = label.rectTransform;
        Debug.Log(
            "[Theme1VisualCapture] first-card " +
            $"text='{label.text}' active={label.gameObject.activeInHierarchy} enabled={label.enabled} " +
            $"alpha={label.alpha.ToString(CultureInfo.InvariantCulture)} color={label.color} " +
            $"rect={rect.rect.width.ToString("0.##", CultureInfo.InvariantCulture)}x{rect.rect.height.ToString("0.##", CultureInfo.InvariantCulture)} " +
            $"path={BuildPath(label.transform)}");

        TMP_Text countdown = viewRoot.HudBar != null ? viewRoot.HudBar.CountdownText : null;
        RectTransform countdownRect = countdown != null ? countdown.rectTransform : null;
        Debug.Log(
            "[Theme1VisualCapture] countdown " +
            $"text='{(countdown != null ? countdown.text : "null")}' active={(countdown != null && countdown.gameObject.activeInHierarchy)} " +
            $"selfActive={(countdown != null && countdown.gameObject.activeSelf)} enabled={(countdown != null && countdown.enabled)} " +
            $"alpha={(countdown != null ? countdown.alpha.ToString(CultureInfo.InvariantCulture) : "null")} " +
            $"color={(countdown != null ? countdown.color.ToString() : "null")} " +
            $"font={(countdown != null && countdown.font != null ? countdown.font.name : "null")} " +
            $"rect={(countdownRect != null ? countdownRect.rect.width.ToString("0.##", CultureInfo.InvariantCulture) + "x" + countdownRect.rect.height.ToString("0.##", CultureInfo.InvariantCulture) : "null")} " +
            $"pos={(countdownRect != null ? countdownRect.anchoredPosition.ToString() : "null")} " +
            $"path={(countdown != null ? BuildPath(countdown.transform) : "null")}");

        TextMeshProUGUI mirror = null;
        TextMeshProUGUI[] tmpLabels = UnityEngine.Object.FindObjectsByType<TextMeshProUGUI>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        for (int i = 0; i < tmpLabels.Length; i++)
        {
            if (tmpLabels[i] != null && string.Equals(tmpLabels[i].name, "Theme1CountdownMirror", StringComparison.Ordinal))
            {
                mirror = tmpLabels[i];
                break;
            }
        }

        RectTransform mirrorRect = mirror != null ? mirror.rectTransform : null;
        CanvasRenderer mirrorRenderer = mirror != null ? mirror.GetComponent<CanvasRenderer>() : null;
        RectTransform countdownHost = mirror != null ? mirror.transform.parent as RectTransform : null;
        Debug.Log(
            "[Theme1VisualCapture] countdown-mirror " +
            $"exists={(mirror != null)} text='{(mirror != null ? mirror.text : "null")}' " +
            $"active={(mirror != null && mirror.gameObject.activeInHierarchy)} selfActive={(mirror != null && mirror.gameObject.activeSelf)} " +
            $"enabled={(mirror != null && mirror.enabled)} " +
            $"font={(mirror != null && mirror.font != null ? mirror.font.name : "null")} " +
            $"color={(mirror != null ? mirror.color.ToString() : "null")} " +
            $"canvasRenderer={(mirrorRenderer != null)} " +
            $"rendererAlpha={(mirrorRenderer != null ? mirrorRenderer.GetAlpha().ToString(CultureInfo.InvariantCulture) : "null")} " +
            $"rendererCull={(mirrorRenderer != null && mirrorRenderer.cull)} " +
            $"rect={(mirrorRect != null ? mirrorRect.rect.width.ToString("0.##", CultureInfo.InvariantCulture) + "x" + mirrorRect.rect.height.ToString("0.##", CultureInfo.InvariantCulture) : "null")} " +
            $"pos={(mirrorRect != null ? mirrorRect.anchoredPosition.ToString() : "null")} " +
            $"path={(mirror != null ? BuildPath(mirror.transform) : "null")}");
        Debug.Log(
            "[Theme1VisualCapture] countdown-host " +
            $"exists={(countdownHost != null)} " +
            $"rect={(countdownHost != null ? countdownHost.rect.width.ToString("0.##", CultureInfo.InvariantCulture) + "x" + countdownHost.rect.height.ToString("0.##", CultureInfo.InvariantCulture) : "null")} " +
            $"pos={(countdownHost != null ? countdownHost.anchoredPosition.ToString() : "null")} " +
            $"path={(countdownHost != null ? BuildPath(countdownHost.transform) : "null")}");
    }

    private static void CaptureCameraViewToPng(Camera camera, RectTransform cropTarget)
    {
        if (camera == null)
        {
            throw new InvalidOperationException("Camera mangler for visual capture.");
        }

        Canvas[] canvases = UnityEngine.Object.FindObjectsByType<Canvas>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        List<CanvasCaptureState> canvasStates = new List<CanvasCaptureState>(canvases.Length);
        for (int i = 0; i < canvases.Length; i++)
        {
            Canvas canvas = canvases[i];
            if (canvas == null || !canvas.isActiveAndEnabled)
            {
                continue;
            }

            canvasStates.Add(new CanvasCaptureState(canvas));
            if (canvas.renderMode == RenderMode.ScreenSpaceOverlay)
            {
                canvas.renderMode = RenderMode.ScreenSpaceCamera;
                canvas.worldCamera = camera;
                canvas.planeDistance = 100f;
            }
            else if (canvas.renderMode == RenderMode.ScreenSpaceCamera && canvas.worldCamera == null)
            {
                canvas.worldCamera = camera;
            }
        }

        RenderTexture renderTexture = null;
        Texture2D texture = null;
        RenderTexture previousActive = RenderTexture.active;
        RenderTexture previousTarget = camera.targetTexture;

        try
        {
            renderTexture = new RenderTexture(captureWidth, captureHeight, 24, RenderTextureFormat.ARGB32)
            {
                antiAliasing = 4
            };
            texture = new Texture2D(captureWidth, captureHeight, TextureFormat.RGBA32, false);
            camera.targetTexture = renderTexture;
            RenderTexture.active = renderTexture;
            camera.Render();

            texture.ReadPixels(new Rect(0f, 0f, captureWidth, captureHeight), 0, 0, false);
            texture.Apply(false, false);
            Texture2D exportTexture = cropTarget != null
                ? CreateCroppedTexture(texture, camera, cropTarget)
                : texture;
            byte[] png = exportTexture.EncodeToPNG();
            if (png == null || png.Length == 0)
            {
                throw new InvalidOperationException("EncodeToPNG returnerte tomt resultat.");
            }

            File.WriteAllBytes(outputPath, png);
            if (!ReferenceEquals(exportTexture, texture))
            {
                UnityEngine.Object.DestroyImmediate(exportTexture);
            }
        }
        finally
        {
            camera.targetTexture = previousTarget;
            RenderTexture.active = previousActive;

            for (int i = 0; i < canvasStates.Count; i++)
            {
                canvasStates[i].Restore();
            }

            if (texture != null)
            {
                UnityEngine.Object.DestroyImmediate(texture);
            }

            if (renderTexture != null)
            {
                UnityEngine.Object.DestroyImmediate(renderTexture);
            }
        }
    }

    private static void ApplyBongOneToGoPreviewState(Theme1GameplayViewRoot viewRoot)
    {
        if (viewRoot == null)
        {
            return;
        }

        Theme1RoundRenderState state = Theme1RoundRenderState.CreateEmpty(
            viewRoot.Cards != null ? viewRoot.Cards.Length : 4,
            viewRoot.BallRack?.Slots != null ? viewRoot.BallRack.Slots.Length : 30,
            viewRoot.TopperStrip?.Slots != null ? viewRoot.TopperStrip.Slots.Length : 0);

        if (state.Cards.Length == 0)
        {
            return;
        }

        state.Hud.CountdownLabel = "00:45";
        state.Hud.PlayerCountLabel = string.Empty;
        state.Cards[0] = BuildOneToGoCardState();
        for (int cardIndex = 1; cardIndex < state.Cards.Length; cardIndex++)
        {
            Theme1CardRenderState card = Theme1CardRenderState.CreateEmpty();
            for (int i = 0; i < PreviewTicketNumbers.Length && i < card.Cells.Length; i++)
            {
                card.Cells[i] = new Theme1CardCellRenderState(
                    PreviewTicketNumbers[i].ToString(),
                    false,
                    false,
                    false);
            }

            state.Cards[cardIndex] = card;
        }

        new Theme1RealtimePresenter().Render(viewRoot, state);
        if (viewRoot.HudBar?.CountdownText != null)
        {
            viewRoot.HudBar.CountdownText.text = "00:45";
        }

        Theme1CardCellView previewCell = viewRoot.Cards != null &&
                                         viewRoot.Cards.Length > 0 &&
                                         viewRoot.Cards[0] != null &&
                                         viewRoot.Cards[0].Cells != null &&
                                         viewRoot.Cards[0].Cells.Length > 12
            ? viewRoot.Cards[0].Cells[12]
            : null;
        previewCell?.PulseController?.SetPreviewEmphasis(Theme1BongStyle.PreviewPulseEmphasis);
        LogPreviewPulseState(previewCell);
    }

    private static void LogPreviewPulseState(Theme1CardCellView previewCell)
    {
        if (previewCell == null)
        {
            Debug.LogWarning("[Theme1VisualCapture] previewCell missing.");
            return;
        }

        RectTransform numberRect = previewCell.NumberLabel != null ? previewCell.NumberLabel.rectTransform : null;
        Image glow = previewCell.Glow;
        Debug.Log(
            "[Theme1VisualCapture] previewPulse " +
            $"pulseController={(previewCell.PulseController != null)} " +
            $"numberScale={(numberRect != null ? numberRect.localScale.ToString() : "null")} " +
            $"numberPos={(numberRect != null ? numberRect.anchoredPosition.ToString() : "null")} " +
            $"glowEnabled={(glow != null && glow.enabled)} " +
            $"glowColor={(glow != null ? glow.color.ToString() : "null")} " +
            $"glowSize={(glow != null ? glow.rectTransform.sizeDelta.ToString() : "null")}");
    }

    private static int CountActivePaylines(Theme1CardGridView cardView)
    {
        int active = 0;
        GameObject[] paylineObjects = cardView?.PaylineObjects;
        for (int i = 0; paylineObjects != null && i < paylineObjects.Length; i++)
        {
            if (paylineObjects[i] != null && paylineObjects[i].activeSelf)
            {
                active += 1;
            }
        }

        return active;
    }

    private static int CountMatchedTopperSlots(Theme1GameplayViewRoot viewRoot)
    {
        int active = 0;
        Theme1TopperSlotView[] slots = viewRoot?.TopperStrip?.Slots;
        for (int i = 0; slots != null && i < slots.Length; i++)
        {
            if (slots[i]?.PrizeLabel != null && slots[i].PrizeLabel.color == Color.green)
            {
                active += 1;
            }
        }

        return active;
    }

    private static int CountVisibleCardPrizeLabels(Theme1CardGridView cardView, out List<string> labels)
    {
        labels = new List<string>();
        Theme1CardCellView[] cells = cardView?.Cells;
        for (int i = 0; cells != null && i < cells.Length; i++)
        {
            TextMeshProUGUI prizeLabel = cells[i]?.PrizeLabel;
            string text = ReadText(prizeLabel);
            if (prizeLabel == null ||
                !prizeLabel.gameObject.activeSelf ||
                string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            labels.Add(text.Trim());
        }

        return labels.Count;
    }

    private static string DescribePrizeLabels(Theme1CardGridView cardView)
    {
        Theme1CardCellView[] cells = cardView?.Cells;
        if (cells == null || cells.Length == 0)
        {
            return "<none>";
        }

        List<string> entries = new List<string>();
        for (int i = 0; i < cells.Length; i++)
        {
            TextMeshProUGUI prizeLabel = cells[i]?.PrizeLabel;
            if (prizeLabel == null || !prizeLabel.gameObject.activeSelf)
            {
                continue;
            }

            prizeLabel.ForceMeshUpdate(ignoreActiveState: true, forceTextReparsing: false);
            RectTransform rect = prizeLabel.rectTransform;
            CanvasRenderer renderer = prizeLabel.GetComponent<CanvasRenderer>();
            entries.Add(
                $"cell{i}:text='{ReadText(prizeLabel)}' enabled={prizeLabel.enabled} alpha={prizeLabel.alpha.ToString(CultureInfo.InvariantCulture)} " +
                $"chars={(prizeLabel.textInfo != null ? prizeLabel.textInfo.characterCount : -1)} " +
                $"rect={(rect != null ? rect.rect.width.ToString("0.##", CultureInfo.InvariantCulture) + "x" + rect.rect.height.ToString("0.##", CultureInfo.InvariantCulture) : "null")} " +
                $"pos={(rect != null ? rect.anchoredPosition.ToString() : "null")} scale={(rect != null ? rect.localScale.ToString() : "null")} " +
                $"fontSize={prizeLabel.fontSize.ToString("0.##", CultureInfo.InvariantCulture)} material={(prizeLabel.fontSharedMaterial != null ? prizeLabel.fontSharedMaterial.name : "null")} color={prizeLabel.color} " +
                $"rendererAlpha={(renderer != null ? renderer.GetAlpha().ToString(CultureInfo.InvariantCulture) : "null")} " +
                $"rendererCull={(renderer != null && renderer.cull)}");
        }

        return entries.Count > 0 ? string.Join(" | ", entries) : "<none>";
    }

    private static string DescribeTextTarget(TMP_Text target)
    {
        if (target == null)
        {
            return "<null>";
        }

        target.ForceMeshUpdate(ignoreActiveState: true, forceTextReparsing: false);
        RectTransform rect = target.rectTransform;
        CanvasRenderer renderer = target.GetComponent<CanvasRenderer>();
        return
            $"text='{ReadText(target)}' active={target.gameObject.activeSelf} enabled={target.enabled} " +
            $"alpha={target.alpha.ToString(CultureInfo.InvariantCulture)} " +
            $"chars={(target.textInfo != null ? target.textInfo.characterCount : -1)} " +
            $"rect={(rect != null ? rect.rect.width.ToString("0.##", CultureInfo.InvariantCulture) + "x" + rect.rect.height.ToString("0.##", CultureInfo.InvariantCulture) : "null")} " +
            $"pos={(rect != null ? rect.anchoredPosition.ToString() : "null")} scale={(rect != null ? rect.localScale.ToString() : "null")} " +
            $"fontSize={target.fontSize.ToString("0.##", CultureInfo.InvariantCulture)} material={(target.fontSharedMaterial != null ? target.fontSharedMaterial.name : "null")} " +
            $"color={target.color} rendererAlpha={(renderer != null ? renderer.GetAlpha().ToString(CultureInfo.InvariantCulture) : "null")} " +
            $"rendererCull={(renderer != null && renderer.cull)} path={BuildPath(target.transform)}";
    }

    private static Theme1CardRenderState BuildOneToGoCardState()
    {
        Theme1CardRenderState card = Theme1CardRenderState.CreateEmpty();
        for (int i = 0; i < PreviewTicketNumbers.Length && i < card.Cells.Length; i++)
        {
            Theme1CardCellVisualState visualState = Theme1CardCellVisualState.Normal;
            bool isNearTarget = false;
            bool isMatched = false;
            string prizeLabel = string.Empty;

            if (i == 0 || i == 3 || i == 6 || i == 9)
            {
                visualState = Theme1CardCellVisualState.NearHit;
                isMatched = true;
            }
            else if (i == 12)
            {
                visualState = Theme1CardCellVisualState.NearTarget;
                isNearTarget = true;
                prizeLabel = "3 kr";
            }

            card.Cells[i] = new Theme1CardCellRenderState(
                PreviewTicketNumbers[i].ToString(),
                isSelected: false,
                isMissing: isNearTarget,
                isMatched: isMatched,
                nearWinPatternIndex: 0,
                missingNumber: isNearTarget ? PreviewTicketNumbers[i] : 0,
                visualState: visualState,
                isPrizeCell: false,
                isNearTargetCell: isNearTarget,
                prizeLabel: prizeLabel,
                prizeAnchor: Theme1WinLabelAnchor.BottomCenter);
        }

        return card;
    }

    private static RectTransform ResolvePrimaryBoardRect(Theme1GameplayViewRoot viewRoot)
    {
        RectTransform cellRoot = viewRoot?.Cards != null &&
                                 viewRoot.Cards.Length > 0 &&
                                 viewRoot.Cards[0] != null &&
                                 viewRoot.Cards[0].Cells != null &&
                                 viewRoot.Cards[0].Cells.Length > 0
            ? viewRoot.Cards[0].Cells[0]?.CellRoot
            : null;
        Transform cardRoot = cellRoot != null ? cellRoot.parent?.parent : null;
        return cardRoot != null ? cardRoot.Find("RealtimeCardBoard") as RectTransform : null;
    }

    private static Texture2D CreateCroppedTexture(Texture2D source, Camera camera, RectTransform cropTarget)
    {
        if (source == null || camera == null || cropTarget == null)
        {
            return source;
        }

        Vector3[] corners = new Vector3[4];
        cropTarget.GetWorldCorners(corners);
        Vector2 min = new Vector2(float.MaxValue, float.MaxValue);
        Vector2 max = new Vector2(float.MinValue, float.MinValue);
        for (int i = 0; i < corners.Length; i++)
        {
            Vector3 screen = RectTransformUtility.WorldToScreenPoint(camera, corners[i]);
            min = Vector2.Min(min, screen);
            max = Vector2.Max(max, screen);
        }

        float marginX = Mathf.Max(24f, (max.x - min.x) * 0.18f);
        float marginY = Mathf.Max(24f, (max.y - min.y) * 0.18f);
        int x = Mathf.Clamp(Mathf.FloorToInt(min.x - marginX), 0, source.width - 1);
        int y = Mathf.Clamp(Mathf.FloorToInt(min.y - marginY), 0, source.height - 1);
        int width = Mathf.Clamp(Mathf.CeilToInt((max.x - min.x) + (marginX * 2f)), 1, source.width - x);
        int height = Mathf.Clamp(Mathf.CeilToInt((max.y - min.y) + (marginY * 2f)), 1, source.height - y);

        Texture2D cropped = new Texture2D(width, height, TextureFormat.RGBA32, false);
        cropped.SetPixels(source.GetPixels(x, y, width, height));
        cropped.Apply(false, false);
        return cropped;
    }

    private static bool TryBindRuntime(out string error)
    {
        error = string.Empty;
        handleRealtimeRoomUpdateMethod = typeof(APIManager).GetMethod(
            "HandleRealtimeRoomUpdate",
            BindingFlags.Instance | BindingFlags.NonPublic);
        activePlayerIdField = typeof(APIManager).GetField(
            "activePlayerId",
            BindingFlags.Instance | BindingFlags.NonPublic);
        processedDrawCountField = typeof(APIManager).GetField(
            "processedDrawCount",
            BindingFlags.Instance | BindingFlags.NonPublic);
        activeTicketSetsField = typeof(APIManager).GetField(
            "activeTicketSets",
            BindingFlags.Instance | BindingFlags.NonPublic);
        theme1RealtimeViewModeField = typeof(APIManager).GetField(
            "theme1RealtimeViewMode",
            BindingFlags.Instance | BindingFlags.NonPublic);

        if (handleRealtimeRoomUpdateMethod == null ||
            activePlayerIdField == null ||
            processedDrawCountField == null ||
            activeTicketSetsField == null ||
            theme1RealtimeViewModeField == null)
        {
            error = "Klarte ikke binde APIManager runtime members.";
            return false;
        }

        Theme1GameplayViewRoot viewRoot = UnityEngine.Object.FindFirstObjectByType<Theme1GameplayViewRoot>(FindObjectsInactive.Include);
        if (viewRoot == null)
        {
            error = "Theme1GameplayViewRoot mangler.";
            return false;
        }

        if (!viewRoot.ValidateContract(out string report))
        {
            error = "Ugyldig Theme1GameplayViewRoot:\n" + report;
            return false;
        }

        return true;
    }

    private static CaptureScenario ParseCaptureScenario(string rawScenario)
    {
        if (string.IsNullOrWhiteSpace(rawScenario))
        {
            return CaptureScenario.Win;
        }

        string normalized = rawScenario.Trim().Replace("_", "-").ToLowerInvariant();
        return normalized switch
        {
            "near" => CaptureScenario.NearWin,
            "near-win" => CaptureScenario.NearWin,
            "one-to-go" => CaptureScenario.NearWin,
            "preview" => CaptureScenario.NearWin,
            _ => CaptureScenario.Win
        };
    }

    private static string GetScenarioGameId()
    {
        return captureScenario == CaptureScenario.NearWin
            ? "GAME-VISUAL-NEAR"
            : "GAME-VISUAL-WIN";
    }

    private static IReadOnlyList<int> GetScenarioDraws()
    {
        return captureScenario == CaptureScenario.NearWin
            ? NearWinDraws
            : WinDraws;
    }

    private static JSONNode BuildSnapshot(string gameId, IReadOnlyList<int> draws)
    {
        JSONObject root = new JSONObject();
        root["code"] = "VISUAL";
        root["hallId"] = "hall-visual";
        root["hostPlayerId"] = PlayerId;
        root["players"] = BuildPlayersNode();
        root["preRoundTickets"] = BuildTicketsNode();
        root["currentGame"] = BuildCurrentGameNode(gameId, draws);
        return root;
    }

    private static JSONArray BuildPlayersNode()
    {
        JSONArray players = new JSONArray();
        JSONObject player = new JSONObject();
        player["id"] = PlayerId;
        player["walletId"] = "wallet-visual";
        player["displayName"] = "Visual";
        players.Add(player);
        return players;
    }

    private static JSONObject BuildCurrentGameNode(string gameId, IReadOnlyList<int> draws)
    {
        JSONObject currentGame = new JSONObject();
        currentGame["id"] = gameId;
        currentGame["status"] = "RUNNING";
        currentGame["entryFee"] = GameManager.instance != null ? GameManager.instance.currentBet : 0;
        currentGame["ticketsPerPlayer"] = TicketSets.Count;
        currentGame["tickets"] = BuildTicketsNode();
        JSONArray drawnNumbers = new JSONArray();
        for (int i = 0; draws != null && i < draws.Count; i++)
        {
            drawnNumbers.Add(draws[i]);
        }

        currentGame["drawnNumbers"] = drawnNumbers;
        currentGame["claims"] = new JSONArray();
        return currentGame;
    }

    private static JSONObject BuildTicketsNode()
    {
        JSONArray tickets = new JSONArray();
        for (int i = 0; i < TicketSets.Count; i++)
        {
            JSONObject ticket = new JSONObject();
            JSONArray numbers = new JSONArray();
            for (int numberIndex = 0; numberIndex < TicketSets[i].Length; numberIndex++)
            {
                numbers.Add(TicketSets[i][numberIndex]);
            }

            ticket["numbers"] = numbers;
            tickets.Add(ticket);
        }

        JSONObject byPlayer = new JSONObject();
        byPlayer[PlayerId] = tickets;
        return byPlayer;
    }

    private static string GetCommandLineArgValue(string argumentName, string fallback)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], argumentName, StringComparison.Ordinal))
            {
                return args[i + 1];
            }
        }

        return fallback;
    }

    private static int ParsePositiveInt(string rawValue, int fallback)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return fallback;
        }

        if (!int.TryParse(rawValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out int parsed))
        {
            return fallback;
        }

        return parsed > 0 ? parsed : fallback;
    }

    private static string BuildPath(Transform target)
    {
        if (target == null)
        {
            return string.Empty;
        }

        Stack<string> parts = new Stack<string>();
        Transform current = target;
        while (current != null)
        {
            parts.Push(current.name);
            current = current.parent;
        }

        return string.Join("/", parts);
    }

    private static string ReadText(TMP_Text target)
    {
        return target != null ? (target.text ?? string.Empty) : string.Empty;
    }

    private static void HandleLogMessage(string condition, string stackTrace, LogType type)
    {
        if (!isRunning || type != LogType.Exception)
        {
            return;
        }

        Fail("Exception logged: " + condition);
    }

    private static void HandlePlayModeStateChanged(PlayModeStateChange state)
    {
        if (!isRunning)
        {
            return;
        }

        if (state == PlayModeStateChange.EnteredEditMode)
        {
            Finish();
        }
    }

    private static void Complete()
    {
        if (!EditorApplication.isPlaying)
        {
            Finish();
            return;
        }

        EditorApplication.isPlaying = false;
    }

    private static void Fail(string reason)
    {
        Debug.LogError("[Theme1VisualCapture] FAIL: " + reason);
        if (EditorApplication.isPlaying)
        {
            EditorApplication.isPlaying = false;
            return;
        }

        Finish();
    }

    private static void Finish()
    {
        if (!isRunning)
        {
            return;
        }

        isRunning = false;
        Application.logMessageReceived -= HandleLogMessage;
        EditorApplication.playModeStateChanged -= HandlePlayModeStateChanged;
        EditorApplication.update -= Tick;
        EditorSettings.enterPlayModeOptionsEnabled = previousEnterPlayModeOptionsEnabled;
        EditorSettings.enterPlayModeOptions = previousEnterPlayModeOptions;

        if (shouldExitOnFinish)
        {
            EditorApplication.Exit(0);
        }
    }
}
