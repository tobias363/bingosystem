using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using TMPro;
using UnityEngine.UI;
using System;

public class GameManager : MonoBehaviour
{
    private const int DefaultStartingCredit = 1000;
    private const int BetStep = 4;
    private const int MaxBet = 20;
    private const int DefaultCardCount = 4;
    private static readonly int[] BasePatternPayouts =
    {
        200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400
    };

    public static GameManager instance;

    [Header("Testing Speed")]
    [SerializeField] private bool increaseGameSpeedInTesting = true;
    [SerializeField] [Range(1f, 5f)] private float testingSpeedMultiplier = 3.5f;
    [SerializeField] private bool hidePerCardWinLabels = true;

    public int extraBallTotal;
    public NumberGenerator numberGenerator;
    public TextMeshProUGUI displayTotalMoney;
    public TextMeshProUGUI displayCurrentBets;
    public TextMeshProUGUI winAmtText;
    public List<TextMeshProUGUI> CardBets;
    public Button btn_creditUp;
    public Button btn_creditDown;
    public List<TextMeshProUGUI> displayCurrentPoints = new List<TextMeshProUGUI>();
    public List<TextMeshProUGUI> displayCardWinPoints = new List<TextMeshProUGUI>();
    public List<AllWinPoints> allWinPoints = new List<AllWinPoints>();
    public List<int> currentWinPoints = new List<int>();
    public List<int> totalBets = new List<int>();
    public int NumberOfCard = 0;

    public int totalMoney = 0;
    public int currentBet;
    public static int winAmt;
    private readonly List<int> cardWin = new List<int>();
    public int betlevel;
    public List<int> winList;
    private bool testingSpeedApplied;
    private bool roundSettlementPending;
    private bool displayStateInitialized;

    public int CreditBalance => totalMoney;
    public int RoundWinnings => winAmt;

    private void OnEnable()
    {
        EventManager.OnPayAmt += ShowWinAmt;
        EventManager.OnPlay += OnPlay;
        EventManager.OnRoundComplete += SettleRoundWinnings;
    }

    private void OnDisable()
    {
        EventManager.OnPayAmt -= ShowWinAmt;
        EventManager.OnPlay -= OnPlay;
        EventManager.OnRoundComplete -= SettleRoundWinnings;
        RestoreTestingSpeedIfApplied();

    }

    void Awake()
    {
        instance = this;
        EnsureLegacyBetTables();
        EnsureCardWinCapacity(DefaultCardCount);
        InitializeDisplayStateIfNeeded();
        ApplyTestingSpeedIfEnabled();
    }
    // Start is called before the first frame update
    void Start()
    {
        InitializeDisplayStateIfNeeded();
        SetPerCardWinLabelVisibility(!hidePerCardWinLabels);
    }

    private void OnDestroy()
    {
        RestoreTestingSpeedIfApplied();
    }

    private void OnPlay()
    {
        if (!CanPlayCurrentBet())
        {
            Debug.LogWarning("[GameManager] Ignorerer Play fordi bet er 0.");
            RefreshBetControls();
            return;
        }

        AdjustCreditBalance(-currentBet);
        ResetRoundTracking(clearDisplayedWinnings: true);
        roundSettlementPending = true;
    }

    public void BetUp()
    {
        ApplyBetLevel(betlevel + 1);
    }

    public void BetDown()
    {
        ApplyBetLevel(betlevel - 1);
    }

    public void SetTotalMoney(int atm)
    {
        AdjustCreditBalance(atm);
    }

    public void ApplyBetLevel(int lvl)
    {
        EnsureLegacyBetTables();
        if (APIManager.instance != null &&
            APIManager.instance.UseRealtimeBackend &&
            !APIManager.instance.CanEditRealtimePreRoundSelection)
        {
            Debug.LogWarning("[GameManager] Ignorerer bet-endring mens trekningen pågår.");
            RefreshBetControls();
            return;
        }

        int maxLevel = Mathf.Max(0, totalBets.Count - 1);
        betlevel = Mathf.Clamp(lvl, 0, maxLevel);
        currentBet = totalBets.Count > 0 ? totalBets[betlevel] : 0;
        if (displayCurrentBets != null)
        {
            RealtimeTextStyleUtils.ApplyHudText(displayCurrentBets, currentBet.ToString());
        }

        APIManager.instance?.SetRealtimeEntryFeeFromGameUI(currentBet);
        for (int i = 0; i < CardBets.Count; i++)
        {
            if (CardBets[i] != null)
            {
                CardBets[i].enableAutoSizing = true;
                CardBets[i].fontSizeMin = 18;
                CardBets[i].fontSizeMax = 36;
                CardBets[i].alignment = TextAlignmentOptions.Center;
                RealtimeTextStyleUtils.ApplyHudText(CardBets[i], FormatCardStakeLabel(), preferredColor: CardBets[i].color);
            }
        }

        currentWinPoints = betlevel >= 0 && betlevel < allWinPoints.Count
            ? new List<int>(allWinPoints[betlevel].points)
            : new List<int>(BasePatternPayouts.Length);

        for (int i = 0; i < displayCurrentPoints.Count; i++)
        {
            if (displayCurrentPoints[i] != null)
            {
                RealtimeTextStyleUtils.ApplyHudText(
                    displayCurrentPoints[i],
                    GetFormattedPayoutLabel(i),
                    preferredColor: displayCurrentPoints[i].color);
            }
        }

        RefreshBetControls();
    }

    public void AddBonusPayoutToCurrentRound(int bonusAmount)
    {
        if (bonusAmount <= 0)
        {
            Debug.LogWarning($"[GameManager] Ignorerer bonus payout <= 0 ({bonusAmount}).");
            return;
        }

        AddRoundWinnings(bonusAmount);
    }

    public void AddRoundWinnings(int amount)
    {
        if (amount <= 0)
        {
            return;
        }

        if (winList == null)
        {
            winList = new List<int>();
        }

        winList.Add(amount);
        winAmt += amount;
        UpdateWinningsDisplay();
    }

    public void SettleRoundWinnings()
    {
        if (!roundSettlementPending)
        {
            return;
        }

        roundSettlementPending = false;
        if (winAmt > 0)
        {
            AdjustCreditBalance(winAmt);
        }
    }

    public int GetPayoutForPatternSlot(int payoutIndex)
    {
        if (currentWinPoints == null || payoutIndex < 0 || payoutIndex >= currentWinPoints.Count)
        {
            return 0;
        }

        return Mathf.Max(0, currentWinPoints[payoutIndex]);
    }

    public string GetFormattedPayoutLabel(int payoutIndex)
    {
        return $"{GetPayoutForPatternSlot(payoutIndex)} kr";
    }

    public bool TryGetFormattedPayoutLabel(int payoutIndex, out string label)
    {
        if (currentWinPoints == null || payoutIndex < 0 || payoutIndex >= currentWinPoints.Count)
        {
            label = string.Empty;
            return false;
        }

        label = GetFormattedPayoutLabel(payoutIndex);
        return true;
    }

    public bool CanPlayCurrentBet()
    {
        return currentBet > 0;
    }

    public void RefreshBetControls()
    {
        if (btn_creditUp != null)
        {
            btn_creditUp.interactable = totalBets.Count > 0 && betlevel < totalBets.Count - 1;
        }

        if (btn_creditDown != null)
        {
            btn_creditDown.interactable = totalBets.Count > 0 && betlevel > 0;
        }
    }

    public static int ResolvePayoutSlotIndex(int rawPatternIndex, int payoutCount)
    {
        if (payoutCount <= 0)
        {
            return -1;
        }

        int resolvedIndex = rawPatternIndex;
        if (resolvedIndex >= 5 && resolvedIndex <= 7)
        {
            resolvedIndex = 5;
        }
        else if (resolvedIndex > 7 && resolvedIndex < 13)
        {
            resolvedIndex -= 2;
        }
        else if (resolvedIndex >= 13)
        {
            resolvedIndex = payoutCount - 1;
        }

        return Mathf.Clamp(resolvedIndex, 0, payoutCount - 1);
    }

    private void ShowWinAmt(int cardNo, int index)
    {
        int payoutSlotIndex = ResolvePayoutSlotIndex(index, currentWinPoints != null ? currentWinPoints.Count : 0);
        int payoutAmount = GetPayoutForPatternSlot(payoutSlotIndex);
        if (payoutAmount <= 0)
        {
            return;
        }

        EnsureCardWinCapacity(Mathf.Max(DefaultCardCount, cardNo + 1));
        cardWin[cardNo] += payoutAmount;
        UpdateCardWinDisplay(cardNo);
        AddRoundWinnings(payoutAmount);
    }

    private void EnsureLegacyBetTables()
    {
        totalBets.Clear();
        allWinPoints.Clear();

        for (int betAmount = 0; betAmount <= MaxBet; betAmount += BetStep)
        {
            totalBets.Add(betAmount);

            int multiplier = betAmount / BetStep;
            AllWinPoints winPoints = new AllWinPoints();
            for (int i = 0; i < BasePatternPayouts.Length; i++)
            {
                winPoints.points.Add(BasePatternPayouts[i] * multiplier);
            }

            allWinPoints.Add(winPoints);
        }
    }

    private void InitializeDisplayStateIfNeeded()
    {
        if (displayStateInitialized)
        {
            return;
        }

        displayStateInitialized = true;
        SetCreditBalance(DefaultStartingCredit);
        ApplyBetLevel(betlevel);
        ResetRoundTracking(clearDisplayedWinnings: true);
    }

    private void SetCreditBalance(int amount)
    {
        totalMoney = amount;
        if (displayTotalMoney != null)
        {
            RealtimeTextStyleUtils.ApplyHudText(displayTotalMoney, totalMoney.ToString());
        }
    }

    private void AdjustCreditBalance(int amountDelta)
    {
        SetCreditBalance(totalMoney + amountDelta);
    }

    private void ResetRoundTracking(bool clearDisplayedWinnings)
    {
        if (winList == null)
        {
            winList = new List<int>();
        }
        else
        {
            winList.Clear();
        }

        if (clearDisplayedWinnings)
        {
            winAmt = 0;
            UpdateWinningsDisplay();
        }

        EnsureCardWinCapacity(Mathf.Max(DefaultCardCount, displayCardWinPoints.Count));
        for (int i = 0; i < cardWin.Count; i++)
        {
            cardWin[i] = 0;
            UpdateCardWinDisplay(i);
        }
    }

    private void UpdateWinningsDisplay()
    {
        if (winAmtText != null)
        {
            RealtimeTextStyleUtils.ApplyHudText(winAmtText, winAmt.ToString());
        }
    }

    private void EnsureCardWinCapacity(int requiredCount)
    {
        while (cardWin.Count < requiredCount)
        {
            cardWin.Add(0);
        }
    }

    private void UpdateCardWinDisplay(int cardNo)
    {
        if (cardNo < 0 || cardNo >= displayCardWinPoints.Count || displayCardWinPoints[cardNo] == null)
        {
            return;
        }

        RealtimeTextStyleUtils.ApplyHudText(
            displayCardWinPoints[cardNo],
            $"WIN - {cardWin[cardNo]}",
            preferredColor: displayCardWinPoints[cardNo].color);
    }

    private string FormatCardStakeLabel()
    {
        int cardCount = Mathf.Max(1, CardBets != null && CardBets.Count > 0 ? CardBets.Count : DefaultCardCount);
        int perCardStake = Mathf.Max(0, currentBet / cardCount);
        return $"Innsats - {perCardStake} kr";
    }

    private void SetPerCardWinLabelVisibility(bool visible)
    {
        if (displayCardWinPoints == null)
        {
            return;
        }

        for (int i = 0; i < displayCardWinPoints.Count; i++)
        {
            if (displayCardWinPoints[i] == null)
            {
                continue;
            }

            displayCardWinPoints[i].gameObject.SetActive(visible);
        }
    }

    private void ApplyTestingSpeedIfEnabled()
    {
        if (!increaseGameSpeedInTesting)
        {
            return;
        }

        if (!Application.isEditor && !Debug.isDebugBuild)
        {
            return;
        }

        float resolvedMultiplier = Mathf.Max(1f, testingSpeedMultiplier);
        Time.timeScale = resolvedMultiplier;
        testingSpeedApplied = true;
        Debug.Log($"[GameManager] Testing speed active: {resolvedMultiplier:0.##}x");
    }

    private void RestoreTestingSpeedIfApplied()
    {
        if (!testingSpeedApplied)
        {
            return;
        }

        testingSpeedApplied = false;
        Time.timeScale = 1f;
    }
}
[System.Serializable]
public class AllWinPoints
{
    public List<int> points = new List<int>();
}
