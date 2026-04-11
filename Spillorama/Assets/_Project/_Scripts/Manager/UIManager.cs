using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using Assets.Plugins.Drop3DEffects.Scripts;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

public static class Extention
{
    public static string ToTime(this float secounds)
    {
        return $"{(secounds / 60):00}:{(secounds % 60):00}";
    }
}

public class UIManager : MonoBehaviour
{
    #region PUBLIC_VARIABLES
    public static UIManager Instance = null;

    [SerializeField] private Image bingoBtnLoginPanel;
    [SerializeField] private Image bingoBtnTopBarPanel;
    [SerializeField] private Sprite bingoBtnYellow;
    [SerializeField] private Sprite bingoBtnGrey;

    public bool isBreak;
    public bool isGame2 = false;
    public bool isGame3 = false;
    public bool isGame4 = false;
    public bool isGame4Theme1 = false;
    public bool isGame4Theme2 = false;
    public bool isGame4Theme3 = false;
    public bool isGame4Theme4 = false;
    public bool isGame4Theme5 = false;
    public bool isGame5 = false;
    public DateTimeOffset startBreakTime;
    public DateTimeOffset endBreakTime;

    [HideInInspector]
    public bool isGameWebGL = false;

    public Canvas canvas;
    public GameAssetData gameAssetData;
    public KeyboardScript keyboardWin;
    public SplashScreenPanel splashScreenPanel;
    public BingoHallDisplay bingoHallDisplayPanel;
    public LoginPanel loginPanel;
    public SignupPanel signupPanel;
    public ForgotPasswordPanel forgotPasswordPanel;
    public TopBarPanel topBarPanel;
    public LobbyPanel lobbyPanel;
    public BreakTimer breakTimePopup;
    public NotificationPanel notificationPanel;
    public ProfilePanel profilePanel;
    public SettingPanel settingPanel;
    public SubSettingPanel subSettingPanel;
    public UtilityMessagePanel messagePopup;
    public UtilityMessagePanel deleteMessagePopup;
    public UtilityLoaderPanel loaderPanel;
    public MultipleSelectionPanel MultiSelectionPanel;
    public SelectPurchaseTypePanel selectPurchaseTypePanel;
    public WithdrawNumberHistoryPanel withdrawNumberHistoryPanel;
    public MultipleGameScreenManager multipleGameScreenManager;
    public SplitScreenGameManager splitScreenGameManager;
    public AdminExtraGameNotifications adminExtraGameNotifications;
    public webViewManager webViewManager;
    public UpdateManager UpdateManager;


    [Header("Bingo Games")]
    public Game1Panel game1Panel;
    public Game2Panel game2Panel;
    public Game3Panel game3Panel;
    public Game4Panel game4Panel;
    public Game5Panel game5Panel;

    [Header("Background Sprites")]
    [SerializeField] private Sprite spriteBackground1;
    [SerializeField] private Sprite spriteBackground2;
    [SerializeField] private Sprite spriteBackground3;
    [SerializeField] private Sprite spriteBackground4;
    [SerializeField] private Sprite spriteBackground5;

    [Header("Ticket Marker Data List")]
    [SerializeField] private TicketMarkerCellData marker1Data;
    [SerializeField] private TicketMarkerCellData marker2Data;
    [SerializeField] private TicketMarkerCellData marker3Data;
    [SerializeField] private TicketMarkerCellData marker4Data;
    [SerializeField] private TicketMarkerCellData marker5Data;
    [SerializeField] private TicketMarkerCellData marker6Data;
    [SerializeField] private TicketMarkerCellData marker7Data;

    [Header("Emoji Sprite")]
    [SerializeField] private List<Sprite> emojiSpriteList;

    [Header("Cursor Sprite")]
    public Texture2D handCursor; // The cursor texture when over a button
    public Texture2D arrowCursor; // The cursor texture when over a button

    [Header("Text")]
    [SerializeField] private TextMeshProUGUI txtNotificationUpperTray;
    [SerializeField] private TextMeshProUGUI txtNotificationUpperTray2;

    [Header("Winner Animation Components")]
    [SerializeField] private Animator3D Animations;
    [SerializeField] private Transform Model;

    [Header("Player")]
    [SerializeField] internal string Player_Hall_ID;
    [SerializeField] internal string Player_Hall_Name;
    [SerializeField] internal string selectedLanguage;

    internal int Current_Game_Number;

    [Header("Safe-Area-Border")]
    public RectTransform Left_Safe_Area_Border;
    public RectTransform Right_Safe_Area_Border;

    public Sprite Elvis_Icon;

    [Header("Co Routines")]
    private Coroutine closeNotificationCoroutine;

    [HideInInspector]
    public MonoBehaviour previouslyActiveGamePanel;
    [HideInInspector]
    public bool previouslyActiveGame4Theme1;
    [HideInInspector]
    public bool previouslyActiveGame4Theme2;
    [HideInInspector]
    public bool previouslyActiveGame4Theme3;
    [HideInInspector]
    public bool previouslyActiveGame4Theme4;
    [HideInInspector]
    public bool previouslyActiveGame4Theme5;

    #endregion

    #region PRIVATE_VARIABLES    
    #endregion

    #region UNITY_CALLBACKS

    private void Start()
    {
        Debug.Log("CultureInfo Updated");
        // Set the culture to South Africa
        CultureInfo culture = new CultureInfo("en-US");
        // Set the current culture
        System.Threading.Thread.CurrentThread.CurrentCulture = culture;
        System.Threading.Thread.CurrentThread.CurrentUICulture = culture;
        keyboardWin.Close();
#if UNITY_STANDALONE_WIN && !UNITY_EDITOR
        Debug.Log("Downloading Tray App");
        StartCoroutine(UpdateManager.DownloadAndInstallTrayApp());
#endif
    }

    private void Awake()
    {
        Instance = this;

        CloseAllCanvasChildPanels();
        splashScreenPanel.Open();

#if UNITY_WEBGL

        if (SceneManager.GetActiveScene().name == "Game")
        {
            Debug.LogWarning("its Playing of 'Game' Scene name");
            isGameWebGL = true;
        }
        else
        {
            Debug.LogWarning("its Playing Outside of 'Game' Scene name");
            isGameWebGL = false;
        }

#else
        isGameWebGL = false;
#endif

        Debug.Log($"[Recovery] UIManager.Awake scene='{SceneManager.GetActiveScene().name}' isGameWebGL={isGameWebGL}");

    }

    private void OnDisable()
    {
        UIManager.Instance.gameAssetData.IsLoggedIn = false;
    }
    #endregion

    #region DELEGATE_CALLBACKS
    #endregion

    #region PUBLIC_METHODS

    public void CloseAllSubPanels()
    {
        notificationPanel.Close();
        profilePanel.Close();
        settingPanel.Close();
        subSettingPanel.Close();
        lobbyPanel.Close();
    }

    public void CloseAllGameElements()
    {
        if (UIManager.Instance.game5Panel.isActiveAndEnabled)
        {
            UIManager.Instance.game5Panel.game5GamePlayPanel.roulateSpinnerElements.SetActive(false);
        }
    }

    public void ActiveAllGameElements()
    {
        Debug.Log("ActiveAllGameElements");
        if (UIManager.Instance.game5Panel.isActiveAndEnabled)
        {
            UIManager.Instance.game5Panel.game5GamePlayPanel.roulateSpinnerElements.SetActive(true);
        }

        UIManager.Instance.game5Panel.game5GamePlayPanel.roulateSpinnerElements.SetActive(Game5ActiveElementAction());
    }

    public void CloseAllPanels()
    {
        splashScreenPanel.Close();
        bingoHallDisplayPanel.Close();
        loginPanel.Close();
        signupPanel.Close();
        forgotPasswordPanel.Close();
        lobbyPanel.Close();
        notificationPanel.Close();
        profilePanel.Close();
        settingPanel.Close();
        subSettingPanel.Close();
        selectPurchaseTypePanel.Close();

        if (Utility.Instance.IsStandAloneVersion())
        {
            multipleGameScreenManager.CloseResetPanel();
            splitScreenGameManager.CloseResetPanel();
        }
        else
        {
            multipleGameScreenManager.Close();
            game1Panel.Close();
            game2Panel.Close();
            game3Panel.Close();
            game4Panel.Close();
            game5Panel.Close();
        }
        MultiSelectionPanel.Close();
    }

    public void OpenMultiSelectionPanel(string[] options)
    {
        MultiSelectionPanel.SetOptionListAndOpen(options);
    }

    public Sprite GetBackgroundSprite(int id)
    {
        switch (id)
        {
            case GameId.ID2:
                return spriteBackground2;

            case GameId.ID3:
                return spriteBackground3;

            case GameId.ID4:
                return spriteBackground4;

            case GameId.ID5:
                return spriteBackground5;

            default:
                return spriteBackground1;
        }
    }

    public TicketMarkerCellData GetMarkerData(int id)
    {

        switch (id)
        {
            case GameId.ID2:
                return marker2Data;

            case GameId.ID3:
                return marker3Data;

            case GameId.ID4:
                return marker4Data;

            case GameId.ID5:
                return marker5Data;

            case GameId.ID6:
                return marker6Data;

            default:
                return marker1Data;
        }
    }

    public Sprite GetEmoji(int id)
    {
        if (id < 0 || id >= emojiSpriteList.Count)
            id = 0;

        return emojiSpriteList[id];
    }

    public void BingoButtonColor(bool isPaused)
    {
        bingoBtnLoginPanel.sprite = /*isPaused ? bingoBtnGrey :*/ bingoBtnYellow;
        bingoBtnTopBarPanel.sprite = /*isPaused ? bingoBtnGrey :*/ bingoBtnYellow;
    }

    public void LaunchWinningAnimation(string message = "", float waitingTime = 0)
    {
        //if (ScreenSaverManager.Instance.screenSaverActive)
        //return;
        if (message != "")
            StartCoroutine(WinningAnimationMessage(message, waitingTime));

        Animator3D anim = Animations;
        anim.ObjectPrefab = Model;
        anim.StartSpeed = 1;
        anim.Duration = 3;
        anim.Count = 100;
        anim.Run();
    }

    public void StopCloseNotification()
    {
        if (closeNotificationCoroutine != null)
        {
            StopCoroutine(closeNotificationCoroutine); // Stop the CloseNotification coroutine if it's running
            closeNotificationCoroutine = null; // Reset the coroutine variable
        }
    }

    public void DisplayNotificationUpperTray(string message)
    {
        //if (ScreenSaverManager.Instance.screenSaverActive)
        //return;

        StopCloseNotification();
        txtNotificationUpperTray.transform.parent.gameObject.SetActive(false);
        txtNotificationUpperTray.text = message;
        txtNotificationUpperTray.transform.parent.gameObject.SetActive(true);
        var rt = txtNotificationUpperTray.transform.parent.gameObject.GetComponent<RectTransform>();
        LeanTween.scale(rt, new Vector2(1f, 1f), 0.25f)
           .setOnComplete(() =>
           {
               closeNotificationCoroutine = StartCoroutine(CloseNotificationDelayed(3f));
           });
    }

    public void DisplayFirebaseNotificationUpperTray(string message)
    {
        //if (ScreenSaverManager.Instance.screenSaverActive)
        //return;

        StopCloseNotification();
        txtNotificationUpperTray2.transform.parent.gameObject.SetActive(false);
        txtNotificationUpperTray2.text = message;
        txtNotificationUpperTray2.transform.parent.gameObject.SetActive(true);
        var rt = txtNotificationUpperTray2.transform.parent.gameObject.GetComponent<RectTransform>();

        // Set initial position (top)
        rt.anchoredPosition = new Vector2(rt.anchoredPosition.x, 220f);

        // Animate position from top to bottom and scale
        LeanTween.moveY(rt, 0f, 0.25f);
        LeanTween.scale(rt, new Vector2(1f, 1f), 0.25f);
        //    .setOnComplete(() =>
        //    {
        //        closeNotificationCoroutine = StartCoroutine(CloseNotificationDelayed(5f));
        //    });
    }

    public void CloseFirebaseNotificationUpperTray()
    {
        if (closeNotificationCoroutine != null)
        {
            StopCoroutine(closeNotificationCoroutine);
            closeNotificationCoroutine = null;
        }
        closeNotificationCoroutine = StartCoroutine(CloseNotificationDelayed(0.1f));
    }

    private IEnumerator CloseNotificationDelayed(float delay)
    {
        yield return new WaitForSeconds(delay); // Wait for the specified delay (5 seconds in this case)

        if (txtNotificationUpperTray2.transform.parent.gameObject.activeSelf)
        {
            var rt2 = txtNotificationUpperTray2.transform.parent.gameObject.GetComponent<RectTransform>();

            LeanTween.scale(rt2, new Vector2(0f, 0f), 0.25f)
                .setOnComplete(() =>
                {
                    txtNotificationUpperTray2.transform.parent.gameObject.SetActive(false);
                    StopCloseNotification();
                });
        }
        else
        {
            var rt = txtNotificationUpperTray.transform.parent.gameObject.GetComponent<RectTransform>();

            LeanTween.scale(rt, new Vector2(0f, 0f), 0.25f)
                .setOnComplete(() =>
                {
                    txtNotificationUpperTray.transform.parent.gameObject.SetActive(false);
                    StopCloseNotification();
                });
        }
    }

    public bool Game5ActiveElementAction()
    {
        if (UIManager.Instance.profilePanel.isActiveAndEnabled || UIManager.Instance.settingPanel.isActiveAndEnabled || UIManager.Instance.notificationPanel.isActiveAndEnabled
            || UIManager.Instance.game5Panel.game5GamePlayPanel.game5FreeSpinJackpot.isActiveAndEnabled || UIManager.Instance.game5Panel.game5GamePlayPanel.game5JackpotRouletteWheel.isActiveAndEnabled)
        {
            return false;
        }
        else
        {
            return true;
        }
    }

    public void CloseNotification()
    {

        Debug.LogError("Close...................");
        //txtNotificationUpperTray.transform.parent.gameObject.GetComponent<Animator>().enabled = false;
        var rt = txtNotificationUpperTray.transform.parent.gameObject.GetComponent<RectTransform>();
        //LeanTween.move(rt, new Vector2(0f, 150f), 0.25f)
        //    .setOnComplete(() =>
        //    {
        //        txtNotificationUpperTray.transform.parent.gameObject.SetActive(false);
        //    });

        LeanTween.scale(rt, new Vector2(0f, 0f), 0.25f)
        .setOnComplete(() =>
        {
            txtNotificationUpperTray.transform.parent.gameObject.SetActive(false);
        });
    }

    public void DisplayLoader(bool showLoader)
    {
        if (showLoader)
            loaderPanel.ShowLoader();
        else
            loaderPanel.HideLoader();
    }

    public void DisplayLoader(bool showLoader, string msg)
    {
        if (showLoader)
            loaderPanel.ShowLoader(msg);
        else
            loaderPanel.HideLoader();
    }

    public void SyncPlayerTokenToWebHost()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        string authToken = gameAssetData != null && gameAssetData.playerGameData != null
            ? gameAssetData.playerGameData.authToken
            : "";

        if (!string.IsNullOrEmpty(authToken))
            Application.ExternalCall("SetPlayerToken", authToken);
#endif
    }

    public void SyncPlayerTokenToWebHost(string authToken)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        if (!string.IsNullOrEmpty(authToken))
            Application.ExternalCall("SetPlayerToken", authToken);
#endif
    }

    public void ClearPlayerTokenFromWebHost()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        Application.ExternalCall("ClearPlayerToken");
#endif
    }

    public void RefreshPlayerWalletFromHost()
    {
        if (
            gameAssetData == null
            || gameAssetData.playerGameData == null
            || !gameAssetData.IsLoggedIn
            || string.IsNullOrEmpty(gameAssetData.PlayerId)
        )
        {
            Debug.LogWarning("RefreshPlayerWalletFromHost skipped: missing logged-in player context.");
            return;
        }

        EventManager.Instance.GetPlayerDetails(
            gameAssetData.PlayerId,
            (socket, packet, args) =>
            {
                EventResponse<ProfileData> response = JsonUtility.FromJson<EventResponse<ProfileData>>(
                    Utility.Instance.GetPacketString(packet)
                );

                if (response.status != Constants.EventStatus.SUCCESS || response.result == null)
                {
                    Debug.LogWarning(
                        "RefreshPlayerWalletFromHost failed: "
                            + (response != null ? response.message : "empty response")
                    );
                    return;
                }

                gameAssetData.PlayerId = response.result.playerId;
                gameAssetData.Points = response.result.points.ToString("###,###,##0.00");
                gameAssetData.RealMoney = response.result.realMoney.ToString("###,###,##0.00");
                gameAssetData.TodaysBalance = response.result.realMoney.ToString("###,###,##0.00");
                Player_Hall_ID = response.result.hall;
                Player_Hall_Name = response.result.hallName;
            }
        );
    }

    /// <summary>
    /// Called from JavaScript via SendMessage to navigate to a game.
    /// Usage: unityInstance.SendMessage('UIManager', 'NavigateToGame', '2');
    /// Game numbers: 1-5 for Unity games, 6 for Candy Mania, 0 to return to lobby.
    /// </summary>
    public void NavigateToGame(string gameNumber)
    {
        Debug.Log("NavigateToGame called from JS: game_" + gameNumber);

        if (gameNumber == "0")
        {
            // Return to lobby / game selection
            topBarPanel.OnGamesButtonTap();
            return;
        }

        // First open the game selection panel (activates lobby panels)
        lobbyPanel.OpenGameSelectionPanel();

        // Then navigate to the specific game
        StartCoroutine(NavigateToGameDelayed(gameNumber));
    }

    private IEnumerator NavigateToGameDelayed(string gameNumber)
    {
        // Wait one frame for panels to activate
        yield return null;

        // Find the LobbyGameSelection component and call the game method
        LobbyGameSelection gameSelection = lobbyPanel.GetComponentInChildren<LobbyGameSelection>(true);
        if (gameSelection != null)
        {
            gameSelection.gameObject.SetActive(true);
            switch (gameNumber)
            {
                case "1": gameSelection.OnGame1ButtonTap(); break;
                case "2": gameSelection.OnGame2ButtonTap(); break;
                case "3": gameSelection.OnGame3ButtonTap(); break;
                case "4": gameSelection.OnGame4ButtonTap(); break;
                case "5": gameSelection.OnGame5ButtonTap(); break;
                case "6": gameSelection.OnCandyButtonTap(); break;
                default: Debug.LogError("NavigateToGame: invalid game number: " + gameNumber); break;
            }
        }
        else
        {
            Debug.LogError("NavigateToGame: LobbyGameSelection not found in lobbyPanel");
        }
    }

    /// <summary>
    /// Called from JavaScript to return to the lobby game selection screen.
    /// Usage: unityInstance.SendMessage('UIManager', 'ReturnToLobby');
    /// </summary>
    public void ReturnToLobby()
    {
        Debug.Log("ReturnToLobby called from JS");
        topBarPanel.OnGamesButtonTap();
    }

    #endregion

    #region PRIVATE_METHODS

    private void CloseAllCanvasChildPanels()
    {
        for (int i = 0; i < canvas.transform.childCount; i++)
        {
            canvas.transform.GetChild(i).gameObject.SetActive(false);
        }
    }

    #endregion

    #region COROUTINES

    IEnumerator WinningAnimationMessage(string message, float waitingTime = 0)
    {
        yield return new WaitForSeconds(waitingTime);
        //Instance.messagePopup.DisplayMessagePopup(message);
        DisplayNotificationUpperTray(message);
    }

    #endregion

    #region GETTER_SETTER

    public int EmojiCount
    {
        get
        {
            return emojiSpriteList.Count;
        }
    }
    #endregion
}

public static class GameId
{
    public const int ID2 = 2;
    public const int ID3 = 3;
    public const int ID4 = 4;
    public const int ID5 = 5;
    public const int ID6 = 6;
}
