using UnityEngine;

public partial class APIManager
{
    private void TryRenderTheme1IdleDisplayState()
    {
        if (hasRenderedTheme1IdleState)
        {
            return;
        }

        if (!TryResolveTheme1GameplayViewContract(out Theme1GameplayViewRoot viewRoot))
        {
            return;
        }

        NumberGenerator generator = ResolveNumberGenerator();
        BallManager resolvedBallManager = ResolveBallManager();
        GameManager gameManager = ResolveGameManager();
        Theme1DisplayState idleState = theme1LocalStateAdapter.Build(
            viewRoot,
            generator,
            resolvedBallManager,
            gameManager);
        theme1DisplayPresenter.Render(viewRoot, idleState);
        hasRenderedTheme1IdleState = HasStableTheme1IdleValues(idleState);
    }

    private void TryRenderTheme1LocalDisplayState()
    {
        if (!TryResolveTheme1GameplayViewContract(out Theme1GameplayViewRoot viewRoot))
        {
            return;
        }

        NumberGenerator generator = ResolveNumberGenerator();
        BallManager resolvedBallManager = ResolveBallManager();
        GameManager gameManager = ResolveGameManager();
        Theme1DisplayState localState = theme1LocalStateAdapter.Build(
            viewRoot,
            generator,
            resolvedBallManager,
            gameManager);
        theme1DisplayPresenter.Render(viewRoot, localState);
        hasRenderedTheme1IdleState = true;
    }

    private bool TryResolveTheme1GameplayViewContract(out Theme1GameplayViewRoot viewRoot)
    {
        viewRoot = theme1GameplayViewRoot != null ? theme1GameplayViewRoot : GetComponent<Theme1GameplayViewRoot>();
        if (viewRoot == null)
        {
            return false;
        }

        theme1GameplayViewRoot = viewRoot;
        return viewRoot.ValidateContract(out _);
    }

    private static bool HasStableTheme1IdleValues(Theme1DisplayState state)
    {
        if (state == null || state.Hud == null || state.Topper == null)
        {
            return false;
        }

        bool hasHud =
            !string.IsNullOrWhiteSpace(state.Hud.CreditLabel) &&
            !string.IsNullOrWhiteSpace(state.Hud.WinningsLabel) &&
            !string.IsNullOrWhiteSpace(state.Hud.BetLabel);
        bool hasTopper = false;
        if (state.Topper.Slots != null)
        {
            for (int i = 0; i < state.Topper.Slots.Length; i++)
            {
                if (!string.IsNullOrWhiteSpace(state.Topper.Slots[i]?.PrizeLabel))
                {
                    hasTopper = true;
                    break;
                }
            }
        }

        return hasHud && hasTopper;
    }
}
