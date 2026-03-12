using System.Collections.Generic;
using TMPro;
using UnityEngine;

public static class Theme1GameplayViewContractRefresher
{
    public static void RefreshVisibleContractFromScene(Theme1GameplayViewRoot root)
    {
        NumberGenerator generator = Object.FindFirstObjectByType<NumberGenerator>(FindObjectsInactive.Include);
        BallManager resolvedBallManager = Object.FindFirstObjectByType<BallManager>(FindObjectsInactive.Include);
        GameManager gameManager = GameManager.instance != null
            ? GameManager.instance
            : Object.FindFirstObjectByType<GameManager>(FindObjectsInactive.Include);
        TopperManager topperManager = Object.FindFirstObjectByType<TopperManager>(FindObjectsInactive.Include);
        CandyCardViewBindingSet cardBindings = Object.FindFirstObjectByType<CandyCardViewBindingSet>(FindObjectsInactive.Include);
        CandyBallViewBindingSet ballBindings = Object.FindFirstObjectByType<CandyBallViewBindingSet>(FindObjectsInactive.Include);
        CandyTheme1HudBindingSet hudBindings = Object.FindFirstObjectByType<CandyTheme1HudBindingSet>(FindObjectsInactive.Include);
        if (generator != null)
        {
            if (generator.cardClasses != null)
            {
                for (int i = 0; i < generator.cardClasses.Length; i++)
                {
                    generator.cardClasses[i] ??= new CardClass { cardNo = i };
                }
            }

            bool needsCardBindingBootstrap = NeedsCardBindingBootstrap(generator);
            if (needsCardBindingBootstrap)
            {
                generator.ApplyExplicitRealtimeCardViewBindingsFromComponent();
                if (cardBindings != null && !cardBindings.TryApplyTo(generator, out string cardBindingError))
                {
                    Debug.LogWarning("[Theme1GameplayViewRoot] Klarte ikke anvende CandyCardViewBindingSet i refresh. " + cardBindingError);
                }
            }

            Theme1GameplayViewRepairUtils.EnsureCardNumberTargets(generator);
        }

        if (resolvedBallManager != null)
        {
            Theme1GameplayViewRepairUtils.EnsureBallNumberTargets(resolvedBallManager);
        }

        bool builtRuntimeCardViews = false;
        if (generator?.cardClasses != null && generator.cardClasses.Length > 0)
        {
            int cardCount = generator.cardClasses.Length;
            Theme1CardGridView[] resolvedCards = new Theme1CardGridView[cardCount];
            List<TextMeshProUGUI> resolvedBetLabels = new List<TextMeshProUGUI>(cardCount);
            List<TextMeshProUGUI> resolvedWinLabels = new List<TextMeshProUGUI>(cardCount);

            for (int i = 0; i < cardCount; i++)
            {
                CandyCardViewBinding runtimeBinding =
                    Theme1GameplayViewRepairUtils.BuildDedicatedCardBinding(generator.cardClasses[i], i, gameManager);
                resolvedCards[i] ??= new Theme1CardGridView();
                resolvedCards[i].PullFrom(
                    runtimeBinding,
                    runtimeBinding != null ? runtimeBinding.HeaderText : null,
                    runtimeBinding != null ? runtimeBinding.BetText : null,
                    runtimeBinding != null ? runtimeBinding.WinningText : null);
                resolvedBetLabels.Add(runtimeBinding != null ? runtimeBinding.BetText : null);
                resolvedWinLabels.Add(runtimeBinding != null ? runtimeBinding.WinningText : null);
            }

            root.ReplaceCards(resolvedCards);
            if (gameManager != null)
            {
                gameManager.CardBets = resolvedBetLabels;
                gameManager.displayCardWinPoints = resolvedWinLabels;
            }

            builtRuntimeCardViews = true;
        }

        if (!builtRuntimeCardViews && cardBindings != null && generator != null)
        {
            cardBindings.PullFrom(generator);
            Theme1GameplayViewRepairUtils.EnsureCardDisplayTextBindings(cardBindings, gameManager);
            int cardCount = cardBindings.Cards != null ? cardBindings.Cards.Count : 0;
            Theme1CardGridView[] resolvedCards = new Theme1CardGridView[cardCount];
            for (int i = 0; i < cardCount; i++)
            {
                resolvedCards[i] ??= new Theme1CardGridView();
                resolvedCards[i].PullFrom(
                    cardBindings.Cards[i],
                    cardBindings.Cards[i].HeaderText,
                    cardBindings.Cards[i].BetText,
                    cardBindings.Cards[i].WinningText);
            }

            root.ReplaceCards(resolvedCards);
        }

        if (ballBindings != null && resolvedBallManager != null)
        {
            ballBindings.PullFrom(resolvedBallManager);
            Theme1BallRackView rack = new Theme1BallRackView();
            rack.PullFrom(ballBindings);
            root.ReplaceBallRack(rack);
        }

        if (gameManager != null)
        {
            Theme1GameplayViewRepairUtils.EnsureHudValueTargets(gameManager);
            gameManager.ReapplyTheme1HudState();
        }

        if (hudBindings != null)
        {
            hudBindings.PullFrom(generator, gameManager);
            Theme1HudBarView hudBar = new Theme1HudBarView();
            hudBar.PullFrom(hudBindings);
            root.ReplaceHudBar(hudBar);
        }

        if (topperManager != null)
        {
            Theme1GameplayViewRepairUtils.EnsureTopperPrizeTargets(topperManager, gameManager);
            Theme1TopperStripView strip = new Theme1TopperStripView();
            strip.PullFrom(topperManager);
            root.ReplaceTopperStrip(strip);
        }
    }

    private static bool NeedsCardBindingBootstrap(NumberGenerator generator)
    {
        if (generator?.cardClasses == null || generator.cardClasses.Length == 0)
        {
            return true;
        }

        for (int cardIndex = 0; cardIndex < generator.cardClasses.Length; cardIndex++)
        {
            CardClass card = generator.cardClasses[cardIndex];
            if (card == null ||
                card.num_text == null ||
                card.selectionImg == null ||
                card.missingPatternImg == null ||
                card.matchPatternImg == null ||
                card.num_text.Count < Theme1GameplayViewRoot.Theme1CardCellCount ||
                card.selectionImg.Count < Theme1GameplayViewRoot.Theme1CardCellCount ||
                card.missingPatternImg.Count < Theme1GameplayViewRoot.Theme1CardCellCount ||
                card.matchPatternImg.Count < Theme1GameplayViewRoot.Theme1CardCellCount)
            {
                return true;
            }

            for (int cellIndex = 0; cellIndex < Theme1GameplayViewRoot.Theme1CardCellCount; cellIndex++)
            {
                if (card.num_text[cellIndex] == null ||
                    card.selectionImg[cellIndex] == null ||
                    card.missingPatternImg[cellIndex] == null ||
                    card.matchPatternImg[cellIndex] == null)
                {
                    return true;
                }
            }
        }

        return false;
    }
}
