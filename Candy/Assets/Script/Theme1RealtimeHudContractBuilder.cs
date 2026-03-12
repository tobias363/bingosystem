internal static class Theme1RealtimeHudContractBuilder
{
    public static void EnsureHudValueTargets(GameManager gameManager)
    {
        if (gameManager == null)
        {
            return;
        }

        gameManager.displayTotalMoney = Theme1OverlayLabelFactory.EnsureDedicatedHudValueTarget(
            gameManager.displayTotalMoney,
            Theme1GameplayViewRepairUtils.CreditValueLabelName,
            gameManager.CreditBalance.ToString());
        gameManager.winAmtText = Theme1OverlayLabelFactory.EnsureDedicatedHudValueTarget(
            gameManager.winAmtText,
            Theme1GameplayViewRepairUtils.WinningsValueLabelName,
            gameManager.RoundWinnings.ToString());
        gameManager.displayCurrentBets = Theme1OverlayLabelFactory.EnsureDedicatedHudValueTarget(
            gameManager.displayCurrentBets,
            Theme1GameplayViewRepairUtils.BetValueLabelName,
            gameManager.currentBet.ToString());

        Theme1OverlayLabelFactory.ApplyOverlayLabelDefault(gameManager.displayTotalMoney, gameManager.CreditBalance.ToString());
        Theme1OverlayLabelFactory.ApplyOverlayLabelDefault(gameManager.winAmtText, gameManager.RoundWinnings.ToString());
        Theme1OverlayLabelFactory.ApplyOverlayLabelDefault(gameManager.displayCurrentBets, gameManager.currentBet.ToString());
    }
}
