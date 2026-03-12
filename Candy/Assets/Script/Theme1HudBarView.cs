using System;
using TMPro;
using UnityEngine;

[Serializable]
public sealed class Theme1HudBarView
{
    [SerializeField] private TextMeshProUGUI countdownText;
    [SerializeField] private TextMeshProUGUI roomPlayerCountText;
    [SerializeField] private TextMeshProUGUI creditText;
    [SerializeField] private TextMeshProUGUI winningsText;
    [SerializeField] private TextMeshProUGUI betText;

    public TextMeshProUGUI CountdownText => countdownText;
    public TextMeshProUGUI RoomPlayerCountText => roomPlayerCountText;
    public TextMeshProUGUI CreditText => creditText;
    public TextMeshProUGUI WinningsText => winningsText;
    public TextMeshProUGUI BetText => betText;

    public void PullFrom(CandyTheme1HudBindingSet hudBindings)
    {
        countdownText = hudBindings != null ? hudBindings.CountdownText : null;
        roomPlayerCountText = hudBindings != null ? hudBindings.RoomPlayerCountText : null;
        creditText = hudBindings != null ? hudBindings.CreditText : null;
        winningsText = hudBindings != null ? hudBindings.WinningsText : null;
        betText = hudBindings != null ? hudBindings.BetText : null;
    }
}
