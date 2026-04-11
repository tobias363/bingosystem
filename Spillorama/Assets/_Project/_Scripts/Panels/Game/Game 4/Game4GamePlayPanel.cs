using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using BestHTTP.SocketIO;
using I2.Loc;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public partial class Game4GamePlayPanel : MonoBehaviour
{
    #region PUBLIC_VARIABLES
    public PrefabGame4ThemeButton themeBtn1;
    public PrefabGame4ThemeButton themeBtn2;
    public PrefabGame4ThemeButton themeBtn3;
    public PrefabGame4ThemeButton themeBtn4;
    public PrefabGame4ThemeButton themeBtn5;
    #endregion

    #region PRIVATE_VARIABLES
    [Header("Text")]
    [SerializeField] private TextMeshProUGUI txtTicketCount;
    [SerializeField] private TextMeshProUGUI txtBetValue;
    [SerializeField] private TextMeshProUGUI txtWonValue;

    [Header("Button")]
    [SerializeField] private Button btnDecreaseBet;
    [SerializeField] private Button btnIncreaseBet;
    [SerializeField] private Button btnPlay;
    [SerializeField] private Button btnTryOtherGame;
    [SerializeField] private Button btnTicketRefreshInScrollViewButton;
    [SerializeField] private Button btnTicketRefreshPhysicalButton;

    [Header("Toggle")]
    [SerializeField] private Toggle toggleAutoPlay;

    [Header("Game Object")]
    [SerializeField] private GameObject objectDetailPanel;

    [Header("Panels")]
    [SerializeField] private UtilityMessagePanel messagePopup;
    [SerializeField] private UtilityLoaderPanel loaderPanel;

    [Header("Images")]
    [SerializeField] private Image imgBallContainerPanel;
    [SerializeField] private Image imgTryOtherGamesPanel;
    [SerializeField] private Image imgTryOtherGameButton;
    [SerializeField] private Image imgSelectTicketHighlight;
    [SerializeField] private Image imgTotalTicketCounterPanel;
    [SerializeField] private Image imgBetPanel;
    [SerializeField] private Image imgWonPanel;
    [SerializeField] private Image imgBackground;
    [SerializeField] private Image imgTicketScrollBar;
    [SerializeField] private Image imgPatternScrollBar;

    [Header("Transform")]
    [SerializeField] private Transform transformPatternContainer;
    [SerializeField] private Transform transformTicketContainer;
    [SerializeField] private Transform transformWithdrawnBallContainer;
    [SerializeField] private Transform transformMiniGameContainer;

    [Header("RectTransform")]
    [SerializeField] private RectTransform rectTransformTicketScrollViewContainer;
    [SerializeField] private RectTransform rectTransformTicketContainer;
    [SerializeField] private RectTransform rectTransformWithdrawBallPanel;
    [SerializeField] private RectTransform rectTransformPatternContainerPanel;

    [Header("GridLayoutGroup")]
    [SerializeField] private GridLayoutGroup gridLayoutGroupTicketContainer;
    [SerializeField] private GridLayoutGroup gridLayoutGroupWithdrawBallContainer;


    [Header("Prefabs")]
    [SerializeField] private PrefabBingoGame4Ticket5x3 prefabBingoGame4Ticket5X3;
    [SerializeField] private PrefabBingoGame4Pattern prefabBingoGame4Pattern;
    [SerializeField] private PrefabBingoBallPanel prefabBingoBall;

    [Header("Theme")]
    [SerializeField] private Game4Theme theme;

    [Header("Mini Games")]
    public WheelOfFortunePanel wheelOfFortunePanel;
    public FortuneWheelManager fortuneWheelManager;
    public TreasureChestPanel treasureChestPanel;
    public MysteryGamePanel mysteryGamePanel;

    [Header("List")]
    [SerializeField] private List<Game4PatternSpriteData> patternSpriteDataList = new List<Game4PatternSpriteData>();

    [Header("Data")]
    [SerializeField] private Game4Data game4Data;

    private List<PrefabBingoGame4Ticket5x3> ticketList = new List<PrefabBingoGame4Ticket5x3>();
    [SerializeField] private List<PrefabBingoGame4Pattern> patternList = new List<PrefabBingoGame4Pattern>();
    private TicketMarkerCellData markerData;

    private int _ticketCount = 0;
    private int ticketPrice = 1;
    private int betMultiplierValue = 1;
    public int betMultiplierIndex = 0;
    private int _betValue = 0;
    public bool _isGamePlayInProcess = false;
    public bool _isBetUpdateAllowed = true;
    public bool _isPatternChangeAllowed = false;
    private bool _isTicketOptionEnable = false;
    private bool isDrewBallSetProgress = false;
    public bool isGameRunningStatus = false;
    [Header("Strings")]
    private string lastPurchaseType = "";
    private string lastVoucherCode = "";
    private string miniGameId = "";

    [Header("Game 4 Play Response")]
    public Game4PlayResponse game4PlayResponseActual;

    [Header("Drew Ball List")]
    public List<int> drewBallList = new List<int>();
    public Coroutine GameTimer;
    #endregion

    #region UNITY_CALLBACKS

    private void Awake()
    {
        UIManager.Instance.selectPurchaseTypePanel.Close();
        transformMiniGameContainer.gameObject.SetActive(true);
        GameMarkerId = 6;

        for (int i = 0; i < transformTicketContainer.childCount; i++)
            Destroy(transformTicketContainer.GetChild(i).gameObject);
    }

    private void Start()
    {
        //objectDetailPanel.SetActive(Utility.Instance.IsStandAloneVersion());
    }

    private void OnEnable()
    {
        Debug.Log("OnEnable Game4GamePlayPanel");
        UIManager.Instance.isGame4 = true;
        CloseMiniGames();
        //InvokeRepeating(nameof(OnPlayButtonTap), 15f, 20f);
        //Reset();
    }

    private void OnDisable()
    {
        SoundManager.Instance.StopNumberAnnouncement();
        UIManager.Instance.isGame4 = false;
        UIManager.Instance.isGame4Theme1 = false;
        UIManager.Instance.isGame4Theme2 = false;
        UIManager.Instance.isGame4Theme3 = false;
        UIManager.Instance.isGame4Theme4 = false;
        UIManager.Instance.isGame4Theme5 = false;
        CloseMiniGames();
        imgTryOtherGamesPanel.Close();
        UIManager.Instance.selectPurchaseTypePanel.Close();

        // Clear the drawn ball list
        drewBallList.Clear();
        Reset();
        btnDecreaseBet.Close();
        btnIncreaseBet.Close();
        btnPlay.interactable = false;
    }

    #endregion

    #region DELEGATE_CALLBACKS
    #endregion

    #region PUBLIC_METHODS

    public void SetData(Game4Theme theme, Game4Data game4data = null, bool isGameRunning = false)
    {
        try
        {
            Debug.Log("SetData");
            this.theme = theme;
            this.Open();
            isGameRunningStatus = isGameRunning;
            btnDecreaseBet.gameObject.SetActive(!isGameRunningStatus);
            btnIncreaseBet.gameObject.SetActive(!isGameRunningStatus);
            if (isGameRunningStatus)
            {
                btnPlay.interactable = !isGameRunningStatus;
                IsTicketOptionEnable = false;
            }
            CallPlayerHallLimitEvent();
            GameSocketManager.SocketGame4.Off(Constants.BroadcastName.PatternChange);
            GameSocketManager.socketManager.Socket.Off(Constants.BroadcastName.BreakTimeStart);
            GameSocketManager.SocketGame4.On(Constants.BroadcastName.PatternChange, PatternChange);
            GameSocketManager.socketManager.Socket.On(Constants.BroadcastName.BreakTimeStart, OnBreak);
            // Reset();

            //pattern
            prefabBingoGame4Pattern.ApplyTheme(theme.patternThemeData.textColor,
                theme.patternThemeData.backgroundColor,
                theme.patternThemeData.normalCellColor,
                theme.patternThemeData.filledCellColor,
                theme.patternThemeData.extraText,
                theme.patternThemeData.extraOutline);

            //ticket
            prefabBingoGame4Ticket5X3.TicketTheme(theme.ticketThemeData);

            imgBallContainerPanel.sprite = theme.withdrawBallContainerThemeData.spriteBallContainer;

            imgBetPanel.sprite = theme.betPanelTheme.spriteBetPanel;
            imgWonPanel.sprite = theme.betPanelTheme.spriteBetPanel;
            imgTotalTicketCounterPanel.sprite = theme.betPanelTheme.spriteBTicketThumbnailIcon;

            if (imgTicketScrollBar)
                imgTicketScrollBar.color = theme.betPanelTheme.ticketThumbnailOutlineColor;
            if (imgPatternScrollBar)
                imgPatternScrollBar.color = theme.betPanelTheme.ticketThumbnailOutlineColor;

            btnPlay.GetComponent<Image>().sprite = theme.spritePlayButton;
            imgBackground.sprite = theme.spriteBackground;
            Debug.Log("IsGamePlayInProcess = > " + IsGamePlayInProcess);
            Debug.Log("isGameRunning = > " + isGameRunning);
            //if (game4data != null && !IsGamePlayInProcess)
            SaveGameDataResponse(game4data);
            if (UIManager.Instance.isBreak)
            {
                UIManager.Instance.breakTimePopup.OpenPanel("null");
            }

            // If the internet connection is lost and then restored, after calling the reset method, if the drawn ball list is not empty, call the WithdrawBingoBall method.
            List<int> drewBallListTemp = new List<int>(drewBallList);
            drewBallList.Clear();
            if (drewBallListTemp.Count > 0)
            {
                foreach (int ball in drewBallListTemp)
                {
                    // WithdrawBingoBall(ball);
                }
            }
            Debug.Log("isGameRunning = " + isGameRunning);
            if (isGameRunning)
            {
                IsGamePlayInProcess = true;
                StartCoroutine(RunningGameSetData(game4data.response));
            }

        }
        catch (Exception e)
        {
            Debug.LogError("Error in SetData: " + e.Message + "\n" + e.StackTrace);
        }
    }

    public void Game4ChangeTickets()
    {
        if (!IsGamePlayInProcess && !IsTicketOptionEnable)
        {
            DisplayLoader(true);
            EventManager.Instance.Game4ChangeTickets(game4Data.gameId, Game4ChangeTicketsResponse);
        }
    }

    public void OnPlayButtonTap()
    {
        Debug.Log("OnPlayButtonTap");
        SoundManager.Instance.ResetPlayedAnnouncements();
        //commented code is before we show the popups and after purchasing now direct purchasing
        //UIManager.Instance.selectPurchaseTypePanel.Open(game4Data.gameId, GetActiveTicketIdList().Count, GameSocketManager.SocketGame4);
        //UIManager.Instance.selectPurchaseTypePanel.eventPurchaseByPoints.AddListener((string voucherCode) => {
        //    CallGame4PlayEvent("points", voucherCode);
        //});
        //UIManager.Instance.selectPurchaseTypePanel.eventPurchaseByRealMoney.AddListener((string voucherCode) => {
        //    CallGame4PlayEvent("realMoney", voucherCode);
        //});

        btnPlay.interactable = false;

        CallGame4PlayEvent();
    }

    public void OnTicketButtonTap()
    {
        if (!IsGamePlayInProcess)
        {
            if (!isGameRunningStatus)
            {
                IsTicketOptionEnable = !IsTicketOptionEnable;
                imgSelectTicketHighlight.color = theme.betPanelTheme.ticketThumbnailOutlineColor;
                imgSelectTicketHighlight.gameObject.SetActive(IsTicketOptionEnable);
            }
        }
    }

    public void OnTryOtherGamesButtonTap()
    {
        imgTryOtherGamesPanel.Open();
    }

    public void ModifyBetValue(bool isIncreased)
    {
        if (isIncreased)
            betMultiplierIndex++;
        else
            betMultiplierIndex--;

        if (betMultiplierIndex > (game4Data.betData.ticket1Multiplier.Count - 1))
            betMultiplierIndex = 0;
        else if (betMultiplierIndex < 0)
            betMultiplierIndex = game4Data.betData.ticket1Multiplier.Count - 1;

        RefreshBetValue();
    }

    public UtilityMessagePanel GetUtilityMessagePanel()
    {
        if (loaderPanel && Utility.Instance.IsSplitScreenSupported && UIManager.Instance.splitScreenGameManager.SplitScreenRunningGameCount() > 1)
            return messagePopup;
        else
            return UIManager.Instance.messagePopup;
    }

    public void DisplayLoader(bool showLoader)
    {
        if (loaderPanel && Utility.Instance.IsSplitScreenSupported && UIManager.Instance.splitScreenGameManager.SplitScreenRunningGameCount() > 1)
        {
            if (showLoader)
                loaderPanel.ShowLoader();
            else
            {
                loaderPanel.HideLoader();
                UIManager.Instance.DisplayLoader(false);
            }
        }
        else
        {
            // UIManager.Instance.DisplayLoader(showLoader);
        }
    }

    /// <summary>
    /// This is a custom UI handling function. Code normalization is remain.
    /// </summary>
    /// <param name="totalActiveGames"></param>
    public void RefreshSplitScreenLayoutUI(int totalActiveGames)
    {
        if (totalActiveGames >= 3)
        {
            rectTransformTicketScrollViewContainer.localScale = new Vector3(0.7f, 0.7f, 0.7f);

            rectTransformTicketScrollViewContainer.SetTop(55);
            rectTransformTicketScrollViewContainer.SetBottom(155);
            rectTransformTicketScrollViewContainer.SetLeft(-78);
            rectTransformTicketScrollViewContainer.SetRight(244);

            rectTransformTicketContainer.pivot = new Vector2(0, 1);

            gridLayoutGroupTicketContainer.spacing = new Vector2(36, 0);
            gridLayoutGroupTicketContainer.constraintCount = 1;

            rectTransformWithdrawBallPanel.pivot = new Vector2(1f, 0);
            rectTransformWithdrawBallPanel.SetAnchor(AnchorPresets.BottomRight, -34, 218);
            rectTransformWithdrawBallPanel.sizeDelta = new Vector2(292, 150);

            gridLayoutGroupWithdrawBallContainer.cellSize = new Vector2(28, 28);
            gridLayoutGroupWithdrawBallContainer.spacing = new Vector2(3, 6);

            rectTransformPatternContainerPanel.SetAnchor(AnchorPresets.HorStretchBottom, 0, 82);
            rectTransformPatternContainerPanel.SetLeft(1.25f);
            rectTransformPatternContainerPanel.SetRight(0);

            btnTicketRefreshInScrollViewButton.enabled = false;
            btnTicketRefreshPhysicalButton.Open();
        }
        else
        {
            rectTransformTicketScrollViewContainer.localScale = Vector3.one;

            rectTransformTicketScrollViewContainer.SetTop(130);
            rectTransformTicketScrollViewContainer.SetBottom(155);
            rectTransformTicketScrollViewContainer.SetLeft(0);
            rectTransformTicketScrollViewContainer.SetRight(0);

            rectTransformTicketContainer.pivot = new Vector2(0.5f, 1);

            gridLayoutGroupTicketContainer.spacing = new Vector2(54, 38.82f);
            gridLayoutGroupTicketContainer.constraintCount = 2;

            rectTransformWithdrawBallPanel.pivot = new Vector2(0.5f, 0);
            rectTransformWithdrawBallPanel.SetAnchor(AnchorPresets.BottomCenter, 0, 200);
            rectTransformWithdrawBallPanel.sizeDelta = new Vector2(892, 150);

            gridLayoutGroupWithdrawBallContainer.cellSize = new Vector2(42, 42);
            gridLayoutGroupWithdrawBallContainer.spacing = new Vector2(4, 4);

            if (totalActiveGames == 1)
            {
                rectTransformPatternContainerPanel.SetAnchor(AnchorPresets.BottomCenter, 0, 82);
                rectTransformPatternContainerPanel.sizeDelta = new Vector2(1450, 74);
            }
            else
            {
                rectTransformPatternContainerPanel.SetAnchor(AnchorPresets.HorStretchBottom, 0, 82);
                rectTransformPatternContainerPanel.SetLeft(1.25f);
                rectTransformPatternContainerPanel.SetRight(0);
            }

            btnTicketRefreshInScrollViewButton.enabled = true;
            btnTicketRefreshPhysicalButton.Close();
        }
    }
    #endregion

    #region PRIVATE_METHODS
    private List<GameTicketData> GenerateDummyTicket()
    {
        List<int> intList = new List<int>();
        for (int i = 1; i <= 60; i++)
            intList.Add(i);

        intList = intList.OrderBy(x => Guid.NewGuid()).ToList();

        List<GameTicketData> tempTicketList = new List<GameTicketData>();
        for (int i = 0; i < 4; i++)
        {
            GameTicketData newObj = new GameTicketData();
            tempTicketList.Add(newObj);
        }

        tempTicketList[0].ticketCellNumberList.Clear();
        for (int i = 0; i < 15; i++)
        {
            tempTicketList[0].ticketCellNumberList.Add(intList[i]);
        }

        tempTicketList[1].ticketCellNumberList.Clear();
        for (int i = 15; i < 30; i++)
        {
            tempTicketList[1].ticketCellNumberList.Add(intList[i]);
        }

        tempTicketList[2].ticketCellNumberList.Clear();
        for (int i = 30; i < 45; i++)
        {
            tempTicketList[2].ticketCellNumberList.Add(intList[i]);
        }

        tempTicketList[3].ticketCellNumberList.Clear();
        for (int i = 45; i < 60; i++)
        {
            tempTicketList[3].ticketCellNumberList.Add(intList[i]);
        }

        return tempTicketList;
    }

    public int SampleWebViewInput;

    private void HeighlightCell()
    {
        ResetHeighlightCell();

        foreach (var ticket in ticketList)
        {
            ticket.HighlightMissingIndices(theme.ticketThemeData.ticketHighlighCellColor);
        }
    }

    private void CheckMissIndies()
    {
        foreach (PrefabBingoGame4Ticket5x3 ticket in ticketList)
        {
            if (ticket._isTicketPurchased)
            {
                // Clear existing matching patterns before checking new ones
                ticket.MissingPatterns.Clear();

                List<PrefabBingoGame4Pattern> matchingPatterns = MatchPatternList(ticket.yourArray);

                if (matchingPatterns.Count > 0)
                {
                    // Store all matching patterns in the ticket's property
                    ticket.MissingPatterns.AddRange(matchingPatterns);

                    foreach (PrefabBingoGame4Pattern pattern in matchingPatterns)
                    {
                        // Check if the ticket is not already in the pattern's Matchingickets list
                        if (!pattern.MissingTickets.Contains(ticket))
                        {
                            pattern.MissingTickets.Add(ticket);
                        }

                        //Debug.Log(string.Join(", ", pattern.patternData.pattern));
                    }
                }
                else
                {
                    // No pattern match found
                    //Debug.Log("No pattern match found.");
                }
            }
        }
    }


    //1L
    // Define the array of patterns
    private List<List<int>> oneLPatterns = new List<List<int>>
    {
        new List<int> {1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
        new List<int> {0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0},
        new List<int> {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1}
    };

    //2L
    // Define the list of patterns
    private List<List<int>> twoLPatterns = new List<List<int>>
    {
        new List<int> {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0},
        new List<int> {1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1},
        new List<int> {0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}
    };

    private List<PrefabBingoGame4Pattern> MatchPatternList(int[] yourArray)
    {
        List<PrefabBingoGame4Pattern> missingPatterns = new List<PrefabBingoGame4Pattern>();

        // Exclude the last pattern
        int patternCount = patternList.Count - 1;
        for (int i = 0; i < patternCount; i++)
        {
            PrefabBingoGame4Pattern patternListEntry = patternList[i];
            if (MissingPattern(patternListEntry.patternData.patternDataList, yourArray, out List<int> missingIndices))
            {
                // Print or handle missing indices here
                if (missingIndices.Count > 0)
                {
                    // Ensure patternListEntry.missingIndices is initialized
                    if (patternListEntry.missingIndices == null)
                    {
                        patternListEntry.missingIndices = new List<int>();
                    }

                    // Add only unique missing indices
                    foreach (int index in missingIndices)
                    {
                        if (!patternListEntry.missingIndices.Contains(index))
                        {
                            patternListEntry.missingIndices.Add(index);
                        }
                    }

                    //Debug.Log($"Missing indices for pattern {i}: {string.Join(", ", missingIndices)}");
                }

                missingPatterns.Add(patternListEntry);
            }
        }


        for (int i = 0; i < oneLPatterns.Count; i++)
        {
            PrefabBingoGame4Pattern patternListEntry = patternList[14];
            if (MissingPattern(oneLPatterns[i], yourArray, out List<int> missingIndices))
            {
                // Print or handle missing indices here
                if (missingIndices.Count > 0)
                {
                    // Ensure patternListEntry.missingIndices is initialized
                    if (patternListEntry.missingIndices == null)
                    {
                        patternListEntry.missingIndices = new List<int>();
                    }

                    // Add only unique missing indices
                    foreach (int index in missingIndices)
                    {
                        if (!patternListEntry.missingIndices.Contains(index))
                        {
                            patternListEntry.missingIndices.Add(index);
                        }
                    }

                    //Debug.Log($"Missing indices for pattern {i}: {string.Join(", ", missingIndices)}");
                }

                missingPatterns.Add(patternListEntry);
            }
        }



        for (int i = 0; i < twoLPatterns.Count; i++)
        {
            PrefabBingoGame4Pattern patternListEntry = patternList[6];
            if (MissingPattern(twoLPatterns[i], yourArray, out List<int> missingIndices))
            {
                // Print or handle missing indices here
                if (missingIndices.Count > 0)
                {
                    // Ensure patternListEntry.missingIndices is initialized
                    if (patternListEntry.missingIndices == null)
                    {
                        patternListEntry.missingIndices = new List<int>();
                    }

                    // Add only unique missing indices
                    foreach (int index in missingIndices)
                    {
                        if (!patternListEntry.missingIndices.Contains(index))
                        {
                            patternListEntry.missingIndices.Add(index);
                        }
                    }

                    //Debug.Log($"Missing indices for pattern {i}: {string.Join(", ", missingIndices)}");
                }

                missingPatterns.Add(patternListEntry);
            }
        }


        return missingPatterns;
    }

    // Method to check if an array contains a specific value
    static bool ArrayContainsValue(int[] array, int value)
    {
        foreach (int num in array)
        {
            if (num == value)
            {
                return true;
            }
        }
        return false;
    }

    private bool MissingPattern(List<int> pattern, int[] yourArray, out List<int> missingIndices)
    {
        missingIndices = new List<int>();

        if (pattern.Count != yourArray.Length)
        {
            return false; // Patterns must have the same length to be comparable
        }

        List<int> occurrence = pattern
            .Select((value, index) => new { value, index })
            .Where(item => item.value == 1)
            .Select(item => item.index)
            .ToList();

        return Missing1toGoPattern(pattern, yourArray, occurrence, out missingIndices);
    }

    bool Missing1toGoPattern(List<int> pattern, int[] yourArray, List<int> indexArr, out List<int> missingIndices)
    {
        missingIndices = new List<int>();

        int count = 0;
        for (int i = 0; i < yourArray.Length; i++)
        {
            if (yourArray[i] == 1 && indexArr.Contains(i))
            {
                count++;
            }
            else if (yourArray[i] == 0 && indexArr.Contains(i))
            {
                missingIndices.Add(i);
            }
        }

        return count == indexArr.Count - 1;
    }


    /// <summary>
    /// Mark number in tickets if available
    /// </summary>
    /// <param name="number"></param>
    private void MarkTicketNumber(int number)
    {
        if (ticketList[0].IsTicketPurchased)
            ticketList[0].MarkNewWithdrawNumber(number, false, false, true);

        if (ticketList[1].IsTicketPurchased)
            ticketList[1].MarkNewWithdrawNumber(number, false, false, true);

        if (ticketList[2].IsTicketPurchased)
            ticketList[2].MarkNewWithdrawNumber(number, false, false, true);

        if (ticketList[3].IsTicketPurchased)
            ticketList[3].MarkNewWithdrawNumber(number, false, false, true);
    }

    private void HighlightWinningPattern(Game4PlayResponse game4PlayData)
    {
        // foreach (Game4WinningTicketData winningTicketData in game4PlayData.winningTicketList)
        // {
        //     PrefabBingoGame4Ticket5x3 ticketObject = GetTicketObjectById(winningTicketData.ticketId);

        //     if (ticketObject != null)
        //     {
        //         foreach (string patternId in winningTicketData.winningPatternIdList)
        //         {
        //             PrefabBingoGame4Pattern patternObject = GetPatternObjectById(patternId);

        //             if (patternObject != null)
        //             {
        //                 //if (patternObject.patternData.extra == "1L" || patternObject.patternData.extra == "2L")
        //                 //{
        //                 //    patternObject.patternData.patternDataList = winningTicketData.row1L_2L_winningPattern;
        //                 //}

        //                 patternObject.HighlightPattern(true);
        //                 ticketObject.HighlightTicket(patternObject.PatternDataList, winningTicketData.row1L_2L_winningPattern, patternObject.patternData.extra, theme.ticketThemeData.ticketHighlighCellColor, GetPatternSpriteData(patternObject.PatternId));
        //             }
        //         }
        //     }

        foreach (Game4WinningTicketData winningTicketData in game4PlayData.winningTicketList)
        {
            PrefabBingoGame4Ticket5x3 ticketObject = GetTicketObjectById(winningTicketData.ticketId);

            if (ticketObject != null)
            {
                foreach (string patternId in winningTicketData.winningPatternIdList)
                {
                    PrefabBingoGame4Pattern patternObject = GetPatternObjectById(patternId);

                    if (patternObject != null)
                    {
                        patternObject.HighlightPattern(true);
                        ticketObject.HighlightTicket(
                            patternObject.PatternDataList,
                            winningTicketData.row1L_2L_winningPattern,
                            patternObject.patternData.extra,
                            theme.ticketThemeData.ticketHighlighCellColor,
                            GetPatternSpriteData(patternObject.PatternId)
                        );
                    }
                }
            }
        }

        // 🆕 SHOW BINGO RESULT PANEL - EXACTLY LIKE GAME5
        PrefabBingoGame4Ticket5x3 wonTicket;
        foreach (Game4WinningTicketData winningTicketData in game4PlayData.winningTicketList)
        {
            wonTicket = GetTicketObjectById(winningTicketData.ticketId);

            if (wonTicket != null)
            {
                wonTicket.WonAmount = winningTicketData.winningAmount.ToString();
                wonTicket.TicketCompleted = true;
            }
        }

        //StartCoroutine(HighlightTicketWait(game4PlayData));

        WonValue = game4PlayData.winningPrize;
        //btnTryOtherGame.gameObject.SetActive(game4PlayData.winningPrize > 0);
        btnTryOtherGame.gameObject.SetActive(game4PlayData.extraGamePlay);
        // CallPlayerHallLimitEvent();
    }

    private IEnumerator HighlightTicketWait(Game4PlayResponse game4PlayData)
    {
        foreach (Game4WinningTicketData winningTicketData in game4PlayData.winningTicketList)
        {
            PrefabBingoGame4Ticket5x3 ticketObject = GetTicketObjectById(winningTicketData.ticketId);

            if (ticketObject != null)
            {
                foreach (string patternId in winningTicketData.winningPatternIdList)
                {
                    yield return new WaitForSeconds(.5f);

                    PrefabBingoGame4Pattern patternObject = GetPatternObjectById(patternId);

                    if (patternObject != null)
                    {
                        if (patternObject.patternData.extra == "1L" || patternObject.patternData.extra == "2L")
                        {
                            patternObject.patternData.patternDataList = winningTicketData.row1L_2L_winningPattern;
                        }

                        //patternObject.HighlightPattern(true);
                        ticketObject.HighlightTicket(patternObject.PatternDataList, winningTicketData.row1L_2L_winningPattern, patternObject.patternData.extra, theme.ticketThemeData.ticketHighlighCellColor, GetPatternSpriteData(patternObject.PatternId));
                    }
                }
            }
        }
    }


    private PrefabBingoGame4Pattern GetPatternObjectById(string id)
    {
        foreach (PrefabBingoGame4Pattern patternData in patternList)
        {
            if (patternData.PatternId == id)
                return patternData;
        }

        return null;
    }

    private PrefabBingoGame4Ticket5x3 GetTicketObjectById(string id)
    {
        foreach (PrefabBingoGame4Ticket5x3 ticket in ticketList)
        {
            if (ticket.TicketId == id)
                return ticket;
        }

        return null;
    }

    /// <summary>
    /// generate pattern from patter data list
    /// </summary>
    /// <param name="list"></param>
    private void GeneratePatterns(List<Game4PatternData> list)
    {
        int patternNumber = 0;
        foreach (Game4PatternData patternData in list)
        {
            PrefabBingoGame4Pattern newPattern = Instantiate(prefabBingoGame4Pattern, transformPatternContainer);
            patternSpriteDataList[patternNumber].patternId = patternData.id;
            newPattern.name = "Pattern " + (++patternNumber);
            newPattern.SetData(patternData);
            patternList.Add(newPattern);
        }

        RefreshBetValue();

        //foreach (Game4PatternSpriteData data in patternSpriteDataList)
    }

    /// <summary>
    /// generate tickets with ticket cell data
    /// </summary>
    /// <param name="list"></param>
    private void GenerateTickets(List<GameTicketData> list)
    {
        ResetTickets();

        foreach (GameTicketData ticket in list)
        {
            PrefabBingoGame4Ticket5x3 newTicket = Instantiate(prefabBingoGame4Ticket5X3, transformTicketContainer);
            newTicket.SetData(ticket, markerData);
            newTicket.TicketTheme(theme.ticketThemeData);
            ticketList.Add(newTicket);
            newTicket.InitializeTicketPurchasingOption();
        }

        TicketCount = ticketList.Count;
        RefreshBetValue();
    }

    /// <summary>
    /// modify existed ticked with new cell data
    /// </summary>
    /// <param name="list"></param>
    private void ChangeTickets(List<GameTicketData> list)
    {
        Debug.Log("ChangeTickets");

        foreach (PrefabBingoGame4Pattern patternData in patternList)
            patternData.HighlightPattern(false);

        for (int i = 0; i < ticketList.Count; i++)
        {
            ticketList[i].ResetTicket();
            ticketList[i].SetData(list[i], markerData);
        }
    }

    //OnRemoveTicketButtonTap
    private void ChangeTicketIdArray(List<GameTicketData> NewticketList, bool isComeBack = false)
    {
        for (int i = 0; i < ticketList.Count; i++)
        {
            for (int j = 0; j < NewticketList.Count; j++)
            {
                if (ticketList[i].gameTicketData.ticketCellNumberList.SequenceEqual(NewticketList[j].ticketCellNumberList))
                {
                    //Debug.Log($"Match found between thisTicketList[{i}] and ticketList[{j}]");
                    ticketList[i].TicketId = NewticketList[j].id;
                }

            }
        }
        if (isComeBack)
        {
            UpdateTicketIdArray(game4Data.parsedTicketList);
        }
    }
    private void UpdateTicketIdArray(List<string> NewticketList)
    {
        for (int i = 0; i < ticketList.Count; i++)
        {
            if (!NewticketList.Contains(ticketList[i].TicketId))
            {
                ticketList[i].OnRemoveTicket();
                ticketList[i].nonPurchaseTicket();
            }

        }
        BetValue = game4Data.totalAmountOfTickets;
        UpdatedBetValue(game4Data.totalAmountOfTickets);
    }

    /// <summary>
    /// refresh bet value in UI
    /// </summary>
    private void RefreshBetValue()
    {

        if (TicketCount == 1)
            betMultiplierValue = game4Data.betData.ticket1Multiplier[betMultiplierIndex];
        else if (TicketCount == 2)
            betMultiplierValue = game4Data.betData.ticket2Multiplier[betMultiplierIndex];
        else if (TicketCount == 3)
            betMultiplierValue = game4Data.betData.ticket3Multiplier[betMultiplierIndex];
        else
            betMultiplierValue = game4Data.betData.ticket4Multiplier[betMultiplierIndex];



        //Debug.Log("TicketCount => " + TicketCount);
        //Debug.Log("ticketPrice => " + ticketPrice);
        //Debug.Log("betMultiplierValue => " + betMultiplierValue);
        BetValue = TicketCount * ticketPrice * betMultiplierValue;
    }
    private void UpdatedBetValue(int value)
    {
        Debug.Log("TicketCount => " + TicketCount);
        Debug.Log("game4Data.ticketPrice => " + betMultiplierValue);
        Debug.Log("betMultiplierIndex => " + value);
        int indexvalue = (value / (game4Data.ticketPrice * TicketCount));
        Debug.Log("indexvalue => " + indexvalue);

        if (TicketCount == 1)
            betMultiplierIndex = game4Data.betData.ticket1Multiplier.IndexOf(indexvalue);
        else if (TicketCount == 2)
            betMultiplierIndex = game4Data.betData.ticket2Multiplier.IndexOf(indexvalue);
        else if (TicketCount == 3)
            betMultiplierIndex = game4Data.betData.ticket3Multiplier.IndexOf(indexvalue);
        else
            betMultiplierIndex = game4Data.betData.ticket4Multiplier.IndexOf(indexvalue);

        //if (game4Data.parsedTicketList.Count == 1)
        //    betMultiplierIndex = game4Data.betData.ticket1Multiplier.IndexOf(indexvalue);
        //else if (game4Data.parsedTicketList.Count == 2)
        //    betMultiplierIndex = game4Data.betData.ticket2Multiplier.IndexOf(indexvalue);
        //else if (game4Data.parsedTicketList.Count == 3)
        //    betMultiplierIndex = game4Data.betData.ticket3Multiplier.IndexOf(indexvalue);
        //else
        //    betMultiplierIndex = game4Data.betData.ticket4Multiplier.IndexOf(indexvalue);

        Debug.Log("TicketCount after => " + TicketCount);

        Debug.Log("betMultiplierIndex after  => " + betMultiplierIndex);
    }

    public Game4PatternSpriteData GetPatternSpriteData(string patternId)
    {
        foreach (Game4PatternSpriteData data in patternSpriteDataList)
        {
            if (data.patternId == patternId)
                return data;
        }

        return null;
    }

    private void Reset()
    {
        foreach (Transform obj in transformPatternContainer)
            Destroy(obj.gameObject);

        ResetWithdrawnBallContainer();

        ResetTickets();
        MissingPatternsAndTicketsList();

        WonValue = 0;
        betMultiplierIndex = 0;

        patternList.Clear();
        _isPatternChangeAllowed = true;
        IsGamePlayInProcess = false;
        btnTryOtherGame.Close();
        toggleAutoPlay.isOn = false;
        imgSelectTicketHighlight.Close();

    }

    private void ResetHeighlightCell()
    {
        foreach (var ticket in ticketList)
        {
            ticket.ResetHighlightMissingIndices();
        }
    }

    private void ResetHighlightMissingPattern()
    {
        foreach (var ticket in ticketList)
        {
            ticket.StopHighlightMissingPattern();
        }
    }

    private void ResetTicketHighlightData()
    {
        foreach (PrefabBingoGame4Pattern patternData in patternList)
            patternData.HighlightPattern(false);

        for (int i = 0; i < ticketList.Count; i++)
        {
            ticketList[i].ResetTicket();
        }
    }

    private void ResetWithdrawnBallContainer()
    {
        foreach (Transform obj in transformWithdrawnBallContainer)
            Destroy(obj.gameObject);
    }

    private void CloseMiniGames()
    {
        // wheelOfFortunePanel.Close();
        fortuneWheelManager.Close();
        treasureChestPanel.Close();
        mysteryGamePanel.Close();
    }

    private void ResetTickets()
    {
        foreach (PrefabBingoGame4Ticket5x3 ticket in ticketList)
            Destroy(ticket.gameObject);

        ticketList.Clear();
    }

    private void MissingPatternsAndTicketsList()
    {
        foreach (PrefabBingoGame4Ticket5x3 ticket in ticketList)
            ticket.MissingPatterns.Clear();

        //foreach (PrefabBingoGame4Pattern pattern in patternList)
        //    pattern.MissingTickets.Clear();


        //foreach (PrefabBingoGame4Ticket5x3 ticket in ticketList)
        //    ticket.missingIndices.Clear();

        //foreach (PrefabBingoGame4Pattern pattern in patternList)
        //    pattern.missingIndices.Clear();


        foreach (PrefabBingoGame4Ticket5x3 ticket in ticketList)
            ticket.ResetYourArray();
    }

    #endregion

    #region COROUTINES
    #endregion

    #region GETTER_SETTER
    public int TicketCount
    {
        set
        {
            _ticketCount = value;
            txtTicketCount.text = value.ToString();

            if (!isGameRunningStatus)
            {
                btnPlay.interactable = _ticketCount > 0;
            }
            RefreshBetValue();
        }
        get
        {
            return _ticketCount;
        }
    }

    public int BetValue
    {
        set
        {
            _betValue = value;
            txtBetValue.text = value.ToString();
        }
        get
        {
            return _betValue;
        }
    }

    public long WonValue
    {
        set
        {
            if (value <= 0)
                txtWonValue.text = "";
            else
                txtWonValue.text = value.ToString();
        }
    }

    public int GameMarkerId
    {
        set
        {
            markerData = UIManager.Instance.GetMarkerData(value);
        }
    }

    public bool IsGamePlayInProcess
    {
        set
        {
            _isGamePlayInProcess = value;

            btnDecreaseBet.gameObject.SetActive(!value);
            btnIncreaseBet.gameObject.SetActive(!value);
            btnPlay.interactable = !value;
        }
        get
        {
            return _isGamePlayInProcess;
        }
    }

    public bool IsTicketOptionEnable
    {
        set
        {
            _isTicketOptionEnable = value;

            btnPlay.gameObject.SetActive(!value);

            foreach (PrefabBingoGame4Ticket5x3 ticket in ticketList)
                ticket.TicketPurchaseEnable(value);
        }
        get
        {
            return _isTicketOptionEnable;
        }
    }
    #endregion
}
