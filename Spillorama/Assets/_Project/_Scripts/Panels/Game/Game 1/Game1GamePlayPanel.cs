using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using BestHTTP.SocketIO;
using I2.Loc;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
#if !UNITY_WEBGL
using I2.Loc;
#endif

public partial class Game1GamePlayPanel : MonoBehaviour
{
    #region PUBLIC_VARIABLES

    [Header("Panels")]
    public ChangeMarkerBackgroundPanel changeMarkerBackgroundPanel;

    [Header("Row Details")]
    public PanelRowDetails PanelRowDetails;
    private int curruntPatternRow = 0;

    [Header("Patterns")]
    public List<PrefabBingoGame1Pattern> Patterns;
    bool CanBeDeleted;

    [Header("Game 1 Timer")]
    public GameObject Game_1_Timer;
    public GameObject Game_1_Timer_LBL;
    public TMP_Text Game_1_Timer_Txt;

    public Game1ViewPurchaseElvisTicket View_Elvis_Tickets_Prefab;
    public Transform View_Ticket_Parent;
    public RectTransform Elvis_Tickets_ScrollRect_RT;
    Game1ViewPurchaseElvisTicket Elvis_Ticket;
    public List<GameObject> Elvis_Tickets;

    [Header("Replace Elvis Tickets")]
    public int Replace_Amount;
    public string Elvis_Replace_Ticket_Id1,
        Elvis_Replace_Ticket_Id2;

    public GameObject Tickets_Panel,
        Elvis_Replace_Tickets_Panel;

    #endregion

    #region PRIVATE_VARIABLES
    [Header("Text")]
    [SerializeField]
    private TextMeshProUGUI txtLuckeyNumber;

    [SerializeField]
    private TextMeshProUGUI txtActivePlayers;

    [SerializeField]
    private TextMeshProUGUI txtTotalBetAmount;

    [SerializeField]
    private TextMeshProUGUI txtTotalProfitAmount;

    [SerializeField]
    private TextMeshProUGUI txtLastWithdrawNumber;

    [SerializeField]
    private TextMeshProUGUI txtWithdrawNumberStats;

    [SerializeField]
    private TextMeshProUGUI txtPickLuckyNumber;

    [Header("Button")]
    [SerializeField]
    private Button btnSelectLuckyNumber;

    [SerializeField]
    private Button miniGamePlan;

    [SerializeField]
    private Button buyMoreTicket;

    [Header("Transform")]
    [SerializeField]
    private Transform transformPatternContainer;

    [SerializeField]
    private Transform transformTicketContainer;

    [SerializeField]
    private Transform transformMiniGameContainer;
    public RectTransform Tickets_ScrollRect_RT;

    [Header("Prefabs")]
    [SerializeField]
    private PrefabBingoGame1Pattern prefabBingo1PatternPanel;

    [SerializeField]
    private PrefabBingoGame1Ticket5x5 prefabBingoGame1Ticket5X5;

    [SerializeField]
    private PrefabBingoGame1LargeTicket5x5 prefabBingoGame1LargeTicket5X5;

    [Header("List")]
    /*[SerializeField]*/
    public List<PrefabBingoGame1Ticket5x5> ticketList;

    [SerializeField]
    private List<PrefabBingoGame1LargeTicket5x5> ticketLargeList;

    [Header("Panels")]
    [SerializeField]
    private SelectLuckyNumberPanel selectLuckyNumberPanel;

    [SerializeField]
    private BingoBallPanelManager bingoBallPanelManager;

    [SerializeField]
    private UtilityMessagePanel messagePopup;

    [SerializeField]
    private UtilityLoaderPanel loaderPanel;

    [Header("Mini Games")]
    public WheelOfFortunePanel wheelOfFortunePanel;
    public FortuneWheelManager fortuneWheelManager;
    public NewFortuneWheelManager newFortuneWheelManager;
    public TreasureChestPanel treasureChestPanel;
    public MysteryGamePanel mysteryGamePanel;
    public ColorDraftPanel colorDraftGamePanel;

    [Header("Data")]
    [SerializeField]
    private GameData gameData;

    private TicketMarkerCellData markerData;
    private int _luckeyNumber = 0;
    private int _maxWithdrawCount = 0;
    int _gameMarkerId = 0;

    [Header("Upcoming Game")]
    public GameObject Upcoming_Game_Purchase_UI;
    public Transform Upcoming_Game_Ticket_Parent;
    public ContentSizeFitter Upcoming_Game_CSF;
    public Game1PurchaseTicketData Upcoming_Game_Ticket_Prefab;
    public TMP_Text Upcoming_Game_Name_Txt,
        Upcoming_Game_Purchased_Ticket_Txt,
        Upcoming_Game_Buy_Ticket_Txt;
    public Button Btn_Upcoming_Game_Buy_Tickets;
    public List<Game1PurchaseTicketData> Upcoming_Game_Tickets;
    public int Purchased_Tickets,
        Max_Purcahse_Ticket;
    internal Game1 Upcoming_Game_Data;
    internal bool Is_AnyGame_Running;

    [Header("Elves")]
    private bool isReplaceDisabled;

    [Header("Chat")]
    [SerializeField]
    private ChatPanel chatPanel;
    public RectTransform Chat_Panel_RT;
    public int Chat_Panel_State;
    public Transform Chat_Open_Close_Icon;
    public GameObject Chat_Open_Open_Text;
    public GameObject Chat_Open_Close_Text;

    [Header("Extras")]
    public GameObject Prefab_Devider;
    public List<GameObject> instantiatedObjects;
    private int BuyMoreDisableFlagVal;

    public bool onGameStart = false;
    public bool isGameRefreshed = false;

    public BingoGame1History BingoGame1HistoryData;

    [Header("Header objects")]
    public GameObject Panel_Game_Header;

    private Coroutine nextGameTimer;
    #endregion
    #region UNITY_CALLBACKS
    private void Awake()
    {
        GameMarkerId = PlayerPrefs.GetInt("Game_Marker", 1);
        transformMiniGameContainer.gameObject.SetActive(true);
    }

    private void OnEnable()
    {
        isGameRefreshed = false;
        Reset();
        CloseMiniGames();

        GameSocketManager.OnSocketReconnected += Reconnect;
        EnableBroadcasts();
        UIManager.Instance.topBarPanel.HallGameListButton = false;
        UIManager.Instance.topBarPanel.btnMiniGamePlan.gameObject.SetActive(
            !Utility.Instance.IsSplitScreenSupported
        );
        LocalizationManager.OnLocalizeEvent += HandleLanguageChange;
    }

    private void OnDisable()
    {
        SoundManager.Instance.StopNumberAnnouncement();
        GameSocketManager.OnSocketReconnected -= Reconnect;
        DisableBroadcasts();
        UIManager.Instance.topBarPanel.MiniGamePlanButtonEnable = false;
        UIManager.Instance.topBarPanel.HallGameListButton = false;

        if (gameData.gameId != null || gameData.gameId != "")
        {
            EventManager.Instance.UnSubscribeRoom(gameData.namespaceString, gameData.gameId, null);
        }

        UIManager.Instance.withdrawNumberHistoryPanel.Close();
        UIManager.Instance.topBarPanel.GameType = "";
        CloseMiniGames();

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
        UIManager.Instance.topBarPanel.GameType = gameData.gameName;

        //chatPanel.InitiateChatFeature(gameData);
        changeMarkerBackgroundPanel.Close();
        GameMarkerId = PlayerPrefs.GetInt("Game_Marker", 1);
        selectLuckyNumberPanel.Close();
        UIManager.Instance.Current_Game_Number = 1;
        UIManager.Instance.topBarPanel.hallGameListPanel.gameObject.SetActive(false);
        UIManager.Instance.topBarPanel.hallGameListPanel.game1PurchaseTicket.gameObject.SetActive(
            false
        );

        this.Open();
        DisplayLoader(true);

        //Invoke("CallSubscribeRoom", 0.1f);
        CallSubscribeRoom();

        if (UIManager.Instance.game1Panel.game1GamePlayPanel.gameObject == gameObject)
        {
            Chat_Panel_State = Chat_Panel_RT.anchoredPosition.x == 0f ? 1 : 0;
            switch (Chat_Panel_State)
            {
                case 0: // Closed chat panel
                    Tickets_ScrollRect_RT.offsetMin = new Vector2(
                        200f,
                        Tickets_ScrollRect_RT.offsetMin.y
                    );
                    Tickets_ScrollRect_RT.offsetMax = new Vector2(
                        -30f,
                        Tickets_ScrollRect_RT.offsetMax.y
                    );
                    Elvis_Tickets_ScrollRect_RT.offsetMin = new Vector2(
                        200f,
                        Tickets_ScrollRect_RT.offsetMin.y
                    );
                    Elvis_Tickets_ScrollRect_RT.offsetMax = new Vector2(
                        -30f,
                        Tickets_ScrollRect_RT.offsetMax.y
                    );

                    //LeanTween.cancel(Panel_Game_Header);
                    //LeanTween.move(Panel_Game_Header.GetComponent<RectTransform>(), new Vector2(Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.x - 80f, Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.y), 0.25f)
                    //    .setOnComplete(() =>
                    //    {
                    //        // Your code to be executed when the move is complete
                    //        Debug.Log("Closed chat panel!");
                    //    });

                    break;
                case 1: // Opened chat panel
                    Tickets_ScrollRect_RT.offsetMin = new Vector2(
                        200f,
                        Tickets_ScrollRect_RT.offsetMin.y
                    );
                    Tickets_ScrollRect_RT.offsetMax = new Vector2(
                        -400f,
                        Tickets_ScrollRect_RT.offsetMax.y
                    );
                    Elvis_Tickets_ScrollRect_RT.offsetMin = new Vector2(
                        200f,
                        Tickets_ScrollRect_RT.offsetMin.y
                    );
                    Elvis_Tickets_ScrollRect_RT.offsetMax = new Vector2(
                        -400f,
                        Tickets_ScrollRect_RT.offsetMax.y
                    );

                    //LeanTween.cancel(Panel_Game_Header);
                    //LeanTween.move(Panel_Game_Header.GetComponent<RectTransform>(), new Vector2(Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.x + 80f, Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.y), 0.25f)
                    //    .setOnComplete(() =>
                    //    {
                    //        // Assuming the script is attached to the GameObject with RectTransform
                    //        RectTransform rectTransform = Panel_Game_Header.GetComponent<RectTransform>();

                    //        // Set the left and right values to 0
                    //        rectTransform.offsetMin = new Vector2(0f, rectTransform.offsetMin.y);
                    //        rectTransform.offsetMax = new Vector2(0f, rectTransform.offsetMax.y);
                    //    });

                    break;
            }
        }
    }

    public void ClosePanel()
    {
        UIManager.Instance.game1Panel.Close();
        //if (!UIManager.Instance.multipleGameScreenManager.AnyGameActive())
        //    UIManager.Instance.topBarPanel.OnGamesButtonTap();
        //UIManager.Instance.multipleGameScreenManager.RefreshGridLayoutSize();
        UIManager.Instance.Current_Game_Number = 0;
        /////
        if (Utility.Instance.IsSplitScreenSupported)
        {
            UIManager.Instance.splitScreenGameManager.game1Panel.Close();
            UIManager.Instance.splitScreenGameManager.RefreshSplitScreenFunction();
            if (UIManager.Instance.splitScreenGameManager.SplitScreenRunningGameCount() == 0)
                UIManager.Instance.topBarPanel.OnGamesButtonTap();
        }
        else
        {
            UIManager.Instance.game1Panel.Close();
            UIManager.Instance.topBarPanel.OnGamesButtonTap();
        }
    }

    public void Reconnect()
    {
        UIManager.Instance.lobbyPanel.gamePlanPanel.OnGame1ButtonTap();
        // CallSubscribeRoom();
    }

    public void OnLuckeyNumberTap()
    {
        selectLuckyNumberPanel.Open();
    }

    internal void Close_Panels()
    {
        selectLuckyNumberPanel.Close();
        changeMarkerBackgroundPanel.Close();
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
        DisplayLoader(true); // UIManager.Instance.DisplayLoader(true);
        EventManager.Instance.SelectLuckyNumberGame1(
            gameData.namespaceString,
            gameData.gameId,
            luckyNumber,
            (socket, packet, args) =>
            {
                Debug.Log("SelectLuckyNumber response: " + packet.ToString());
                DisplayLoader(false); // UIManager.Instance.DisplayLoader(false);
                EventResponse eventResponse = JsonUtility.FromJson<EventResponse>(
                    Utility.Instance.GetPacketString(packet)
                );

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
            }
        );
    }

    public void OpenWithdrawNumberHistoryPanel()
    {
        UIManager.Instance.withdrawNumberHistoryPanel.Open();
    }

    public UtilityMessagePanel GetUtilityMessagePanel()
    {
        if (
            loaderPanel
            && Utility.Instance.IsSplitScreenSupported
            && UIManager.Instance.splitScreenGameManager.SplitScreenRunningGameCount() > 1
        )
            return messagePopup;
        else
            return UIManager.Instance.messagePopup;
    }

    public void DisplayLoader(bool showLoader)
    {
        if (
            loaderPanel
            && Utility.Instance.IsSplitScreenSupported
            && UIManager.Instance.splitScreenGameManager.SplitScreenRunningGameCount() > 1
        )
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

    public void Upcoming_Game1_Ticket_Set_Up_Open()
    {
        //BackButton1.gameObject.SetActive(true);
        //BackButton2.gameObject.SetActive(true);

        if (!Is_AnyGame_Running)
            Upcoming_Game1_Ticket_Set_Up(true);
        else
            Upcoming_Game_Purchase_UI.SetActive(false);
        Btn_Upcoming_Game_Buy_Tickets.interactable =
            UIManager.Instance.game1Panel.Game_1_Data.maxPurchaseTicket
            != UIManager.Instance.game1Panel.Game_1_Data.purchasedTickets;
    }

    public void Upcoming_Game1_Ticket_Set_Up_Close()
    {
        //BackButton1.gameObject.SetActive(false);
        //BackButton2.gameObject.SetActive(false);
        Upcoming_Game_Purchase_UI.SetActive(false);
    }

    internal void Upcoming_Game1_Ticket_Set_Up(bool isforce = false)
    {
        if (!isforce)
        {
            EditLuckyNumberEnable = false;
        }
        buyMoreTicket.interactable = true;
        selectLuckyNumberPanel.ClosePanel();
        int length = Upcoming_Game_Tickets.Count;
        if (length > 0)
        {
            for (int i = 0; i < length; i++)
                Destroy(Upcoming_Game_Tickets[i].gameObject);
            Upcoming_Game_Tickets.Clear();
        }

        if (instantiatedObjects.Count > 0)
        {
            for (int i = 0; i < instantiatedObjects.Count; i++)
                Destroy(instantiatedObjects[i].gameObject);
            instantiatedObjects.Clear();
        }

        length = Upcoming_Game_Data.ticketTypes.Count;
        var localManager = Upcoming_Game_Purchased_Ticket_Txt.GetComponent<LocalizationParamsManager>();
        localManager.SetParameterValue("value", Upcoming_Game_Data.purchasedTickets.ToString());

        Upcoming_Game_Name_Txt.GetComponent<LocalizationParamsManager>().SetParameterValue("value", Upcoming_Game_Data.gameName);
        // $"Wait until the <b>{Upcoming_Game_Data.gameName}</b> game starts";
        //Upcoming_Game_Purchased_Ticket_Txt.text = $"{Upcoming_Game_Data.purchasedTickets}";
        Upcoming_Game_Purchase_UI.SetActive(true);
        Game1PurchaseTicketData ticket;
        for (int i = 0; i < length; i++)
        {
            ticket = Instantiate(Upcoming_Game_Ticket_Prefab, Vector3.zero, Quaternion.identity, Upcoming_Game_Ticket_Parent);
            Upcoming_Game_Tickets.Add(ticket);
            ticket.Set_Data(Upcoming_Game_Data.ticketTypes[i], Get_Ticket_Weight(Upcoming_Game_Data.gameType, Upcoming_Game_Data.ticketTypes[i].name)); //Upcoming_Game_Data.ticketTypes[i].name.ToLower().Contains("large") ? 3 : 1);

            GameObject newObject = Instantiate(Prefab_Devider, Vector3.zero, Quaternion.identity, Upcoming_Game_Ticket_Parent);
            instantiatedObjects.Add(newObject);
        }

        //To remove the last instantiated GameObject:
        if (instantiatedObjects.Count > 0)
        {
            GameObject lastObject = instantiatedObjects[instantiatedObjects.Count - 1];
            instantiatedObjects.RemoveAt(instantiatedObjects.Count - 1);
            Destroy(lastObject);
        }

        Upcoming_Game_Purchase_UI.SetActive(false);
        Upcoming_Game_CSF.enabled = false;
        Invoke(nameof(Enable_Upcoming_UI), 0.25f);
    }

    int Get_Ticket_Weight(string game_Type, string ticket_name)
    {
        switch (game_Type)
        {
            default:
                return 1;
            case "traffic-light":
                return 3;
            case "elvis":
                return 2;
            case "color":
                if (ticket_name.ToLower().Contains("large"))
                    return 3;
                return 1;
        }
    }

    void Enable_Upcoming_UI()
    {
        buyMoreTicket.interactable = true;
        Upcoming_Game_Purchase_UI.SetActive(true);
        StartCoroutine(Refresh_Upcoming_UI());
    }

    IEnumerator Refresh_Upcoming_UI()
    {
        Upcoming_Game_CSF.enabled = true;
        yield return new WaitForSeconds(0.1f);
        Upcoming_Game_CSF.enabled = false;
        yield return new WaitForSeconds(0.1f);
        Upcoming_Game_CSF.enabled = true;
    }

    public void Chat_Open_Close_Btn()
    {
        switch (Chat_Panel_State)
        {
            case 0: // Open chat panel
                LeanTween.cancel(chatPanel.gameObject);
                LeanTween.move(
                    Chat_Panel_RT,
                    new Vector2(0f, Chat_Panel_RT.anchoredPosition.y),
                    0.25f
                );

                LeanTween.cancel(Tickets_ScrollRect_RT.gameObject);
                LeanTween.value(
                    Tickets_ScrollRect_RT.gameObject,
                    Set_Ticket_Scroll_Rect_RT,
                    new Vector2(200f, -30f),
                    new Vector2(200f, -400f),
                    0.25f
                );
                LeanTween.cancel(Elvis_Tickets_ScrollRect_RT.gameObject);
                LeanTween.value(
                    Elvis_Tickets_ScrollRect_RT.gameObject,
                    Set_Elvis_Ticket_Scroll_Rect_RT,
                    new Vector2(200f, -30f),
                    new Vector2(200f, -400f),
                    0.25f
                );

                Chat_Open_Close_Icon.eulerAngles = new Vector3(0f, 0f, 180f);
                Chat_Open_Open_Text.SetActive(false);
                Chat_Open_Close_Text.SetActive(true);
                Chat_Panel_State = 1;
                if (Upcoming_Game_Purchase_UI.activeSelf)
                {
                    LeanTween.cancel(Upcoming_Game_Purchase_UI);
                    LeanTween.move(
                        Upcoming_Game_Purchase_UI.GetComponent<RectTransform>(),
                        new Vector2(
                            (-Chat_Panel_RT.rect.width / 2f) + 100f,
                            Upcoming_Game_Purchase_UI
                                .GetComponent<RectTransform>()
                                .anchoredPosition.y
                        ),
                        0.25f
                    );
                }

                if (Panel_Game_Header.activeSelf)
                {
                    LeanTween.cancel(Panel_Game_Header);
                    LeanTween
                        .move(
                            Panel_Game_Header.GetComponent<RectTransform>(),
                            new Vector2(
                                Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.x
                                    - 80,
                                Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.y
                            ),
                            0.25f
                        )
                        .setOnComplete(() =>
                        {
                            // Assuming the script is attached to the GameObject with RectTransform
                            RectTransform rectTransform =
                                Panel_Game_Header.GetComponent<RectTransform>();

                            // Set the left and right values to 0
                            rectTransform.offsetMin = new Vector2(0f, rectTransform.offsetMin.y);
                            rectTransform.offsetMax = new Vector2(0f, rectTransform.offsetMax.y);
                        });
                }
                break;
            case 1: // Close chat panel
                LeanTween.cancel(chatPanel.gameObject);
                LeanTween.move(
                    Chat_Panel_RT,
                    new Vector2(Chat_Panel_RT.rect.width * 3f, Chat_Panel_RT.anchoredPosition.y),
                    0.25f
                );
                LeanTween.cancel(Tickets_ScrollRect_RT.gameObject);
                LeanTween.value(
                    Tickets_ScrollRect_RT.gameObject,
                    Set_Ticket_Scroll_Rect_RT,
                    new Vector2(200f, -400f),
                    new Vector2(200f, -30f),
                    0.25f
                );
                LeanTween.cancel(Elvis_Tickets_ScrollRect_RT.gameObject);
                LeanTween.value(
                    Elvis_Tickets_ScrollRect_RT.gameObject,
                    Set_Elvis_Ticket_Scroll_Rect_RT,
                    new Vector2(200f, -400f),
                    new Vector2(200f, -30f),
                    0.25f
                );
                Chat_Open_Close_Icon.eulerAngles = Vector3.zero;
                Chat_Open_Open_Text.SetActive(true);
                Chat_Open_Close_Text.SetActive(false);
                Chat_Panel_State = 0;
                if (Upcoming_Game_Purchase_UI.activeSelf)
                {
                    LeanTween.cancel(Upcoming_Game_Purchase_UI);
                    LeanTween.move(
                        Upcoming_Game_Purchase_UI.GetComponent<RectTransform>(),
                        new Vector2(
                            100f,
                            Upcoming_Game_Purchase_UI
                                .GetComponent<RectTransform>()
                                .anchoredPosition.y
                        ),
                        0.25f
                    );
                }

                if (Panel_Game_Header.activeSelf)
                {
                    LeanTween.cancel(Panel_Game_Header);
                    LeanTween
                        .move(
                            Panel_Game_Header.GetComponent<RectTransform>(),
                            new Vector2(
                                Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.x
                                    + 80f,
                                Panel_Game_Header.GetComponent<RectTransform>().anchoredPosition.y
                            ),
                            0.25f
                        )
                        .setOnComplete(() => { });
                }

                break;
        }
    }

    void Set_Ticket_Scroll_Rect_RT(Vector2 size)
    {
        Tickets_ScrollRect_RT.offsetMin = new Vector2(size.x, Tickets_ScrollRect_RT.offsetMin.y);
        Tickets_ScrollRect_RT.offsetMax = new Vector2(size.y, Tickets_ScrollRect_RT.offsetMax.y);
    }

    void Set_Elvis_Ticket_Scroll_Rect_RT(Vector2 size)
    {
        Elvis_Tickets_ScrollRect_RT.offsetMin = new Vector2(
            size.x,
            Elvis_Tickets_ScrollRect_RT.offsetMin.y
        );
        Elvis_Tickets_ScrollRect_RT.offsetMax = new Vector2(
            size.y,
            Elvis_Tickets_ScrollRect_RT.offsetMax.y
        );
    }

    #endregion

    #region PRIVATE_METHODS
    private void HandleLanguageChange()
    {
        GenerateRowDetails(BingoGame1HistoryData.patternList);
        GeneratePatternList(BingoGame1HistoryData.patternList);
        GenerateTicketList(BingoGame1HistoryData.ticketList);
        GenerateWithdrawNumberList(BingoGame1HistoryData.withdrawNumberList);
    }

    private void GenerateRowDetails(List<PatternData> patternList)
    {
        //Row 1
        //Row 2
        //Row 3
        //Row 4
        //Picture
        //Frame
        //Full House

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

                    if (
                        patternList[i].name == "Row 1"
                        || patternList[i].name == "Row 2"
                        || patternList[i].name == "Row 3"
                        || patternList[i].name == "Row 4"
                    )
                    {
                        PanelRowDetails.Rows[i].text =
                            I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow")
                            + " "
                            + incrementedI
                            + " - "
                            + patternList[i].amount
                            + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else if (patternList[i].name == "Picture")
                    {
                        PanelRowDetails.Rows[i].text =
                            I2.Loc.LocalizationManager.GetTranslation("TextDataSubPicture")
                            + " - "
                            + patternList[i].amount
                            + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else if (patternList[i].name == "Frame")
                    {
                        PanelRowDetails.Rows[i].text =
                            I2.Loc.LocalizationManager.GetTranslation("TextDataSubFrame")
                            + " - "
                            + patternList[i].amount
                            + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else if (patternList[i].name == "Full House")
                    {
                        PanelRowDetails.Rows[i].text =
                            I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow")
                            + " 5"
                            + " - "
                            + patternList[i].amount
                            + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else
                    {
                        PanelRowDetails.Rows[i].text =
                            I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow")
                            + " "
                            + incrementedI
                            + " - "
                            + patternList[i].amount
                            + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }

                    PanelRowDetails.Rows[i].GetComponent<TextMeshProUGUI>().color =
                        PanelRowDetails.ActiveColour;
                }
                else
                {
                    if (
                        patternList[i].name == "Row 1"
                        || patternList[i].name == "Row 2"
                        || patternList[i].name == "Row 3"
                        || patternList[i].name == "Row 4"
                    )
                    {
                        PanelRowDetails.Rows[i].text =
                            I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow")
                            + " "
                            + incrementedI
                            + " - "
                            + patternList[i].amount
                            + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else if (patternList[i].name == "Picture")
                    {
                        PanelRowDetails.Rows[i].text =
                            I2.Loc.LocalizationManager.GetTranslation("TextDataSubPicture")
                            + " - "
                            + patternList[i].amount
                            + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else if (patternList[i].name == "Frame")
                    {
                        PanelRowDetails.Rows[i].text =
                            I2.Loc.LocalizationManager.GetTranslation("TextDataSubFrame")
                            + " - "
                            + patternList[i].amount
                            + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else if (patternList[i].name == "Full House")
                    {
                        PanelRowDetails.Rows[i].text =
                            I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow")
                            + " 5"
                            + " - "
                            + patternList[i].amount
                            + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }
                    else
                    {
                        PanelRowDetails.Rows[i].text =
                            I2.Loc.LocalizationManager.GetTranslation("TextDataSubRow")
                            + " "
                            + incrementedI
                            + " - "
                            + patternList[i].amount
                            + " kr";
                        PanelRowDetails.Rows[i].gameObject.SetActive(true);
                    }

                    PanelRowDetails.Rows[i].GetComponent<TextMeshProUGUI>().color =
                        PanelRowDetails.DeActiveColour;
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
                if (Patterns[i].Pattern_Name == patternList[j].name)
                {
                    CanBeDeleted = false;
                    Patterns[i].Update_Pattern_Amount(patternList[j].amount);
                    patternList.RemoveAt(j);
                    break;
                }
            }
            if (CanBeDeleted)
            {
                if (Patterns[i].gameObject != null)
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
                    PrefabBingoGame1Pattern newPatternPanel = Instantiate(
                        prefabBingo1PatternPanel,
                        transformPatternContainer
                    );
                    newPatternPanel.SetData(patternList[i], i);
                    Patterns.Add(newPatternPanel);
                }
            }

            for (int i = 1; i < Patterns.Count; i++)
                Patterns[i].transform.SetAsFirstSibling();
            for (int j = 4; j > 0; j--)
                for (int i = 0; i < Patterns.Count; i++)
                    if (Patterns[i].Pattern_Design == j)
                        Patterns[i].transform.SetAsFirstSibling();
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

        if (withdrawNumberList.Count > 0)
            LastWithdrawNumber = withdrawNumberList[withdrawNumberList.Count - 1].number;

        bingoBallPanelManager.WithdrawList(withdrawNumberList, "Game 1");
    }

    private void RunBestCardFirstAction()
    {
        //ticketList.Sort(BingoTicket.ReverseSortBySelectedNumber);

        //for (int i = 0; i < ticketList.Count; i++)
        //    ticketList[i].transform.SetSiblingIndex(i);

        // PrefabBingoGame1Ticket5x5 ticket;
        // for (int i = 1; i < ticketList.Count; i++)
        //     for (int j = 0; j < i; j++)
        //         if (
        //             ticketList[j].Pattern_Remaining_Cell_Count
        //             > ticketList[i].Pattern_Remaining_Cell_Count
        //         )
        //         {
        //             ticketList[j].transform.SetSiblingIndex(i);
        //             ticketList[i].transform.SetSiblingIndex(j);
        //             ticket = ticketList[j];
        //             ticketList[j] = ticketList[i];
        //             ticketList[i] = ticket;
        //         }

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
        bingoBallPanelManager.NewWithdraw(newBingoNumberData, true, "Game 1");
        MarkWithdrawNumbers(newBingoNumberData, true);
        LastWithdrawNumber = newBingoNumberData.number;
    }

    /// <summary>
    /// Mark new withdraw number on all ticket
    /// </summary>
    /// <param name="data"></param>
    private void MarkWithdrawNumbers(BingoNumberData data, bool playSound = false)
    {
        foreach (PrefabBingoGame1Ticket5x5 ticket in ticketList)
        {
            ticket.MarkNewWithdrawNumber(data.number, true, false, playSound);
            ticket.Set_Togo_Txt_Game1();
        }
        foreach (PrefabBingoGame1Ticket5x5 ticket in ticketList)
        {
            if (ticket.Pattern_Remaining_Cell_Count == 0)
            {
                foreach (PrefabBingoGame1Ticket5x5 t in ticketList)
                {
                    t.Stop_Blink();
                }
            }
        }
        RunBestCardFirstAction();
    }

    public void HighlightLuckyNumber()
    {
        foreach (PrefabBingoGame1Ticket5x5 ticket in ticketList)
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
        //Debug.Log("GenerateTicketList : " + ticketDataList.Count);
        foreach (Transform transform in transformTicketContainer)
            Destroy(transform.gameObject);
        ticketList.Clear();
        ticketLargeList.Clear();
        int largeTicketCount = 0;
        var isElvis = UIManager.Instance.game1Panel.Game_1_Data.gameName == "Elvis";
        List<GameTicketData> currentBatch = new List<GameTicketData>();
        List<PrefabBingoGame1Ticket5x5> largeTicketPrefabs = new List<PrefabBingoGame1Ticket5x5>();

        foreach (GameTicketData data in ticketDataList)
        {
            PrefabBingoGame1Ticket5x5 newTicket = Instantiate(
                prefabBingoGame1Ticket5X5,
                transformTicketContainer
            );
            newTicket.SetData(data, markerData);
            newTicket.Game_1_12();
            if (isElvis)
                newTicket.Ticket_Name_Txt.text = data.ticketColor;
            newTicket.Set_Ticket_Color();
            ticketList.Add(newTicket);
            if (newTicket.gameTicketData.IsLargeTicket())
            {
                currentBatch.Add(data);
                largeTicketPrefabs.Add(newTicket);

                if (currentBatch.Count == 3)
                {
                    PrefabBingoGame1Ticket5x5 lastLargeTicket = largeTicketPrefabs[
                        largeTicketPrefabs.Count - 1
                    ];
                    lastLargeTicket.deleteBtn.gameObject.SetActive(
                        !BingoGame1HistoryData.gameStatus.Equals("running")
                    );
                    currentBatch.Clear();
                }
                largeTicketCount++;
            }
            // Handle small tickets
            else if (
                newTicket.gameTicketData.IsSmallTicket()
                && !BingoGame1HistoryData.gameName.Equals("Traffic Light")
            )
            {
                newTicket.deleteBtn.gameObject.SetActive(
                    !BingoGame1HistoryData.gameStatus.Equals("running")
                );
            }
            // Handle traffic light tickets
            else if (BingoGame1HistoryData.gameName.Equals("Traffic Light"))
            {
                currentBatch.Add(data);
                largeTicketPrefabs.Add(newTicket);

                if (currentBatch.Count == 3)
                {
                    PrefabBingoGame1Ticket5x5 lastLargeTicket = largeTicketPrefabs[
                        largeTicketPrefabs.Count - 1
                    ];
                    lastLargeTicket.deleteBtn.gameObject.SetActive(true);
                    currentBatch.Clear();
                }
                largeTicketCount++;
            }
        }
        Upcoming_Game_Purchase_UI.SetActive(ticketList.Count == 0);
        Tickets_Panel.SetActive(true);
        Elvis_Replace_Tickets_Panel.SetActive(false);
        int length = Elvis_Tickets.Count;
        for (int i = 0; i < length; i++)
            Destroy(Elvis_Tickets[i]);
        Elvis_Tickets.Clear();
        if (ticketDataList.Count > 0)
        {
            if (UIManager.Instance.game1Panel.Game_1_Data.gameName == "Elvis")
            {
                Elvis_Game_Tickets(ticketDataList);
                if (UIManager.Instance.game1Panel.Is_Upcoming_Game && !isReplaceDisabled)
                {
                    Tickets_Panel.SetActive(false);
                    Elvis_Replace_Tickets_Panel.SetActive(true);
                    UIManager
                        .Instance
                        .topBarPanel
                        .hallGameListPanel
                        .game1ViewPurchaseTicket
                        .Game_ID = UIManager.Instance.game1Panel.Game_1_Data.gameId;
                    UIManager
                        .Instance
                        .topBarPanel
                        .hallGameListPanel
                        .game1ViewPurchaseTicket
                        .Replace_Amount = Replace_Amount;
                }
                else
                {
                    Elvis_Replace_Tickets_Panel.SetActive(false);
                }
            }
        }
    }

    void Elvis_Game_Tickets(List<GameTicketData> tickets)
    {
        int length = tickets.Count;
        List<View_Ticket_Data> mini_tickets = new List<View_Ticket_Data>();
        for (int i = 0; i < length; i += 2)
        {
            Elvis_Ticket = Instantiate(View_Elvis_Tickets_Prefab, View_Ticket_Parent);
            mini_tickets.Clear();
            for (int j = 0; j < 2; j++)
                mini_tickets.Add(
                    new View_Ticket_Data(
                        tickets[i + j].id,
                        tickets[i + j].ticketNumber,
                        int.Parse(tickets[i + j].ticketPrice),
                        tickets[i + j].ticketCellNumberList
                    )
                );
            Elvis_Ticket.Set_Data(
                mini_tickets,
                TicketColorManager.Instance.Get_Ticket_Color(tickets[i].ticketColor),
                tickets[i].ticketColor,
                Replace_Amount
            );
            Elvis_Tickets.Add(Elvis_Ticket.gameObject);
        }
    }

    private PrefabBingoGame1Ticket5x5 GetTicketById(string ticketId)
    {
        foreach (PrefabBingoGame1Ticket5x5 ticket in ticketList)
        {
            if (ticket.TicketId == ticketId)
                return ticket;
        }

        return null;
    }

    //private void CallWheelOfFortuneEvent()
    //{
    //    DisplayLoader(true); // UIManager.Instance.DisplayLoader(true);
    //    EventManager.Instance.WheelOfFortuneData(GameSocketManager.SocketGame1, gameData.gameId, WheelOfFortuneDataResponse);
    //}

    private void CallWheelOfFortuneEvent(BingoGame1History gameHistory = null, bool isForceShow = false)
    {
        if (isForceShow)
        {
            if (gameHistory.minigameData.isDisplayWheel)
            {
                // UIManager.Instance.DisplayLoader(true);
                EventManager.Instance.WheelOfFortuneData(
                    GameSocketManager.SocketGame1,
                    gameData.gameId,
                    WheelOfFortuneDataResponse
                );
            }
            else
            {
                //false: physical player won->show only winning popup
            }
        }
        else
        {
            // UIManager.Instance.DisplayLoader(true);
            EventManager.Instance.WheelOfFortuneData(GameSocketManager.SocketGame1, gameData.gameId, WheelOfFortuneDataResponse);
        }
    }

    private void WheelOfFortuneDataResponse(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("WheelOfFortuneDataResponse :" + packet.ToString());
        DisplayLoader(false); // UIManager.Instance.DisplayLoader(false);

        EventResponse<WheelOfFortuneData> response = JsonUtility.FromJson<EventResponse<WheelOfFortuneData>>(Utility.Instance.GetPacketString(packet));
        if (response.status == Constants.EventStatus.SUCCESS)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (UIManager.Instance.isGameWebGL)
            {
                // wheelOfFortunePanel.Open(GameSocketManager.SocketGame1, gameData.gameId, response.result, 10, UIManager.Instance.game1Panel.BackgroundSprite, LocalizationManager.GetTranslation("Game 1"));
                // fortuneWheelManager.Open(
                //     GameSocketManager.SocketGame1,
                //     gameData.gameId,
                //     response.result,
                //     10,
                //     UIManager.Instance.game1Panel.BackgroundSprite,
                //     LocalizationManager.GetTranslation("Game 1")
                // );
                newFortuneWheelManager.Open(GameSocketManager.SocketGame1, gameData.gameId, response.result, 10, UIManager.Instance.game1Panel.BackgroundSprite, LocalizationManager.GetTranslation("Game 1"));
            }
            else
            {
                // wheelOfFortunePanel.Open(GameSocketManager.SocketGame1, gameData.gameId, response.result, 10, UIManager.Instance.game1Panel.BackgroundSprite, "Game 1");
                // fortuneWheelManager.Open(
                //     GameSocketManager.SocketGame1,
                //     gameData.gameId,
                //     response.result,
                //     10,
                //     UIManager.Instance.game1Panel.BackgroundSprite,
                //     "Game 1"
                // );
                newFortuneWheelManager.Open(GameSocketManager.SocketGame1, gameData.gameId, response.result, 10, UIManager.Instance.game1Panel.BackgroundSprite, "Game 1");
            }
#else
            // wheelOfFortunePanel.Open(GameSocketManager.SocketGame1, gameData.gameId, response.result, 10 , UIManager.Instance.game1Panel.BackgroundSprite, LocalizationManager.GetTranslation("Game 1"));
            // fortuneWheelManager.Open(GameSocketManager.SocketGame1, gameData.gameId, response.result, 10, UIManager.Instance.game1Panel.BackgroundSprite, LocalizationManager.GetTranslation("Game 1"));
            newFortuneWheelManager.Open(GameSocketManager.SocketGame1, gameData.gameId, response.result, 10, UIManager.Instance.game1Panel.BackgroundSprite, LocalizationManager.GetTranslation("Game 1"));
#endif
        }
        else
        {
            GetUtilityMessagePanel().DisplayMessagePopup(response.message);
        }
    }

    private void CallTreasureChestEvent()
    {
        DisplayLoader(true); // UIManager.Instance.DisplayLoader(true);

        //#if UNITY_WEBGL
        //        Refresh();
        //#else
        //                UIManager.Instance.DisplayLoader(true);
        //                EventManager.Instance.WheelOfFortuneData(adminSocket, roomId, WheelOfFortuneDataResponse, "Admin");
        //#endif

        EventManager.Instance.TreasureChestData(
            GameSocketManager.SocketGame1,
            gameData.gameId,
            TreasureChestDataResponse
        );
    }

    private void TreasureChestDataResponse(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("TreasureChestDataResponse :" + packet.ToString());
        DisplayLoader(false); // UIManager.Instance.DisplayLoader(false);

        EventResponse<TreasureChestData> response = JsonUtility.FromJson<
            EventResponse<TreasureChestData>
        >(Utility.Instance.GetPacketString(packet));
        if (response.status == Constants.EventStatus.SUCCESS)
        {
#if UNITY_WEBGL
            if (UIManager.Instance.isGameWebGL)
            {
                treasureChestPanel.Open(
                    GameSocketManager.SocketGame1,
                    gameData.gameId,
                    response.result,
                    10,
                    UIManager.Instance.game1Panel.BackgroundSprite,
                    LocalizationManager.GetTranslation("Game 1")
                );
            }
            else
            {
                treasureChestPanel.Open(
                    GameSocketManager.SocketGame1,
                    gameData.gameId,
                    response.result,
                    10,
                    UIManager.Instance.game1Panel.BackgroundSprite,
                    "Game 1"
                );
            }
#else
            treasureChestPanel.Open(
                GameSocketManager.SocketGame1,
                gameData.gameId,
                response.result,
                10,
                UIManager.Instance.game1Panel.BackgroundSprite,
                LocalizationManager.GetTranslation("Game 1")
            );
#endif
        }
        else
        {
            GetUtilityMessagePanel().DisplayMessagePopup(response.message);
        }
    }

    private void CallMysteryGameEvent()
    {
        DisplayLoader(true); // UIManager.Instance.DisplayLoader(true);
        EventManager.Instance.MysteryGameData(
            GameSocketManager.SocketGame1,
            gameData.gameId,
            MysteryGameDataResponse,
            "Real"
        );
    }

    private void MysteryGameDataResponse(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("MysteryGameDataResponse :" + packet.ToString());
        DisplayLoader(false); // UIManager.Instance.DisplayLoader(false);

        EventResponse<MysteryGameData> response = JsonUtility.FromJson<EventResponse<MysteryGameData>>(Utility.Instance.GetPacketString(packet));
        if (response.status == Constants.EventStatus.SUCCESS)
        {
#if UNITY_WEBGL
            if (UIManager.Instance.isGameWebGL)
            {
                mysteryGamePanel.Open(
                    GameSocketManager.SocketGame1,
                    gameData.gameId,
                    response.result,
                    UIManager.Instance.game1Panel.BackgroundSprite,
                    response.result.isGamePaused,
                    BingoGame1HistoryData.pauseGameMessage,
                    LocalizationManager.GetTranslation("Game 1"),
                    "Game 1"
                );
            }
            else
            {
                mysteryGamePanel.Open(
                    GameSocketManager.SocketGame1,
                    gameData.gameId,
                    response.result,
                    UIManager.Instance.game1Panel.BackgroundSprite,
                    response.result.isGamePaused,
                    BingoGame1HistoryData.pauseGameMessage,
                    "Game 1",
                    "Game 1"
                );
            }
#else
            mysteryGamePanel.Open(
                GameSocketManager.SocketGame1,
                gameData.gameId,
                response.result,
                UIManager.Instance.game1Panel.BackgroundSprite,
                response.result.isGamePaused,
                BingoGame1HistoryData.pauseGameMessage,
                LocalizationManager.GetTranslation("Game 1"),
                "Game 1"
            );
#endif
        }
        else
            GetUtilityMessagePanel().DisplayMessagePopup(response.message);
    }

    private void CallColorDraftGameEvent()
    {
        DisplayLoader(true);
        EventManager.Instance.ColorDraftGameData(
            GameSocketManager.SocketGame1,
            gameData.gameId,
            ColorDraftGameDataResponse,
            "Real"
        );
    }

    private void ColorDraftGameDataResponse(Socket socket, Packet packet, object[] args)
    {
        Debug.Log("ColorDraftGameDataResponse :" + packet.ToString());
        DisplayLoader(false); // UIManager.Instance.DisplayLoader(false);

        EventResponse<ColorDraftGameData> response = JsonUtility.FromJson<
            EventResponse<ColorDraftGameData>
        >(Utility.Instance.GetPacketString(packet));
        if (response.status == Constants.EventStatus.SUCCESS)
        {
#if UNITY_WEBGL
            if (UIManager.Instance.isGameWebGL)
            {
                colorDraftGamePanel.Open(
                    GameSocketManager.SocketGame1,
                    gameData.gameId,
                    response.result,
                    UIManager.Instance.game1Panel.BackgroundSprite,
                    response.result.isGamePaused,
                    BingoGame1HistoryData.pauseGameMessage,
                    LocalizationManager.GetTranslation("Game 1")
                );
            }
            else
            {
                colorDraftGamePanel.Open(
                    GameSocketManager.SocketGame1,
                    gameData.gameId,
                    response.result,
                    UIManager.Instance.game1Panel.BackgroundSprite,
                    response.result.isGamePaused,
                    BingoGame1HistoryData.pauseGameMessage,
                    "Game 1"
                );
            }
#else
            colorDraftGamePanel.Open(
                GameSocketManager.SocketGame1,
                gameData.gameId,
                response.result,
                UIManager.Instance.game1Panel.BackgroundSprite,
                response.result.isGamePaused,
                BingoGame1HistoryData.pauseGameMessage,
                LocalizationManager.GetTranslation("Game 1")
            );
#endif
        }
        else
        {
            GetUtilityMessagePanel().DisplayMessagePopup(response.message);
        }
    }

    private void CloseMiniGames()
    {
        // wheelOfFortunePanel.Close();
        fortuneWheelManager.Close();
        newFortuneWheelManager.Close();
        treasureChestPanel.Close();
        mysteryGamePanel.Close();
        colorDraftGamePanel.Close();
    }

    /// <summary>
    /// Reset/Clear all game data. normally calls on starting game or reconnecting existing game
    /// </summary>
    private void Reset()
    {
        LastWithdrawNumber = 0;
        LuckyNumber = 0;
        TotalRegisteredPlayerCount = 0;

        Game_1_Timer.SetActive(false);
        Game_1_Timer_LBL.SetActive(false);
        bingoBallPanelManager.Reset();
        ticketList.Clear();
        ticketLargeList.Clear();

        Tickets_Panel.SetActive(false);
        Elvis_Replace_Tickets_Panel.SetActive(false);

        foreach (Transform transform in transformPatternContainer)
            Destroy(transform.gameObject);

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

            if (value > 0)
                txtLuckeyNumber.text = value.ToString();
            else
                txtLuckeyNumber.text = "";
        }
        get { return _luckeyNumber; }
    }

    public int GameMarkerId
    {
        set
        {
            PlayerPrefs.SetInt("Game_Marker", value);
            _gameMarkerId = value;
            markerData = UIManager.Instance.GetMarkerData(value);
            foreach (PrefabBingoGame1Ticket5x5 ticket in ticketList)
                ticket.ModifyMarkerDesign(markerData, true);
        }
        get { return _gameMarkerId; }
    }

    public int TotalRegisteredPlayerCount
    {
        set { txtActivePlayers.text = value.ToString("00"); }
    }

    public int TotalBetAmount
    {
        set
        {
            txtTotalBetAmount
                .GetComponent<LocalizationParamsManager>()
                .SetParameterValue("TotalBet", value.ToString());
        }
    }

    public int TotalProfitAmount
    {
        set
        {
            txtTotalProfitAmount
                .GetComponent<LocalizationParamsManager>()
                .SetParameterValue("TotalProfit", value.ToString());
        }
    }

    public int TotalWithdrawCount
    {
        set { txtWithdrawNumberStats.text = value.ToString("00") + "/" + MaxWithdrawCount; }
    }

    public bool EditLuckyNumberEnable
    {
        set
        {
            //Debug.LogError("txtPickLuckyNumber : " + value);
            txtPickLuckyNumber.gameObject.SetActive(value);
            btnSelectLuckyNumber.enabled = value;
        }
    }

    public int MaxWithdrawCount
    {
        set { _maxWithdrawCount = value; }
        get { return _maxWithdrawCount; }
    }

    public int LastWithdrawNumber
    {
        set { txtLastWithdrawNumber.text = value.ToString("00"); }
    }
    #endregion
}
