using TMPro;

public static class Theme1CardLabelPolicy
{
    public static bool ShouldShowWinLabel(int amount)
    {
        return amount > 0;
    }

    public static string ResolveWinLabel(GameManager gameManager, int amount, string hiddenFallback, out bool showWinLabel)
    {
        showWinLabel = ShouldShowWinLabel(amount);
        if (showWinLabel)
        {
            return gameManager != null
                ? gameManager.FormatCardWinLabel(amount)
                : GameManager.FormatTheme1CardWinLabel(amount);
        }

        return NormalizeHiddenWinLabel(hiddenFallback);
    }

    public static string ResolveWinLabelForCard(GameManager gameManager, int cardIndex, string hiddenFallback, out bool showWinLabel)
    {
        int amount = gameManager != null ? gameManager.GetCardWinAmount(cardIndex) : 0;
        return ResolveWinLabel(gameManager, amount, hiddenFallback, out showWinLabel);
    }

    public static string ReadHiddenWinLabel(TMP_Text target)
    {
        return IsVisible(target) ? (target.text ?? string.Empty) : string.Empty;
    }

    public static bool IsVisible(TMP_Text target)
    {
        return target != null && target.gameObject.activeSelf;
    }

    public static string ReadVisibleWinLabel(TMP_Text target)
    {
        return IsVisible(target) ? (target.text ?? string.Empty) : string.Empty;
    }

    public static void ApplyRenderedWinLabel(TMP_Text target, string value, bool showWinLabel)
    {
        if (target == null)
        {
            return;
        }

        if (showWinLabel && !string.IsNullOrWhiteSpace(value))
        {
            Theme1PresentationTextUtils.ApplyHudText(target, value);
        }
        else
        {
            Theme1PresentationTextUtils.ApplyText(target, string.Empty);
        }

        Theme1PresentationTextUtils.SetActive(
            target.gameObject,
            showWinLabel);
    }

    public static string NormalizeHiddenWinLabel(string hiddenFallback)
    {
        return string.IsNullOrWhiteSpace(hiddenFallback) ? string.Empty : hiddenFallback;
    }
}
