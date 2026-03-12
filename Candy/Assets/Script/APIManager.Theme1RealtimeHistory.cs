using System;
using SimpleJSON;

public partial class APIManager
{
    private bool TryShowEndedRoundResultsFromHistory(JSONNode snapshot, string gameId)
    {
        if (snapshot == null || snapshot.IsNull || string.IsNullOrWhiteSpace(gameId))
        {
            return false;
        }

        JSONNode endedGame = FindHistoricGameById(snapshot["gameHistory"], gameId);
        if (endedGame == null || endedGame.IsNull)
        {
            return false;
        }

        if (GetLatestValidClaimForCurrentPlayer(endedGame).ClaimNode == null)
        {
            return false;
        }

        if (!TryApplyHistoricTicketsForEndedGame(endedGame, snapshot))
        {
            return false;
        }

        processedDrawCount = 0;
        ApplyDrawnNumbers(endedGame, shouldMarkCards: true);
        RefreshRealtimeWinningPatternVisuals(endedGame);
        return true;
    }

    private JSONNode FindHistoricGameById(JSONNode gameHistory, string gameId)
    {
        if (gameHistory == null || gameHistory.IsNull || !gameHistory.IsArray || string.IsNullOrWhiteSpace(gameId))
        {
            return null;
        }

        for (int i = gameHistory.Count - 1; i >= 0; i--)
        {
            JSONNode historicGame = gameHistory[i];
            if (historicGame == null || historicGame.IsNull)
            {
                continue;
            }

            string historicGameId = historicGame["id"];
            if (string.Equals(historicGameId?.Trim(), gameId, StringComparison.Ordinal))
            {
                return historicGame;
            }
        }

        return null;
    }
}
