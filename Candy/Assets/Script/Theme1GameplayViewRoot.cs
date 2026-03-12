using UnityEngine;
using TMPro;
public sealed partial class Theme1GameplayViewRoot : MonoBehaviour
{
    internal const int Theme1CardCellCount = 15;
    internal const int Theme1VisibleCardCellCount = 15;
    [SerializeField] private Theme1CardGridView[] cards = new Theme1CardGridView[4];
    [SerializeField] private Theme1BallRackView ballRack = new Theme1BallRackView();
    [SerializeField] private Theme1HudBarView hudBar = new Theme1HudBarView();
    [SerializeField] private Theme1TopperStripView topperStrip = new Theme1TopperStripView();
    private bool presentationInitialized;
    private Theme1LayoutController cachedLayoutController;

    public Theme1CardGridView[] Cards => cards;
    public Theme1BallRackView BallRack => ballRack;
    public Theme1HudBarView HudBar => hudBar;
    public Theme1TopperStripView TopperStrip => topperStrip;

    internal void ReplaceCards(Theme1CardGridView[] value) => cards = value;
    internal void ReplaceBallRack(Theme1BallRackView value) => ballRack = value;
    internal void ReplaceHudBar(Theme1HudBarView value) => hudBar = value;
    internal void ReplaceTopperStrip(Theme1TopperStripView value) => topperStrip = value;

    public void PullFrom(
        CandyCardViewBindingSet cardBindings,
        CandyBallViewBindingSet ballBindings,
        CandyTheme1HudBindingSet hudBindings,
        TopperManager topperManager)
    {
        cards = new Theme1CardGridView[cardBindings != null ? cardBindings.Cards.Count : 0];
        for (int i = 0; i < cards.Length; i++)
        {
            cards[i] = new Theme1CardGridView();
            cards[i].PullFrom(
                cardBindings.Cards[i],
                cardBindings.Cards[i].HeaderText,
                cardBindings.Cards[i].BetText,
                cardBindings.Cards[i].WinningText);
        }

        ballRack = new Theme1BallRackView();
        ballRack.PullFrom(ballBindings);

        hudBar = new Theme1HudBarView();
        hudBar.PullFrom(hudBindings);

        topperStrip = new Theme1TopperStripView();
        topperStrip.PullFrom(topperManager);
        presentationInitialized = false;
    }

    public void EnsurePresentationInitialized()
    {
        if (presentationInitialized)
        {
            return;
        }

        presentationInitialized = true;
        Theme1GameplayTypographyBootstrap.RegisterManagedTextTargets(this);
        Theme1GameplayTypographyBootstrap.ApplyTypography(this);
    }

    internal Theme1LayoutController ResolveLayoutController()
    {
        if (cachedLayoutController == null)
        {
            cachedLayoutController = GetComponent<Theme1LayoutController>();
        }

        return cachedLayoutController;
    }

    public void CollectTextTargets(System.Collections.Generic.ICollection<TMP_Text> targets)
    {
        if (targets == null)
        {
            return;
        }

        for (int cardIndex = 0; cards != null && cardIndex < cards.Length; cardIndex++)
        {
            Theme1CardGridView card = cards[cardIndex];
            AddTextTarget(targets, card?.HeaderLabel);
            AddTextTarget(targets, card?.BetLabel);
            AddTextTarget(targets, card?.WinLabel);
            for (int cellIndex = 0; card?.Cells != null && cellIndex < card.Cells.Length; cellIndex++)
            {
                AddTextTarget(targets, card.Cells[cellIndex]?.NumberLabel);
                AddTextTarget(targets, card.Cells[cellIndex]?.PrizeLabel);
            }
        }

        AddTextTarget(targets, ballRack?.BigBallText);
        for (int slotIndex = 0; ballRack?.Slots != null && slotIndex < ballRack.Slots.Length; slotIndex++)
        {
            AddTextTarget(targets, ballRack.Slots[slotIndex]?.NumberLabel);
        }

        AddTextTarget(targets, hudBar?.CountdownText);
        AddTextTarget(targets, hudBar?.RoomPlayerCountText);
        AddTextTarget(targets, hudBar?.CreditText);
        AddTextTarget(targets, hudBar?.WinningsText);
        AddTextTarget(targets, hudBar?.BetText);

        for (int slotIndex = 0; topperStrip?.Slots != null && slotIndex < topperStrip.Slots.Length; slotIndex++)
        {
            AddTextTarget(targets, topperStrip.Slots[slotIndex]?.PrizeLabel);
        }
    }

    public bool ContainsTextTarget(TMP_Text target)
    {
        if (target == null)
        {
            return false;
        }

        System.Collections.Generic.List<TMP_Text> targets = new System.Collections.Generic.List<TMP_Text>();
        CollectTextTargets(targets);
        for (int i = 0; i < targets.Count; i++)
        {
            if (targets[i] == target)
            {
                return true;
            }
        }

        return false;
    }

    public static bool TryFindOwningRoot(TMP_Text target, out Theme1GameplayViewRoot root)
    {
        root = null;
        if (target == null)
        {
            return false;
        }

        Theme1GameplayViewRoot[] roots = Object.FindObjectsByType<Theme1GameplayViewRoot>(
            FindObjectsInactive.Include,
            FindObjectsSortMode.None);
        for (int i = 0; i < roots.Length; i++)
        {
            Theme1GameplayViewRoot candidate = roots[i];
            if (candidate != null && candidate.ContainsTextTarget(target))
            {
                root = candidate;
                return true;
            }
        }

        return false;
    }

    private void OnDisable()
    {
        Theme1ManagedTypographyRegistry.Clear();
    }

    private static void AddTextTarget(System.Collections.Generic.ICollection<TMP_Text> targets, TMP_Text target)
    {
        if (target != null)
        {
            targets.Add(target);
        }
    }
}
