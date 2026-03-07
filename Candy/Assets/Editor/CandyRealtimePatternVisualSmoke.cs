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

    private static bool isRunning;
    private static bool shouldExitOnFinish;
    private static SmokeStage stage;
    private static double stageDeadlineAt;
    private static string finishMessage = string.Empty;
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
            Fail($"stage timeout: {stage}");
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
                    Complete("near-win and matched payline visuals verified");
                }
                else if (!string.IsNullOrEmpty(matchedError))
                {
                    Fail(matchedError);
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
        currentGame["claims"] = new JSONArray();

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
            int[] ticket = TicketSets[i];
            for (int cellIndex = 0; cellIndex < ticket.Length; cellIndex++)
            {
                numbers.Add(ticket[cellIndex]);
            }

            JSONObject ticketNode = new JSONObject();
            ticketNode["numbers"] = numbers;
            ticketArray.Add(ticketNode);
        }

        ticketsByPlayer[PlayerId] = ticketArray;
        currentGame["tickets"] = ticketsByPlayer;
        snapshot["currentGame"] = currentGame;
        return snapshot;
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
        ValidateButton(uiManager.autoPlayBtn, "autoPlayBtn", issues);
        ValidateButton(uiManager.betUp, "betUp", issues);
        ValidateButton(uiManager.betDown, "betDown", issues);

        if (issues.Count == 0)
        {
            return true;
        }

        error = "[PatternSmoke] Gameplay controls hidden or invalid: " + string.Join("; ", issues);
        return false;
    }

    private static void ValidateButton(UnityEngine.UI.Button button, string label, List<string> issues)
    {
        if (button == null)
        {
            issues.Add($"{label}=null");
            return;
        }

        if (!button.gameObject.activeInHierarchy)
        {
            issues.Add($"{label} inactive");
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

        TopperManager topperManager = UnityEngine.Object.FindFirstObjectByType<TopperManager>(FindObjectsInactive.Include);
        NumberGenerator generator = UnityEngine.Object.FindFirstObjectByType<NumberGenerator>(FindObjectsInactive.Include);
        if (topperManager == null || generator == null)
        {
            error = "[PatternSmoke] Missing runtime objects while validating matched visuals.";
            return false;
        }

        int activeMatchedPatterns = GetPrivateCollectionCount(topperManager, "activeMatchedPatternIndexes");
        int activeMatchedHeaders = CountActiveObjects(topperManager.matchedPatterns);
        int activePaylines = CountActivePaylines(generator);

        if (activeMatchedPatterns > 0 && activeMatchedHeaders > 0 && activePaylines > 0)
        {
            return true;
        }

        return false;
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
