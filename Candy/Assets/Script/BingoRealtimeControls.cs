using TMPro;
using UnityEngine;
using SimpleJSON;

public class BingoRealtimeControls : MonoBehaviour
{
    [SerializeField] private APIManager apiManager;
    [SerializeField] private BingoRealtimeClient realtimeClient;

    [Header("Optional UI bindings")]
    [SerializeField] private TMP_InputField roomCodeInput;
    [SerializeField] private TMP_InputField hallIdInput;
    [SerializeField] private TMP_InputField playerNameInput;
    [SerializeField] private TMP_InputField walletIdInput;
    [SerializeField] private TMP_InputField accessTokenInput;
    [SerializeField] private TextMeshProUGUI statusText;

    private string latestRoomCode = string.Empty;
    private string latestGameStatus = "NONE";
    private int latestDrawCount = 0;

    private void OnEnable()
    {
        ResolveReferences();

        if (realtimeClient != null)
        {
            realtimeClient.OnConnectionChanged += HandleConnectionChanged;
            realtimeClient.OnRoomUpdate += HandleRoomUpdate;
            realtimeClient.OnError += HandleError;
        }
    }

    private void OnDisable()
    {
        if (realtimeClient != null)
        {
            realtimeClient.OnConnectionChanged -= HandleConnectionChanged;
            realtimeClient.OnRoomUpdate -= HandleRoomUpdate;
            realtimeClient.OnError -= HandleError;
        }
    }

    private void ResolveReferences()
    {
        if (apiManager == null)
        {
            apiManager = APIManager.instance;
        }

        if (realtimeClient == null)
        {
            realtimeClient = BingoRealtimeClient.instance;
        }
    }

    public void ConnectAndJoin()
    {
        ResolveReferences();
        if (apiManager == null)
        {
            SetStatus("APIManager mangler i scenen.");
            return;
        }

        ApplyInputs();
        apiManager.JoinOrCreateRoom();
        apiManager.RequestRealtimeState();

        SetStatus("Kobler til rom...");
    }

    public void RefreshRoomState()
    {
        ResolveReferences();
        apiManager?.RequestRealtimeState();
    }

    public void NextTicketPage()
    {
        ResolveReferences();
        apiManager?.NextTicketPage();
        RenderStatus();
    }

    public void PreviousTicketPage()
    {
        ResolveReferences();
        apiManager?.PreviousTicketPage();
        RenderStatus();
    }

    public void ClaimLine()
    {
        ResolveReferences();
        apiManager?.ClaimLine();
    }

    public void ClaimBingo()
    {
        ResolveReferences();
        apiManager?.ClaimBingo();
    }

    public void ApplyInputs()
    {
        ResolveReferences();
        if (apiManager == null)
        {
            return;
        }

        string playerName = playerNameInput != null ? playerNameInput.text : "Player";
        string walletId = walletIdInput != null ? walletIdInput.text : string.Empty;
        string roomCode = roomCodeInput != null ? roomCodeInput.text : string.Empty;
        string hallId = hallIdInput != null ? hallIdInput.text : string.Empty;
        string accessToken = accessTokenInput != null ? accessTokenInput.text : string.Empty;

        apiManager.ConfigurePlayer(playerName, walletId);
        apiManager.ConfigureHall(hallId);
        apiManager.ConfigureAccessToken(accessToken);
        apiManager.SetRoomCode(roomCode);
    }

    private void HandleConnectionChanged(bool connected)
    {
        SetStatus(connected ? "Tilkoblet backend" : "Frakoblet backend");
    }

    private void HandleRoomUpdate(JSONNode snapshot)
    {
        if (snapshot == null || snapshot.IsNull)
        {
            return;
        }

        latestRoomCode = snapshot["code"];
        latestGameStatus = "NONE";
        latestDrawCount = 0;

        JSONNode currentGame = snapshot["currentGame"];
        if (currentGame != null && !currentGame.IsNull)
        {
            latestGameStatus = currentGame["status"];
            JSONNode drawnNumbers = currentGame["drawnNumbers"];
            if (drawnNumbers != null && drawnNumbers.IsArray)
            {
                latestDrawCount = drawnNumbers.Count;
            }
        }

        RenderStatus();

        if (roomCodeInput != null && !string.IsNullOrWhiteSpace(latestRoomCode))
        {
            roomCodeInput.text = latestRoomCode;
        }

        if (hallIdInput != null)
        {
            string snapshotHallId = snapshot["hallId"];
            if (!string.IsNullOrWhiteSpace(snapshotHallId))
            {
                hallIdInput.text = snapshotHallId;
            }
        }
    }

    private void HandleError(string errorMessage)
    {
        SetStatus("Feil: " + errorMessage);
    }

    private void SetStatus(string text)
    {
        if (statusText != null)
        {
            statusText.text = text;
        }
        else
        {
            Debug.Log("[BingoRealtimeControls] " + text);
        }
    }

    private void RenderStatus()
    {
        string player = apiManager != null ? apiManager.ActivePlayerId : string.Empty;
        string hall = apiManager != null ? apiManager.ActiveHallId : string.Empty;
        int ticketPage = apiManager != null ? apiManager.CurrentTicketPage + 1 : 1;
        int ticketPageCount = apiManager != null ? apiManager.TicketPageCount : 1;
        SetStatus($"Hall: {hall}\nRom: {latestRoomCode}\nSpiller: {player}\nSpill: {latestGameStatus}\nTrukket: {latestDrawCount}\nBonger: {ticketPage}/{ticketPageCount}");
    }
}
