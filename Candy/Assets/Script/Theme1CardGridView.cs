using System;
using TMPro;
using UnityEngine;

[Serializable]
public sealed class Theme1CardGridView
{
    [SerializeField] private TextMeshProUGUI headerLabel;
    [SerializeField] private TextMeshProUGUI betLabel;
    [SerializeField] private TextMeshProUGUI winLabel;
    [SerializeField] private Theme1CardCellView[] cells = new Theme1CardCellView[15];
    [SerializeField] private GameObject[] paylineObjects = Array.Empty<GameObject>();

    public TextMeshProUGUI HeaderLabel => headerLabel;
    public TextMeshProUGUI BetLabel => betLabel;
    public TextMeshProUGUI WinLabel => winLabel;
    public TextMeshProUGUI CardIndexLabel => headerLabel;
    public TextMeshProUGUI StakeLabel => betLabel;
    public TextMeshProUGUI CardWinLabel => winLabel;
    public Theme1CardCellView[] Cells => cells;
    public GameObject[] PaylineObjects => paylineObjects;

    public void PullFrom(CandyCardViewBinding binding, TextMeshProUGUI resolvedHeaderLabel, TextMeshProUGUI resolvedBetLabel, TextMeshProUGUI resolvedWinLabel)
    {
        headerLabel = resolvedHeaderLabel;
        betLabel = resolvedBetLabel;
        winLabel = resolvedWinLabel;

        int cellCount = 15;
        cells = new Theme1CardCellView[cellCount];
        for (int i = 0; i < cellCount; i++)
        {
            cells[i] = new Theme1CardCellView();
            TextMeshProUGUI numberLabel = binding != null && i < binding.NumberTexts.Count ? binding.NumberTexts[i] : null;
            cells[i].PullFrom(
                numberLabel != null ? numberLabel.transform.parent as RectTransform : null,
                numberLabel,
                binding != null && i < binding.SelectionOverlays.Count ? binding.SelectionOverlays[i] : null,
                binding != null && i < binding.MissingPatternOverlays.Count ? binding.MissingPatternOverlays[i] : null,
                binding != null && i < binding.MatchedPatternOverlays.Count ? binding.MatchedPatternOverlays[i] : null);
        }

        Array.Sort(cells, CompareCellsByVisualOrder);

        int paylineCount = binding != null && binding.PaylineObjects != null ? binding.PaylineObjects.Count : 0;
        paylineObjects = new GameObject[paylineCount];
        for (int i = 0; i < paylineCount; i++)
        {
            paylineObjects[i] = binding.PaylineObjects[i];
        }
    }

    private static int CompareCellsByVisualOrder(Theme1CardCellView left, Theme1CardCellView right)
    {
        if (ReferenceEquals(left, right))
        {
            return 0;
        }

        if (left == null)
        {
            return 1;
        }

        if (right == null)
        {
            return -1;
        }

        Vector2 leftPosition = left.CellRoot != null ? left.CellRoot.anchoredPosition : Vector2.zero;
        Vector2 rightPosition = right.CellRoot != null ? right.CellRoot.anchoredPosition : Vector2.zero;

        int xComparison = leftPosition.x.CompareTo(rightPosition.x);
        if (xComparison != 0)
        {
            return xComparison;
        }

        int yComparison = rightPosition.y.CompareTo(leftPosition.y);
        if (yComparison != 0)
        {
            return yComparison;
        }

        return 0;
    }
}
