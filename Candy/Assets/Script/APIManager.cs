using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using SimpleJSON;

public class APIManager : MonoBehaviour
{
    public static APIManager instance;

    private const string BASE_URL = "https://bingoapi.codehabbit.com/";

    [Header("Realtime Multiplayer (Skeleton backend)")]
    [SerializeField] private bool useRealtimeBackend = true;
    [SerializeField] private BingoRealtimeClient realtimeClient;
    [SerializeField] private BingoAutoLogin autoLogin;
    [SerializeField] private bool joinOrCreateOnStart = true;
    [SerializeField] private bool autoCreateRoomWhenRoomCodeIsEmpty = true;
    [SerializeField] private bool autoMarkDrawnNumbers = true;
    [SerializeField] private bool duplicateTicketAcrossAllCards = true;
    [SerializeField] private bool enableTicketPaging = true;
    [SerializeField] private bool triggerAutoLoginWhenAuthMissing = true;
    [SerializeField] private string roomCode = "";
    [SerializeField] private string hallId = "";
    [SerializeField] private string playerName = "Player";
    [SerializeField] private string walletId = "";
    [SerializeField] private string accessToken = "";

    [Header("Legacy Slot API (Fallback)")]
    [SerializeField] private bool legacyStartCallEnabled = true;

    private string initialApiUrl;
    private string remainingApiUrl;

    public int bonusAMT;

    private readonly List<SlotData> slotDataList = new();
    private bool isSlotDataFetched = false;

    private string activeRoomCode = "";
    private string activePlayerId = "";
    private string activeGameId = "";
    private int processedDrawCount = 0;
    private int currentTicketPage = 0;
    private List<List<int>> activeTicketSets = new();

    public bool UseRealtimeBackend => useRealtimeBackend;
    public string ActiveRoomCode => activeRoomCode;
    public string ActivePlayerId => activePlayerId;
    public string ActiveHallId => hallId;
    public int CurrentTicketPage => currentTicketPage;

    public int TicketPageCount
    {
        get
        {
            int cardSlots = Mathf.Max(1, GetCardSlotsCount());
            int totalTickets = Mathf.Max(1, activeTicketSets != null ? activeTicketSets.Count : 0);
            return Mathf.Max(1, Mathf.CeilToInt((float)totalTickets / cardSlots));
        }
    }

    void Awake()
    {
        instance = this;
    }

    void OnEnable()
    {
        if (useRealtimeBackend)
        {
            BindRealtimeClient();
        }
    }

    void OnDisable()
    {
        if (realtimeClient != null)
        {
            realtimeClient.OnConnectionChanged -= HandleRealtimeConnectionChanged;
            realtimeClient.OnRoomUpdate -= HandleRealtimeRoomUpdate;
            realtimeClient.OnError -= HandleRealtimeError;
        }
    }

    void Start()
    {
        if (useRealtimeBackend)
        {
            BindRealtimeClient();
            if (joinOrCreateOnStart)
            {
                JoinOrCreateRoom();
            }
            return;
        }

        if (legacyStartCallEnabled)
        {
            CallApisForFetchData();
        }
    }

    private void BindRealtimeClient()
    {
        if (realtimeClient == null)
        {
            realtimeClient = BingoRealtimeClient.instance;
        }

        if (realtimeClient == null)
        {
            realtimeClient = FindObjectOfType<BingoRealtimeClient>();
        }

        if (realtimeClient == null)
        {
            GameObject clientObject = new("BingoRealtimeClient_Auto");
            realtimeClient = clientObject.AddComponent<BingoRealtimeClient>();
            Debug.LogWarning("[APIManager] BingoRealtimeClient manglet i scenen. Opprettet automatisk runtime-klient.");
        }

        realtimeClient.OnConnectionChanged -= HandleRealtimeConnectionChanged;
        realtimeClient.OnRoomUpdate -= HandleRealtimeRoomUpdate;
        realtimeClient.OnError -= HandleRealtimeError;

        realtimeClient.OnConnectionChanged += HandleRealtimeConnectionChanged;
        realtimeClient.OnRoomUpdate += HandleRealtimeRoomUpdate;
        realtimeClient.OnError += HandleRealtimeError;
        realtimeClient.SetAccessToken(accessToken);
    }

    private BingoAutoLogin ResolveAutoLogin()
    {
        if (autoLogin != null)
        {
            return autoLogin;
        }

        autoLogin = FindObjectOfType<BingoAutoLogin>();
        if (autoLogin != null)
        {
            return autoLogin;
        }

        GameObject autoLoginObject = new("BingoAutoLogin_Auto");
        autoLogin = autoLoginObject.AddComponent<BingoAutoLogin>();
        Debug.LogWarning("[APIManager] BingoAutoLogin manglet i scenen. Opprettet runtime auto-login med default credentials.");
        return autoLogin;
    }

    private bool TryStartAutoLogin(string reason)
    {
        if (!useRealtimeBackend || !triggerAutoLoginWhenAuthMissing)
        {
            return false;
        }

        BingoAutoLogin loginBootstrap = ResolveAutoLogin();
        if (loginBootstrap == null)
        {
            return false;
        }

        Debug.LogWarning($"[APIManager] {reason} Starter auto-login.");
        loginBootstrap.StartAutoLogin();
        return true;
    }

    private void HandleRealtimeConnectionChanged(bool connected)
    {
        if (!connected)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(activeRoomCode) && !string.IsNullOrWhiteSpace(activePlayerId))
        {
            realtimeClient.ResumeRoom(activeRoomCode, activePlayerId, HandleResumeAck);
            return;
        }

        if (joinOrCreateOnStart && string.IsNullOrWhiteSpace(activePlayerId))
        {
            JoinOrCreateRoom();
        }
    }

    private void HandleRealtimeError(string message)
    {
        Debug.LogError("[APIManager] Realtime error: " + message);
    }

    public void ConfigurePlayer(string newPlayerName, string newWalletId)
    {
        playerName = string.IsNullOrWhiteSpace(newPlayerName) ? "Player" : newPlayerName.Trim();
        walletId = (newWalletId ?? string.Empty).Trim();
    }

    public void ConfigureHall(string newHallId)
    {
        hallId = (newHallId ?? string.Empty).Trim();
    }

    public void ConfigureAccessToken(string token)
    {
        accessToken = (token ?? string.Empty).Trim();
        if (realtimeClient != null)
        {
            realtimeClient.SetAccessToken(accessToken);
        }
    }

    public void SetRoomCode(string newRoomCode)
    {
        roomCode = (newRoomCode ?? string.Empty).Trim().ToUpperInvariant();
    }

    public void NextTicketPage()
    {
        if (!enableTicketPaging)
        {
            return;
        }

        if (activeTicketSets == null || activeTicketSets.Count == 0)
        {
            return;
        }
        int pageCount = TicketPageCount;
        if (pageCount <= 1)
        {
            return;
        }

        currentTicketPage = (currentTicketPage + 1) % pageCount;
        ApplyTicketSetsToCards(activeTicketSets);
    }

    public void PreviousTicketPage()
    {
        if (!enableTicketPaging)
        {
            return;
        }

        if (activeTicketSets == null || activeTicketSets.Count == 0)
        {
            return;
        }
        int pageCount = TicketPageCount;
        if (pageCount <= 1)
        {
            return;
        }

        currentTicketPage = (currentTicketPage - 1 + pageCount) % pageCount;
        ApplyTicketSetsToCards(activeTicketSets);
    }

    public void JoinOrCreateRoom()
    {
        if (!useRealtimeBackend)
        {
            Debug.LogWarning("[APIManager] Realtime backend is disabled.");
            return;
        }

        BindRealtimeClient();
        if (realtimeClient == null)
        {
            return;
        }

        string desiredAccessToken = (accessToken ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(desiredAccessToken))
        {
            if (!TryStartAutoLogin("accessToken mangler. Login kreves for realtime gameplay."))
            {
                Debug.LogError("[APIManager] accessToken mangler. Login kreves for realtime gameplay.");
            }
            return;
        }
        realtimeClient.SetAccessToken(desiredAccessToken);

        string desiredHallId = (hallId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(desiredHallId))
        {
            if (!TryStartAutoLogin("hallId mangler. Forsoker a hente hall via auto-login."))
            {
                Debug.LogError("[APIManager] hallId mangler. Sett hallId før realtime gameplay.");
            }
            return;
        }

        if (!realtimeClient.IsReady)
        {
            realtimeClient.Connect();
            return;
        }

        if (!string.IsNullOrWhiteSpace(activeRoomCode) && !string.IsNullOrWhiteSpace(activePlayerId))
        {
            RequestRealtimeState();
            return;
        }

        string desiredRoomCode = (roomCode ?? string.Empty).Trim().ToUpperInvariant();
        string desiredPlayerName = string.IsNullOrWhiteSpace(playerName) ? "Player" : playerName.Trim();
        string desiredWalletId = (walletId ?? string.Empty).Trim();

        if (!string.IsNullOrWhiteSpace(desiredRoomCode))
        {
            realtimeClient.JoinRoom(desiredRoomCode, desiredHallId, desiredPlayerName, desiredWalletId, HandleJoinOrCreateAck);
            return;
        }

        if (autoCreateRoomWhenRoomCodeIsEmpty)
        {
            realtimeClient.CreateRoom(desiredHallId, desiredPlayerName, desiredWalletId, HandleJoinOrCreateAck);
        }
    }

    private void HandleJoinOrCreateAck(SocketAck ack)
    {
        if (ack == null)
        {
            Debug.LogError("[APIManager] room ack is null.");
            return;
        }

        if (!ack.ok)
        {
            if (IsRoomNotFound(ack))
            {
                Debug.LogWarning("[APIManager] room ack feilet med ROOM_NOT_FOUND. Rommet kan vaere foreldet etter reconnect.");
            }
            Debug.LogError($"[APIManager] room ack failed: {ack.errorCode} {ack.errorMessage}");
            return;
        }

        JSONNode data = ack.data;
        if (data == null)
        {
            Debug.LogError("[APIManager] room ack missing data.");
            return;
        }

        string ackRoomCode = data["roomCode"];
        string ackPlayerId = data["playerId"];

        if (!string.IsNullOrWhiteSpace(ackRoomCode))
        {
            activeRoomCode = ackRoomCode.Trim().ToUpperInvariant();
            roomCode = activeRoomCode;
        }

        if (!string.IsNullOrWhiteSpace(ackPlayerId))
        {
            activePlayerId = ackPlayerId.Trim();
        }

        Debug.Log($"[APIManager] Connected to room {activeRoomCode} as player {activePlayerId}");

        JSONNode snapshot = data["snapshot"];
        if (snapshot != null && !snapshot.IsNull)
        {
            HandleRealtimeRoomUpdate(snapshot);
        }
        else
        {
            RequestRealtimeState();
        }
    }

    public void RequestRealtimeState()
    {
        if (!useRealtimeBackend)
        {
            return;
        }

        BindRealtimeClient();
        if (realtimeClient == null)
        {
            return;
        }

        string desiredAccessToken = (accessToken ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(desiredAccessToken))
        {
            if (!TryStartAutoLogin("accessToken mangler. Login kreves for realtime gameplay."))
            {
                Debug.LogError("[APIManager] accessToken mangler. Login kreves for realtime gameplay.");
            }
            return;
        }
        realtimeClient.SetAccessToken(desiredAccessToken);

        if (!realtimeClient.IsReady)
        {
            realtimeClient.Connect();
            return;
        }

        if (string.IsNullOrWhiteSpace(activeRoomCode))
        {
            JoinOrCreateRoom();
            return;
        }

        if (!string.IsNullOrWhiteSpace(activePlayerId))
        {
            realtimeClient.ResumeRoom(activeRoomCode, activePlayerId, HandleResumeAck);
            return;
        }

        realtimeClient.RequestRoomState(activeRoomCode, (ack) =>
        {
            if (ack == null || !ack.ok)
            {
                Debug.LogError($"[APIManager] room:state failed: {ack?.errorCode} {ack?.errorMessage}");
                return;
            }

            JSONNode snapshot = ack.data?["snapshot"];
            if (snapshot != null && !snapshot.IsNull)
            {
                HandleRealtimeRoomUpdate(snapshot);
            }
        });
    }

    private void HandleResumeAck(SocketAck ack)
    {
        if (ack == null || !ack.ok)
        {
            Debug.LogError($"[APIManager] room:resume failed: {ack?.errorCode} {ack?.errorMessage}");
            if (IsRoomNotFound(ack))
            {
                ResetActiveRoomState(clearDesiredRoomCode: true);
            }
            else
            {
                activePlayerId = string.Empty;
            }
            if (joinOrCreateOnStart)
            {
                JoinOrCreateRoom();
            }
            return;
        }

        JSONNode snapshot = ack.data?["snapshot"];
        if (snapshot != null && !snapshot.IsNull)
        {
            HandleRealtimeRoomUpdate(snapshot);
            return;
        }

        realtimeClient.RequestRoomState(activeRoomCode, (stateAck) =>
        {
            if (stateAck == null || !stateAck.ok)
            {
                Debug.LogError($"[APIManager] room:state after resume failed: {stateAck?.errorCode} {stateAck?.errorMessage}");
                return;
            }

            JSONNode stateSnapshot = stateAck.data?["snapshot"];
            if (stateSnapshot != null && !stateSnapshot.IsNull)
            {
                HandleRealtimeRoomUpdate(stateSnapshot);
            }
        });
    }

    public void ClaimLine()
    {
        if (!CanSendClaim())
        {
            return;
        }
        realtimeClient.SubmitClaim(activeRoomCode, activePlayerId, "LINE", HandleClaimAck);
    }

    public void ClaimBingo()
    {
        if (!CanSendClaim())
        {
            return;
        }
        realtimeClient.SubmitClaim(activeRoomCode, activePlayerId, "BINGO", HandleClaimAck);
    }

    private bool CanSendClaim()
    {
        if (!useRealtimeBackend || realtimeClient == null || !realtimeClient.IsReady)
        {
            Debug.LogWarning("[APIManager] Realtime client not ready for claim.");
            return false;
        }

        if (string.IsNullOrWhiteSpace(activeRoomCode) || string.IsNullOrWhiteSpace(activePlayerId))
        {
            Debug.LogWarning("[APIManager] Missing room/player for claim.");
            return false;
        }

        return true;
    }

    private void HandleClaimAck(SocketAck ack)
    {
        if (ack == null)
        {
            return;
        }

        if (!ack.ok)
        {
            Debug.LogError($"[APIManager] claim failed: {ack.errorCode} {ack.errorMessage}");
            return;
        }

        JSONNode snapshot = ack.data?["snapshot"];
        if (snapshot != null && !snapshot.IsNull)
        {
            HandleRealtimeRoomUpdate(snapshot);
        }
    }

    private void HandleRealtimeRoomUpdate(JSONNode snapshot)
    {
        if (snapshot == null || snapshot.IsNull)
        {
            return;
        }

        string snapshotRoomCode = snapshot["code"];
        if (!string.IsNullOrWhiteSpace(snapshotRoomCode))
        {
            activeRoomCode = snapshotRoomCode.Trim().ToUpperInvariant();
            roomCode = activeRoomCode;
        }

        string snapshotHallId = snapshot["hallId"];
        if (!string.IsNullOrWhiteSpace(snapshotHallId))
        {
            hallId = snapshotHallId.Trim();
        }

        JSONNode currentGame = snapshot["currentGame"];
        if (currentGame == null || currentGame.IsNull)
        {
            activeGameId = string.Empty;
            processedDrawCount = 0;
            currentTicketPage = 0;
            activeTicketSets.Clear();
            return;
        }

        string gameId = currentGame["id"];
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return;
        }

        if (!string.Equals(activeGameId, gameId, StringComparison.Ordinal))
        {
            activeGameId = gameId;
            processedDrawCount = 0;
            currentTicketPage = 0;
        }

        ApplyMyTicketToCards(currentGame);
        ApplyDrawnNumbers(currentGame);
    }

    private void ApplyMyTicketToCards(JSONNode currentGame)
    {
        if (string.IsNullOrWhiteSpace(activePlayerId))
        {
            return;
        }

        JSONNode tickets = currentGame["tickets"];
        if (tickets == null || tickets.IsNull)
        {
            return;
        }

        JSONNode myTicketsNode = tickets[activePlayerId];
        if (myTicketsNode == null || myTicketsNode.IsNull)
        {
            return;
        }

        List<List<int>> ticketSets = ExtractTicketSets(myTicketsNode);
        if (ticketSets.Count == 0)
        {
            return;
        }

        activeTicketSets = ticketSets;
        ApplyTicketSetsToCards(ticketSets);
    }

    private void ApplyTicketSetsToCards(List<List<int>> ticketSets)
    {
        if (ticketSets == null || ticketSets.Count == 0)
        {
            return;
        }

        NumberGenerator generator = GameManager.instance?.numberGenerator;
        if (generator == null || generator.cardClasses == null)
        {
            return;
        }

        int cardSlots = Mathf.Max(1, generator.cardClasses.Length);
        int pageCount = Mathf.Max(1, Mathf.CeilToInt((float)ticketSets.Count / cardSlots));
        if (!enableTicketPaging)
        {
            currentTicketPage = 0;
        }
        if (currentTicketPage >= pageCount)
        {
            currentTicketPage = 0;
        }
        int pageStartIndex = currentTicketPage * cardSlots;

        for (int cardIndex = 0; cardIndex < generator.cardClasses.Length; cardIndex++)
        {
            CardClass card = generator.cardClasses[cardIndex];
            if (card == null)
            {
                continue;
            }

            card.numb.Clear();
            card.selectedPayLineCanBe.Clear();
            card.paylineindex.Clear();

            for (int i = 0; i < card.payLinePattern.Count; i++)
            {
                card.payLinePattern[i] = 0;
            }

            for (int i = 0; i < card.selectionImg.Count; i++)
            {
                card.selectionImg[i].SetActive(false);
            }

            for (int i = 0; i < card.missingPatternImg.Count; i++)
            {
                card.missingPatternImg[i].SetActive(false);
            }

            for (int i = 0; i < card.matchPatternImg.Count; i++)
            {
                card.matchPatternImg[i].SetActive(false);
            }

            for (int i = 0; i < card.paylineObj.Count; i++)
            {
                card.paylineObj[i].SetActive(false);
            }

            List<int> sourceTicket = null;
            int ticketIndex = pageStartIndex + cardIndex;
            if (ticketIndex < ticketSets.Count)
            {
                sourceTicket = NormalizeTicketNumbers(ticketSets[ticketIndex]);
            }
            else if (duplicateTicketAcrossAllCards && ticketSets.Count == 1)
            {
                sourceTicket = NormalizeTicketNumbers(ticketSets[0]);
            }

            bool shouldPopulate = sourceTicket != null;
            for (int cellIndex = 0; cellIndex < 15; cellIndex++)
            {
                int value = shouldPopulate ? sourceTicket[cellIndex] : 0;
                card.numb.Add(value);

                if (cellIndex < card.num_text.Count)
                {
                    card.num_text[cellIndex].text = shouldPopulate ? value.ToString() : "-";
                }
            }
        }

        Debug.Log($"[APIManager] Applied ticket page {currentTicketPage + 1}/{pageCount} ({ticketSets.Count} total ticket(s)) for player {activePlayerId}. Room {activeRoomCode}, game {activeGameId}");
    }

    private void ApplyDrawnNumbers(JSONNode currentGame)
    {
        JSONNode drawnNumbers = currentGame["drawnNumbers"];
        if (drawnNumbers == null || drawnNumbers.IsNull || !drawnNumbers.IsArray)
        {
            return;
        }

        NumberGenerator generator = GameManager.instance?.numberGenerator;
        if (generator == null || generator.cardClasses == null)
        {
            return;
        }

        for (int drawIndex = processedDrawCount; drawIndex < drawnNumbers.Count; drawIndex++)
        {
            int drawnNumber = drawnNumbers[drawIndex].AsInt;
            MarkDrawnNumberOnCards(generator, drawnNumber);

            if (autoMarkDrawnNumbers && TicketContainsInAnyTicketSet(activeTicketSets, drawnNumber) &&
                !string.IsNullOrWhiteSpace(activeRoomCode) && !string.IsNullOrWhiteSpace(activePlayerId) &&
                realtimeClient != null && realtimeClient.IsReady)
            {
                realtimeClient.MarkNumber(activeRoomCode, activePlayerId, drawnNumber, null);
            }
        }

        processedDrawCount = drawnNumbers.Count;
    }

    private static bool TicketContainsInAnyTicketSet(List<List<int>> ticketSets, int number)
    {
        if (ticketSets == null || ticketSets.Count == 0)
        {
            return false;
        }

        foreach (List<int> ticket in ticketSets)
        {
            if (ticket != null && ticket.Contains(number))
            {
                return true;
            }
        }
        return false;
    }

    private static void MarkDrawnNumberOnCards(NumberGenerator generator, int drawnNumber)
    {
        foreach (CardClass card in generator.cardClasses)
        {
            if (card == null)
            {
                continue;
            }

            for (int cellIndex = 0; cellIndex < card.numb.Count && cellIndex < card.selectionImg.Count; cellIndex++)
            {
                if (card.numb[cellIndex] == drawnNumber)
                {
                    card.selectionImg[cellIndex].SetActive(true);
                    if (cellIndex < card.payLinePattern.Count)
                    {
                        card.payLinePattern[cellIndex] = 1;
                    }
                }
            }
        }
    }

    private static List<int> FlattenTicketGrid(JSONNode gridNode)
    {
        List<int> values = new();
        if (gridNode == null || gridNode.IsNull || !gridNode.IsArray)
        {
            return values;
        }

        for (int row = 0; row < gridNode.Count; row++)
        {
            JSONNode rowNode = gridNode[row];
            if (rowNode == null || rowNode.IsNull || !rowNode.IsArray)
            {
                continue;
            }

            for (int col = 0; col < rowNode.Count; col++)
            {
                int number = rowNode[col].AsInt;
                if (number > 0 && !values.Contains(number))
                {
                    values.Add(number);
                }
            }
        }

        return values;
    }

    private static List<int> NormalizeTicketNumbers(List<int> source)
    {
        List<int> numbers = source == null ? new List<int>() : new List<int>(source);
        while (numbers.Count < 15)
        {
            int fallback = UnityEngine.Random.Range(1, 76);
            if (!numbers.Contains(fallback))
            {
                numbers.Add(fallback);
            }
        }

        if (numbers.Count > 15)
        {
            numbers = numbers.GetRange(0, 15);
        }

        return numbers;
    }

    private static List<List<int>> ExtractTicketSets(JSONNode myTicketsNode)
    {
        List<List<int>> ticketSets = new();
        if (myTicketsNode == null || myTicketsNode.IsNull)
        {
            return ticketSets;
        }

        if (myTicketsNode.IsArray)
        {
            for (int i = 0; i < myTicketsNode.Count; i++)
            {
                List<int> flat = FlattenTicketGrid(myTicketsNode[i]?["grid"]);
                if (flat.Count > 0)
                {
                    ticketSets.Add(flat);
                }
            }
            return ticketSets;
        }

        List<int> single = FlattenTicketGrid(myTicketsNode["grid"]);
        if (single.Count > 0)
        {
            ticketSets.Add(single);
        }
        return ticketSets;
    }

    private int GetCardSlotsCount()
    {
        NumberGenerator generator = GameManager.instance?.numberGenerator;
        if (generator != null && generator.cardClasses != null && generator.cardClasses.Length > 0)
        {
            return generator.cardClasses.Length;
        }

        return 1;
    }

    private static bool IsRoomNotFound(SocketAck ack)
    {
        if (ack == null)
        {
            return false;
        }

        return string.Equals(ack.errorCode, "ROOM_NOT_FOUND", StringComparison.OrdinalIgnoreCase);
    }

    private void ResetActiveRoomState(bool clearDesiredRoomCode)
    {
        activeRoomCode = string.Empty;
        activePlayerId = string.Empty;
        activeGameId = string.Empty;
        processedDrawCount = 0;
        currentTicketPage = 0;
        activeTicketSets.Clear();

        if (clearDesiredRoomCode)
        {
            roomCode = string.Empty;
        }
    }

    public void CallApisForFetchData()
    {
        if (useRealtimeBackend)
        {
            RequestRealtimeState();
            return;
        }

        CallRemainingApi();
    }

    public void CallRemainingApi()
    {
        Debug.Log("Remaining API call started.");
        if (GameManager.instance != null)
        {
            int currentBet = GameManager.instance.currentBet;
            remainingApiUrl = $"{BASE_URL}api/v1/slot?bet={currentBet}";
            StartCoroutine(FetchSlotDataFromAPI(remainingApiUrl, false));
        }
        else
        {
            Debug.LogError("GameManager instance is not available.");
        }
    }

    private IEnumerator FetchSlotDataFromAPI(string url, bool isInitialCall)
    {
        using (UnityWebRequest request = UnityWebRequest.Get(url))
        {
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.ConnectionError || request.result == UnityWebRequest.Result.ProtocolError)
            {
                Debug.LogError("Error: " + request.error);
            }
            else
            {
                string responseText = request.downloadHandler.text;

                if (isInitialCall)
                {
                    RootObject rootObject = JsonUtility.FromJson<RootObject>(responseText);

                    if (rootObject != null && rootObject.data != null)
                    {
                        slotDataList.Clear();
                        slotDataList.AddRange(rootObject.data);
                        isSlotDataFetched = true;
                    }
                    else
                    {
                        Debug.LogError("Failed to parse JSON from URL " + url + ". Please check the JSON format and ensure it matches the class structure.");
                    }
                }
                else
                {
                    RemainingApiResponse remainingApiResponse = JsonUtility.FromJson<RemainingApiResponse>(responseText);

                    if (remainingApiResponse != null && remainingApiResponse.data != null)
                    {
                        SlotData slotData = remainingApiResponse.data;
                        slotDataList.Clear();
                        slotDataList.Add(slotData);
                        isSlotDataFetched = true;
                        StartGameWithBet();
                    }
                    else
                    {
                        Debug.LogError("Failed to parse JSON from URL " + url + ". Please check the JSON format and ensure it matches the class structure.");
                    }
                }
            }
        }
    }

    public void StartGameWithBet()
    {
        if (GameManager.instance != null)
        {
            if (isSlotDataFetched)
            {
                int currentBet = GameManager.instance.currentBet;

                foreach (SlotData slotData in slotDataList)
                {
                    if (slotData.bet == currentBet)
                    {
                        int fetchNo = GameManager.instance.betlevel + 1;

                        if (fetchNo != 0)
                        {
                            fetchNo = slotData.number / fetchNo;
                            Debug.Log("Original Fetched number: " + slotData.number);
                            NumberManager.instance.num = fetchNo;
                        }
                        else
                        {
                            NumberManager.instance.num = slotData.number;
                            Debug.Log("Fetched number: " + slotData.number);
                            Debug.Log("GameManager.instance.betlevel is zero. Division by zero is not allowed.");
                        }

                        if (fetchNo > 150)
                        {
                            Debug.Log("Bonus Is Present :::");
                            NumberManager.instance.num = 150;

                            int bonus = fetchNo - 150;
                            bonusAMT = bonus;
                            Debug.Log("Bonus Is Present ::: " + bonus);
                        }

                        NumberManager.instance.DoAvailablePattern();
                        slotData.selected = true;
                    }
                    else
                    {
                        slotData.selected = false;
                    }
                }
            }
            else
            {
                Debug.LogError("Slot data has not been fetched yet.");
            }
        }
        else
        {
            Debug.LogError("GameManager instance is not available.");
        }
    }

    [System.Serializable]
    private class SlotWrapper
    {
        public List<SlotData> slots;

        public SlotWrapper(List<SlotData> slotDataList)
        {
            this.slots = slotDataList;
        }
    }

    [System.Serializable]
    private class RootObject
    {
        public List<SlotData> data;
        public bool error;
        public string message;
        public int code;
    }

    [System.Serializable]
    private class RemainingApiResponse
    {
        public SlotData data;
        public bool error;
        public string message;
        public int code;
    }

    [System.Serializable]
    private class SlotData
    {
        public string slotId;
        public string numberId;
        public int number;
        public int bet;
        public bool selected;
    }
}
