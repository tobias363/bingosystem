using System;
using System.Collections.Generic;
using System.Globalization;
using SimpleJSON;
using UnityEngine;

public partial class APIManager
{
    private void RefreshRealtimeBonusFlow(
        JSONNode currentGame,
        RealtimeClaimInfo latestClaim,
        Dictionary<int, HashSet<int>> winningPatternsByCard)
    {
        if (string.IsNullOrWhiteSpace(activeGameId))
        {
            return;
        }

        if (string.Equals(realtimeBonusTriggeredGameId, activeGameId, StringComparison.Ordinal))
        {
            return;
        }

        if (!TryResolveRealtimeBonusTrigger(latestClaim, winningPatternsByCard, out string triggerSource))
        {
            return;
        }

        if (!TryResolveRealtimeBonusAmount(currentGame, latestClaim, out int bonusAmount, out string amountSource))
        {
            string missingKey = $"{activeGameId}:{latestClaim.ClaimId}";
            if (!string.Equals(realtimeBonusMissingDataLogKey, missingKey, StringComparison.Ordinal))
            {
                realtimeBonusMissingDataLogKey = missingKey;
                Debug.LogWarning(
                    $"[APIManager] Realtime bonus-trigger ({triggerSource}) ble funnet i game {activeGameId}, " +
                    $"men bonusbelop mangler i snapshot/claim. Forventet: claim.bonusAmount / claim.payload.bonusAmount / " +
                    $"currentGame.bonusByPlayer[playerId] / currentGame.bonusAmount.");
            }

            return;
        }

        NumberGenerator generator = ResolveNumberGenerator();
        if (generator == null)
        {
            Debug.LogError($"[APIManager] Realtime bonus-trigger ({triggerSource}) funnet, men NumberGenerator mangler.");
            return;
        }

        bonusAMT = bonusAmount;
        if (!generator.TryOpenRealtimeBonusPanel(bonusAmount, activeGameId, latestClaim.ClaimId))
        {
            return;
        }

        realtimeBonusTriggeredGameId = activeGameId;
        realtimeBonusTriggeredClaimId = latestClaim.ClaimId ?? string.Empty;
        realtimeBonusMissingDataLogKey = string.Empty;
        Debug.Log($"[APIManager] Realtime bonus-trigger aktivert ({triggerSource}). bonusAMT={bonusAmount} ({amountSource}) game={activeGameId} claim={realtimeBonusTriggeredClaimId}");
    }

    private bool TryResolveRealtimeBonusTrigger(
        RealtimeClaimInfo latestClaim,
        Dictionary<int, HashSet<int>> winningPatternsByCard,
        out string triggerSource)
    {
        triggerSource = string.Empty;
        if (latestClaim.ClaimNode == null || latestClaim.ClaimNode.IsNull)
        {
            return false;
        }

        if (TryResolveBackendBonusTrigger(latestClaim.ClaimNode, out bool backendTriggered, out string backendSource))
        {
            triggerSource = backendSource;
            return backendTriggered;
        }

        if (string.Equals(latestClaim.ClaimType, "BONUS", StringComparison.OrdinalIgnoreCase))
        {
            triggerSource = "claim.type=BONUS";
            LogBonusFallbackUsed("trigger", triggerSource, latestClaim.ClaimId);
            return true;
        }

        if (HasTruthyBonusFlag(latestClaim.ClaimNode))
        {
            triggerSource = "claim.bonusFlag";
            LogBonusFallbackUsed("trigger", triggerSource, latestClaim.ClaimId);
            return true;
        }

        if (!string.Equals(latestClaim.ClaimType, "LINE", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (winningPatternsByCard == null)
        {
            return false;
        }

        foreach (KeyValuePair<int, HashSet<int>> cardWin in winningPatternsByCard)
        {
            if (cardWin.Value != null && cardWin.Value.Contains(realtimeBonusPatternIndex))
            {
                triggerSource = $"winningPatternIndex={realtimeBonusPatternIndex}";
                LogBonusFallbackUsed("trigger", triggerSource, latestClaim.ClaimId);
                return true;
            }
        }

        return false;
    }

    private bool TryResolveBackendBonusTrigger(JSONNode claimNode, out bool bonusTriggered, out string source)
    {
        bonusTriggered = false;
        source = string.Empty;
        if (claimNode == null || claimNode.IsNull)
        {
            return false;
        }

        if (TryParseOptionalBool(claimNode["bonusTriggered"], out bool claimFlag))
        {
            bonusTriggered = claimFlag;
            source = "claim.bonusTriggered";
            return true;
        }

        JSONNode payload = claimNode["payload"];
        if (TryParseOptionalBool(payload?["bonusTriggered"], out bool payloadFlag))
        {
            bonusTriggered = payloadFlag;
            source = "claim.payload.bonusTriggered";
            return true;
        }

        return false;
    }

    private bool HasTruthyBonusFlag(JSONNode claimNode)
    {
        if (claimNode == null || claimNode.IsNull)
        {
            return false;
        }

        if (IsTruthyNode(claimNode["hasBonus"]) ||
            IsTruthyNode(claimNode["isBonus"]))
        {
            return true;
        }

        JSONNode payload = claimNode["payload"];
        return IsTruthyNode(payload?["hasBonus"]) ||
               IsTruthyNode(payload?["isBonus"]);
    }

    private bool IsTruthyNode(JSONNode node)
    {
        if (node == null || node.IsNull)
        {
            return false;
        }

        if (bool.TryParse(node.Value, out bool boolValue))
        {
            return boolValue;
        }

        if (int.TryParse(node.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out int intValue))
        {
            return intValue != 0;
        }

        return node.AsBool;
    }

    private bool TryResolveRealtimeBonusAmount(
        JSONNode currentGame,
        RealtimeClaimInfo latestClaim,
        out int bonusAmount,
        out string source)
    {
        bonusAmount = 0;
        source = string.Empty;

        if (TryResolveBackendBonusAmount(latestClaim.ClaimNode, out bonusAmount, out source))
        {
            source = $"claim.{source}";
            return true;
        }

        JSONNode claimPayload = latestClaim.ClaimNode?["payload"];
        if (TryResolveBackendBonusAmount(claimPayload, out bonusAmount, out source))
        {
            source = $"claim.payload.{source}";
            return true;
        }

        if (TryResolveBonusAmountFromNode(latestClaim.ClaimNode, out bonusAmount, out source))
        {
            source = $"claim.{source}";
            LogBonusFallbackUsed("amount", source, latestClaim.ClaimId);
            return true;
        }

        if (TryResolveBonusAmountFromNode(claimPayload, out bonusAmount, out source))
        {
            source = $"claim.payload.{source}";
            LogBonusFallbackUsed("amount", source, latestClaim.ClaimId);
            return true;
        }

        if (TryResolveBonusAmountFromNode(currentGame, out bonusAmount, out source))
        {
            source = $"currentGame.{source}";
            LogBonusFallbackUsed("amount", source, latestClaim.ClaimId);
            return true;
        }

        if (TryResolveBonusAmountFromPlayerMap(currentGame?["bonusByPlayer"], out bonusAmount))
        {
            source = $"currentGame.bonusByPlayer[{activePlayerId}]";
            LogBonusFallbackUsed("amount", source, latestClaim.ClaimId);
            return true;
        }

        if (TryResolveBonusAmountFromPlayerMap(currentGame?["bonusAmounts"], out bonusAmount))
        {
            source = $"currentGame.bonusAmounts[{activePlayerId}]";
            LogBonusFallbackUsed("amount", source, latestClaim.ClaimId);
            return true;
        }

        if (TryResolveBonusAmountFromPlayerMap(currentGame?["bonusAwards"], out bonusAmount))
        {
            source = $"currentGame.bonusAwards[{activePlayerId}]";
            LogBonusFallbackUsed("amount", source, latestClaim.ClaimId);
            return true;
        }

        return false;
    }

    private bool TryResolveBackendBonusAmount(JSONNode node, out int bonusAmount, out string source)
    {
        bonusAmount = 0;
        source = string.Empty;
        if (node == null || node.IsNull)
        {
            return false;
        }

        if (TryParsePositiveAmount(node["bonusAmount"], out bonusAmount))
        {
            source = "bonusAmount";
            return true;
        }

        return false;
    }

    private bool TryResolveBonusAmountFromNode(JSONNode node, out int bonusAmount, out string source)
    {
        bonusAmount = 0;
        source = string.Empty;
        if (node == null || node.IsNull)
        {
            return false;
        }

        if (TryParsePositiveAmount(node["bonusAmount"], out bonusAmount))
        {
            source = "bonusAmount";
            return true;
        }

        if (TryParsePositiveAmount(node["bonusAmt"], out bonusAmount))
        {
            source = "bonusAmt";
            return true;
        }

        if (TryParsePositiveAmount(node["bonusPayout"], out bonusAmount))
        {
            source = "bonusPayout";
            return true;
        }

        if (TryParsePositiveAmount(node["bonusValue"], out bonusAmount))
        {
            source = "bonusValue";
            return true;
        }

        JSONNode bonusNode = node["bonus"];
        if (TryParseBonusAmountFromGenericNode(bonusNode, out bonusAmount))
        {
            source = "bonus";
            return true;
        }

        return false;
    }

    private bool TryResolveBonusAmountFromPlayerMap(JSONNode mapNode, out int bonusAmount)
    {
        bonusAmount = 0;
        if (mapNode == null || mapNode.IsNull || string.IsNullOrWhiteSpace(activePlayerId))
        {
            return false;
        }

        JSONNode playerNode = mapNode[activePlayerId];
        return TryParseBonusAmountFromGenericNode(playerNode, out bonusAmount);
    }

    private bool TryParseBonusAmountFromGenericNode(JSONNode node, out int bonusAmount)
    {
        bonusAmount = 0;
        if (node == null || node.IsNull)
        {
            return false;
        }

        if (TryParsePositiveAmount(node, out bonusAmount))
        {
            return true;
        }

        if (TryParsePositiveAmount(node["amount"], out bonusAmount))
        {
            return true;
        }

        if (TryParsePositiveAmount(node["bonusAmount"], out bonusAmount))
        {
            return true;
        }

        if (TryParsePositiveAmount(node["value"], out bonusAmount))
        {
            return true;
        }

        if (TryParsePositiveAmount(node["payout"], out bonusAmount))
        {
            return true;
        }

        if (TryParsePositiveAmount(node["bonusPayout"], out bonusAmount))
        {
            return true;
        }

        return false;
    }

    private bool TryParsePositiveAmount(JSONNode node, out int value)
    {
        value = 0;
        if (node == null || node.IsNull)
        {
            return false;
        }

        string raw = node.Value;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out int intValue))
        {
            if (intValue > 0)
            {
                value = intValue;
                return true;
            }

            return false;
        }

        if (double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out double doubleValue) && doubleValue > 0d)
        {
            value = Mathf.RoundToInt((float)doubleValue);
            return value > 0;
        }

        return false;
    }

    private bool TryParseOptionalBool(JSONNode node, out bool value)
    {
        value = false;
        if (node == null || node.IsNull)
        {
            return false;
        }

        string raw = node.Value;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        if (bool.TryParse(raw, out bool boolValue))
        {
            value = boolValue;
            return true;
        }

        if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out int intValue))
        {
            value = intValue != 0;
            return true;
        }

        return false;
    }

    private void LogBonusFallbackUsed(string scope, string source, string claimId)
    {
        string normalizedClaimId = string.IsNullOrWhiteSpace(claimId) ? "<unknown-claim>" : claimId;
        Debug.LogWarning(
            $"[APIManager] Realtime bonus-{scope} bruker fallback ({source}) i game {activeGameId}, claim {normalizedClaimId}. " +
            "Backend-feltene claim.bonusTriggered/claim.bonusAmount mangler.");
    }
}
