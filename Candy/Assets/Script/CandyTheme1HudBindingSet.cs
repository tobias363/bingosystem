using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;

public sealed class CandyTheme1HudBindingSet : MonoBehaviour
{
    [SerializeField] private TextMeshProUGUI countdownText;
    [SerializeField] private TextMeshProUGUI roomPlayerCountText;
    [SerializeField] private TextMeshProUGUI creditText;
    [SerializeField] private TextMeshProUGUI winningsText;
    [SerializeField] private TextMeshProUGUI betText;

    public TextMeshProUGUI CountdownText => countdownText;
    public TextMeshProUGUI RoomPlayerCountText => roomPlayerCountText;
    public TextMeshProUGUI CreditText => creditText;
    public TextMeshProUGUI WinningsText => winningsText;
    public TextMeshProUGUI BetText => betText;

    public void PullFrom(NumberGenerator generator, GameManager gameManager = null)
    {
        if (generator != null && generator.autoSpinRemainingPlayText != null)
        {
            countdownText = generator.autoSpinRemainingPlayText;
        }

        if (roomPlayerCountText == null)
        {
            roomPlayerCountText = FindExistingPlayerCountText(countdownText);
        }

        if (gameManager != null)
        {
            creditText = gameManager.displayTotalMoney;
            winningsText = gameManager.winAmtText;
            betText = gameManager.displayCurrentBets;
        }
    }

    public bool TryApplyTo(NumberGenerator generator, APIManager apiManager, GameManager gameManager, out string error)
    {
        error = string.Empty;

        if (countdownText == null)
        {
            error = "countdownText mangler.";
            return false;
        }

        if (roomPlayerCountText == null)
        {
            error = "roomPlayerCountText mangler.";
            return false;
        }

        if (creditText == null)
        {
            error = "creditText mangler.";
            return false;
        }

        if (winningsText == null)
        {
            error = "winningsText mangler.";
            return false;
        }

        if (betText == null)
        {
            error = "betText mangler.";
            return false;
        }

        if (generator != null)
        {
            generator.autoSpinRemainingPlayText = countdownText;
        }

        if (gameManager != null)
        {
            gameManager.displayTotalMoney = creditText;
            gameManager.winAmtText = winningsText;
            gameManager.displayCurrentBets = betText;
        }

        apiManager?.ApplyExplicitRealtimeHudBindings(countdownText, roomPlayerCountText);
        return true;
    }

    public bool Validate(out string report)
    {
        List<string> errors = new List<string>();
        bool isValid = true;

        if (!CandyCardViewBindingValidator.ValidateTextTarget(countdownText, "HUD countdownText", requireActive: true, errors))
        {
            isValid = false;
        }

        if (!CandyCardViewBindingValidator.ValidateTextTarget(roomPlayerCountText, "HUD roomPlayerCountText", requireActive: true, errors))
        {
            isValid = false;
        }

        if (!CandyCardViewBindingValidator.ValidateTextTarget(creditText, "HUD creditText", requireActive: true, errors))
        {
            isValid = false;
        }

        if (!CandyCardViewBindingValidator.ValidateTextTarget(winningsText, "HUD winningsText", requireActive: true, errors))
        {
            isValid = false;
        }

        if (!CandyCardViewBindingValidator.ValidateTextTarget(betText, "HUD betText", requireActive: true, errors))
        {
            isValid = false;
        }

        if (countdownText != null &&
            roomPlayerCountText != null &&
            countdownText.GetInstanceID() == roomPlayerCountText.GetInstanceID())
        {
            errors.Add("HUD countdownText og roomPlayerCountText peker til samme TMP-objekt.");
            isValid = false;
        }

        EnsureDistinct(creditText, winningsText, "HUD creditText og winningsText", errors, ref isValid);
        EnsureDistinct(creditText, betText, "HUD creditText og betText", errors, ref isValid);
        EnsureDistinct(winningsText, betText, "HUD winningsText og betText", errors, ref isValid);

        report = string.Join(Environment.NewLine, errors);
        return isValid;
    }

    private static void EnsureDistinct(TextMeshProUGUI left, TextMeshProUGUI right, string label, List<string> errors, ref bool isValid)
    {
        if (left == null || right == null)
        {
            return;
        }

        if (left.GetInstanceID() == right.GetInstanceID())
        {
            errors.Add(label + " peker til samme TMP-objekt.");
            isValid = false;
        }
    }

    public static TextMeshProUGUI FindExistingPlayerCountText(TextMeshProUGUI countdown)
    {
        if (countdown == null)
        {
            return null;
        }

        Transform parent = countdown.transform.parent;
        if (parent == null)
        {
            return null;
        }

        for (int i = 0; i < parent.childCount; i++)
        {
            Transform child = parent.GetChild(i);
            if (child == null || child == countdown.transform)
            {
                continue;
            }

            if (!string.Equals(child.name, "RealtimeRoomPlayerCountText", StringComparison.Ordinal))
            {
                continue;
            }

            TextMeshProUGUI label = child.GetComponent<TextMeshProUGUI>();
            if (label == null)
            {
                label = child.GetComponentInChildren<TextMeshProUGUI>(true);
            }

            if (label != null)
            {
                return label;
            }
        }

        return null;
    }
}
