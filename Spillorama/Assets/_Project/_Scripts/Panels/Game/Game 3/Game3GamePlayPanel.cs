using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using BestHTTP.SocketIO;
using I2.Loc;
#if !UNITY_WEBGL
using I2.Loc;
#endif
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public class Game3GamePlayPanel : MonoBehaviour
{
    #region PUBLIC_VARIABLES
    [Header("Panels")]
    public ChangeMarkerBackgroundPanel changeMarkerBackgroundPanel;

    [Header("Row Details")]
    public PanelRowDetails PanelRowDetails;

    #endregion

    #region PRIVATE_VARIABLES
    [Header("Text")]
    [SerializeField] private TextMeshProUGUI txtLuckeyNumber;
    [SerializeField] private TextMeshProUGUI txtActivePlayers;
    [SerializeField] private TextMeshProUGUI txtTotalWithdrawCount;
    [SerializeField] private TextMeshProUGUI txtLastWithdrawNumber;
    [SerializeField] private TextMeshProUGUI txtWithdrawNumberStats;
    [SerializeField] private TextMeshProUGUI txtPickLuckyNumber;
    [SerializeField] private TextMeshProUGUI txtTotalBetAmount;
    [SerializeField] private TextMeshProUGUI txtTotalProfitAmount;

    [Header("Button")]
    [SerializeField] private Button btnSelectLuckyNumber;
    [SerializeField] private Button btnBuyMore;

    [Header("Transform")]
    [SerializeField] private Transform transformPatternContainer;
    [SerializeField] private Transform transformTicketContainer;
    public RectTransform Tickets_ScrollRect_RT;

    [Header("Prefabs")]
    [SerializeField] private PrefabBingoGame3Pattern prefabBingo3PatternPanel;
    [SerializeField] private PrefabBingoGame3Ticket5x5 prefabBingoGame3Ticket5X5;

    [Header("List")]
    [SerializeField] private List<PrefabBingoGame3Ticket5x5> ticketList;

    [Header("Panels")]
    [SerializeField] private SelectLuckyNumberPanel selectLuckyNumberPanel;
    [SerializeField] private BingoBallPanelManager bingoBallPanelManager;
    [SerializeField] private UtilityMessagePanel messagePopup;
    [SerializeField] private UtilityLoaderPanel loaderPanel;

    [Header("Data")]
    [SerializeField] private GameData gameData;

    private TicketMarkerCellData markerData;
    private int _luckeyNumber = 0;
    private int _maxWithdrawCount = 0;
    private int curruntPatternRow = 0;

    public BingoGame3History BingoGame3History;

    [Header("Timer")]
    public GameObject Game3Timer_UI;
    public TMP_Text Game3_Timer_Txt;
    public Color Timer_Blink_Color, Timer_Normal_Color;

    [Header("Sub Game ID")]
    public string Current_Sub_Game_ID;

    [Header("Patterns")]
    public List<PrefabBingoGame3Pattern> Patterns;
    bool CanBeDeleted;

    [Header("Chat")]
    [SerializeField] private ChatPanel chatPanel;
    public RectTransform Chat_Panel_RT;
    public int Chat_Panel_State;
    public Transform Chat_Open_Close_Icon;
    public GameObject Chat_Open_Open_Text;
    public GameObject Chat_Open_Close_Text;


    [Header("Upcoming Game")]
    public GameObject Upcoming_Game_UI;
    public GameObject Waiting_For_Next_Game;
    float Upcoming_Game_UI_Offset;


    [Header("Header objects")]
    public GameObject Panel_Game_Header;
    #endregion    
    #region UNITY_CALLBACKS
    //private void Awake()
    //{
    //    GameMarkerId = PlayerPrefs.GetInt("Game_Marker", 1);
    //}

    private void OnEnable()
    {
        UIManager.Instance.isGame3 = true;
        Reset();

        GameSocketManager.OnSocketReconnected += Reconnect;
        EnableBroadcasts();
        Screen.sleepTimeout = SleepTimeout.NeverSleep;
        UIManager.Instance.topBarPanel.MiniGamePlanButtonEnable = true;
        UIManager.Instance.topBarPanel.btnMiniGamePlan.gameObject.SetActive(!Utility.Instance.IsSplitScreenSupported);
        Game3Timer_UI.SetActive(false);
        LocalizationManager.OnLocalizeEvent += HandleLanguageChange;
    }

    private void OnDisable()
    {
        SoundManager.Instance.StopNumberAnnouncement();
        UIManager.Instance.isGame3 = false;

        GameSocketManager.OnSocketReconnected -= Reconnect;
        DisableBroadcasts();
        Screen.sleepTimeout = SleepTimeout.SystemSetting;
        foreach (Transform transform in transformPatternContainer)
            Destroy(transform.gameObject);
        Patterns.Clear();
        UIManager.Instance.topBarPanel.MiniGamePlanButtonEnable = false;
        EventManager.Instance.UnSubscribeGame3Room(UIManager.Instance.game3Panel.Game_3_Data.gameId, null);
        UIManager.Instance.withdrawNumberHistoryPanel.Close();

        LocalizationManager.OnLocalizeEvent -= HandleLanguageChange;

    }

    private void HandleLanguageChange()
    {
        GenerateRowDetails(BingoGame3History.patternList);
        GeneratePatternList(BingoGame3History.patternList);
        GenerateWithdrawNumberList(BingoGame3History.withdrawNumberList);
    }

    #endregion

    #region DELEGATE_CALLBACKS
    #endregion

    #region PUBLIC_METHODS
    /// <summary>
    /// Save game/room data & open game play panel
    /// </summary>
    /// <param name="gameData"></param>
    public void OpenPanel(GameData gameData, string gameID)
    {
        this.gameData = gameData;
        this.gameData.gameId = gameID;

        foreach (Transform transform in transformPatternContainer)
            Destroy(transform.gameObject);
        Patterns.Clear();

        //chatPanel.InitiateChatFeature(gameData);
        changeMarkerBackgroundPanel.Close();
        selectLuckyNumberPanel.Close();
        GameMarkerId = PlayerPrefs.GetInt("Game_Marker", 1);

        this.Open();
        if (UIManager.Instance.game2Panel.game2PlayPanel.gameObject == gameObject)
        {
            Chat_Panel_State = Chat_Panel_RT.anchoredPosition.x == 0 ? 1 : 0;
            switch (Chat_Panel_State)
            {
                case 0: // Closed chat panel
                    Tickets_ScrollRect_RT.offsetMin = new Vector2(200f, Tickets_ScrollRect_RT.offsetMin.y);
                    Tickets_ScrollRect_RT.offsetMax = new Vector2(-30f, Tickets_ScrollRect_RT.offsetMax.y);

                    LeanTween.cancel(Panel_Game_Header);
                    LeanTween.move(Panel_Game_Header.GetComponent<RectTransform>(), new Vector2(Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.x - 80f, Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.y), 0.25f)
                        .setOnComplete(() =>
                        {
                            // Your code to be executed when the move is complete
                            Debug.Log("Closed chat panel!");
                        });

                    break;
                case 1: // Opened chat panel
                    Tickets_ScrollRect_RT.offsetMin = new Vector2(200f, Tickets_ScrollRect_RT.offsetMin.y);
                    Tickets_ScrollRect_RT.offsetMax = new Vector2(-400f, Tickets_ScrollRect_RT.offsetMax.y);

                    LeanTween.cancel(Panel_Game_Header);
                    LeanTween.move(Panel_Game_Header.GetComponent<RectTransform>(), new Vector2(Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.x + 80f, Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.y), 0.25f)
                        .setOnComplete(() =>
                        {
                            // Assuming the script is attached to the GameObject with RectTransform
                            RectTransform rectTransform = Panel_Game_Header.GetComponent<RectTransform>();

                            // Set the left and right values to 0
                            rectTransform.offsetMin = new Vector2(0f, rectTransform.offsetMin.y);
                            rectTransform.offsetMax = new Vector2(0f, rectTransform.offsetMax.y);
                        });
                    break;
            }
        }

        Upcoming_Game_UI_Offset = (bingoBallPanelManager.transform.parent.gameObject.GetComponent<RectTransform>().anchoredPosition.x + ((bingoBallPanelManager.transform.parent.gameObject.GetComponent<RectTransform>().rect.width - bingoBallPanelManager.gameObject.GetComponent<RectTransform>().rect.width) / 2f) + bingoBallPanelManager.gameObject.GetComponent<RectTransform>().rect.width) / 2f;

        UIManager.Instance.Current_Game_Number = 3;

        //Invoke("CallSubscribeRoom", 0.1f);
        if (UIManager.Instance.isBreak)
        {
            UIManager.Instance.breakTimePopup.OpenPanel("null");
        }
        else
        {
            CallSubscribeRoom();
        }
    }

    public void ClosePanel()
    {
        UIManager.Instance.game3Panel.Close();
        //if (!UIManager.Instance.multipleGameScreenManager.AnyGameActive())
        //    UIManager.Instance.topBarPanel.OnGamesButtonTap();
        //UIManager.Instance.multipleGameScreenManager.RefreshGridLayoutSize();
        UIManager.Instance.Current_Game_Number = 0;
        /////
        if (Utility.Instance.IsSplitScreenSupported)
        {
            UIManager.Instance.splitScreenGameManager.game3Panel.Close();
            UIManager.Instance.splitScreenGameManager.RefreshSplitScreenFunction();
            if (UIManager.Instance.splitScreenGameManager.SplitScreenRunningGameCount() == 0)
                UIManager.Instance.topBarPanel.OnGamesButtonTap();
        }
        else
        {
            UIManager.Instance.game3Panel.Close();
            UIManager.Instance.topBarPanel.OnGamesButtonTap();
        }
    }

    public void Reconnect()
    {
        Game3Timer_UI.SetActive(false);
        CallSubscribeRoom();
    }

    public void BuyMoreBoardsButtonTap()
    {
        Show_Upcoming_Game_UI();
    }

    public void BuyMoreBoardsclose()
    {
        Upcoming_Game_UI.SetActive(false);
    }

    public void OnLuckeyNumberTap()
    {
        if (ticketList.Count <= 0)
            return;
        selectLuckyNumberPanel.Open();
    }

    public void OpenChangeMarkerBackgroundPanel()
    {
        changeMarkerBackgroundPanel.Open();
    }

    public void OnLuckyNumberSelection(Int32 luckyNumber)
    {
        if (LuckyNumber == luckyNumber)
            return;

        int lastLuckyNumber = LuckyNumber;
        DisplayLoader(true);
        EventManager.Instance.SelectLuckyNumberGame3("Game3", Current_Sub_Game_ID, luckyNumber, (socket, packet, args) =>
        {
            Debug.Log("SelectLuckyNumber response: " + packet.ToString());
            DisplayLoader(false);
            EventResponse eventResponse = JsonUtility.FromJson<EventResponse>(Utility.Instance.GetPacketString(packet));

            if (eventResponse.status == Constants.EventStatus.SUCCESS)
            {
                LuckyNumber = luckyNumber;
                HighlightLuckyNumber();
                //selectLuckyNumberPanel.SetLuckyNumber(luckyNumber);                
            }
            else
            {
                LuckyNumber = lastLuckyNumber;
                //selectLuckyNumberPanel.SetLuckyNumber(lastLuckyNumber);
                GetUtilityMessagePanel().DisplayMessagePopup(eventResponse.message);
            }
        });
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

    public void Chat_Open_Close_Btn()
    {
        switch (Chat_Panel_State)
        {
            case 0: // Open chat panel
                LeanTween.cancel(chatPanel.gameObject);
                LeanTween.move(Chat_Panel_RT, new Vector2(0f, Chat_Panel_RT.anchoredPosition.y), 0.25f);

                LeanTween.cancel(Tickets_ScrollRect_RT.gameObject);
                LeanTween.value(Tickets_ScrollRect_RT.gameObject, Set_Ticket_Scroll_Rect_RT, new Vector2(200f, -30f), new Vector2(200f, -400f), 0.25f);

                Chat_Open_Close_Icon.eulerAngles = new Vector3(0f, 0f, 180f);

                Chat_Open_Open_Text.SetActive(false);
                Chat_Open_Close_Text.SetActive(true);

                Chat_Panel_State = 1;
                if (Upcoming_Game_UI.activeSelf)
                {
                    LeanTween.cancel(Upcoming_Game_UI);
                    LeanTween.move(Upcoming_Game_UI.GetComponent<RectTransform>(), new Vector2((-Chat_Panel_RT.rect.width / 2f) + Upcoming_Game_UI_Offset, Upcoming_Game_UI.GetComponent<RectTransform>().anchoredPosition.y), 0.25f);
                }

                if (Panel_Game_Header.activeSelf)
                {
                    LeanTween.cancel(Panel_Game_Header);
                    LeanTween.move(Panel_Game_Header.GetComponent<RectTransform>(), new Vector2(Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.x - 80, Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.y), 0.25f)
                        .setOnComplete(() =>
                        {
                            // Assuming the script is attached to the GameObject with RectTransform
                            RectTransform rectTransform = Panel_Game_Header.GetComponent<RectTransform>();

                            // Set the left and right values to 0
                            rectTransform.offsetMin = new Vector2(0f, rectTransform.offsetMin.y);
                            rectTransform.offsetMax = new Vector2(0f, rectTransform.offsetMax.y);

                        });
                }


                break;
            case 1: // Close chat panel
                LeanTween.cancel(chatPanel.gameObject);
                LeanTween.move(Chat_Panel_RT, new Vector2(Chat_Panel_RT.rect.width * 3f, Chat_Panel_RT.anchoredPosition.y), 0.25f);
                LeanTween.cancel(Tickets_ScrollRect_RT.gameObject);
                LeanTween.value(Tickets_ScrollRect_RT.gameObject, Set_Ticket_Scroll_Rect_RT, new Vector2(200f, -400f), new Vector2(200f, -30f), 0.25f);

                Chat_Open_Close_Icon.eulerAngles = Vector3.zero;

                Chat_Open_Open_Text.SetActive(true);
                Chat_Open_Close_Text.SetActive(false);

                Chat_Panel_State = 0;
                if (Upcoming_Game_UI.activeSelf)
                {
                    LeanTween.cancel(Upcoming_Game_UI);
                    LeanTween.move(Upcoming_Game_UI.GetComponent<RectTransform>(), new Vector2(Upcoming_Game_UI_Offset, Upcoming_Game_UI.GetComponent<RectTransform>().anchoredPosition.y), 0.25f);
                }
                if (Panel_Game_Header.activeSelf)
                {
                    LeanTween.cancel(Panel_Game_Header);
                    LeanTween.move(Panel_Game_Header.GetComponent<RectTransform>(), new Vector2(Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.x + 80f, Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.y), 0.25f)
                        .setOnComplete(() =>
                        {

                        });
                }

                break;
        }
    }

    void Set_Ticket_Scroll_Rect_RT(Vector2 size)
    {
        Tickets_ScrollRect_RT.offsetMin = new Vector2(size.x, Tickets_ScrollRect_RT.offsetMin.y);
        Tickets_ScrollRect_RT.offsetMax = new Vector2(size.y, Tickets_ScrollRect_RT.offsetMax.y);
    }

    #endregion

    #region BROADCAST_HANDLING
    /// <summary>
    /// Enable all required broadcasts, which is usefull for game play
    /// </summary>
    private void EnableBroadcasts()
    {
        Debug.Log("Game 3 namespace: " + GameSocketManager.SocketGame3.Namespace);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.SubscribeRoom, OnSubscribeRoom);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.UpdatePlayerRegisteredCount, OnUpdatePlayerRegisteredCount);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.GameStartWaiting, OnGameStartWaiting);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.GameStart, OnGameStart);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.WithdrawBingoBall, OnWithdrawBingoBall);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.PatternChange, OnPatternChange);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.TicketCompleted, OnTicketCompleted);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.UpdateProfitAmount, OnUpdateProfitAmount);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.PatternWin, OnPatternWin);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.GameFinish, OnGameFinish);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.GameTerminate, OnGameTerminate);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.GameRefreshRoom, On_Game_3_Refresh_Room);
        GameSocketManager.SocketGame3.On(Constants.BroadcastName.GameStartTimer, On_Start_Timer_Broadcast);
        GameSocketManager.socketManager.Socket.On(Constants.BroadcastName.BreakTimeStart, OnBreak);
    }

    /// <summary>
    /// Disable all broadcasts
    /// </summary>
    private void DisableBroadcasts()
    {
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.SubscribeRoom);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.UpdatePlayerRegisteredCount);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.GameStartWaiting);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.GameStart);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.WithdrawBingoBall);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.PatternChange);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.TicketCompleted);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.UpdateProfitAmount);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.PatternWin);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.GameFinish);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.GameTerminate);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.GameRefreshRoom);
        GameSocketManager.SocketGame3.Off(Constants.BroadcastName.GameStartTimer);
        GameSocketManager.socketManager.Socket.Off(Constants.BroadcastName.BreakTimeStart);
    }

    private void OnSubscribeRoom(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnSubscribeRoom: " + packet.ToString());

        BingoGame3History resp = JsonUtility.FromJson<BingoGame3History>(Utility.Instance.GetPacketString(packet));
        CallPlayerHallLimitEvent();
        BingoGame3History = resp;
        SoundManager.Instance.ResetPlayedAnnouncements();
        PanelRowDetails.txtGameName.GetComponent<LocalizationParamsManager>().SetParameterValue("gameNumber", BingoGame3History.gameCount.ToString());
        PanelRowDetails.txtGameName.GetComponent<LocalizationParamsManager>().SetParameterValue("gameName", BingoGame3History.gameName.ToString());
        GenerateRowDetails(BingoGame3History.patternList);
        GeneratePatternList(BingoGame3History.patternList);
        jackpotUpdateDataUpdate(BingoGame3History.jackPotData);
        totalBetAmount = BingoGame3History.totalBetAmount;
        TotalProfitAmount = BingoGame3History.totalWon;
        if (BingoGame3History.subGameId != Current_Sub_Game_ID)
            return;

        Reset();
        isTimerRecieved = resp.disableCancelButton;
        GenerateRowDetails(BingoGame3History.patternList);
        GeneratePatternList(BingoGame3History.patternList);
        EditLuckyNumberEnable = BingoGame3History.editLuckyNumber;
        LuckyNumber = BingoGame3History.luckyNumber;
        TotalRegisteredPlayerCount = BingoGame3History.activePlayers;
        MaxWithdrawCount = BingoGame3History.maxWithdrawCount;
        TotalWithdrawCount = BingoGame3History.totalWithdrawCount;
        GenerateTicketList(resp.ticketList);
        if (resp.disableCancelButton == true)
        {
            foreach (var btn in ticketList)
            {
                btn.deleteBtn.gameObject.SetActive(false);
            }
            btnBuyMore.interactable = false;
        }
        else
        {
            foreach (var btn in ticketList)
            {
                btn.deleteBtn.gameObject.SetActive(true);
            }
            btnBuyMore.interactable = true;
        }
        GenerateWithdrawNumberList(BingoGame3History.withdrawNumberList);
        selectLuckyNumberPanel.GenerateLuckyNumbers(BingoGame3History.luckyNumber);
        HighlightLuckyNumber();
        UIManager.Instance.withdrawNumberHistoryPanel.AddNumber(BingoGame3History.withdrawNumberList);
        DisplayLoader(false);
    }

    void CallPlayerHallLimitEvent()
    {
        EventManager.Instance.PlayerHallLimit((socket, packet, args) =>
        {
            Debug.Log("PlayerHallLimit: " + packet.ToString());
            EventResponse<PlayerApprovedHallsResponse> response = JsonUtility.FromJson<EventResponse<PlayerApprovedHallsResponse>>(Utility.Instance.GetPacketString(packet));
            if (response.status == Constants.EventStatus.SUCCESS)
            {
                UIManager.Instance.topBarPanel.SetSwitchHallDropdown(response.result.approvedHalls);
            }
            else
            {
                Debug.Log("PlayerHallLimit: " + response.message);
                UIManager.Instance.messagePopup.DisplayMessagePopup(response.message);
            }
        });
    }

    void OnBreak(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnBreak Broadcast: " + packet.ToString());
        BreakTime breakTime = JsonUtility.FromJson<BreakTime>(Utility.Instance.GetPacketString(packet));
        if (breakTime.startBreakTime != null && breakTime.endBreakTime != null)
        {
            //Debug.Log("enter..break time");
            UIManager.Instance.startBreakTime = DateTimeOffset.Parse(breakTime.startBreakTime, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal);
            UIManager.Instance.endBreakTime = DateTimeOffset.Parse(breakTime.endBreakTime, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal);
            UIManager.Instance.isBreak = breakTime.isBreak;
            UIManager.Instance.breakTimePopup.OpenPanel(breakTime.gameType);
            if (BackgroundManager.Instance.checkBreakTime != null)
            {
                StopCoroutine(BackgroundManager.Instance.checkBreakTime);
            }
            //BackgroundManager.Instance.checkBreakTime = StartCoroutine(BackgroundManager.Instance.CheckBreakTime());
            // BackgroundManager.Instance.StopBreakCheck();
            // BackgroundManager.Instance.StartBreakCheck();
        }
    }

    public void TicketDeleteBtnClose()
    {
        foreach (var btn in ticketList)
        {
            btn.deleteBtn.gameObject.SetActive(false);
        }
    }

    private void OnUpdatePlayerRegisteredCount(Socket socket, Packet packet, object[] args)
    {
        Debug.Log($"UpdatePlayerRegisteredCount: {packet}");
        PlayerRegisteredCount data = JsonUtility.FromJson<PlayerRegisteredCount>(Utility.Instance.GetPacketString(packet));

        TotalRegisteredPlayerCount = data.playerRegisteredCount;
    }

    private void OnGameStartWaiting(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnGameStartWaiting: " + packet.ToString());
    }

    private void OnGameStart(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnGameStart: " + packet.ToString());

        //Game3GameStart game3GameStart = JsonUtility.FromJson<Game3GameStart>(Utility.Instance.GetPacketString(packet));
        Game3Timer_UI.SetActive(false);
        Waiting_For_Next_Game.SetActive(false);
        selectLuckyNumberPanel.ClosePanel();
        BuyMoreBoardsclose();
        UIManager.Instance.topBarPanel.miniGamePlanPanel.Close();
        EditLuckyNumberEnable = false;
        foreach (var btn in ticketList)
        {
            btn.deleteBtn.gameObject.SetActive(false);
        }
        //LuckyNumber = game3GameStart.luckyNumber;
    }

    private void OnWithdrawBingoBall(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnWithdrawBingoBall: " + packet.ToString());

        BingoNumberData bingoNumberData = JsonUtility.FromJson<BingoNumberData>(Utility.Instance.GetPacketString(packet));
        TotalWithdrawCount = bingoNumberData.totalWithdrawCount;
        WithdrawBingoBallAction(bingoNumberData);
        BingoGame3History.withdrawNumberList.Add(bingoNumberData);
        if (UIManager.Instance.gameAssetData.isVoiceOn == 1)
        {

            if (BingoGame3History.isSoundPlay)
            {
                SoundManager.Instance.PlayNorwegianMaleNumberAnnouncement(bingoNumberData.number, false);
            }
            //if (UIManager.Instance.gameAssetData.selectedVoiceLanguage == 0)
            //{
            //    SoundManager.Instance.PlayNorwegianMaleNumberAnnouncement(bingoNumberData.number, BingoGame3History.isSoundPlay);
            //}
            //else if (UIManager.Instance.gameAssetData.selectedVoiceLanguage == 1)
            //{
            //    SoundManager.Instance.PlayNorwegianFemaleNumberAnnouncement(bingoNumberData.number, BingoGame3History.isSoundPlay);
            //}
            //else
            //{
            //    SoundManager.Instance.PlayNumberAnnouncement(bingoNumberData.number, BingoGame3History.isSoundPlay);
            //}
        }
        //SoundManager.Instance.PlayGame3NumberAnnouncement(bingoNumberData.number, true, BingoGame3History.isSoundPlay);
        UIManager.Instance.withdrawNumberHistoryPanel.AddNumber(bingoNumberData);
        Waiting_For_Next_Game.SetActive(false);
        foreach (var btn in ticketList)
        {
            btn.deleteBtn.gameObject.SetActive(false);
        }
    }

    private void OnPatternChange(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnPatternChange: " + packet.ToString());
        PatternChangeResponse patternList = JsonUtility.FromJson<PatternChangeResponse>(Utility.Instance.GetPacketString(packet));
        BingoGame3History.patternList = patternList.patternList;
        GenerateRowDetails(patternList.patternList);
        GeneratePatternList(patternList.patternList);
        jackpotUpdateDataUpdate(patternList.jackPotData);

        foreach (PrefabBingoGame3Ticket5x5 ticket in ticketList)
        {
            ticket.Stop_Blink();
            foreach (BingoTicketSingleCellData item in ticket.ticketCellList)
            {

                item.Stop_NumberBlink();
            }
        }
    }

    private void jackpotUpdateDataUpdate(JackPotData jackPotData)
    {
        PanelRowDetails.JackpotObject.SetActive(jackPotData.isDisplay);
        PanelRowDetails.txtJackpotDetails.text = jackPotData.isDisplay
            ? $"{jackPotData.draw} Jackpot : {jackPotData.winningAmount} kr"
            : "No Jackpot Data";
    }

    private void OnTicketCompleted(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnTicketCompleted: " + packet.ToString());
        TicketCompletedResponse ticketData = JsonUtility.FromJson<TicketCompletedResponse>(Utility.Instance.GetPacketString(packet));

        if (ticketData.gameId != Current_Sub_Game_ID)
            return;

        foreach (PrefabBingoGame3Ticket5x5 tickets in ticketList)
        {
            tickets.Stop_Blink();
            foreach (BingoTicketSingleCellData item in tickets.ticketCellList)
            {

                item.Stop_NumberBlink();
            }
        }
        PrefabBingoGame3Ticket5x5 ticket = GetTicketById(ticketData.ticketId);
        ticket.Togo_Txt.text = Constants.LanguageKey.PatternCompletedMessage;

        if (ticket != null)
        {
            // Set WonAmount BEFORE TicketCompleted to ensure panel displays correct amount
            ticket.WonAmount = ticketData.winningAmount;
            ticket.TicketCompleted = true;
            UIManager.Instance.LaunchWinningAnimation();
        }
    }

    private void OnUpdateProfitAmount(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("UpdateProfitAmount: Response" + packet.ToString());
        UpdateWonAmountResponse ResponseData = JsonUtility.FromJson<UpdateWonAmountResponse>(Utility.Instance.GetPacketString(packet));
        TotalProfitAmount = ResponseData.totalWon;
    }

    private void OnPatternWin(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnPatternWin: " + packet.ToString());
        TicketCompletedResponse ticketData = JsonUtility.FromJson<TicketCompletedResponse>(Utility.Instance.GetPacketString(packet));

        if (ticketData.gameId != Current_Sub_Game_ID)
            return;

        PrefabBingoGame3Ticket5x5 ticket = GetTicketById(ticketData.ticketId);
        if (ticket != null)
        {
            ticket.Togo_Txt.text = Constants.LanguageKey.PatternCompletedMessage;
            // Set WonAmount BEFORE PatternWonResult to ensure panel displays correct amount
            ticket.WonAmount = ticketData.winningAmount;
            ticket.PatternWonResult = "";
        }
    }

    private void OnGameFinish(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnGameFinish: " + packet.ToString());

        BingoGameFinishResponse bingoGameFinishResponse = JsonUtility.FromJson<BingoGameFinishResponse>(Utility.Instance.GetPacketString(packet));

        //if (bingoGameFinishResponse.gameId != this.gameData.gameId)
        if (bingoGameFinishResponse.gameId != Current_Sub_Game_ID)
            return;

        btnBuyMore.interactable = true;

        Debug.Log("I REACH HERE");

        for (int i = 0; i < ticketList.Count; i++)
        {
            if (ticketList[i].Blink_Tween != null)
                ticketList[i].Stop_Blink();

            foreach (BingoTicketSingleCellData item in ticketList[i].ticketCellList)
            {
                item.Stop_NumberBlink();
            }
        }

        if (bingoGameFinishResponse.message != "")
            //GetUtilityMessagePanel().DisplayMessagePopup(bingoGameFinishResponse.message);
            BackgroundManager.Instance.PlayerUpdateIntervalCall();
    }

    private void OnGameTerminate(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnGameTerminate: " + packet.ToString());

        GameTerminateResponse gameTerminateResponse = JsonUtility.FromJson<GameTerminateResponse>(Utility.Instance.GetPacketString(packet));

        if (gameTerminateResponse.gameId != this.gameData.gameId)
            return;

        if (Utility.Instance.IsStandAloneVersion())
            ClosePanel();
        else
            UIManager.Instance.topBarPanel.OnGamesButtonTap();

        if (gameTerminateResponse.message.Length > 0)
            GetUtilityMessagePanel().DisplayMessagePopup(gameTerminateResponse.message);
    }

    internal void Change_Profile_Pic(string playerID)
    {
        chatPanel.UpdatePlayerProfile(playerID);
    }

    void On_Game_3_Refresh_Room(Socket socket, Packet packet, object[] args)
    {
        print($"RefreshRoom : {packet}");
        RefreshRoom res = JsonUtility.FromJson<RefreshRoom>(Utility.Instance.GetPacketString(packet));

        print($"{res.gameId} != {UIManager.Instance.game3Panel.Game_3_Data.gameId} : {res.gameId != UIManager.Instance.game3Panel.Game_3_Data.gameId}");

        if (res.gameId != UIManager.Instance.game3Panel.Game_3_Data.gameId)
            return;

        isTimerRecieved = false;
        UIManager.Instance.messagePopup.OnCloseButtonTap();
        UIManager.Instance.lobbyPanel.gamePlanPanel.Game3();
    }
    public bool isTimerRecieved = false;

    void On_Start_Timer_Broadcast(Socket socket, Packet packet, object[] args)
    {
        Debug.Log($"On_Start_Timer_Broadcast Response : {packet.ToString()}");
        GameTimer timer = JsonUtility.FromJson<GameTimer>(Utility.Instance.GetPacketString(packet));
        Game3Timer_UI.SetActive(timer.remainingTime > 0);
        isTimerRecieved = true;
        Game3_Timer_Txt.text = timer.remainingTime.ToTime();
        Game3_Timer_Txt.color = Timer_Normal_Color;
        if (timer.remainingTime < 6)
        {
            //TimerTxtAnim();
            btnBuyMore.interactable = false;
        }
        foreach (var btn in ticketList)
        {
            btn.deleteBtn.gameObject.SetActive(false);
        }
    }

    void TimerTxtAnim()
    {
        LeanTween.scale(Game3Timer_UI, Vector3.one, 0.25f)
            .setOnComplete(() =>
            {
                LeanTween.scale(Game3Timer_UI, Vector3.one * 1.15f, 0.5f)
                .setOnComplete(() =>
                {
                    LeanTween.scale(Game3Timer_UI, Vector3.one, 0.25f);
                });
            });
        LeanTween.value(Game3_Timer_Txt.gameObject, Set_Color_Callback, Timer_Normal_Color, Timer_Blink_Color, 0.5f)
                .setOnComplete(() =>
                {
                    LeanTween.value(Game3_Timer_Txt.gameObject, Set_Color_Callback, Timer_Blink_Color, Timer_Normal_Color, 0.5f);
                });
    }

    void Set_Color_Callback(Color c)
    {
        c.a = 1f;
        Game3_Timer_Txt.color = c;
    }

    #endregion

    #region PRIVATE_METHODS
    /// <summary>
    /// Emit subscribe room event
    /// </summary>
    public void CallSubscribeRoom()
    {
        DisableBroadcasts();
        EnableBroadcasts();
        DisplayLoader(true);
        Upcoming_Game_UI.SetActive(false);
        Waiting_For_Next_Game.SetActive(false);
        EventManager.Instance.SubscribeRoom("Game3", gameData.gameId, UIManager.Instance.gameAssetData.PreviousGameId, (socket, packet, args) =>
        {
            Debug.Log("SubscribeRoom Emit Response: " + packet.ToString());
            BackgroundManager.Instance.PlayerUpdateIntervalCall();
            UIManager.Instance.selectPurchaseTypePanel.Close();
            EventResponse<BingoGame3History> response = JsonUtility.FromJson<EventResponse<BingoGame3History>>(Utility.Instance.GetPacketString(packet));
            // CallPlayerHallLimitEvent();
            Current_Sub_Game_ID = response.result.subGameId;
            UIManager.Instance.gameAssetData.PreviousGameId = Current_Sub_Game_ID;

            DisplayLoader(false);
            if (response.status == Constants.EventStatus.FAIL && response.messageType == Constants.MessageType.SomethingWentWrong)
            {
                GetUtilityMessagePanel().DisplayMessagePopup(response.messageType);
                UIManager.Instance.topBarPanel.OnGamesButtonTap();
                return;
            }
            else
            {
                Reset();
                EditLuckyNumberEnable = response.result.editLuckyNumber;
                LuckyNumber = response.result.luckyNumber;
                TotalRegisteredPlayerCount = response.result.activePlayers;
                MaxWithdrawCount = response.result.maxWithdrawCount;
                TotalWithdrawCount = response.result.totalWithdrawCount;

                GenerateTicketList(response.result.ticketList);
                GenerateRowDetails(response.result.patternList);
                GeneratePatternList(response.result.patternList);
                GenerateWithdrawNumberList(response.result.withdrawNumberList);
                if (response.result.disableCancelButton == true)
                {
                    foreach (var btn in ticketList)
                    {
                        btn.deleteBtn.gameObject.SetActive(false);
                    }
                    btnBuyMore.interactable = false;
                }
                else
                {
                    foreach (var btn in ticketList)
                    {
                        btn.deleteBtn.gameObject.SetActive(true);
                    }
                    btnBuyMore.interactable = true;
                }

                Waiting_For_Next_Game.SetActive(response.result.withdrawNumberList.Count == 0);

                selectLuckyNumberPanel.GenerateLuckyNumbers(response.result.luckyNumber);
                HighlightLuckyNumber();
                UIManager.Instance.withdrawNumberHistoryPanel.AddNumber(response.result.withdrawNumberList);
                chatPanel.InitiateChatFeatureSubGame(UIManager.Instance.game3Panel.Game_3_Data.gameId, "Game3");
            }
        });
    }

    private void GenerateRowDetails(List<PatternData> patternList)
    {
        for (int i = 0; i < PanelRowDetails.Rows.Length; i++)
        {
            PanelRowDetails.Rows[i].gameObject.SetActive(false);
        }
        for (int i = 0; i < PanelRowDetails.RowsDevider.Length; i++)
        {
            PanelRowDetails.RowsDevider[i].gameObject.SetActive(false);
        }

        //Active Devider
        for (int i = 0; i < patternList.Count; i++)
        {
            if (i > 0)
            {
                PanelRowDetails.RowsDevider[i - 1].gameObject.SetActive(true);
            }
        }


        curruntPatternRow = 0;

        if (patternList.Count > 0)
        {
            for (int i = 0; i < patternList.Count; i++)
            {

                int incrementedI = i + 1; // Create a new variable to store the incremented value

                if (patternList[i].isWon)
                {
                    curruntPatternRow = i;
                    curruntPatternRow++;

                    if (patternList[i].name == "Row 1" || patternList[i].name == "Row 2" || patternList[i].name == "Row 3" || patternList[i].name == "Row 4")
                    {
                        PanelRowDetails.Rows[i].text = I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow") + " " + incrementedI + " - " + patternList[i].amount + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else if (patternList[i].name == "Picture")
                    {
                        PanelRowDetails.Rows[i].text = I2.Loc.LocalizationManager.GetTranslation("TextDataSubPicture") + " - " + patternList[i].amount + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else if (patternList[i].name == "Frame")
                    {
                        PanelRowDetails.Rows[i].text = I2.Loc.LocalizationManager.GetTranslation("TextDataSubFrame") + " - " + patternList[i].amount + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);

                    }
                    else if (patternList[i].name == "Full House")
                    {
                        PanelRowDetails.Rows[i].text = I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow") + " 5" + " - " + patternList[i].amount + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else
                    {
                        //PanelRowDetails.Rows[i].text = I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow") + " " + incrementedI + " - " + patternList[i].amount + " kr";
                        //PanelRowDetails.Rows[i].gameObject.SetActive(true);

                        PanelRowDetails.Rows[i].text = patternList[i].name + " - " + patternList[i].amount + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);

                    }

                    PanelRowDetails.Rows[i].GetComponent<TextMeshProUGUI>().color = PanelRowDetails.ActiveColour;
                }
                else
                {


                    if (patternList[i].name == "Row 1" || patternList[i].name == "Row 2" || patternList[i].name == "Row 3" || patternList[i].name == "Row 4")
                    {

                        PanelRowDetails.Rows[i].text = I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow") + " " + incrementedI + " - " + patternList[i].amount + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else if (patternList[i].name == "Picture")
                    {
                        PanelRowDetails.Rows[i].text = I2.Loc.LocalizationManager.GetTranslation("TextDataSubPicture") + " - " + patternList[i].amount + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else if (patternList[i].name == "Frame")
                    {
                        PanelRowDetails.Rows[i].text = I2.Loc.LocalizationManager.GetTranslation("TextDataSubFrame") + " - " + patternList[i].amount + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);

                    }
                    else if (patternList[i].name == "Full House")
                    {
                        PanelRowDetails.Rows[i].text = I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow") + " 5" + " - " + patternList[i].amount + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else
                    {

                        double amount = patternList[i].amount;
                        string formattedAmount = (amount % 1 == 0) ? amount.ToString("0") : amount.ToString("0.00");
                        PanelRowDetails.Rows[i].text = patternList[i].name + " - " + formattedAmount + " kr";
                        //PanelRowDetails.Rows[i].text = patternList[i].name + " - " + patternList[i].amount.ToString("0.00") + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);

                    }

                    PanelRowDetails.Rows[i].GetComponent<TextMeshProUGUI>().color = PanelRowDetails.DeActiveColour;
                }
            }
        }
        else
        {
            //PanelRowDetails.Close();
        }


    }

    /// <summary>
    /// Remove/Destroy old jackpot list & generate new list
    /// </summary>
    /// <param name="jackpotList"></param>
    private void GeneratePatternList(List<PatternData> patternList)
    {

        //foreach (Transform transform in transformPatternContainer)
        //    Destroy(transform.gameObject);

        //foreach (Transform transform in transformPatternContainer)
        //    Destroy(transform.gameObject);


        // Destroy all children of transformPatternContainer
        foreach (Transform child in transformPatternContainer)
        {
            Destroy(child.gameObject);
        }
        // Clear the Patterns list
        Patterns.Clear();


        for (int i = Patterns.Count - 1; i > -1; i--)
        {
            CanBeDeleted = true;
            for (int j = 0; j < patternList.Count; j++)
            {
                if (Patterns[i].Pattern_ID == patternList[j]._id)
                {
                    CanBeDeleted = false;
                    Patterns[i].Pattern_Prize = patternList[j].amount;
                    Patterns[i].Prize_Txt.text = $"{patternList[j].amount} kr";
                    patternList.RemoveAt(j);
                    break;
                }
            }
            if (CanBeDeleted)
            {
                Destroy(Patterns[i].gameObject);
                Patterns.RemoveAt(i);
            }
        }


        if (patternList.Count > 0)
        {
            for (int i = 0; i < patternList.Count; i++)
            {
                if (i == curruntPatternRow)
                {
                    PrefabBingoGame3Pattern newPatternPanel = Instantiate(prefabBingo3PatternPanel, transformPatternContainer);
                    newPatternPanel.SetData(patternList[i], i + 1);
                    Patterns.Add(newPatternPanel);
                }
            }

            for (int i = 1; i < 1; i++)
                if (Patterns[i].Ball_Number <= Patterns[0].Ball_Number)
                    Patterns[i].transform.SetAsFirstSibling();
            for (int j = 4; j > 0; j--)
                for (int i = 0; i < Patterns.Count; i++)
                    if (Patterns[i].Pattern_Design == j)
                        Patterns[i].transform.SetAsFirstSibling();
        }
        //foreach (PatternData data in patternList)
        //{
        //    PrefabBingoGame3Pattern newPatternPanel = Instantiate(prefabBingo3PatternPanel, transformPatternContainer);
        //    newPatternPanel.SetData(data);
        //}
    }

    /// <summary>
    /// Remove/Destroy old withdraw number list & genereate new list
    /// </summary>
    /// <param name="withdrawNumberList"></param>
    private void GenerateWithdrawNumberList(List<BingoNumberData> withdrawNumberList)
    {
        foreach (BingoNumberData data in withdrawNumberList)
        {
            MarkWithdrawNumbers(data);
        }

        if (withdrawNumberList.Count > 0)
            LastWithdrawNumber = withdrawNumberList[withdrawNumberList.Count - 1].number;

        bingoBallPanelManager.WithdrawList(withdrawNumberList, "Game 3");
    }

    private void RunBestCardFirstAction()
    {
        //ticketList.Sort(BingoTicket.ReverseSortBySelectedNumber);

        //for (int i = 0; i < ticketList.Count; i++)
        //    ticketList[i].transform.SetSiblingIndex(i);
        // PrefabBingoGame3Ticket5x5 ticket;
        // for (int i = 1; i < ticketList.Count; i++)
        // {
        //     for (int j = 0; j < i; j++)
        //     {
        //         if (ticketList[j].Pattern_Remaining_Cell_Count > ticketList[i].Pattern_Remaining_Cell_Count)
        //         {
        //             ticketList[j].transform.SetSiblingIndex(i);
        //             ticketList[i].transform.SetSiblingIndex(j);
        //             ticket = ticketList[j];
        //             ticketList[j] = ticketList[i];
        //             ticketList[i] = ticket;
        //         }
        //     }
        // }

        //nicola change
        // Sort tickets by the fewest remaining pattern cells (best card first)
        ticketList = ticketList.OrderBy(t => t.Pattern_Remaining_Cell_Count).ToList();

        // Update sibling order in the UI hierarchy
        for (int i = 0; i < ticketList.Count; i++)
        {
            ticketList[i].transform.SetSiblingIndex(i);
        }

        // Force the layout to refresh
        Canvas.ForceUpdateCanvases();
        if (ticketList.Count > 0)
        {
            LayoutRebuilder.ForceRebuildLayoutImmediate(ticketList[0].transform.parent as RectTransform);
        }
    }

    /// <summary>
    /// NewNumberWithdrawEvent will show new withdraw bingo ball with animation
    /// </summary>
    /// <param name="newBingoNumberData"></param>
    private void WithdrawBingoBallAction(BingoNumberData newBingoNumberData)
    {
        bingoBallPanelManager.NewWithdraw(newBingoNumberData, true, "Game 3");
        MarkWithdrawNumbers(newBingoNumberData, true);
        LastWithdrawNumber = newBingoNumberData.number;
    }

    /// <summary>
    /// Mark new withdraw number on all ticket
    /// </summary>
    /// <param name="data"></param>
    private void MarkWithdrawNumbers(BingoNumberData data, bool playSound = false)
    {
        foreach (PrefabBingoGame3Ticket5x5 ticket in ticketList)
        {
            ticket.MarkNewWithdrawNumber(data.number, false, false, playSound);
            ticket.Match_Pattern_And_Set_Togo_Txt();
        }
        RunBestCardFirstAction();
    }

    public void HighlightLuckyNumber()
    {
        foreach (PrefabBingoGame3Ticket5x5 ticket in ticketList)
        {
            ticket.HighlightLuckyNumber(LuckyNumber);
        }
    }

    /// <summary>
    /// Remove/Destroy old ticket list & generate new list
    /// </summary>
    /// <param name="ticketDataList"></param>
    private void GenerateTicketList(List<GameTicketData> ticketDataList)
    {
        Clear_Tickets(Current_Sub_Game_ID, false);
        foreach (GameTicketData data in ticketDataList)
        {
            PrefabBingoGame3Ticket5x5 newTicket = Instantiate(prefabBingoGame3Ticket5X5, transformTicketContainer);
            newTicket.SetData(data, markerData);
            if (BingoGame3History.disableCancelButton)
            {
                newTicket.deleteBtn.gameObject.SetActive(false);
            }
            else
            {
                newTicket.deleteBtn.gameObject.SetActive(true);
            }
            ticketList.Add(newTicket);
        }
        if (ticketList.Count == 0)
            Show_Upcoming_Game_UI();
    }

    internal void Clear_Tickets(string subgameID, bool showUpcomingGameUI = true)
    {
        if (Current_Sub_Game_ID != subgameID)
            return;
        foreach (Transform transform in transformTicketContainer)
            Destroy(transform.gameObject);
        ticketList.Clear();
        if (showUpcomingGameUI)
            Show_Upcoming_Game_UI();
    }

    void Show_Upcoming_Game_UI()
    {
        EventManager.Instance.Game3List((socket, packet, args) =>
        {
            print($"Game 3 list response : {packet}");
            EventResponse<Game3PlanList> response = JsonUtility.FromJson<EventResponse<Game3PlanList>>(Utility.Instance.GetPacketString(packet));
            if (response.status == Constants.EventStatus.SUCCESS)
            {
                Upcoming_Game_UI.GetComponent<PrefabGame3UpcomingGame>().Set_Data(response.result.upcomingGames[0]);
                if (Chat_Panel_RT != null)
                    Upcoming_Game_UI.GetComponent<RectTransform>().anchoredPosition = new Vector2(Chat_Panel_RT.anchoredPosition.x == 0f ? (-Chat_Panel_RT.rect.width / 2f) + Upcoming_Game_UI_Offset : Upcoming_Game_UI_Offset, Upcoming_Game_UI.GetComponent<RectTransform>().anchoredPosition.y);
                Upcoming_Game_UI.SetActive(true);
            }
        });
    }

    internal void Clear_Luck_Number(string subgameID)
    {
        if (Current_Sub_Game_ID != subgameID)
            return;

        LuckyNumber = 0;
    }

    internal void Clear_totat_Bet_Amount(string subgameID)
    {
        if (Current_Sub_Game_ID != subgameID)
            return;

        totalBetAmount = 0;
    }

    private PrefabBingoGame3Ticket5x5 GetTicketById(string ticketId)
    {
        foreach (PrefabBingoGame3Ticket5x5 ticket in ticketList)
        {
            if (ticket.TicketId == ticketId)
                return ticket;
        }

        return null;
    }

    /// <summary>
    /// Reset/Clear all game data. normally calls on starting game or reconnecting existing game
    /// </summary>
    private void Reset()
    {
        LastWithdrawNumber = 0;
        LuckyNumber = 0;
        TotalRegisteredPlayerCount = 0;

        bingoBallPanelManager.Reset();
        ticketList.Clear();

        foreach (Transform transform in transformPatternContainer)
            Destroy(transform.gameObject);
        Patterns.Clear();

        foreach (Transform transform in transformTicketContainer)
            Destroy(transform.gameObject);

        UIManager.Instance.withdrawNumberHistoryPanel.Close();
        UIManager.Instance.withdrawNumberHistoryPanel.Reset();
    }
    #endregion

    #region COROUTINES
    #endregion

    #region GETTER_SETTER
    public int LuckyNumber
    {
        set
        {
            _luckeyNumber = value;

            txtLuckeyNumber.text = (value > 0) ? value.ToString() : "";
            //if (value > 0)
            //    txtLuckeyNumber.text = value.ToString();
            //else
            //    txtLuckeyNumber.text = "";
        }
        get
        {
            return _luckeyNumber;
        }
    }

    public int GameMarkerId
    {
        set
        {
            PlayerPrefs.SetInt("Game_Marker", value);
            markerData = UIManager.Instance.GetMarkerData(value);
            foreach (PrefabBingoGame3Ticket5x5 ticket in ticketList)
            {
                if (ticket != null)
                    ticket.ModifyMarkerDesign(markerData);
            }
        }
    }

    public int TotalRegisteredPlayerCount
    {
        set
        {
            txtActivePlayers.text = value.ToString("00");
        }
    }

    public int TotalWithdrawCount
    {
        set
        {
            txtWithdrawNumberStats.text = value.ToString("00") + "/" + MaxWithdrawCount;
        }
    }

    public bool EditLuckyNumberEnable
    {
        set
        {
            txtPickLuckyNumber.gameObject.SetActive(value);
            btnSelectLuckyNumber.enabled = value;
        }
    }

    public int totalBetAmount
    {
        set
        {
            txtTotalBetAmount.GetComponent<LocalizationParamsManager>().SetParameterValue("TotalBet", value.ToString());
        }
    }

    public int TotalProfitAmount
    {
        set
        {
            txtTotalProfitAmount.GetComponent<LocalizationParamsManager>().SetParameterValue("TotalProfit", value.ToString());
        }
    }

    public int MaxWithdrawCount
    {
        set
        {
            _maxWithdrawCount = value;
        }
        get
        {
            return _maxWithdrawCount;
        }
    }

    public int LastWithdrawNumber
    {
        set
        {
            txtLastWithdrawNumber.text = value.ToString("00");
        }
    }
    #endregion
}
