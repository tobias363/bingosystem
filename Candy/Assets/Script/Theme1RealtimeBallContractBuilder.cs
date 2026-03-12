using TMPro;
using UnityEngine;

internal static class Theme1RealtimeBallContractBuilder
{
    internal static void EnsureBallNumberTargets(BallManager ballManager)
    {
        if (ballManager == null)
        {
            return;
        }

        if (ballManager.balls != null)
        {
            for (int i = 0; i < ballManager.balls.Count; i++)
            {
                GameObject root = ballManager.balls[i];
                if (root == null)
                {
                    continue;
                }

                RectTransform rootRect = root.GetComponent<RectTransform>();
                Vector2 preferredSize = rootRect != null && rootRect.rect.width > 1f && rootRect.rect.height > 1f
                    ? rootRect.rect.size
                    : new Vector2(84f, 84f);
                TextMeshProUGUI label = Theme1RuntimeTextTargetBuilder.ResolveOrCreateTextLabel(
                    root.transform,
                    Theme1GameplayViewRepairUtils.BallNumberLabelName,
                    preferredSize,
                    GameplayTextSurface.BallNumber,
                    Color.white,
                    fontSizeMin: 14f,
                    fontSizeMax: 40f);
                if (label == null)
                {
                    continue;
                }

                Theme1RuntimeTextTargetBuilder.PlaceBallNumberLabel(label.rectTransform, preferredSize);
                Theme1RuntimeTextTargetBuilder.DeactivateLegacyTextLabels(root.transform, label);
            }
        }

        if (ballManager.bigBallImg != null)
        {
            RectTransform bigBallRect = ballManager.bigBallImg.rectTransform;
            Vector2 preferredSize = bigBallRect != null && bigBallRect.rect.width > 1f && bigBallRect.rect.height > 1f
                ? bigBallRect.rect.size
                : new Vector2(160f, 160f);
            TextMeshProUGUI label = Theme1RuntimeTextTargetBuilder.ResolveOrCreateTextLabel(
                ballManager.bigBallImg.transform,
                Theme1GameplayViewRepairUtils.BigBallNumberLabelName,
                preferredSize,
                GameplayTextSurface.BallNumber,
                Color.white,
                fontSizeMin: 40f,
                fontSizeMax: 72f);
            if (label != null)
            {
                Theme1RuntimeTextTargetBuilder.PlaceBallNumberLabel(label.rectTransform, preferredSize);
                Theme1RuntimeTextTargetBuilder.DeactivateLegacyTextLabels(ballManager.bigBallImg.transform, label);
            }
        }
    }
}
