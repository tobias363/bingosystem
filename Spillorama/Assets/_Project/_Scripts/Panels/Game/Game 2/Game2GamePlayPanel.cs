using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using BestHTTP.SocketIO;
using I2.Loc;
#if !UNITY_WEBGL
using I2.Loc;
#endif
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public class Game2GamePlayPanel : MonoBehaviour
{
    #region PUBLIC_VARIABLES

    [Header("Panels")]
    public ChangeMarkerBackgroundPanel changeMarkerBackgroundPanel;
    public PrefabGame2UpcomingGames prefabGame2UpcomingGames;

    public delegate void ticketNumbersGridLayoutGroupCellSizeUpdate(float value);
    public event ticketNumbersGridLayoutGroupCellSizeUpdate MyEvent;

    public BingoGame2History bingoGame2History;

    #endregion

    #region PRIVATE_VARIABLES
    [Header("Text")]
    [SerializeField] private TextMeshProUGUI txtLuckeyNumber;
    [SerializeField] private TextMeshProUGUI txtActivePlayers;
    [SerializeField] private TextMeshProUGUI txtTotalWithdrawCount;
    [SerializeField] private TextMeshProUGUI txtTotalBetAmount;

    [Header("Button")]
    [SerializeField] private Button btnBuyMore;


    [Header("Toggle")]
    [SerializeField] private Toggle toggleAutoPlay;

    [Header("Transform")]
    [SerializeField] private Transform transformJackpotContainer;
    [SerializeField] private Transform transformTicketContainerHorizontal;
    [SerializeField] private Transform transformTicketContainerVerticle;
    public RectTransform Tickets_Horizontal_ScrollRect_RT, Tickets_Verticle_ScrollRect_RT, Tickets_ScrollRect_RT;
    public RectTransform Number_Of_Moves;
    public RectTransform jackpot;

    [Header("GameObject")]
    [SerializeField] private GameObject objectHorizontalContainer;
    [SerializeField] private GameObject objectVerticleContainer;

    [Header("Layout")]
    public GridLayoutGroup ticketContainerHorizontalGridLayoutGroup;

    [Header("Prefabs")]
    [SerializeField] private PrefabJackpotPanel prefabJackpotPanel;
    [SerializeField] public PrefabBingoGame2Ticket3x3 prefabBingoGame2Ticket3X3;

    [Header("List")]
    [SerializeField] private List<PrefabBingoGame2Ticket3x3> ticketList;

    [Header("Panel")]
    [SerializeField] private BingoBallPanelManager bingoBallPanelManager;
    [SerializeField] private UtilityMessagePanel messagePopup;
    [SerializeField] private UtilityLoaderPanel loaderPanel;

    [Header("Data")]
    [SerializeField] private GameData gameData;

    private Transform transformTicketContainer;
    private TicketMarkerCellData markerData;
    private int _luckyNumber;
    private int maxWithdrawCount = 0;
    private List<PrefabJackpotPanel> jackpotPanelList = new List<PrefabJackpotPanel>();

    public GameObject Game2_Player_Details;

    [Header("Timer")]
    public GameObject Game2Timer_UI;
    public TMP_Text Game2_Timer_Txt;
    public Color Timer_Blink_Color;
    public Color Timer_Normal_Color;

    [Header("Sub Game ID")]
    public string Current_Sub_Game_ID;

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

    [Header("Lucky Number")]
    public Button Lucky_Number_Btn;
    public SelectLuckyNumberPanel Lucky_Number_Panel;
    internal bool Is_Lucky_Number_Method_Added = false;
    internal int New_Lucky_Number;
    private bool _isGameRunning = false;
    #endregion

    #region UNITY_CALLBACKS

    private void Awake()
    {
        AssignTicketContainer();
        GameMarkerId = PlayerPrefs.GetInt("Game_Marker", 1);
    }

    private void OnEnable()
    {
        UIManager.Instance.isGame2 = true;
        Reset();
        UIManager.Instance.topBarPanel.miniGamePlanPanel.gameObject.SetActive(false);
        GameSocketManager.OnSocketReconnected += Reconnect;
        Game2Timer_UI.SetActive(false);
        Game2_Player_Details.SetActive(true);
        EnableBroadcasts();
        UIManager.Instance.topBarPanel.MiniGamePlanButtonEnable = true;
        UIManager.Instance.topBarPanel.btnMiniGamePlan.gameObject.SetActive(!Utility.Instance.IsSplitScreenSupported);
        LocalizationManager.OnLocalizeEvent += HandleLanguageChange;
    }

    private void HandleLanguageChange()
    {
        GenerateTicketList(bingoGame2History.ticketList);
    }

    private void OnDisable()
    {
        SoundManager.Instance.StopNumberAnnouncement();
        UIManager.Instance.isGame2 = false;
        GameSocketManager.OnSocketReconnected -= Reconnect;
        DisableBroadcasts();
        UIManager.Instance.topBarPanel.MiniGamePlanButtonEnable = false;
        EventManager.Instance.UnSubscribeGame2Room(UIManager.Instance.game2Panel.Game_2_Data.gameId, null);
        UIManager.Instance.withdrawNumberHistoryPanel.Close();

        LocalizationManager.OnLocalizeEvent -= HandleLanguageChange;
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

        //chatPanel.InitiateChatFeature(gameData);
        changeMarkerBackgroundPanel.Close();
        GameMarkerId = PlayerPrefs.GetInt("Game_Marker", 1);
        if (Lucky_Number_Btn != null)
            Lucky_Number_Btn.targetGraphic.raycastTarget = true;
        this.Open();

        if (UIManager.Instance.game2Panel.game2PlayPanel.gameObject == gameObject)
        {
            Chat_Panel_State = Chat_Panel_RT.anchoredPosition.x == 0f ? 1 : 0;
            switch (Chat_Panel_State)
            {
                case 0: // Closed chat panel
                    Tickets_ScrollRect_RT.offsetMin = new Vector2(30f, Tickets_ScrollRect_RT.offsetMin.y);
                    Tickets_ScrollRect_RT.offsetMax = new Vector2(-30f, Tickets_ScrollRect_RT.offsetMax.y);

                    float x1 = (Tickets_ScrollRect_RT.rect.width - (40 + 30 + 380));
                    x1 /= 5;
                    ticketContainerHorizontalGridLayoutGroup.cellSize = new Vector2(x1, x1);

                    Chat_Open_Open_Text.SetActive(true);
                    Chat_Open_Close_Text.SetActive(false);

                    Number_Of_Moves.localScale = new Vector3(1, 1, 1);
                    jackpot.localScale = new Vector3(1, 1, 1);
                    jackpot.anchoredPosition = new Vector3(856f, -140f);

                    break;
                case 1: // Opened chat panel
                    Tickets_ScrollRect_RT.offsetMin = new Vector2(30f, Tickets_ScrollRect_RT.offsetMin.y);
                    Tickets_ScrollRect_RT.offsetMax = new Vector2(-370f, Tickets_ScrollRect_RT.offsetMax.y);

                    float x2 = (Tickets_ScrollRect_RT.rect.width - (40 + 30 + 380));
                    x2 /= 5;
                    ticketContainerHorizontalGridLayoutGroup.cellSize = new Vector2(x2, x2);

                    Chat_Open_Open_Text.SetActive(false);
                    Chat_Open_Close_Text.SetActive(true);

                    Number_Of_Moves.localScale = new Vector3(0.8f, 0.8f, 0.8f);
                    jackpot.localScale = new Vector3(0.8f, 0.8f, 0.8f);
                    jackpot.anchoredPosition = new Vector3(706f, -140f);


                    break;
            }
        }

        //Invoke("CallSubscribeRoom", 0.1f);
        UIManager.Instance.Current_Game_Number = 2;
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
        UIManager.Instance.game2Panel.Close();
        //if (!UIManager.Instance.multipleGameScreenManager.AnyGameActive())
        //    UIManager.Instance.topBarPanel.OnGamesButtonTap();
        //UIManager.Instance.multipleGameScreenManager.RefreshGridLayoutSize();

        /////
        UIManager.Instance.Current_Game_Number = 0;
        if (Utility.Instance.IsSplitScreenSupported)
        {
            UIManager.Instance.splitScreenGameManager.game2Panel.Close();
            UIManager.Instance.splitScreenGameManager.RefreshSplitScreenFunction();
            if (UIManager.Instance.splitScreenGameManager.SplitScreenRunningGameCount() == 0)
                UIManager.Instance.topBarPanel.OnGamesButtonTap();
        }
        else
        {
            UIManager.Instance.game2Panel.Close();
            UIManager.Instance.topBarPanel.OnGamesButtonTap();
        }
    }

    public void Reconnect()
    {
        Game2Timer_UI.SetActive(false);
        Game2_Player_Details.SetActive(true);
        CallSubscribeRoom();
    }

    public void OpenChangeMarkerBackgroundPanel()
    {
        changeMarkerBackgroundPanel.Open();
    }

    public void BuyMoreBoardsButtonTap()
    {
        RectTransform rectTransform = prefabGame2UpcomingGames.buyMoreBoardsPopup;
        rectTransform.anchoredPosition = new Vector2(460, 0);
        Show_Upcoming_Game_UI();
    }

    public void AdvancePurchaseForTodaysGame()
    {
        if (prefabGame2UpcomingGames.isActiveAndEnabled)
            prefabGame2UpcomingGames.Close();

        //RectTransform rectTransform = UIManager.Instance.topBarPanel.miniGamePlanPanel.gamePlanListingPopup;
        //rectTransform.anchoredPosition = new Vector2(130, -60);

        UIManager.Instance.topBarPanel.OnMiniGamePlanPanelButtonTap();
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
                LeanTween.value(Tickets_ScrollRect_RT.gameObject, Set_Ticket_Scroll_Rect_RT, new Vector2(30f, -30f), new Vector2(30f, -402f), 0.25f).setOnComplete(() =>
                {
                    //float x2 = (contentRect.rect.width - (372 + 60 + 40 + 30));
                    float x2 = (Tickets_ScrollRect_RT.rect.width - (40 + 30 + 380));
                    x2 /= 5;
                    ticketContainerHorizontalGridLayoutGroup.cellSize = new Vector2(x2, x2);

                    MyEvent?.Invoke(x2);
                });

                Number_Of_Moves.localScale = new Vector3(0.8f, 0.8f, 0.8f);
                jackpot.localScale = new Vector3(0.8f, 0.8f, 0.8f);
                jackpot.anchoredPosition = new Vector3(706f, -140f);

                Chat_Open_Open_Text.SetActive(false);
                Chat_Open_Close_Text.SetActive(true);

                Chat_Open_Close_Icon.eulerAngles = new Vector3(0f, 0f, 180f);
                Chat_Panel_State = 1;
                //if (Upcoming_Game_UI.activeSelf)
                //{
                //    LeanTween.cancel(Upcoming_Game_UI);
                //    LeanTween.move(Upcoming_Game_UI.GetComponent<RectTransform>(), new Vector2(-Chat_Panel_RT.rect.width / 2f, Upcoming_Game_UI.GetComponent<RectTransform>().anchoredPosition.y), 0.25f);
                //}
                break;
            case 1: // Close chat panel
                LeanTween.cancel(chatPanel.gameObject);
                LeanTween.move(Chat_Panel_RT, new Vector2(Chat_Panel_RT.rect.width * 3f, Chat_Panel_RT.anchoredPosition.y), 0.25f);
                LeanTween.cancel(Tickets_ScrollRect_RT.gameObject);
                LeanTween.value(Tickets_ScrollRect_RT.gameObject, Set_Ticket_Scroll_Rect_RT, new Vector2(30f, -402f), new Vector2(30f, -30f), 0.25f).setOnComplete(() =>
                {
                    float x1 = (Tickets_ScrollRect_RT.rect.width - (40 + 30 + 380));
                    x1 /= 5;
                    ticketContainerHorizontalGridLayoutGroup.cellSize = new Vector2(x1, x1);

                    MyEvent?.Invoke(x1);
                });

                Number_Of_Moves.localScale = new Vector3(1, 1, 1);
                jackpot.localScale = new Vector3(1, 1, 1);
                jackpot.anchoredPosition = new Vector3(856f, -140f);

                Chat_Open_Open_Text.SetActive(true);
                Chat_Open_Close_Text.SetActive(false);

                Chat_Open_Close_Icon.eulerAngles = Vector3.zero;
                Chat_Panel_State = 0;
                //if (Upcoming_Game_UI.activeSelf)
                //{
                //    LeanTween.cancel(Upcoming_Game_UI);
                //    LeanTween.move(Upcoming_Game_UI.GetComponent<RectTransform>(), new Vector2(0f, Upcoming_Game_UI.GetComponent<RectTransform>().anchoredPosition.y), 0.25f);
                //}
                break;
        }
    }

    void Set_Ticket_Scroll_Rect_RT(Vector2 size)
    {
        Tickets_ScrollRect_RT.offsetMin = new Vector2(size.x, Tickets_ScrollRect_RT.offsetMin.y);
        Tickets_ScrollRect_RT.offsetMax = new Vector2(size.y, Tickets_ScrollRect_RT.offsetMax.y);
    }

    public void Open_Lucky_Number_Selection_Panel()
    {
        if (Upcoming_Game_UI.activeSelf)
            return;

        Lucky_Number_Panel.GenerateLuckyNumbers();
        if (Lucky_Number_Panel.isLuckyNumbersGenerated)
        {
            if (!Is_Lucky_Number_Method_Added)
            {
                //for (int i = 0; i < Lucky_Number_Panel.listLuckeyNumberBall.Count; i++)
                //{
                //    Lucky_Number_Panel.listLuckeyNumberBall[i].btnSelectLuckyNumber.onClick.AddListener(() =>
                //    {
                //        OnLuckyNumberSelection(1);
                //    });
                //}

                foreach (var btns in Lucky_Number_Panel.listLuckeyNumberBall)
                {
                    btns.btnSelectLuckyNumber.onClick.AddListener(() =>
                    {
                        OnLuckyNumberSelection(btns.Number);
                    });
                }

                Is_Lucky_Number_Method_Added = true;
            }
        }
        Lucky_Number_Panel.SetLuckyNumber(LuckyNumber);
        Lucky_Number_Panel.Open();
    }

    public void OnLuckyNumberSelection(Int32 luckyNumber)
    {
        print($"Number : {New_Lucky_Number} || Number : {luckyNumber}");
        if (New_Lucky_Number == luckyNumber)
            return;
        print($"Number : {luckyNumber}");
        int lastLuckyNumber = LuckyNumber;
        DisplayLoader(true);
        EventManager.Instance.SelectLuckyNumberGame2("Game2", Current_Sub_Game_ID, luckyNumber, (socket, packet, args) =>
        {
            Debug.Log("SelectLuckyNumber response: " + packet.ToString());
            DisplayLoader(false);
            EventResponse eventResponse = JsonUtility.FromJson<EventResponse>(Utility.Instance.GetPacketString(packet));

            if (eventResponse.status == Constants.EventStatus.SUCCESS)
            {
                LuckyNumber = luckyNumber;
                New_Lucky_Number = LuckyNumber;
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

    #endregion

    #region BROADCAST_HANDLING
    /// <summary>
    /// Enable all required broadcasts, which is usefull for game play
    /// </summary>
    private void EnableBroadcasts()
    {
        Debug.Log("Game 2 broadcast on");
        //Debug.Log("Game 2 namespace: " + GameSocketManager.SocketGame2.Namespace);
        //Debug.Log("GameSocketManager.SocketGame2: " + GameSocketManager.SocketGame2);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.SubscribeRoom, OnSubscribeRoom);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.UpdatePlayerRegisteredCount, OnUpdatePlayerRegisteredCount);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.GameStartWaiting, OnGameStartWaiting);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.GameStart, OnGameStart);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.WithdrawBingoBall, OnWithdrawBingoBall);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.TicketCompleted, OnTicketCompleted);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.GameFinish, OnGameFinish);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.GameTerminate, OnGameTerminate);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.GameStartTimer, On_Start_Timer_Broadcast);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.GameRefreshRoom, On_Game_2_Refresh_Room);
        GameSocketManager.SocketGame2.On(Constants.BroadcastName.JackpotListUpdate, On_Jackpot_List_Update);
        GameSocketManager.socketManager.Socket.On(Constants.BroadcastName.BreakTimeStart, OnBreak);
    }

    /// <summary>
    /// Disable all broadcasts
    /// </summary>
    private void DisableBroadcasts()
    {
        Debug.Log("Game 2 broadcast off");
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.SubscribeRoom);
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.UpdatePlayerRegisteredCount);
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.GameStartWaiting);
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.GameStart);
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.WithdrawBingoBall);
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.TicketCompleted);
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.GameFinish);
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.GameTerminate);
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.GameStartTimer);
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.GameRefreshRoom);
        GameSocketManager.SocketGame2.Off(Constants.BroadcastName.JackpotListUpdate);
        GameSocketManager.socketManager.Socket.Off(Constants.BroadcastName.BreakTimeStart);
    }

    private void OnSubscribeRoom(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnSubscribeRoom Broadcast Response : " + packet.ToString());

        BingoGame2History gameHistory = JsonUtility.FromJson<BingoGame2History>(Utility.Instance.GetPacketString(packet));

        if (gameHistory.gameId != this.gameData.gameId)
        {
            SoundManager.Instance.ResetPlayedAnnouncements();
            return;
        }

        bingoGame2History = gameHistory;
        SoundManager.Instance.ResetPlayedAnnouncements();
        CallPlayerHallLimitEvent();
        UIManager.Instance.gameAssetData.PreviousGameId = gameData.gameId;
        Reset();

        IsGameRunning = gameHistory.gameStarted;
        isTimerRecieved = gameHistory.gameStarted;
        TotalBetAmount = gameHistory.totalBetAmount;
        btnBuyMore.interactable = !gameHistory.gameStarted;

        LuckyNumber = gameHistory.luckyNumber;
        New_Lucky_Number = LuckyNumber;
        toggleAutoPlay.isOn = gameHistory.autoPlay;
        TotalRegisteredPlayerCount = gameHistory.activePlayers;
        maxWithdrawCount = gameHistory.maxWithdrawCount;
        TotalWithdrawCount = gameHistory.totalWithdrawCount;
        Current_Sub_Game_ID = gameHistory.subGameId;

        GenerateTicketList(gameHistory.ticketList);
        GenerateJackpotList(gameHistory.jackpotList);
        GenerateWithdrawNumberList(gameHistory.withdrawNumberList);

        Waiting_For_Next_Game.SetActive(gameHistory.withdrawNumberList.Count == 0);

        if (gameHistory.disableCancelButton)
        {
            foreach (var btn in ticketList)
            {
                btn.deleteBtn.gameObject.SetActive(false);
            }
        }
        else
        {
            foreach (var btn in ticketList)
            {
                btn.deleteBtn.gameObject.SetActive(true);
            }
        }
        HighlightLuckyNumber();
        RunBestCardFirstAction();
        UIManager.Instance.withdrawNumberHistoryPanel.AddNumber(gameHistory.withdrawNumberList);
        chatPanel.InitiateChatFeatureSubGame(UIManager.Instance.game2Panel.Game_2_Data.gameId, "Game2");
        if (Lucky_Number_Btn != null)
            Lucky_Number_Btn.targetGraphic.raycastTarget = gameHistory.ticketList.Count > 0 && gameHistory.withdrawNumberList.Count == 0;
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
        SoundManager.Instance.ResetPlayedAnnouncements();
    }

    private void OnGameStart(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnGameStart: " + packet.ToString());
        SoundManager.Instance.ResetPlayedAnnouncements();
        // Code written by caddy for "more buy tickets" button interactable false when game start
        btnBuyMore.interactable = false;

        // Close the "prefabGame2UpcomingGames" panel when game start
        if (prefabGame2UpcomingGames.isActiveAndEnabled)
            prefabGame2UpcomingGames.Close();
        isTimerRecieved = true;
        Waiting_For_Next_Game.SetActive(false);
        Lucky_Number_Panel.gameObject.SetActive(false);
        Lucky_Number_Btn.targetGraphic.raycastTarget = false;

        foreach (var btn in ticketList)
        {
            btn.deleteBtn.gameObject.SetActive(false);
        }
    }

    private void OnWithdrawBingoBall(Socket socket, Packet packet, object[] args)
    {
        //Debug.Log("OnWithdrawBingoBall: " + packet.ToString());

        BingoNumberData bingoNumberData = JsonUtility.FromJson<BingoNumberData>(Utility.Instance.GetPacketString(packet));
        TotalWithdrawCount = bingoNumberData.totalWithdrawCount;
        WithdrawBingoBallAction(bingoNumberData);
        UIManager.Instance.withdrawNumberHistoryPanel.AddNumber(bingoNumberData);
        if (UIManager.Instance.gameAssetData.isVoiceOn == 1)
        {
            if (bingoGame2History.isSoundPlay)
            {
                SoundManager.Instance.PlayNorwegianMaleNumberAnnouncement(bingoNumberData.number, false);
            }
            //if (UIManager.Instance.gameAssetData.selectedVoiceLanguage == 0)
            //{
            //    SoundManager.Instance.PlayNorwegianMaleNumberAnnouncement(bingoNumberData.number, bingoGame2History.isSoundPlay);
            //}
            //else if (UIManager.Instance.gameAssetData.selectedVoiceLanguage == 1)
            //{
            //    SoundManager.Instance.PlayNorwegianFemaleNumberAnnouncement(bingoNumberData.number, bingoGame2History.isSoundPlay);
            //}
            //else
            //{
            //    SoundManager.Instance.PlayNumberAnnouncement(bingoNumberData.number, bingoGame2History.isSoundPlay);
            //}
        }
        //SoundManager.Instance.PlayGame2NumberAnnouncement(bingoNumberData.number, false, bingoGame2History.isSoundPlay);
        PlayJackpotNumberWithdrawAnimation(bingoNumberData.totalWithdrawCount);
        Waiting_For_Next_Game.SetActive(false);
        Lucky_Number_Btn.targetGraphic.raycastTarget = false;
    }

    private void PlayJackpotNumberWithdrawAnimation(int withdrawCount)
    {
        //foreach (PrefabJackpotPanel jackpotPanel in jackpotPanelList)
        //{
        //    if (jackpotPanel.Number < withdrawCount && jackpotPanel.Number != 0)
        //    {
        //        jackpotPanel.Jackpot_CG.alpha = 0.5f;
        //        LeanTween.scale(jackpotPanel.Number_Container, Vector3.one, 0.5f);
        //    }
        //    if (jackpotPanel.Number == withdrawCount || int.Parse(jackpotPanel.data.number.Split('-')[0]) == withdrawCount)
        //    {
        //        jackpotPanel.PlayJackpotAnimation();
        //        break;
        //    }
        //}

        foreach (PrefabJackpotPanel jackpotPanel in jackpotPanelList)
        {
            if (jackpotPanel != null) // Check if the jackpotPanel is not null
            {
                if (jackpotPanel.Number < withdrawCount && jackpotPanel.Number != 0)
                {
                    if (jackpotPanel.Jackpot_CG != null) // Check if the CanvasGroup is not null
                    {
                        jackpotPanel.Jackpot_CG.alpha = 0.5f;
                    }

                    if (jackpotPanel.Number_Container != null)
                    {
                        LeanTween.scale(jackpotPanel.Number_Container, Vector3.one, 0.5f);
                    }
                }

                if (jackpotPanel.Number == withdrawCount || (jackpotPanel.data != null && int.Parse(jackpotPanel.data.number.Split('-')[0]) == withdrawCount))
                {
                    jackpotPanel.PlayJackpotAnimation();
                    break;
                }
            }
        }
    }

    private void OnTicketCompleted(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnTicketCompleted: " + packet.ToString());
        TicketCompletedResponse ticketData = JsonUtility.FromJson<TicketCompletedResponse>(Utility.Instance.GetPacketString(packet));

        //if (ticketData.gameId != this.gameData.gameId)
        if (ticketData.gameId != Current_Sub_Game_ID)
            return;

        PrefabBingoGame2Ticket3x3 ticket = GetTicketById(ticketData.ticketId);

        if (ticket != null)
        {
            ticket.TicketCompleted = true;
            UIManager.Instance.LaunchWinningAnimation();
        }
    }

    private void OnGameFinish(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnGameFinish: " + packet.ToString());

        BingoGameFinishResponse bingoGameFinishResponse = JsonUtility.FromJson<BingoGameFinishResponse>(Utility.Instance.GetPacketString(packet));

        if (bingoGameFinishResponse.gameId != Current_Sub_Game_ID)
            return;

        CallPlayerHallLimitEvent();
        for (int i = 0; i < ticketList.Count; i++)
            if (ticketList[i].Blink_Tween != null)
                ticketList[i].Stop_Blink();
        foreach (PrefabBingoGame2Ticket3x3 ticket in ticketList)
        {
            ticket.WonAmount = bingoGameFinishResponse.winningAmount;
        }
        //if (bingoGameFinishResponse.message != "")
        //    GetUtilityMessagePanel().DisplayMessagePopup(bingoGameFinishResponse.message);
        // isTimerRecieved = false;
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

    public bool isTimerRecieved = false;

    void On_Start_Timer_Broadcast(Socket socket, Packet packet, object[] args)
    {
        GameTimer timer = JsonUtility.FromJson<GameTimer>(Utility.Instance.GetPacketString(packet));
        isTimerRecieved = true;
        Game2Timer_UI.SetActive(timer.remainingTime > 0);
        Game2_Player_Details.SetActive(timer.remainingTime == 0);
        Game2_Timer_Txt.text = timer.remainingTime.ToTime();
        Game2_Timer_Txt.color = Timer_Normal_Color;
        if (timer.remainingTime < 6)
        {
            TimerTxtAnim();
            Lucky_Number_Btn.targetGraphic.raycastTarget = false;
            btnBuyMore.interactable = false;
            prefabGame2UpcomingGames.Close();
        }
    }

    void On_Game_2_Refresh_Room(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("On_Game_2_Refresh_Room Broadcast Response : " + packet.ToString());
        RefreshRoom res = JsonUtility.FromJson<RefreshRoom>(Utility.Instance.GetPacketString(packet));

        if (res.gameId != UIManager.Instance.game2Panel.Game_2_Data.gameId)
            return;
        isTimerRecieved = false;
        UIManager.Instance.messagePopup.OnCloseButtonTap();
        UIManager.Instance.lobbyPanel.gamePlanPanel.Game2(false);
    }


    void On_Jackpot_List_Update(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("JackpotListUpdate: Broadcast" + packet.ToString());

        JackpotBroadcast gameHistory = JsonUtility.FromJson<JackpotBroadcast>(Utility.Instance.GetPacketString(packet));

        //BingoGame2History gameHistory = JsonUtility.FromJson<BingoGame2History>(Utility.Instance.GetPacketString(packet));
        //bingoGame2History = gameHistory;
        GenerateJackpotList(gameHistory.jackpotList);
    }
    void OnBreak(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("OnBreak Broadcast: " + packet.ToString());
        BreakTime breakTime = JsonUtility.FromJson<BreakTime>(Utility.Instance.GetPacketString(packet));
        if (breakTime.startBreakTime != null && breakTime.endBreakTime != null)
        {
            Debug.Log("enter..break time");
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

    void TimerTxtAnim()
    {
        LeanTween.scale(Game2Timer_UI, Vector3.one * 0.85f, 0.25f)
            .setOnComplete(() =>
            {
                LeanTween.scale(Game2Timer_UI, Vector3.one * 1.15f, 0.5f)
                .setOnComplete(() =>
                {
                    LeanTween.scale(Game2Timer_UI, Vector3.one, 0.25f);
                });
            });
        LeanTween.value(Game2_Timer_Txt.gameObject, Set_Color_Callback, Timer_Normal_Color, Timer_Blink_Color, 0.5f)
                .setOnComplete(() =>
                {
                    LeanTween.value(Game2_Timer_Txt.gameObject, Set_Color_Callback, Timer_Blink_Color, Timer_Normal_Color, 0.5f);
                });
    }

    void Set_Color_Callback(Color c)
    {
        c.a = 1f;
        Game2_Timer_Txt.color = c;
    }

    #endregion

    #region PRIVATE_METHODS

    /// <summary>
    /// Emit subscribe room event
    /// </summary>
    public void CallSubscribeRoom()
    {
        DisplayLoader(true);
        Upcoming_Game_UI.SetActive(false);
        Waiting_For_Next_Game.SetActive(false);

        DisableBroadcasts();
        EnableBroadcasts();

        EventManager.Instance.SubscribeRoomGame2(UIManager.Instance.game2Panel.Game_2_Data.gameId, UIManager.Instance.gameAssetData.PreviousGameId, (socket, packet, args) =>
        {
            Debug.Log("SubscribeRoom Emit Response: " + packet.ToString());
            BackgroundManager.Instance.PlayerUpdateIntervalCall();
            EventResponse response = JsonUtility.FromJson<EventResponse>(Utility.Instance.GetPacketString(packet));
            // CallPlayerHallLimitEvent();
            if (response.status == Constants.EventStatus.FAIL || response.messageType == Constants.MessageType.SomethingWentWrong)
            {
                DisplayLoader(false);
                if (response.messageType != "")
                    GetUtilityMessagePanel().DisplayMessagePopup(response.messageType);
                else
                    GetUtilityMessagePanel().DisplayMessagePopup(response.message);
                UIManager.Instance.topBarPanel.OnGamesButtonTap();
            }

            // Code comment by caddy for "refresh broadcast"
            //DisableBroadcasts();
            //EnableBroadcasts();
        });
    }

    /// <summary>
    /// Remove/Destroy old jackpot list & generate new list
    /// </summary>
    /// <param name="jackpotList"></param>
    private void GenerateJackpotList(List<JackpotData> jackpotList)
    {
        foreach (Transform transform in transformJackpotContainer)
            Destroy(transform.gameObject);

        foreach (JackpotData data in jackpotList)
        {
            PrefabJackpotPanel newJackpotPanel = Instantiate(prefabJackpotPanel, transformJackpotContainer);
            newJackpotPanel.SetData(data);
            this.jackpotPanelList.Add(newJackpotPanel);
        }
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

        bingoBallPanelManager.WithdrawList(withdrawNumberList, "Game 2");
    }

    private void RunBestCardFirstAction()
    {
        ticketList.Sort(BingoTicket.ReverseSortBySelectedNumber);

        for (int i = 0; i < ticketList.Count; i++)
            ticketList[i].transform.SetSiblingIndex(i);
    }

    /// <summary>
    /// NewNumberWithdrawEvent will show new withdraw bingo ball with animation
    /// </summary>
    /// <param name="newBingoNumberData"></param>
    private void WithdrawBingoBallAction(BingoNumberData newBingoNumberData)
    {
        bingoBallPanelManager.NewWithdraw(newBingoNumberData, true, "Game 2");
        MarkWithdrawNumbers(newBingoNumberData, true);
    }

    /// <summary>
    /// Mark new withdraw number on all ticket
    /// </summary>
    /// <param name="data"></param>
    private void MarkWithdrawNumbers(BingoNumberData data, bool playSound = false)
    {
        foreach (PrefabBingoGame2Ticket3x3 ticket in ticketList)
        {
            ticket.MarkNewWithdrawNumber(data.number, false, false, playSound);
            ticket.Set_Togo_Txt();
        }
        RunBestCardFirstAction();
    }

    public void HighlightLuckyNumber()
    {
        foreach (PrefabBingoGame2Ticket3x3 ticket in ticketList)
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
            PrefabBingoGame2Ticket3x3 newTicket = Instantiate(prefabBingoGame2Ticket3X3, transformTicketContainer);

            //States of the chat panel: 0 denotes closed, while 1 denotes opened.
            //float x1 = Chat_Panel_State == 0 ? (Screen.width - (60 + 40 + 30)) : (Screen.width - (372 + 60 + 40 + 30));
            //newTicket.TicketNumbersGridLayoutGroupCellSizeUpdate(x1 / 5);

            float x1 = (Tickets_ScrollRect_RT.rect.width - (40 + 30 + 380));
            x1 /= 5;
            ticketContainerHorizontalGridLayoutGroup.cellSize = new Vector2(x1, x1);

            newTicket.TicketNumbersGridLayoutGroupCellSizeUpdate(x1);
            newTicket.deleteBtn.gameObject.SetActive(true);
            newTicket.SetData(data, markerData);
            newTicket.Set_Togo_Txt();
            ticketList.Add(newTicket);
        }
        if (ticketList.Count == 0)
        {
            RectTransform rectTransform = prefabGame2UpcomingGames.buyMoreBoardsPopup;
            rectTransform.anchoredPosition = new Vector2(0, 0);

            Show_Upcoming_Game_UI();
        }
    }

    internal void Clear_Tickets(string subgameID, bool showUpcomingGameUI = true)
    {
        if (Current_Sub_Game_ID != subgameID)
            return;
        foreach (Transform transform in transformTicketContainer)
            Destroy(transform.gameObject);
        ticketList.Clear();

        if (showUpcomingGameUI)
        {
            RectTransform rectTransform = prefabGame2UpcomingGames.buyMoreBoardsPopup;
            rectTransform.anchoredPosition = new Vector2(0, 0);

            Show_Upcoming_Game_UI();
        }
    }

    internal void Clear_Luck_Number(string subgameID)
    {
        if (Current_Sub_Game_ID != subgameID)
            return;
        LuckyNumber = 0;
        New_Lucky_Number = 0;
    }

    void Show_Upcoming_Game_UI()
    {
        EventManager.Instance.Game2List((socket, packet, args) =>
        {
            EventResponse<Game2PlanList> response = JsonUtility.FromJson<EventResponse<Game2PlanList>>(Utility.Instance.GetPacketString(packet));
            if (response.status == Constants.EventStatus.SUCCESS)
            {
                Upcoming_Game_UI.GetComponent<PrefabGame2UpcomingGames>().Set_Data(response.result.upcomingGames[0]);
                //if (Chat_Panel_RT != null)
                //    Upcoming_Game_UI.GetComponent<RectTransform>().anchoredPosition = new Vector2(Chat_Panel_RT.anchoredPosition.x == 0f ? -Chat_Panel_RT.rect.width / 2f : 0f, Upcoming_Game_UI.GetComponent<RectTransform>().anchoredPosition.y);
                Upcoming_Game_UI.SetActive(true);
            }
        });
    }

    private PrefabBingoGame2Ticket3x3 GetTicketById(string ticketId)
    {
        foreach (PrefabBingoGame2Ticket3x3 ticket in ticketList)
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
        toggleAutoPlay.isOn = false;
        LuckyNumber = 0;
        New_Lucky_Number = 0;
        TotalRegisteredPlayerCount = 0;
        bingoBallPanelManager.Reset();
        ticketList.Clear();
        jackpotPanelList.Clear();

        foreach (Transform transform in transformJackpotContainer)
            Destroy(transform.gameObject);

        foreach (Transform transform in transformTicketContainer)
            Destroy(transform.gameObject);

        UIManager.Instance.withdrawNumberHistoryPanel.Close();
        UIManager.Instance.withdrawNumberHistoryPanel.Reset();
    }

    private void AssignTicketContainer()
    {
        if (Utility.Instance.IsRunningOniPad() || Utility.Instance.IsSplitScreenSupported)
        {
            //transformTicketContainer = transformTicketContainerVerticle;
            //if (objectHorizontalContainer)
            //    objectHorizontalContainer.Close();
            //objectVerticleContainer.Open();
            //Tickets_ScrollRect_RT = Tickets_Verticle_ScrollRect_RT;

            transformTicketContainer = transformTicketContainerHorizontal;
            if (objectHorizontalContainer)
                objectHorizontalContainer.Open();
            objectVerticleContainer.Close();
            // Tickets_ScrollRect_RT = Tickets_Horizontal_ScrollRect_RT;

        }
        else
        {
            transformTicketContainer = transformTicketContainerHorizontal;
            if (objectHorizontalContainer)
                objectHorizontalContainer.Open();
            objectVerticleContainer.Close();
            // Tickets_ScrollRect_RT = Tickets_Horizontal_ScrollRect_RT;
        }
    }

    #endregion

    #region COROUTINES
    #endregion

    #region GETTER_SETTER
    public int LuckyNumber
    {
        set
        {
            _luckyNumber = value;
            if (value > 0)
                txtLuckeyNumber.text = value.ToString();
            else
                txtLuckeyNumber.text = "";
        }
        get
        {
            return _luckyNumber;
        }
    }

    public int GameMarkerId
    {
        set
        {
            PlayerPrefs.SetInt("Game_Marker", value);
            markerData = UIManager.Instance.GetMarkerData(value);
            foreach (PrefabBingoGame2Ticket3x3 ticket in ticketList)
            {
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
            txtTotalWithdrawCount.text = value.ToString("00") + "/" + maxWithdrawCount.ToString("00");
        }
    }

    public bool IsGameRunning
    {
        set
        {
            _isGameRunning = value;
        }
        get
        {
            return _isGameRunning;
        }
    }

    public int TotalBetAmount
    {
        set
        {
            txtTotalBetAmount.GetComponent<LocalizationParamsManager>().SetParameterValue("TotalBet", value.ToString());
        }
    }
    #endregion
}
