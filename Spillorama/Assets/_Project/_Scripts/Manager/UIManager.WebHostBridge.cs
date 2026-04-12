using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
public class ApprovedHallHostSyncItem
{
    public string hallId = "";
    public string hallName = "";
    public double totalLimitAvailable = 0;
    public bool isSelected = false;
}

[Serializable]
public class ApprovedHallHostSyncPayload
{
    public string activeHallId = "";
    public string activeHallName = "";
    public List<ApprovedHallHostSyncItem> halls = new List<ApprovedHallHostSyncItem>();
}

public partial class UIManager
{
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
        Application.ExternalCall("ClearApprovedHalls");
#endif
    }

    public void SyncActiveHallToWebHost()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        if (!string.IsNullOrEmpty(Player_Hall_ID))
            Application.ExternalCall("SetActiveHall", Player_Hall_ID, Player_Hall_Name ?? "");
#endif
    }

    public void SyncApprovedHallsToWebHost()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        ApprovedHallHostSyncPayload payload = new ApprovedHallHostSyncPayload
        {
            activeHallId = Player_Hall_ID ?? "",
            activeHallName = Player_Hall_Name ?? ""
        };

        if (topBarPanel != null && topBarPanel.ApprovedHalls != null)
        {
            foreach (ApprovedHalls hall in topBarPanel.ApprovedHalls)
            {
                if (hall == null)
                    continue;

                payload.halls.Add(new ApprovedHallHostSyncItem
                {
                    hallId = hall.hallId ?? "",
                    hallName = hall.hallName ?? "",
                    totalLimitAvailable = hall.totalLimitAvailable,
                    isSelected = hall.isSelected || hall.hallId == Player_Hall_ID
                });
            }
        }

        Application.ExternalCall("SetApprovedHalls", JsonUtility.ToJson(payload));
#endif
    }

    public void RefreshPlayerWalletFromHost()
    {
        if (gameAssetData == null
            || gameAssetData.playerGameData == null
            || !gameAssetData.IsLoggedIn
            || string.IsNullOrEmpty(gameAssetData.PlayerId))
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
                    Debug.LogWarning("RefreshPlayerWalletFromHost failed: " + (response != null ? response.message : "empty response"));
                    return;
                }

                gameAssetData.PlayerId = response.result.playerId;
                gameAssetData.Points = response.result.points.ToString("###,###,##0.00");
                gameAssetData.RealMoney = response.result.realMoney.ToString("###,###,##0.00");
                gameAssetData.TodaysBalance = response.result.realMoney.ToString("###,###,##0.00");
                Player_Hall_ID = response.result.hall;
                Player_Hall_Name = response.result.hallName;
                SyncActiveHallToWebHost();
                SyncApprovedHallsToWebHost();
            }
        );
    }

    public void SwitchActiveHallFromHost(string hallId)
    {
        if (string.IsNullOrEmpty(hallId))
        {
            Debug.LogWarning("SwitchActiveHallFromHost skipped: missing hallId.");
            return;
        }

        if (topBarPanel == null)
        {
            Debug.LogWarning("SwitchActiveHallFromHost skipped: topBarPanel missing.");
            return;
        }

        topBarPanel.SwitchHallFromHost(hallId);
    }

    public void NavigateToGame(string gameNumber)
    {
        Debug.Log("NavigateToGame called from JS: game_" + gameNumber);

        if (gameNumber == "0")
        {
            topBarPanel.OnGamesButtonTap();
            return;
        }

        LobbyGameSelection gameSelection = lobbyPanel != null
            ? lobbyPanel.GetComponentInChildren<LobbyGameSelection>(true)
            : null;

        if (gameSelection == null)
        {
            Debug.LogError("NavigateToGame: LobbyGameSelection not found in lobbyPanel");
            return;
        }

        gameSelection.LaunchGameFromHost(gameNumber);
    }

    public void ReturnToLobby()
    {
        Debug.Log("ReturnToLobby called from JS");
        topBarPanel.OnGamesButtonTap();
    }
}
