using System;
using TMPro;
using UnityEngine;

[Serializable]
public sealed class Theme1TopperSlotView
{
    [SerializeField] private GameObject patternRoot;
    [SerializeField] private GameObject matchedPatternRoot;
    [SerializeField] private GameObject[] missingCells = Array.Empty<GameObject>();
    [SerializeField] private TextMeshProUGUI prizeLabel;
    [SerializeField] private Color defaultPrizeColor = Color.white;

    public GameObject PatternRoot => patternRoot;
    public GameObject MatchedPatternRoot => matchedPatternRoot;
    public GameObject[] MissingCells => missingCells;
    public TextMeshProUGUI PrizeLabel => prizeLabel;
    public Color DefaultPrizeColor => defaultPrizeColor;

    public void PullFrom(GameObject resolvedPatternRoot, GameObject resolvedMatchedPatternRoot, GameObject resolvedMissingPatternRoot, TextMeshProUGUI resolvedPrizeLabel)
    {
        patternRoot = resolvedPatternRoot;
        matchedPatternRoot = resolvedMatchedPatternRoot;
        prizeLabel = resolvedPrizeLabel;
        defaultPrizeColor = resolvedPrizeLabel != null ? resolvedPrizeLabel.color : Color.white;

        if (resolvedMissingPatternRoot == null)
        {
            missingCells = Array.Empty<GameObject>();
            return;
        }

        int childCount = resolvedMissingPatternRoot.transform.childCount;
        missingCells = new GameObject[childCount];
        for (int i = 0; i < childCount; i++)
        {
            Transform child = resolvedMissingPatternRoot.transform.GetChild(i);
            missingCells[i] = child != null ? child.gameObject : null;
        }
    }
}

[Serializable]
public sealed class Theme1TopperStripView
{
    [SerializeField] private Theme1TopperSlotView[] slots = Array.Empty<Theme1TopperSlotView>();

    public Theme1TopperSlotView[] Slots => slots;

    public void PullFrom(TopperManager topperManager)
    {
        int slotCount = topperManager != null && topperManager.prizes != null ? topperManager.prizes.Count : 0;
        slots = new Theme1TopperSlotView[slotCount];
        for (int i = 0; i < slotCount; i++)
        {
            slots[i] = new Theme1TopperSlotView();
            slots[i].PullFrom(
                topperManager != null && topperManager.patterns != null && i < topperManager.patterns.Count ? topperManager.patterns[i] : null,
                topperManager != null && topperManager.matchedPatterns != null && i < topperManager.matchedPatterns.Count ? topperManager.matchedPatterns[i] : null,
                topperManager != null && topperManager.missedPattern != null && i < topperManager.missedPattern.Count ? topperManager.missedPattern[i] : null,
                topperManager != null && topperManager.prizes != null && i < topperManager.prizes.Count ? topperManager.prizes[i] : null);
        }
    }
}
