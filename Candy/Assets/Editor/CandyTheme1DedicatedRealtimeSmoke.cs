using System;
using System.Collections.Generic;
using System.Reflection;
using SimpleJSON;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class CandyTheme1DedicatedRealtimeSmoke
{
    private enum SmokeStage
    {
        WaitingForPlayMode,
        CompareNearWin,
        CompareMatched,
        Completed,
        Failed
    }

    private const string ScenePath = "Assets/Scenes/Theme1.unity";
    private const string PlayerId = "dedicated-smoke-player";
    private const double StageTimeoutSeconds = 6.0;

    private static readonly int[] NearWinDraws = { 1, 4, 7, 10 };
    private static readonly int[] MatchedDraws = { 1, 4, 7, 10, 13 };
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
    private static int exitCode = 1;
    private static string finishMessage = string.Empty;
    private static bool previousEnterPlayModeOptionsEnabled;
    private static EnterPlayModeOptions previousEnterPlayModeOptions;

    private static MethodInfo handleRealtimeRoomUpdateMethod;
    private static FieldInfo activePlayerIdField;
    private static FieldInfo processedDrawCountField;
    private static FieldInfo activeTicketSetsField;
    private static FieldInfo theme1RealtimeViewModeField;

    [MenuItem("Tools/Candy/Tests/Run Theme1 Dedicated Realtime Smoke")]
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

        CandyTheme1BindingTools.InstallOrRefreshTheme1BindingsCli();
        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        ConfigureSceneForSmoke();

        shouldExitOnFinish = exitOnFinish;
        isRunning = true;
        exitCode = 1;
        finishMessage = string.Empty;
        stage = SmokeStage.WaitingForPlayMode;
        stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;

        previousEnterPlayModeOptionsEnabled = EditorSettings.enterPlayModeOptionsEnabled;
        previousEnterPlayModeOptions = EditorSettings.enterPlayModeOptions;
        EditorSettings.enterPlayModeOptionsEnabled = true;
        EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;

        Application.logMessageReceived += HandleLogMessage;
        EditorApplication.playModeStateChanged += HandlePlayModeStateChanged;
        EditorApplication.update += Tick;
        Debug.Log("[Theme1DedicatedSmoke] START");
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
    }

    private static void Tick()
    {
        if (!isRunning || stage == SmokeStage.Completed || stage == SmokeStage.Failed || !EditorApplication.isPlaying)
        {
            return;
        }

        if (EditorApplication.timeSinceStartup > stageDeadlineAt)
        {
            Fail("stage timeout: " + stage);
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

                stage = SmokeStage.CompareNearWin;
                stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
                break;

            case SmokeStage.CompareNearWin:
                if (!TryCompareSnapshot("GAME-NEAR", NearWinDraws, requireMatchedPayline: false, out string nearError))
                {
                    Fail(nearError);
                    return;
                }

                stage = SmokeStage.CompareMatched;
                stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
                break;

            case SmokeStage.CompareMatched:
                if (!TryCompareSnapshot("GAME-MATCHED", MatchedDraws, requireMatchedPayline: true, out string matchedError))
                {
                    Fail(matchedError);
                    return;
                }

                Complete("dedicated Theme1 realtime view verified against legacy output");
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
        theme1RealtimeViewModeField = typeof(APIManager).GetField(
            "theme1RealtimeViewMode",
            BindingFlags.Instance | BindingFlags.NonPublic);

        if (handleRealtimeRoomUpdateMethod == null ||
            activePlayerIdField == null ||
            processedDrawCountField == null ||
            activeTicketSetsField == null ||
            theme1RealtimeViewModeField == null)
        {
            error = "[Theme1DedicatedSmoke] Klarte ikke binde APIManager private runtime members.";
            return false;
        }

        APIManager apiManager = UnityEngine.Object.FindFirstObjectByType<APIManager>(FindObjectsInactive.Include);
        Theme1GameplayViewRoot viewRoot = UnityEngine.Object.FindFirstObjectByType<Theme1GameplayViewRoot>(FindObjectsInactive.Include);
        if (apiManager == null || viewRoot == null)
        {
            error = "[Theme1DedicatedSmoke] APIManager eller Theme1GameplayViewRoot mangler i scene.";
            return false;
        }

        if (!viewRoot.ValidateContract(out string viewReport))
        {
            error = "[Theme1DedicatedSmoke] Ugyldig Theme1GameplayViewRoot:\n" + viewReport;
            return false;
        }

        return true;
    }

    private static bool TryCompareSnapshot(string gameId, IReadOnlyList<int> draws, bool requireMatchedPayline, out string error)
    {
        error = string.Empty;
        if (!TryCaptureModeState(0, gameId, draws, out Theme1RoundRenderState legacyState, out string legacyError))
        {
            error = legacyError;
            return false;
        }

        if (!TryCaptureModeState(2, gameId, draws, out Theme1RoundRenderState dedicatedState, out string dedicatedError))
        {
            error = dedicatedError;
            return false;
        }

        if (!Theme1RoundRenderStateComparer.TryCompare(legacyState, dedicatedState, out string mismatch))
        {
            string actionableMismatch = FilterIgnorableLegacyMismatch(mismatch);
            if (!string.IsNullOrWhiteSpace(actionableMismatch))
            {
                error = "[Theme1DedicatedSmoke] Legacy/dedicated mismatch:\n" + actionableMismatch;
                return false;
            }

            Debug.LogWarning("[Theme1DedicatedSmoke] Ignorerer forventet legacy/dedicated ball-text mismatch:\n" + mismatch);
        }

        if (!HasVisibleTicketNumbers(dedicatedState))
        {
            error = "[Theme1DedicatedSmoke] Dedicated view rendret ikke synlige tall på bongene.";
            return false;
        }

        if (!HasVisibleBallNumbers(dedicatedState))
        {
            error = "[Theme1DedicatedSmoke] Dedicated view rendret ikke synlige balltall.";
            return false;
        }

        if (!HasReadableFirstCardLabelColor())
        {
            error = "[Theme1DedicatedSmoke] Første bongtall er fortsatt for lyst og vil se blankt ut i kortet.";
            return false;
        }

        if (!HasVisibleHudValues(dedicatedState))
        {
            error = "[Theme1DedicatedSmoke] Dedicated view rendret ikke synlige credit/winnings/bet-verdier.";
            return false;
        }

        if (requireMatchedPayline && !HasMatchedPayline(dedicatedState))
        {
            error = "[Theme1DedicatedSmoke] Dedicated view viste ikke matched payline på vinnsnapshot.";
            return false;
        }

        if (!requireMatchedPayline && !HasNearWinCell(dedicatedState))
        {
            error = "[Theme1DedicatedSmoke] Dedicated view viste ikke near-win-cell på near-win-snapshot.";
            return false;
        }

        return true;
    }

    private static string FilterIgnorableLegacyMismatch(string mismatch)
    {
        if (string.IsNullOrWhiteSpace(mismatch))
        {
            return string.Empty;
        }

        string[] lines = mismatch.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        List<string> actionable = new List<string>();
        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i].Trim();
            if (IsIgnorableLegacyBallTextMismatch(line))
            {
                continue;
            }

            actionable.Add(line);
        }

        return string.Join("\n", actionable);
    }

    private static bool IsIgnorableLegacyBallTextMismatch(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return true;
        }

        bool isBallRackLine =
            line.StartsWith("ballRack.bigBallNumber:", StringComparison.Ordinal) ||
            line.StartsWith("ballRack.slots[", StringComparison.Ordinal);
        if (!isBallRackLine)
        {
            return false;
        }

        return line.Contains("expected=''") && line.Contains("actual='");
    }

    private static bool TryCaptureModeState(int renderModeValue, string gameId, IReadOnlyList<int> draws, out Theme1RoundRenderState state, out string error)
    {
        state = null;
        error = string.Empty;

        APIManager apiManager = UnityEngine.Object.FindFirstObjectByType<APIManager>(FindObjectsInactive.Include);
        Theme1GameplayViewRoot viewRoot = UnityEngine.Object.FindFirstObjectByType<Theme1GameplayViewRoot>(FindObjectsInactive.Include);
        if (apiManager == null || viewRoot == null)
        {
            error = "[Theme1DedicatedSmoke] APIManager eller Theme1GameplayViewRoot mangler i play mode.";
            return false;
        }

        ResetVisualState();
        theme1RealtimeViewModeField.SetValue(apiManager, Enum.ToObject(theme1RealtimeViewModeField.FieldType, renderModeValue));
        activePlayerIdField.SetValue(apiManager, PlayerId);
        processedDrawCountField.SetValue(apiManager, 0);
        activeTicketSetsField.SetValue(apiManager, new List<List<int>>());
        handleRealtimeRoomUpdateMethod.Invoke(apiManager, new object[] { BuildSnapshot(gameId, draws) });
        state = viewRoot.CaptureRenderedState();
        return true;
    }

    private static void ResetVisualState()
    {
        NumberGenerator generator = UnityEngine.Object.FindFirstObjectByType<NumberGenerator>(FindObjectsInactive.Include);
        BallManager ballManager = UnityEngine.Object.FindFirstObjectByType<BallManager>(FindObjectsInactive.Include);
        TopperManager topperManager = UnityEngine.Object.FindFirstObjectByType<TopperManager>(FindObjectsInactive.Include);

        if (generator != null)
        {
            MethodInfo resetNumbMethod = typeof(NumberGenerator).GetMethod(
                "ResetNumb",
                BindingFlags.Instance | BindingFlags.NonPublic);
            resetNumbMethod?.Invoke(generator, null);
            generator.ClearPaylineVisuals();
        }

        if (ballManager != null)
        {
            ballManager.ResetBalls();
        }

        if (topperManager != null)
        {
            MethodInfo resetMethod = typeof(TopperManager).GetMethod(
                "Reset",
                BindingFlags.Instance | BindingFlags.NonPublic);
            resetMethod?.Invoke(topperManager, null);
        }
    }

    private static JSONNode BuildSnapshot(string gameId, IReadOnlyList<int> draws)
    {
        JSONObject root = new JSONObject();
        root["code"] = "SMOKE";
        root["hallId"] = "hall-smoke";
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
        player["walletId"] = "wallet-smoke";
        player["displayName"] = "Smoke";
        players.Add(player);
        return players;
    }

    private static JSONObject BuildCurrentGameNode(string gameId, IReadOnlyList<int> draws)
    {
        JSONObject currentGame = new JSONObject();
        currentGame["id"] = gameId;
        currentGame["status"] = "RUNNING";
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

    private static bool HasVisibleTicketNumbers(Theme1RoundRenderState state)
    {
        return state?.Cards != null &&
               state.Cards.Length > 0 &&
               state.Cards[0] != null &&
               state.Cards[0].Cells != null &&
               state.Cards[0].Cells.Length > 0 &&
               state.Cards[0].Cells[0].NumberLabel == "1";
    }

    private static bool HasVisibleBallNumbers(Theme1RoundRenderState state)
    {
        return state?.BallRack != null &&
               state.BallRack.ShowBigBall &&
               !string.IsNullOrWhiteSpace(state.BallRack.BigBallNumber) &&
               state.BallRack.Slots != null &&
               state.BallRack.Slots.Length > 0 &&
               state.BallRack.Slots[0].IsVisible &&
               state.BallRack.Slots[0].NumberLabel == "1";
    }

    private static bool HasReadableFirstCardLabelColor()
    {
        Theme1GameplayViewRoot viewRoot = UnityEngine.Object.FindFirstObjectByType<Theme1GameplayViewRoot>(FindObjectsInactive.Include);
        TMP_Text label = viewRoot?.Cards != null &&
                         viewRoot.Cards.Length > 0 &&
                         viewRoot.Cards[0]?.Cells != null &&
                         viewRoot.Cards[0].Cells.Length > 0
            ? viewRoot.Cards[0].Cells[0]?.NumberLabel
            : null;
        if (label == null)
        {
            return false;
        }

        Color color = label.color;
        return color.r < 0.95f || color.g < 0.95f || color.b < 0.95f;
    }

    private static bool HasVisibleHudValues(Theme1RoundRenderState state)
    {
        return state?.Hud != null &&
               !string.IsNullOrWhiteSpace(state.Hud.CreditLabel) &&
               !string.IsNullOrWhiteSpace(state.Hud.WinningsLabel) &&
               !string.IsNullOrWhiteSpace(state.Hud.BetLabel);
    }

    private static bool HasMatchedPayline(Theme1RoundRenderState state)
    {
        if (state?.Cards == null)
        {
            return false;
        }

        for (int cardIndex = 0; cardIndex < state.Cards.Length; cardIndex++)
        {
            bool[] paylineStates = state.Cards[cardIndex]?.PaylinesActive;
            if (paylineStates == null)
            {
                continue;
            }

            for (int i = 0; i < paylineStates.Length; i++)
            {
                if (paylineStates[i])
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static bool HasNearWinCell(Theme1RoundRenderState state)
    {
        if (state?.Cards == null)
        {
            return false;
        }

        for (int cardIndex = 0; cardIndex < state.Cards.Length; cardIndex++)
        {
            Theme1CardCellRenderState[] cells = state.Cards[cardIndex]?.Cells;
            if (cells == null)
            {
                continue;
            }

            for (int i = 0; i < cells.Length; i++)
            {
                if (cells[i].IsMissing)
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static void SetSerializedBool(SerializedObject serializedObject, string propertyName, bool value)
    {
        SerializedProperty property = serializedObject.FindProperty(propertyName);
        if (property != null)
        {
            property.boolValue = value;
        }
    }

    private static void HandleLogMessage(string condition, string stackTrace, LogType type)
    {
        if (!isRunning || type != LogType.Exception)
        {
            return;
        }

        Fail("[Theme1DedicatedSmoke] Exception logged: " + condition);
    }

    private static void HandlePlayModeStateChanged(PlayModeStateChange stateChange)
    {
        if (!isRunning)
        {
            return;
        }

        if (stateChange == PlayModeStateChange.EnteredEditMode &&
            (stage == SmokeStage.Completed || stage == SmokeStage.Failed))
        {
            Finish();
        }
    }

    private static void Complete(string message)
    {
        finishMessage = "[Theme1DedicatedSmoke] RESULT status=PASS message=\"" + message + "\"";
        exitCode = 0;
        stage = SmokeStage.Completed;
        Debug.Log(finishMessage);
        EditorApplication.isPlaying = false;
    }

    private static void Fail(string reason)
    {
        finishMessage = "[Theme1DedicatedSmoke] RESULT status=FAIL reason=\"" + reason + "\"";
        exitCode = 1;
        stage = SmokeStage.Failed;
        Debug.LogError(finishMessage);
        EditorApplication.isPlaying = false;
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
            EditorApplication.Exit(exitCode);
        }
    }
}
