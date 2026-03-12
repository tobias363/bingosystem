using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using SimpleJSON;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class CandyRealtimePatternVisualSmoke
{
    private enum SmokeStage
    {
        WaitingForPlayMode,
        InjectNearWin,
        ValidateTicketLabels,
        ValidateNearWin,
        InjectMatchedWin,
        ValidateMatchedWin,
        ValidateSyntheticScenarios,
        Completed,
        Failed
    }

    private const string ScenePath = "Assets/Scenes/Theme1.unity";
    private const string PlayerId = "pattern-smoke-player";
    private const string RoomCode = "SMOKE";
    private const string HallId = "hall-smoke";
    private const double StageTimeoutSeconds = 5.0;

    private static readonly string[] NearWinDraws = { "1", "4", "7", "10" };
    private static readonly string[] MatchedWinDraws = { "1", "4", "7", "10", "13" };
    private static readonly List<int[]> TicketSets = new()
    {
        new[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 },
        new[] { 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 },
        new[] { 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45 },
        new[] { 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60 },
    };
    private static readonly int[] SyntheticTicket = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
    private static readonly int[] SyntheticNearDraws = { 1, 4, 7, 10 };
    private static readonly int[] SyntheticWonAndNearDraws = { 3, 6, 9, 12, 1, 4, 5, 7, 10, 11, 14, 15 };
    private static readonly int[] SyntheticPayoutAmounts = { 100, 200, 300, 400, 500 };
    private static readonly byte[][] SyntheticPatternMasks =
    {
        new byte[] { 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 },
        new byte[] { 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1 },
        new byte[] { 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1 },
        new byte[] { 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1 },
        new byte[] { 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0 }
    };

    private static bool isRunning;
    private static bool shouldExitOnFinish;
    private static SmokeStage stage;
    private static double stageDeadlineAt;
    private static string finishMessage = string.Empty;
    private static string stageObservation = string.Empty;
    private static int exitCode;
    private static bool previousEnterPlayModeOptionsEnabled;
    private static EnterPlayModeOptions previousEnterPlayModeOptions;

    private static MethodInfo handleRealtimeRoomUpdateMethod;
    private static FieldInfo activePlayerIdField;
    private static FieldInfo processedDrawCountField;
    private static FieldInfo activeTicketSetsField;

    [MenuItem("Tools/Candy/Tests/Run Realtime Pattern Visual Smoke")]
    public static void RunFromMenu()
    {
        Start(exitOnFinish: false);
    }

    public static void RunFromCommandLine()
    {
        Start(exitOnFinish: true);
    }

    private static void Start(bool exitOnFinish)
    {
        if (isRunning)
        {
            return;
        }

        SceneAsset sceneAsset = AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath);
        if (sceneAsset == null)
        {
            Debug.LogError($"[PatternSmoke] Scene not found: {ScenePath}");
            if (exitOnFinish)
            {
                EditorApplication.Exit(1);
            }
            return;
        }

        shouldExitOnFinish = exitOnFinish;
        isRunning = true;
        exitCode = 1;
        finishMessage = string.Empty;
        stageObservation = string.Empty;
        stage = SmokeStage.WaitingForPlayMode;
        stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;

        CandyTheme1BindingTools.SetSkipPlayModeValidation(true);

        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        ConfigureSceneForSmoke();

        previousEnterPlayModeOptionsEnabled = EditorSettings.enterPlayModeOptionsEnabled;
        previousEnterPlayModeOptions = EditorSettings.enterPlayModeOptions;
        EditorSettings.enterPlayModeOptionsEnabled = true;
        EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;

        Application.logMessageReceived += HandleLogMessage;
        EditorApplication.playModeStateChanged += HandlePlayModeStateChanged;
        EditorApplication.update += Tick;

        Debug.Log("[PatternSmoke] START");
        EditorApplication.isPlaying = true;
    }

    private static void ConfigureSceneForSmoke()
    {
        APIManager apiManager = UnityEngine.Object.FindFirstObjectByType<APIManager>(FindObjectsInactive.Include);
        if (apiManager != null)
        {
            SerializedObject so = new SerializedObject(apiManager);
            SetSerializedBool(so, "useRealtimeBackend", true);
            SetSerializedBool(so, "joinOrCreateOnStart", false);
            SetSerializedBool(so, "triggerAutoLoginWhenAuthMissing", false);
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        BingoAutoLogin autoLogin = UnityEngine.Object.FindFirstObjectByType<BingoAutoLogin>(FindObjectsInactive.Include);
        if (autoLogin != null)
        {
            SerializedObject so = new SerializedObject(autoLogin);
            SetSerializedBool(so, "autoLoginOnStart", false);
            SetSerializedBool(so, "autoConnectAndJoin", false);
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        BingoRealtimeClient realtimeClient = UnityEngine.Object.FindFirstObjectByType<BingoRealtimeClient>(FindObjectsInactive.Include);
        if (realtimeClient != null)
        {
            SerializedObject so = new SerializedObject(realtimeClient);
            SetSerializedBool(so, "autoConnectOnStart", false);
            so.ApplyModifiedPropertiesWithoutUndo();
        }
    }

    private static void Tick()
    {
        if (!isRunning)
        {
            return;
        }

        if (stage == SmokeStage.Completed || stage == SmokeStage.Failed)
        {
            return;
        }

        if (!EditorApplication.isPlaying)
        {
            return;
        }

        if (EditorApplication.timeSinceStartup > stageDeadlineAt)
        {
            Fail(string.IsNullOrWhiteSpace(stageObservation)
                ? $"stage timeout: {stage}"
                : $"stage timeout: {stage} ({stageObservation})");
            return;
        }

        switch (stage)
        {
            case SmokeStage.WaitingForPlayMode:
                if (!TryBindRuntimeMembers(out string bindError))
                {
                    Fail(bindError);
                    return;
                }

                stage = SmokeStage.InjectNearWin;
                stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
                break;

            case SmokeStage.InjectNearWin:
                if (!TryInjectSnapshot("GAME-NEAR", NearWinDraws, out string nearInjectError))
                {
                    Fail(nearInjectError);
                    return;
                }

                stage = SmokeStage.ValidateTicketLabels;
                stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
                break;

            case SmokeStage.ValidateTicketLabels:
                if (TryValidateTicketLabels(out string ticketError))
                {
                    stage = SmokeStage.ValidateNearWin;
                    stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
                }
                else if (!string.IsNullOrEmpty(ticketError))
                {
                    Fail(ticketError);
                }
                break;

            case SmokeStage.ValidateNearWin:
                if (TryValidateNearWinVisuals(out string nearError))
                {
                    stage = SmokeStage.InjectMatchedWin;
                    stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
                }
                else if (!string.IsNullOrEmpty(nearError))
                {
                    Fail(nearError);
                }
                break;

            case SmokeStage.InjectMatchedWin:
                if (!TryInjectSnapshot("GAME-WIN", MatchedWinDraws, out string matchedInjectError))
                {
                    Fail(matchedInjectError);
                    return;
                }

                stage = SmokeStage.ValidateMatchedWin;
                stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
                break;

            case SmokeStage.ValidateMatchedWin:
                if (TryValidateMatchedVisuals(out string matchedError))
                {
                    stage = SmokeStage.ValidateSyntheticScenarios;
                    stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
                }
                else if (!string.IsNullOrEmpty(matchedError))
                {
                    Fail(matchedError);
                }
                break;

            case SmokeStage.ValidateSyntheticScenarios:
                if (TryValidateSyntheticPatternVisuals(out string syntheticError))
                {
                    Complete("near-win, matched, multi-pattern, and stacked-label visuals verified");
                }
                else if (!string.IsNullOrEmpty(syntheticError))
                {
                    Fail(syntheticError);
                }
                break;
        }
    }

    private static bool TryBindRuntimeMembers(out string error)
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

        if (handleRealtimeRoomUpdateMethod == null ||
            activePlayerIdField == null ||
            processedDrawCountField == null ||
            activeTicketSetsField == null)
        {
            error = "[PatternSmoke] Failed to bind APIManager private runtime members.";
            return false;
        }

        APIManager apiManager = UnityEngine.Object.FindFirstObjectByType<APIManager>(FindObjectsInactive.Include);
        NumberGenerator generator = UnityEngine.Object.FindFirstObjectByType<NumberGenerator>(FindObjectsInactive.Include);
        TopperManager topperManager = UnityEngine.Object.FindFirstObjectByType<TopperManager>(FindObjectsInactive.Include);
        UIManager uiManager = UnityEngine.Object.FindFirstObjectByType<UIManager>(FindObjectsInactive.Include);
        if (apiManager == null || generator == null || topperManager == null || uiManager == null)
        {
            error = "[PatternSmoke] Missing APIManager, NumberGenerator, TopperManager or UIManager in scene.";
            return false;
        }

        if (!TryValidateVisibleGameplayControls(uiManager, out error))
        {
            return false;
        }

        return true;
    }

    private static bool TryInjectSnapshot(string gameId, IEnumerable<string> draws, out string error)
    {
        error = string.Empty;

        APIManager apiManager = UnityEngine.Object.FindFirstObjectByType<APIManager>(FindObjectsInactive.Include);
        if (apiManager == null)
        {
            error = "[PatternSmoke] APIManager missing in play mode.";
            return false;
        }

        ResetVisualState();

        activePlayerIdField.SetValue(apiManager, PlayerId);
        processedDrawCountField.SetValue(apiManager, 0);
        activeTicketSetsField.SetValue(apiManager, new List<List<int>>());

        handleRealtimeRoomUpdateMethod.Invoke(apiManager, new object[] { BuildSnapshot(gameId, draws) });
        return true;
    }

    private static void ResetVisualState()
    {
        NumberGenerator generator = UnityEngine.Object.FindFirstObjectByType<NumberGenerator>(FindObjectsInactive.Include);
        TopperManager topperManager = UnityEngine.Object.FindFirstObjectByType<TopperManager>(FindObjectsInactive.Include);
        if (generator != null)
        {
            MethodInfo resetNumbMethod = typeof(NumberGenerator).GetMethod(
                "ResetNumb",
                BindingFlags.Instance | BindingFlags.NonPublic);
            resetNumbMethod?.Invoke(generator, null);
            generator.ClearPaylineVisuals();
        }

        if (topperManager != null)
        {
            MethodInfo resetMethod = typeof(TopperManager).GetMethod(
                "Reset",
                BindingFlags.Instance | BindingFlags.NonPublic);
            resetMethod?.Invoke(topperManager, null);
        }
    }

    private static JSONNode BuildSnapshot(string gameId, IEnumerable<string> draws)
    {
        JSONObject snapshot = new JSONObject();
        snapshot["code"] = RoomCode;
        snapshot["hallId"] = HallId;
        snapshot["hostPlayerId"] = PlayerId;

        JSONObject currentGame = new JSONObject();
        currentGame["id"] = gameId;
        currentGame["status"] = "RUNNING";
        currentGame["entryFee"] = 8;
        currentGame["ticketsPerPlayer"] = TicketSets.Count;
        currentGame["claims"] = BuildClaims(gameId);

        JSONArray drawnNumbers = new JSONArray();
        foreach (string draw in draws)
        {
            drawnNumbers.Add(draw);
        }
        currentGame["drawnNumbers"] = drawnNumbers;

        JSONObject ticketsByPlayer = new JSONObject();
        JSONArray ticketArray = new JSONArray();
        for (int i = 0; i < TicketSets.Count; i++)
        {
            JSONArray numbers = new JSONArray();
            JSONArray grid = new JSONArray();
            int[] ticket = TicketSets[i];
            for (int cellIndex = 0; cellIndex < ticket.Length; cellIndex++)
            {
                numbers.Add(ticket[cellIndex]);
            }

            for (int row = 0; row < 3; row++)
            {
                JSONArray rowValues = new JSONArray();
                for (int column = 0; column < 5; column++)
                {
                    rowValues.Add(ticket[(column * 3) + row]);
                }

                grid.Add(rowValues);
            }

            JSONObject ticketNode = new JSONObject();
            ticketNode["numbers"] = numbers;
            ticketNode["grid"] = grid;
            ticketArray.Add(ticketNode);
        }

        ticketsByPlayer[PlayerId] = ticketArray;
        currentGame["tickets"] = ticketsByPlayer;
        snapshot["currentGame"] = currentGame;
        return snapshot;
    }

    private static JSONArray BuildClaims(string gameId)
    {
        JSONArray claims = new JSONArray();
        if (!string.Equals(gameId, "GAME-WIN", StringComparison.Ordinal))
        {
            return claims;
        }

        JSONObject claim = new JSONObject();
        claim["id"] = gameId + "-claim";
        claim["playerId"] = PlayerId;
        claim["type"] = "LINE";
        claim["valid"] = true;
        claim["patternIndex"] = 0;
        claim["winningPatternIndex"] = 0;
        claims.Add(claim);
        return claims;
    }

    private static bool TryValidateVisibleGameplayControls(UIManager uiManager, out string error)
    {
        error = string.Empty;
        if (uiManager == null)
        {
            error = "[PatternSmoke] UIManager missing while validating gameplay controls.";
            return false;
        }

        List<string> issues = new();
        ValidateButton(uiManager.playBtn, "playBtn", issues);
        ValidateButton(uiManager.autoPlayBtn, "autoPlayBtn", issues, required: false);
        ValidateButton(uiManager.betUp, "betUp", issues);
        ValidateButton(uiManager.betDown, "betDown", issues);

        if (issues.Count == 0)
        {
            return true;
        }

        error = "[PatternSmoke] Gameplay controls hidden or invalid: " + string.Join("; ", issues);
        return false;
    }

    private static void ValidateButton(UnityEngine.UI.Button button, string label, List<string> issues, bool required = true)
    {
        if (button == null)
        {
            if (required)
            {
                issues.Add($"{label}=null");
            }
            return;
        }

        if (!button.gameObject.activeInHierarchy)
        {
            if (required)
            {
                issues.Add($"{label} inactive");
            }
            return;
        }

        UnityEngine.UI.Image image = button.GetComponent<UnityEngine.UI.Image>();
        if (image == null || !image.enabled)
        {
            issues.Add($"{label} image missing");
        }
    }

    private static bool TryValidateTicketLabels(out string error)
    {
        error = string.Empty;

        NumberGenerator generator = UnityEngine.Object.FindFirstObjectByType<NumberGenerator>(FindObjectsInactive.Include);
        if (generator == null || generator.cardClasses == null)
        {
            error = "[PatternSmoke] NumberGenerator/cardClasses missing while validating ticket labels.";
            return false;
        }

        int expectedLabelCount = generator.cardClasses.Length * 15;
        int visiblePopulatedLabels = 0;
        for (int cardIndex = 0; cardIndex < generator.cardClasses.Length; cardIndex++)
        {
            CardClass card = generator.cardClasses[cardIndex];
            if (card == null || card.num_text == null)
            {
                continue;
            }

            for (int cellIndex = 0; cellIndex < card.num_text.Count; cellIndex++)
            {
                if (IsVisiblePopulatedLabel(card.num_text[cellIndex]))
                {
                    visiblePopulatedLabels += 1;
                }
            }
        }

        if (visiblePopulatedLabels < expectedLabelCount)
        {
            return false;
        }

        return
            DoesCardLabelMatch(generator, 0, 0, "1") &&
            DoesCardLabelMatch(generator, 0, 14, "15") &&
            DoesCardLabelMatch(generator, 3, 0, "46");
    }

    private static bool IsVisiblePopulatedLabel(TextMeshProUGUI label)
    {
        if (label == null || !label.enabled || !label.gameObject.activeInHierarchy || label.alpha <= 0.01f)
        {
            return false;
        }

        string value = (label.text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value) || string.Equals(value, "-", StringComparison.Ordinal))
        {
            return false;
        }

        label.ForceMeshUpdate(ignoreActiveState: true, forceTextReparsing: false);
        return label.textInfo != null && label.textInfo.characterCount > 0;
    }

    private static bool DoesCardLabelMatch(NumberGenerator generator, int cardIndex, int cellIndex, string expected)
    {
        if (generator == null ||
            generator.cardClasses == null ||
            cardIndex < 0 ||
            cardIndex >= generator.cardClasses.Length)
        {
            return false;
        }

        CardClass card = generator.cardClasses[cardIndex];
        if (card == null || card.num_text == null || cellIndex < 0 || cellIndex >= card.num_text.Count)
        {
            return false;
        }

        TextMeshProUGUI label = card.num_text[cellIndex];
        return label != null && string.Equals((label.text ?? string.Empty).Trim(), expected, StringComparison.Ordinal);
    }

    private static bool TryValidateNearWinVisuals(out string error)
    {
        error = string.Empty;

        TopperManager topperManager = UnityEngine.Object.FindFirstObjectByType<TopperManager>(FindObjectsInactive.Include);
        NumberGenerator generator = UnityEngine.Object.FindFirstObjectByType<NumberGenerator>(FindObjectsInactive.Include);
        if (topperManager == null || generator == null)
        {
            error = "[PatternSmoke] Missing runtime objects while validating near-win visuals.";
            return false;
        }

        int activeNearWins = GetPrivateCollectionCount(topperManager, "activeNearWins");
        bool missingBlinkVisible = GetPrivateBoolField(topperManager, "missingBlinkVisible");
        int activeHeaderCells = CountActiveHeaderNearWinCells(topperManager);
        int activeCardCells = CountActiveCardNearWinCells(generator);

        if (activeNearWins > 0 &&
            missingBlinkVisible &&
            activeHeaderCells > 0 &&
            activeCardCells > 0 &&
            TryValidateTicketLabels(out _))
        {
            return true;
        }

        return false;
    }

    private static bool TryValidateMatchedVisuals(out string error)
    {
        error = string.Empty;

        Theme1GameplayViewRoot viewRoot = UnityEngine.Object.FindFirstObjectByType<Theme1GameplayViewRoot>(FindObjectsInactive.Include);
        NumberGenerator generator = UnityEngine.Object.FindFirstObjectByType<NumberGenerator>(FindObjectsInactive.Include);
        if (viewRoot == null || generator == null)
        {
            error = "[PatternSmoke] Missing Theme1GameplayViewRoot or NumberGenerator while validating matched visuals.";
            return false;
        }

        Theme1CardGridView cardView = viewRoot.Cards != null && viewRoot.Cards.Length > 0 ? viewRoot.Cards[0] : null;
        if (cardView == null)
        {
            error = "[PatternSmoke] Theme1 matched-win validation missing first card view.";
            return false;
        }

        int activeTheme1Paylines = CountActivePaylines(viewRoot);
        int activeLegacyPaylines = CountActivePaylines(generator);
        bool hasMatchedCells =
            UsesCellSprite(cardView, 0, Theme1RuntimeShapeCatalog.GetHighlightCellGradientSprite()) &&
            UsesCellSprite(cardView, 3, Theme1RuntimeShapeCatalog.GetHighlightCellGradientSprite()) &&
            UsesCellSprite(cardView, 6, Theme1RuntimeShapeCatalog.GetHighlightCellGradientSprite()) &&
            UsesCellSprite(cardView, 9, Theme1RuntimeShapeCatalog.GetHighlightCellGradientSprite()) &&
            UsesCellSprite(cardView, 12, Theme1RuntimeShapeCatalog.GetPrizeCellGradientSprite());
        bool hasPrizeLabel = GetVisiblePrizeLabels(cardView.Cells[12]).Count > 0;
        stageObservation =
            $"matchedCells={hasMatchedCells} prizeLabel={hasPrizeLabel} theme1Paylines={activeTheme1Paylines} legacyPaylines={activeLegacyPaylines}";

        if (hasMatchedCells &&
            hasPrizeLabel &&
            activeLegacyPaylines == 0)
        {
            return true;
        }

        if (hasMatchedCells && hasPrizeLabel && activeLegacyPaylines > 0)
        {
            error = $"[PatternSmoke] Legacy paylines remained visible after a matched win: legacy={activeLegacyPaylines}, theme1={activeTheme1Paylines}.";
            return false;
        }

        return false;
    }

    private static bool TryValidateSyntheticPatternVisuals(out string error)
    {
        error = string.Empty;

        Theme1GameplayViewRoot viewRoot = UnityEngine.Object.FindFirstObjectByType<Theme1GameplayViewRoot>(FindObjectsInactive.Include);
        if (viewRoot == null)
        {
            error = "[PatternSmoke] Theme1GameplayViewRoot missing while validating synthetic Theme1 scenarios.";
            return false;
        }

        if (!TryValidateSyntheticNearScenario(viewRoot, out error))
        {
            return false;
        }

        if (!TryValidateSyntheticWonAndNearScenario(viewRoot, out error))
        {
            return false;
        }

        if (!TryValidateLegacyPaylinesAreIgnored(viewRoot, out error))
        {
            return false;
        }

        return true;
    }

    private static bool TryValidateSyntheticNearScenario(Theme1GameplayViewRoot viewRoot, out string error)
    {
        error = string.Empty;
        Theme1RoundRenderState state = BuildSyntheticPatternState(SyntheticNearDraws);
        if (state.Cards == null || state.Cards.Length == 0 || state.Cards[0] == null)
        {
            error = "[PatternSmoke] Synthetic near scenario did not produce a card state.";
            return false;
        }

        Theme1CardRenderState cardState = state.Cards[0];
        if (cardState.CompletedPatterns.Length != 0)
        {
            error = $"[PatternSmoke] Synthetic near scenario expected 0 completed patterns, got {cardState.CompletedPatterns.Length}.";
            return false;
        }

        if (cardState.ActiveNearPattern == null || cardState.ActiveNearPattern.RawPatternIndex != 4)
        {
            error = "[PatternSmoke] Synthetic near scenario did not keep pattern 4 as active near pattern.";
            return false;
        }

        RenderSyntheticState(viewRoot, state);
        Theme1CardGridView cardView = viewRoot.Cards != null && viewRoot.Cards.Length > 0 ? viewRoot.Cards[0] : null;
        if (cardView == null)
        {
            error = "[PatternSmoke] Synthetic near scenario missing card view.";
            return false;
        }

        int[] expectedNearHitCells = { 0, 3, 6, 9 };
        for (int i = 0; i < expectedNearHitCells.Length; i++)
        {
            int cellIndex = expectedNearHitCells[i];
            if (!UsesCellSprite(cardView, cellIndex, Theme1RuntimeShapeCatalog.GetHighlightCellGradientSprite()))
            {
                error = $"[PatternSmoke] Near-hit cell {cellIndex} did not render with the dark purple highlight sprite.";
                return false;
            }
        }

        if (!UsesCellSprite(cardView, 12, Theme1RuntimeShapeCatalog.GetPrizeCellGradientSprite()))
        {
            error = "[PatternSmoke] Near-target cell 12 did not render with the yellow prize sprite.";
            return false;
        }

        List<TextMeshProUGUI> nearLabels = GetVisiblePrizeLabels(cardView.Cells[12]);
        if (nearLabels.Count != 1 || !string.Equals((nearLabels[0].text ?? string.Empty).Trim(), "500 kr", StringComparison.Ordinal))
        {
            error = $"[PatternSmoke] Near-target cell expected one '500 kr' label, got [{string.Join(", ", GetPrizeLabelTexts(nearLabels))}].";
            return false;
        }

        if (CountActivePaylines(cardView) != 0)
        {
            error = "[PatternSmoke] Near-only scenario activated completed-pattern overlays.";
            return false;
        }

        return true;
    }

    private static bool TryValidateSyntheticWonAndNearScenario(Theme1GameplayViewRoot viewRoot, out string error)
    {
        error = string.Empty;
        Theme1RoundRenderState state = BuildSyntheticPatternState(SyntheticWonAndNearDraws);
        if (state.Cards == null || state.Cards.Length == 0 || state.Cards[0] == null)
        {
            error = "[PatternSmoke] Synthetic won+near scenario did not produce a card state.";
            return false;
        }

        Theme1CardRenderState cardState = state.Cards[0];
        if (cardState.CompletedPatterns == null || cardState.CompletedPatterns.Length != 4)
        {
            error = $"[PatternSmoke] Synthetic won+near scenario expected 4 completed patterns, got {cardState.CompletedPatterns?.Length ?? 0}.";
            return false;
        }

        if (cardState.ActiveNearPattern == null || cardState.ActiveNearPattern.RawPatternIndex != 4)
        {
            error = "[PatternSmoke] Synthetic won+near scenario lost the active near pattern.";
            return false;
        }

        RenderSyntheticState(viewRoot, state);
        Theme1CardGridView cardView = viewRoot.Cards != null && viewRoot.Cards.Length > 0 ? viewRoot.Cards[0] : null;
        if (cardView == null)
        {
            error = "[PatternSmoke] Synthetic won+near scenario missing card view.";
            return false;
        }

        if (CountActivePaylines(cardView) != 4)
        {
            error = $"[PatternSmoke] Synthetic won+near scenario expected 4 active completed-pattern overlays, got {CountActivePaylines(cardView)}.";
            return false;
        }

        int[] expectedPurpleCells = { 0, 3, 6, 9, 14 };
        for (int i = 0; i < expectedPurpleCells.Length; i++)
        {
            int cellIndex = expectedPurpleCells[i];
            if (cellIndex == 14)
            {
                continue;
            }

            if (!UsesCellSprite(cardView, cellIndex, Theme1RuntimeShapeCatalog.GetHighlightCellGradientSprite()))
            {
                error = $"[PatternSmoke] Won+near scenario cell {cellIndex} did not keep the dark purple highlight sprite.";
                return false;
            }
        }

        if (!UsesCellSprite(cardView, 12, Theme1RuntimeShapeCatalog.GetPrizeCellGradientSprite()))
        {
            error = "[PatternSmoke] Won+near scenario target cell 12 did not stay yellow.";
            return false;
        }

        if (!UsesCellSprite(cardView, 14, Theme1RuntimeShapeCatalog.GetPrizeCellGradientSprite()))
        {
            error = "[PatternSmoke] Won+near scenario trigger cell 14 did not render as a prize cell.";
            return false;
        }

        List<TextMeshProUGUI> wonLabels = GetVisiblePrizeLabels(cardView.Cells[14]);
        string[] expectedWonLabels = { "400 kr", "300 kr", "200 kr", "100 kr" };
        if (wonLabels.Count != expectedWonLabels.Length)
        {
            error = $"[PatternSmoke] Expected {expectedWonLabels.Length} stacked labels on trigger cell 14, got {wonLabels.Count}.";
            return false;
        }

        for (int i = 0; i < expectedWonLabels.Length; i++)
        {
            string actual = (wonLabels[i].text ?? string.Empty).Trim();
            if (!string.Equals(actual, expectedWonLabels[i], StringComparison.Ordinal))
            {
                error = $"[PatternSmoke] Trigger cell 14 label {i} expected '{expectedWonLabels[i]}' but got '{actual}'.";
                return false;
            }

            if (i > 0 &&
                wonLabels[i - 1].rectTransform.anchoredPosition.y <= wonLabels[i].rectTransform.anchoredPosition.y)
            {
                error = "[PatternSmoke] Trigger cell 14 labels were not stacked downward in deterministic order.";
                return false;
            }
        }

        if (!UsesBottomRightAnchor(wonLabels))
        {
            error = "[PatternSmoke] Trigger cell 14 labels did not preserve right-column anchoring.";
            return false;
        }

        List<TextMeshProUGUI> nearLabels = GetVisiblePrizeLabels(cardView.Cells[12]);
        if (nearLabels.Count != 1 || !string.Equals((nearLabels[0].text ?? string.Empty).Trim(), "500 kr", StringComparison.Ordinal))
        {
            error = $"[PatternSmoke] Won+near target cell expected one '500 kr' label, got [{string.Join(", ", GetPrizeLabelTexts(nearLabels))}].";
            return false;
        }

        return true;
    }

    private static bool TryValidateLegacyPaylinesAreIgnored(Theme1GameplayViewRoot viewRoot, out string error)
    {
        error = string.Empty;
        Theme1RoundRenderState state = BuildSyntheticPatternState(Array.Empty<int>());
        if (state.Cards == null || state.Cards.Length == 0 || state.Cards[0] == null)
        {
            error = "[PatternSmoke] Synthetic legacy-payline scenario did not produce a card state.";
            return false;
        }

        Theme1CardRenderState cardState = state.Cards[0];
        int paylineCount = viewRoot.Cards != null &&
                           viewRoot.Cards.Length > 0 &&
                           viewRoot.Cards[0] != null &&
                           viewRoot.Cards[0].PaylineObjects != null
            ? viewRoot.Cards[0].PaylineObjects.Length
            : 0;
        cardState.PaylinesActive = new bool[Mathf.Max(1, paylineCount)];
        cardState.PaylinesActive[0] = true;
        cardState.CompletedPatterns = Array.Empty<Theme1CompletedPatternRenderState>();

        RenderSyntheticState(viewRoot, state);
        Theme1CardGridView cardView = viewRoot.Cards != null && viewRoot.Cards.Length > 0 ? viewRoot.Cards[0] : null;
        if (cardView == null)
        {
            error = "[PatternSmoke] Synthetic legacy-payline scenario missing card view.";
            return false;
        }

        if (CountActivePaylines(cardView) != 0)
        {
            error = "[PatternSmoke] PaylinesActive still produced visible overlays without CompletedPatterns.";
            return false;
        }

        return true;
    }

    private static Theme1RoundRenderState BuildSyntheticPatternState(IReadOnlyList<int> drawnNumbers)
    {
        Theme1StateBuildInput input = new Theme1StateBuildInput
        {
            GameId = "GAME-SYNTHETIC",
            CardSlotCount = 1,
            BallSlotCount = drawnNumbers != null ? drawnNumbers.Count : 0,
            TicketSets = new[] { (int[])SyntheticTicket.Clone() },
            DrawnNumbers = drawnNumbers != null ? ToArray(drawnNumbers) : Array.Empty<int>(),
            ActivePatternIndexes = new[] { 0, 1, 2, 3, 4 },
            PreferredNearPatternIndexesByCard = new[] { 4 },
            PatternMasks = SyntheticPatternMasks,
            CardHeaderLabels = new[] { GameManager.FormatTheme1CardHeaderLabel(0) },
            CardBetLabels = new[] { GameManager.FormatTheme1CardStakeLabel(4) },
            CardWinLabels = new[] { string.Empty },
            TopperPrizeLabels = BuildSyntheticTopperPrizeLabels(),
            TopperPayoutAmounts = (int[])SyntheticPayoutAmounts.Clone(),
            CreditLabel = "1 000",
            WinningsLabel = "0",
            BetLabel = "4"
        };

        return new Theme1StateBuilder().Build(input);
    }

    private static string[] BuildSyntheticTopperPrizeLabels()
    {
        string[] labels = new string[SyntheticPayoutAmounts.Length];
        for (int i = 0; i < labels.Length; i++)
        {
            labels[i] = GameManager.FormatKrAmount(SyntheticPayoutAmounts[i]);
        }

        return labels;
    }

    private static int[] ToArray(IReadOnlyList<int> source)
    {
        if (source == null || source.Count == 0)
        {
            return Array.Empty<int>();
        }

        int[] values = new int[source.Count];
        for (int i = 0; i < source.Count; i++)
        {
            values[i] = source[i];
        }

        return values;
    }

    private static void RenderSyntheticState(Theme1GameplayViewRoot viewRoot, Theme1RoundRenderState state)
    {
        new Theme1RealtimePresenter().Render(viewRoot, state);
        Canvas.ForceUpdateCanvases();
    }

    private static bool UsesCellSprite(Theme1CardGridView cardView, int cellIndex, Sprite expectedSprite)
    {
        if (cardView?.Cells == null ||
            cellIndex < 0 ||
            cellIndex >= cardView.Cells.Length ||
            cardView.Cells[cellIndex] == null ||
            cardView.Cells[cellIndex].Background == null)
        {
            return false;
        }

        return cardView.Cells[cellIndex].Background.sprite == expectedSprite;
    }

    private static int CountActivePaylines(Theme1CardGridView cardView)
    {
        if (cardView?.PaylineObjects == null)
        {
            return 0;
        }

        int active = 0;
        for (int i = 0; i < cardView.PaylineObjects.Length; i++)
        {
            GameObject payline = cardView.PaylineObjects[i];
            if (payline != null && payline.activeInHierarchy)
            {
                active += 1;
            }
        }

        return active;
    }

    private static int CountActivePaylines(Theme1GameplayViewRoot viewRoot)
    {
        if (viewRoot?.Cards == null)
        {
            return 0;
        }

        int active = 0;
        for (int cardIndex = 0; cardIndex < viewRoot.Cards.Length; cardIndex++)
        {
            active += CountActivePaylines(viewRoot.Cards[cardIndex]);
        }

        return active;
    }

    private static List<TextMeshProUGUI> GetVisiblePrizeLabels(Theme1CardCellView cellView)
    {
        List<TextMeshProUGUI> labels = new();
        if (cellView?.CellRoot == null)
        {
            return labels;
        }

        TextMeshProUGUI[] texts = cellView.CellRoot.GetComponentsInChildren<TextMeshProUGUI>(true);
        for (int i = 0; i < texts.Length; i++)
        {
            TextMeshProUGUI label = texts[i];
            if (label == null ||
                !label.gameObject.activeInHierarchy ||
                !label.enabled ||
                label.alpha <= 0.01f)
            {
                continue;
            }

            string name = label.name ?? string.Empty;
            bool isPrizeLabel =
                string.Equals(name, Theme1GameplayViewRepairUtils.CardCellPrizeLabelName, StringComparison.Ordinal) ||
                name.StartsWith(Theme1GameplayViewRepairUtils.CardCellPrizeLabelName + "_", StringComparison.Ordinal);
            if (!isPrizeLabel)
            {
                continue;
            }

            string text = (label.text ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            labels.Add(label);
        }

        labels.Sort((left, right) => right.rectTransform.anchoredPosition.y.CompareTo(left.rectTransform.anchoredPosition.y));
        return labels;
    }

    private static IEnumerable<string> GetPrizeLabelTexts(IReadOnlyList<TextMeshProUGUI> labels)
    {
        for (int i = 0; i < labels.Count; i++)
        {
            yield return (labels[i].text ?? string.Empty).Trim();
        }
    }

    private static bool UsesBottomRightAnchor(IReadOnlyList<TextMeshProUGUI> labels)
    {
        if (labels == null || labels.Count == 0)
        {
            return false;
        }

        for (int i = 0; i < labels.Count; i++)
        {
            RectTransform rect = labels[i].rectTransform;
            if (rect.anchorMin != new Vector2(1f, 0f) ||
                rect.anchorMax != new Vector2(1f, 0f) ||
                rect.pivot != new Vector2(1f, 0f))
            {
                return false;
            }
        }

        return true;
    }

    private static int CountActiveHeaderNearWinCells(TopperManager topperManager)
    {
        if (topperManager == null || topperManager.missedPattern == null)
        {
            return 0;
        }

        int active = 0;
        for (int i = 0; i < topperManager.missedPattern.Count; i++)
        {
            GameObject group = topperManager.missedPattern[i];
            if (group == null)
            {
                continue;
            }

            foreach (Transform child in group.transform)
            {
                if (child != null && child.gameObject.activeInHierarchy)
                {
                    active += 1;
                }
            }
        }

        return active;
    }

    private static int CountActiveCardNearWinCells(NumberGenerator generator)
    {
        if (generator == null || generator.cardClasses == null)
        {
            return 0;
        }

        int active = 0;
        for (int cardIndex = 0; cardIndex < generator.cardClasses.Length; cardIndex++)
        {
            CardClass card = generator.cardClasses[cardIndex];
            if (card == null || card.missingPatternImg == null)
            {
                continue;
            }

            for (int cellIndex = 0; cellIndex < card.missingPatternImg.Count; cellIndex++)
            {
                GameObject missingCell = card.missingPatternImg[cellIndex];
                if (missingCell != null && missingCell.activeInHierarchy)
                {
                    active += 1;
                }
            }
        }

        return active;
    }

    private static int CountActivePaylines(NumberGenerator generator)
    {
        if (generator == null || generator.cardClasses == null)
        {
            return 0;
        }

        int active = 0;
        for (int cardIndex = 0; cardIndex < generator.cardClasses.Length; cardIndex++)
        {
            CardClass card = generator.cardClasses[cardIndex];
            if (card == null || card.paylineObj == null)
            {
                continue;
            }

            for (int patternIndex = 0; patternIndex < card.paylineObj.Count; patternIndex++)
            {
                GameObject paylineObject = card.paylineObj[patternIndex];
                if (paylineObject != null && paylineObject.activeInHierarchy)
                {
                    active += 1;
                }
            }
        }

        return active;
    }

    private static int CountActiveObjects(IList<GameObject> objects)
    {
        if (objects == null)
        {
            return 0;
        }

        int active = 0;
        for (int i = 0; i < objects.Count; i++)
        {
            if (objects[i] != null && objects[i].activeInHierarchy)
            {
                active += 1;
            }
        }

        return active;
    }

    private static int GetPrivateCollectionCount(object target, string fieldName)
    {
        if (target == null)
        {
            return 0;
        }

        FieldInfo field = target.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.NonPublic);
        if (field == null)
        {
            return 0;
        }

        object value = field.GetValue(target);
        if (value == null)
        {
            return 0;
        }

        PropertyInfo countProperty = value.GetType().GetProperty("Count", BindingFlags.Public | BindingFlags.Instance);
        if (countProperty == null || countProperty.PropertyType != typeof(int))
        {
            return 0;
        }

        return (int)countProperty.GetValue(value);
    }

    private static bool GetPrivateBoolField(object target, string fieldName)
    {
        if (target == null)
        {
            return false;
        }

        FieldInfo field = target.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.NonPublic);
        return field != null && field.FieldType == typeof(bool) && (bool)field.GetValue(target);
    }

    private static void Complete(string message)
    {
        exitCode = 0;
        finishMessage = message;
        stage = SmokeStage.Completed;
        RequestFinish();
    }

    private static void Fail(string message)
    {
        exitCode = 1;
        finishMessage = message;
        stage = SmokeStage.Failed;
        RequestFinish();
    }

    private static void RequestFinish()
    {
        if (EditorApplication.isPlaying)
        {
            EditorApplication.isPlaying = false;
        }
        else
        {
            CleanupAndExit();
        }
    }

    private static void HandlePlayModeStateChanged(PlayModeStateChange state)
    {
        if (!isRunning)
        {
            return;
        }

        if (state == PlayModeStateChange.EnteredEditMode)
        {
            CleanupAndExit();
        }
    }

    private static void CleanupAndExit()
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
        CandyTheme1BindingTools.SetSkipPlayModeValidation(false);

        string status = exitCode == 0 ? "PASS" : "FAIL";
        Debug.Log($"[PatternSmoke] RESULT status={status} message=\"{finishMessage}\"");

        if (shouldExitOnFinish)
        {
            EditorApplication.Exit(exitCode);
        }
    }

    private static void HandleLogMessage(string condition, string stacktrace, LogType type)
    {
        if (type == LogType.Exception)
        {
            Fail("[PatternSmoke] Exception observed in log: " + condition);
        }
    }

    private static void SetSerializedBool(SerializedObject serializedObject, string propertyName, bool value)
    {
        if (serializedObject == null)
        {
            return;
        }

        SerializedProperty property = serializedObject.FindProperty(propertyName);
        if (property != null && property.propertyType == SerializedPropertyType.Boolean)
        {
            property.boolValue = value;
        }
    }
}
