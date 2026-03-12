using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

internal static class Theme1RealtimeTopperContractBuilder
{
    public static void EnsureTopperPrizeTargets(TopperManager topperManager, GameManager gameManager)
    {
        if (topperManager?.prizes == null)
        {
            return;
        }

        List<TextMeshProUGUI> dedicatedLabels = new List<TextMeshProUGUI>(topperManager.prizes.Count);
        for (int i = 0; i < topperManager.prizes.Count; i++)
        {
            TextMeshProUGUI template = topperManager.prizes[i];
            string defaultText = gameManager != null && gameManager.TryGetFormattedPayoutLabel(i, out string payoutLabel)
                ? payoutLabel
                : Theme1RuntimeViewCommon.ReadText(template, "0 kr");
            Transform labelParent = Theme1ViewHierarchyResolver.ResolveTopperPrizeParent(topperManager, i, template);
            ApplyDedicatedTopperCardSprite(labelParent, i);
            ApplyDedicatedTopperCardSprite(ResolveSlotParent(topperManager?.patterns, i), i);
            ApplyDedicatedTopperCardSprite(ResolveSlotParent(topperManager?.matchedPatterns, i), i);
            ApplyDedicatedTopperCardSprite(ResolveSlotParent(topperManager?.missedPattern, i), i);
            SuppressLegacyTopperGraphics(GetSlotRoot(topperManager?.patterns, i));
            SuppressLegacyTopperGraphics(GetSlotRoot(topperManager?.matchedPatterns, i));
            Color preferredColor = template != null && template.color.a > 0f
                ? template.color
                : Color.white;
            if (Mathf.Approximately(preferredColor.a, 0f))
            {
                preferredColor.a = 1f;
            }

            TextMeshProUGUI dedicated = Theme1OverlayLabelFactory.EnsureDedicatedOverlayLabel(
                labelParent,
                $"RealtimeTopperPrizeLabel_{i + 1}",
                template,
                defaultText,
                GameplayTextSurface.TopperValue,
                preferredColor,
                fallbackSize: new Vector2(168f, 36f));
            Theme1OverlayLabelFactory.ApplyOverlayLabelDefault(dedicated, defaultText);
            if (dedicated != null)
            {
                Theme1RuntimeViewCommon.DeactivateSiblingTextTargets(dedicated.transform.parent, dedicated);
            }

            dedicatedLabels.Add(dedicated);
        }

        topperManager.prizes = dedicatedLabels;
        if (gameManager != null)
        {
            gameManager.displayCurrentPoints = new List<TextMeshProUGUI>(dedicatedLabels);
            gameManager.ReapplyTheme1TopperPayoutState();
        }
    }

    private static GameObject GetSlotRoot(IReadOnlyList<GameObject> slots, int index)
    {
        return slots != null && index >= 0 && index < slots.Count ? slots[index] : null;
    }

    private static Transform ResolveSlotParent(IReadOnlyList<GameObject> slots, int index)
    {
        GameObject slotRoot = GetSlotRoot(slots, index);
        return slotRoot != null && slotRoot.transform.parent != null ? slotRoot.transform.parent : null;
    }

    private static void ApplyDedicatedTopperCardSprite(Transform slotParent, int slotIndex)
    {
        if (slotParent == null)
        {
            return;
        }

        Sprite sprite = Theme1RuntimeAssetCatalog.GetTopperCardSprite(slotIndex);
        if (sprite == null)
        {
            return;
        }

        Image image = slotParent.GetComponent<Image>();
        if (image == null)
        {
            image = slotParent.gameObject.AddComponent<Image>();
        }

        image.sprite = sprite;
        image.type = Image.Type.Simple;
        image.color = Color.white;
        image.preserveAspect = false;
        image.raycastTarget = false;
    }

    private static void SuppressLegacyTopperGraphics(GameObject slotRoot)
    {
        if (slotRoot == null)
        {
            return;
        }

        Graphic[] graphics = slotRoot.GetComponentsInChildren<Graphic>(true);
        for (int i = 0; i < graphics.Length; i++)
        {
            if (graphics[i] == null || graphics[i] is TextMeshProUGUI)
            {
                continue;
            }

            graphics[i].enabled = false;
        }
    }
}
