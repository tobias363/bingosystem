using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public static class Theme1GameplayViewRepairUtils
{
    private const string CardNumberLayerName = "RealtimeCardNumbers";
    private const string CardNumberHostPrefix = "RealtimeCardCell_";
    private const string CardNumberLabelName = "RealtimeCardNumberLabel";
    private const string BallNumberLabelName = "RealtimeBallNumberLabel";
    private const string BigBallNumberLabelName = "RealtimeBigBallNumberLabel";

    public static void EnsureCardNumberTargets(NumberGenerator generator)
    {
        if (generator?.cardClasses == null)
        {
            return;
        }

        for (int cardIndex = 0; cardIndex < generator.cardClasses.Length; cardIndex++)
        {
            CardClass card = generator.cardClasses[cardIndex];
            if (card == null)
            {
                continue;
            }

            card.num_text ??= new List<TextMeshProUGUI>(15);
            EnsureListCapacity(card.num_text, 15);
            for (int cellIndex = 0; cellIndex < 15; cellIndex++)
            {
                GameObject overlay = card.selectionImg != null && cellIndex < card.selectionImg.Count
                    ? card.selectionImg[cellIndex]
                    : null;
                Transform labelHost = ResolveCardNumberHost(card, cellIndex, overlay);
                if (labelHost == null)
                {
                    continue;
                }

                Vector2 preferredSize = ResolvePreferredCellSize(labelHost);
                TextMeshProUGUI label = ResolveOrCreateTextLabel(
                    labelHost,
                    CardNumberLabelName,
                    preferredSize,
                    GameplayTextSurface.CardNumber,
                    new Color32(184, 51, 99, 255),
                    fontSizeMin: 20f,
                    fontSizeMax: 72f);
                if (label == null)
                {
                    continue;
                }

                PlaceCardNumberLabel(label.rectTransform, labelHost);
                card.num_text[cellIndex] = label;
            }

            PromoteCardNumberLayer(card);
        }
    }

    public static void EnsureBallNumberTargets(BallManager ballManager)
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
                TextMeshProUGUI label = ResolveOrCreateTextLabel(
                    root.transform,
                    BallNumberLabelName,
                    preferredSize,
                    GameplayTextSurface.BallNumber,
                    Color.white,
                    fontSizeMin: 14f,
                    fontSizeMax: 40f);
                if (label == null)
                {
                    continue;
                }

                PlaceBallNumberLabel(label.rectTransform, preferredSize);
                DeactivateLegacyTextLabels(root.transform, label);
            }
        }

        if (ballManager.bigBallImg != null)
        {
            RectTransform bigBallRect = ballManager.bigBallImg.rectTransform;
            Vector2 preferredSize = bigBallRect != null && bigBallRect.rect.width > 1f && bigBallRect.rect.height > 1f
                ? bigBallRect.rect.size
                : new Vector2(160f, 160f);
            TextMeshProUGUI label = ResolveOrCreateTextLabel(
                ballManager.bigBallImg.transform,
                BigBallNumberLabelName,
                preferredSize,
                GameplayTextSurface.BallNumber,
                Color.white,
                fontSizeMin: 40f,
                fontSizeMax: 72f);
            if (label != null)
            {
                PlaceBallNumberLabel(label.rectTransform, preferredSize);
                DeactivateLegacyTextLabels(ballManager.bigBallImg.transform, label);
            }
        }
    }

    public static TextMeshProUGUI FindDedicatedCardNumberLabel(GameObject selectionOverlay)
    {
        Transform labelHost = ResolveCardNumberHost(selectionOverlay, createIfMissing: false);
        return FindNamedTextLabel(labelHost, CardNumberLabelName);
    }

    public static TextMeshProUGUI FindDedicatedBallNumberLabel(GameObject root)
    {
        return root == null ? null : FindNamedTextLabel(root.transform, BallNumberLabelName);
    }

    public static TextMeshProUGUI FindDedicatedBigBallNumberLabel(Image bigBallImage)
    {
        return bigBallImage == null ? null : FindNamedTextLabel(bigBallImage.transform, BigBallNumberLabelName);
    }

    public static bool IsDedicatedCardNumberLabel(TextMeshProUGUI label, GameObject selectionOverlay)
    {
        return label != null &&
               string.Equals(label.gameObject.name, CardNumberLabelName, StringComparison.Ordinal) &&
               IsTextLocalToSelectionOverlay(label, selectionOverlay);
    }

    public static bool IsDedicatedBallNumberLabel(TextMeshProUGUI label, GameObject root)
    {
        return label != null &&
               string.Equals(label.gameObject.name, BallNumberLabelName, StringComparison.Ordinal) &&
               IsTextLocalToBallRoot(label, root);
    }

    public static bool IsDedicatedBigBallNumberLabel(TextMeshProUGUI label, Image bigBallImage)
    {
        return label != null &&
               bigBallImage != null &&
               string.Equals(label.gameObject.name, BigBallNumberLabelName, StringComparison.Ordinal) &&
               label.transform.IsChildOf(bigBallImage.transform);
    }

    public static bool IsTextLocalToSelectionOverlay(TextMeshProUGUI label, GameObject selectionOverlay)
    {
        if (label == null || selectionOverlay == null)
        {
            return false;
        }

        Transform labelHost = ResolveCardNumberHost(selectionOverlay, createIfMissing: false);
        return labelHost != null && label.transform.IsChildOf(labelHost);
    }

    public static bool IsTextLocalToBallRoot(TextMeshProUGUI label, GameObject root)
    {
        return label != null && root != null && label.transform.IsChildOf(root.transform);
    }

    private static void EnsureListCapacity<T>(List<T> items, int requiredCount)
    {
        if (items == null)
        {
            return;
        }

        while (items.Count < requiredCount)
        {
            items.Add(default);
        }
    }

    private static Transform ResolveCardNumberHost(CardClass card, int cellIndex, GameObject selectionOverlay)
    {
        Transform cardRoot = ResolveCardRoot(selectionOverlay);
        if (cardRoot == null)
        {
            TextMeshProUGUI existingLabel = card?.num_text != null && cellIndex >= 0 && cellIndex < card.num_text.Count
                ? card.num_text[cellIndex]
                : null;
            Transform existingHost = ResolveExistingCardNumberHost(existingLabel);
            if (existingHost != null)
            {
                return existingHost;
            }

            return null;
        }

        RectTransform cardRootRect = cardRoot as RectTransform;
        Transform numberLayer = EnsureCardNumberLayer(cardRoot);
        if (numberLayer == null || cardRootRect == null)
        {
            return null;
        }

        string hostName = CardNumberHostPrefix + (cellIndex + 1).ToString("00");
        Transform host = numberLayer.Find(hostName);
        if (host == null)
        {
            GameObject hostObject = new GameObject(hostName, typeof(RectTransform));
            hostObject.transform.SetParent(numberLayer, false);
            host = hostObject.transform;
        }

        PositionCardNumberHost(host as RectTransform, cardRootRect, selectionOverlay != null ? selectionOverlay.GetComponent<RectTransform>() : null);
        host.SetAsLastSibling();
        return host;
    }

    private static Transform ResolveCardNumberHost(GameObject selectionOverlay, bool createIfMissing)
    {
        if (selectionOverlay == null)
        {
            return null;
        }

        Transform cardRoot = ResolveCardRoot(selectionOverlay);
        RectTransform cardRootRect = cardRoot as RectTransform;
        if (cardRootRect == null)
        {
            return null;
        }

        Transform numberLayer = createIfMissing ? EnsureCardNumberLayer(cardRoot) : cardRoot.Find(CardNumberLayerName);
        if (numberLayer == null)
        {
            return null;
        }

        int siblingIndex = selectionOverlay.transform.GetSiblingIndex();
        string hostName = CardNumberHostPrefix + (siblingIndex + 1).ToString("00");
        Transform host = numberLayer.Find(hostName);
        if (host == null && createIfMissing)
        {
            GameObject hostObject = new GameObject(hostName, typeof(RectTransform));
            hostObject.transform.SetParent(numberLayer, false);
            host = hostObject.transform;
        }

        if (host is RectTransform hostRect)
        {
            PositionCardNumberHost(hostRect, cardRootRect, selectionOverlay.GetComponent<RectTransform>());
        }

        return host;
    }

    private static Transform ResolveCardRoot(GameObject selectionOverlay)
    {
        if (selectionOverlay == null)
        {
            return null;
        }

        Transform selectedCardGrid = selectionOverlay.transform.parent;
        return selectedCardGrid != null ? selectedCardGrid.parent : null;
    }

    private static Transform ResolveExistingCardNumberHost(TextMeshProUGUI existingLabel)
    {
        if (existingLabel == null)
        {
            return null;
        }

        if (string.Equals(existingLabel.gameObject.name, CardNumberLabelName, StringComparison.Ordinal))
        {
            return existingLabel.transform.parent != null ? existingLabel.transform.parent : existingLabel.transform;
        }

        return existingLabel.transform;
    }

    private static Transform EnsureCardNumberLayer(Transform cardRoot)
    {
        if (cardRoot == null)
        {
            return null;
        }

        Transform layer = cardRoot.Find(CardNumberLayerName);
        if (layer == null)
        {
            GameObject layerObject = new GameObject(CardNumberLayerName, typeof(RectTransform));
            layerObject.transform.SetParent(cardRoot, false);
            layer = layerObject.transform;
        }

        if (layer is RectTransform rect)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.localScale = Vector3.one;
        }

        if (!layer.gameObject.activeSelf)
        {
            layer.gameObject.SetActive(true);
        }

        return layer;
    }

    private static void PromoteCardNumberLayer(CardClass card)
    {
        if (card?.selectionImg == null || card.selectionImg.Count == 0)
        {
            return;
        }

        Transform cardRoot = ResolveCardRoot(card.selectionImg[0]);
        if (cardRoot == null)
        {
            return;
        }

        Transform numberLayer = cardRoot.Find(CardNumberLayerName);
        if (numberLayer != null)
        {
            numberLayer.SetAsLastSibling();
        }
    }

    private static void PositionCardNumberHost(RectTransform hostRect, RectTransform cardRootRect, RectTransform overlayRect)
    {
        if (hostRect == null || cardRootRect == null)
        {
            return;
        }

        hostRect.anchorMin = new Vector2(0.5f, 0.5f);
        hostRect.anchorMax = new Vector2(0.5f, 0.5f);
        hostRect.pivot = new Vector2(0.5f, 0.5f);
        hostRect.localScale = Vector3.one;

        if (overlayRect == null)
        {
            hostRect.anchoredPosition = Vector2.zero;
            if (hostRect.sizeDelta.x <= 1f || hostRect.sizeDelta.y <= 1f)
            {
                hostRect.sizeDelta = new Vector2(96f, 72f);
            }
            return;
        }

        Vector3[] worldCorners = new Vector3[4];
        overlayRect.GetWorldCorners(worldCorners);
        Vector3 localMin = cardRootRect.InverseTransformPoint(worldCorners[0]);
        Vector3 localMax = cardRootRect.InverseTransformPoint(worldCorners[2]);
        Vector2 size = new Vector2(Mathf.Abs(localMax.x - localMin.x), Mathf.Abs(localMax.y - localMin.y));
        Vector2 center = new Vector2((localMin.x + localMax.x) * 0.5f, (localMin.y + localMax.y) * 0.5f);

        hostRect.anchoredPosition = center;
        hostRect.sizeDelta = new Vector2(
            size.x > 1f ? size.x : 96f,
            size.y > 1f ? size.y : 72f);
    }

    private static Vector2 ResolvePreferredCellSize(Transform cellRoot)
    {
        if (cellRoot is RectTransform rect && rect.rect.width > 1f && rect.rect.height > 1f)
        {
            return rect.rect.size;
        }

        GridLayoutGroup grid = FindAncestor<GridLayoutGroup>(cellRoot);
        if (grid != null && grid.cellSize.x > 1f && grid.cellSize.y > 1f)
        {
            return grid.cellSize;
        }

        return new Vector2(96f, 72f);
    }

    private static T FindAncestor<T>(Transform start) where T : Component
    {
        Transform current = start;
        while (current != null)
        {
            T component = current.GetComponent<T>();
            if (component != null)
            {
                return component;
            }

            current = current.parent;
        }

        return null;
    }

    private static TextMeshProUGUI ResolveOrCreateTextLabel(
        Transform parent,
        string objectName,
        Vector2 preferredSize,
        GameplayTextSurface surface,
        Color preferredColor,
        float fontSizeMin,
        float fontSizeMax)
    {
        if (parent == null)
        {
            return null;
        }

        TextMeshProUGUI label = FindNamedTextLabel(parent, objectName);

        if (label == null)
        {
            GameObject child = new GameObject(objectName, typeof(RectTransform), typeof(TextMeshProUGUI));
            child.transform.SetParent(parent, false);
            label = child.GetComponent<TextMeshProUGUI>();
        }

        if (label == null)
        {
            return null;
        }

        if (!parent.gameObject.activeSelf)
        {
            parent.gameObject.SetActive(true);
        }

        label.gameObject.name = objectName;
        if (!label.gameObject.activeSelf)
        {
            label.gameObject.SetActive(true);
        }
        label.enabled = true;
        label.raycastTarget = false;
        label.color = preferredColor;
        label.alpha = 1f;
        label.enableAutoSizing = true;
        label.fontSizeMin = fontSizeMin;
        label.fontSizeMax = Mathf.Max(fontSizeMin, fontSizeMax);
        label.overflowMode = TextOverflowModes.Overflow;
        label.alignment = TextAlignmentOptions.Center;
        label.textWrappingMode = TextWrappingModes.NoWrap;
        RealtimeTextStyleUtils.ApplyGameplayTextPresentation(
            label,
            surface == GameplayTextSurface.BallNumber ? CandyTypographyRole.Number : CandyTypographyRole.Number,
            surface,
            preserveExistingFont: false);

        RectTransform rect = label.rectTransform;
        rect.localScale = Vector3.one;
        rect.sizeDelta = preferredSize;
        label.transform.SetAsLastSibling();
        return label;
    }

    private static TextMeshProUGUI FindNamedTextLabel(Transform parent, string objectName)
    {
        if (parent == null || string.IsNullOrWhiteSpace(objectName))
        {
            return null;
        }

        Transform namedChild = parent.Find(objectName);
        if (namedChild == null)
        {
            return null;
        }

        return namedChild.GetComponent<TextMeshProUGUI>();
    }

    private static void DeactivateLegacyTextLabels(Transform root, TextMeshProUGUI keepLabel)
    {
        if (root == null)
        {
            return;
        }

        TextMeshProUGUI[] labels = root.GetComponentsInChildren<TextMeshProUGUI>(true);
        if (labels == null || labels.Length == 0)
        {
            return;
        }

        for (int i = 0; i < labels.Length; i++)
        {
            TextMeshProUGUI label = labels[i];
            if (label == null || label == keepLabel)
            {
                continue;
            }

            label.enabled = false;
            label.text = string.Empty;
            if (label.transform != root && label.gameObject.activeSelf)
            {
                label.gameObject.SetActive(false);
            }
        }
    }

    private static void PlaceCardNumberLabel(RectTransform rect, Transform cellRoot)
    {
        if (rect == null || cellRoot == null)
        {
            return;
        }

        rect.SetParent(cellRoot, false);
        rect.anchorMin = new Vector2(0.5f, 0.5f);
        rect.anchorMax = new Vector2(0.5f, 0.5f);
        rect.pivot = new Vector2(0.5f, 0.5f);
        rect.anchoredPosition = Vector2.zero;
        if (cellRoot is RectTransform parentRect)
        {
            float width = parentRect.rect.width > 1f ? parentRect.rect.width : 96f;
            float height = parentRect.rect.height > 1f ? parentRect.rect.height : 72f;
            rect.sizeDelta = new Vector2(width, height);
        }
        else
        {
            rect.sizeDelta = new Vector2(96f, 72f);
        }
    }

    private static void PlaceBallNumberLabel(RectTransform rect, Vector2 preferredSize)
    {
        if (rect == null)
        {
            return;
        }

        rect.anchorMin = new Vector2(0.5f, 0.5f);
        rect.anchorMax = new Vector2(0.5f, 0.5f);
        rect.pivot = new Vector2(0.5f, 0.5f);
        rect.anchoredPosition = Vector2.zero;
        rect.sizeDelta = preferredSize;
    }
}
