using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
public class UIManager : MonoBehaviour
{
    public Button playBtn;
    public Button autoPlayBtn;
    
    public Button betUp;
    public Button betDown;
    public Button rerollTicketBtn;

    public Button settingsBtn;
    public GameObject settingsPanel;
    public List<Button> settingsOption;
    public List<Button> autoSpinOptions;
    public List<GameObject> autoSpinBtnHighlighter;

    public List<Sprite> optionSelection;
    public List<Sprite> optionDeSelection;

    public int autoSpinCount = 5;

    private const string RealtimeRerollButtonLabel = "Bytt alle";
    private const string RealtimeSingleCardRerollButtonLabel = "Bytt tall";
    private readonly List<Button> realtimeSingleCardRerollButtons = new();

    private bool IsRealtimeMode()
    {
        return APIManager.instance != null && APIManager.instance.UseRealtimeBackend;
    }

    private bool HasPlayableConfiguredBet()
    {
        return GameManager.instance == null || GameManager.instance.CanPlayCurrentBet();
    }

    private void RefreshLegacyPlayControlsState()
    {
        if (IsRealtimeMode())
        {
            return;
        }

        bool canPlay = HasPlayableConfiguredBet();
        if (playBtn != null && EventManager.isPlayOver)
        {
            playBtn.interactable = canPlay;
        }

        if (autoPlayBtn != null)
        {
            autoPlayBtn.interactable = canPlay && !IsProductionAutoPlayBlocked();
        }
    }

    private void ApplyPlayButtonLabel()
    {
        if (playBtn == null)
        {
            return;
        }

        TMP_Text label = playBtn.GetComponentInChildren<TMP_Text>(true);
        if (label == null)
        {
            return;
        }

        label.text = IsRealtimeMode() ? "Plasser innsats" : "Play";
    }

    private void ApplyAutoPlayButtonLabel()
    {
        if (autoPlayBtn == null)
        {
            return;
        }

        TMP_Text label = autoPlayBtn.GetComponentInChildren<TMP_Text>(true);
        if (label == null)
        {
            return;
        }

        if (IsRealtimeMode())
        {
            label.text = "Start nå";
        }
    }

    private bool IsProductionAutoPlayBlocked()
    {
        return !Application.isEditor && !Debug.isDebugBuild;
    }

    private void EnsurePlayButtonVisible()
    {
        if (playBtn == null)
        {
            return;
        }

        if (!playBtn.gameObject.activeSelf)
        {
            playBtn.gameObject.SetActive(true);
        }
    }

    private void EnsureRealtimeStartNowButtonVisible()
    {
        if (autoPlayBtn == null)
        {
            return;
        }

        if (!autoPlayBtn.gameObject.activeSelf)
        {
            autoPlayBtn.gameObject.SetActive(true);
        }

        autoPlayBtn.interactable = true;
    }

    private static bool IsValidIndex<T>(List<T> list, int index)
    {
        return list != null && index >= 0 && index < list.Count;
    }

    private void ResetAutoSpinHighlights()
    {
        if (autoSpinBtnHighlighter == null)
        {
            return;
        }

        for (int i = 0; i < autoSpinBtnHighlighter.Count; i++)
        {
            if (autoSpinBtnHighlighter[i] != null)
            {
                autoSpinBtnHighlighter[i].SetActive(false);
            }
        }
    }

    private void OnEnable()
    {
        EventManager.OnAutoSpinOver += ActiveAllButtons;
        EnsurePlayButtonVisible();
        if (settingsPanel != null)
        {
            settingsPanel.SetActive(false);
        }

        if (IsValidIndex(settingsOption, 0) &&
            IsValidIndex(optionSelection, 0) &&
            IsValidIndex(optionDeSelection, 0))
        {
            SelectSettingsOption(0);
        }

        ApplyPlayButtonLabel();
        ApplyAutoPlayButtonLabel();
        ResetAutoSpinHighlights();
        EnsureRealtimeRerollButton();
        EnsureRealtimeSingleCardRerollButtons();
        RefreshRealtimeRerollButtonState();
        RefreshRealtimeSingleCardRerollButtonsState();
        RefreshRealtimeBetControlsState();
        RefreshLegacyPlayControlsState();

        if (IsRealtimeMode())
        {
            EnsureRealtimeStartNowButtonVisible();
        }
    }

    private void OnDisable()
    {
        EventManager.OnAutoSpinOver -= ActiveAllButtons;
        if (rerollTicketBtn != null)
        {
            rerollTicketBtn.onClick.RemoveListener(OnRealtimeRerollClicked);
        }

        for (int i = 0; i < realtimeSingleCardRerollButtons.Count; i++)
        {
            if (realtimeSingleCardRerollButtons[i] != null)
            {
                realtimeSingleCardRerollButtons[i].onClick.RemoveAllListeners();
            }
        }
    }

    private void Update()
    {
        RefreshRealtimeRerollButtonState();
        RefreshRealtimeSingleCardRerollButtonsState();
        RefreshRealtimeBetControlsState();
        RefreshLegacyPlayControlsState();
    }

    private void EnsureRealtimeRerollButton()
    {
        if (!IsRealtimeMode())
        {
            if (rerollTicketBtn != null)
            {
                rerollTicketBtn.gameObject.SetActive(false);
            }
            return;
        }

        if (rerollTicketBtn == null && playBtn != null)
        {
            Transform parent = playBtn.transform.parent;
            if (parent != null)
            {
                GameObject buttonObject = new("RealtimeRerollTicketButton");
                buttonObject.transform.SetParent(parent, false);
                RectTransform rect = buttonObject.AddComponent<RectTransform>();
                Image image = buttonObject.AddComponent<Image>();
                Button button = buttonObject.AddComponent<Button>();

                RectTransform playRect = playBtn.GetComponent<RectTransform>();
                RectTransform betDownRect = betDown != null ? betDown.GetComponent<RectTransform>() : null;
                RectTransform templateRect = playRect;
                rect.anchorMin = templateRect.anchorMin;
                rect.anchorMax = templateRect.anchorMax;
                rect.pivot = templateRect.pivot;
                rect.sizeDelta = new Vector2(Mathf.Max(templateRect.sizeDelta.x, 150f), templateRect.sizeDelta.y);
                float horizontalSpacing = 16f;
                if (betDownRect != null)
                {
                    rect.anchoredPosition = betDownRect.anchoredPosition + new Vector2(-(betDownRect.sizeDelta.x + horizontalSpacing), 0f);
                }
                else
                {
                    rect.anchoredPosition = playRect.anchoredPosition + new Vector2(-(playRect.sizeDelta.x + horizontalSpacing), 0f);
                }

                Image templateImage = (betDown != null ? betDown.GetComponent<Image>() : null) ??
                                      playBtn.GetComponent<Image>();
                if (templateImage != null)
                {
                    image.sprite = templateImage.sprite;
                    image.type = templateImage.type;
                    image.pixelsPerUnitMultiplier = templateImage.pixelsPerUnitMultiplier;
                    image.color = templateImage.color;
                    image.material = templateImage.material;
                }

                Button templateButton = betDown != null ? betDown : playBtn;
                if (templateButton != null)
                {
                    button.colors = templateButton.colors;
                    button.transition = templateButton.transition;
                    button.spriteState = templateButton.spriteState;
                }

                GameObject labelObject = new("Label");
                labelObject.transform.SetParent(buttonObject.transform, false);
                RectTransform labelRect = labelObject.AddComponent<RectTransform>();
                labelRect.anchorMin = Vector2.zero;
                labelRect.anchorMax = Vector2.one;
                labelRect.offsetMin = Vector2.zero;
                labelRect.offsetMax = Vector2.zero;

                TextMeshProUGUI label = labelObject.AddComponent<TextMeshProUGUI>();
                label.alignment = TextAlignmentOptions.Center;
                label.text = RealtimeRerollButtonLabel;
                label.enableAutoSizing = true;
                label.fontSizeMin = 18f;
                label.fontSizeMax = 42f;
                label.fontSize = 30f;
                label.color = Color.white;

                TMP_Text templateLabel = (betDown != null ? betDown.GetComponentInChildren<TMP_Text>(true) : null) ??
                                         playBtn.GetComponentInChildren<TMP_Text>(true);
                if (templateLabel != null)
                {
                    label.color = templateLabel.color;
                }
                CandyTypographySystem.ApplyRole(label, CandyTypographyRole.Label);

                int playIndex = playBtn.transform.GetSiblingIndex();
                buttonObject.transform.SetSiblingIndex(Mathf.Max(0, playIndex - 1));

                rerollTicketBtn = button;
            }
        }

        if (rerollTicketBtn != null)
        {
            rerollTicketBtn.gameObject.SetActive(true);
            rerollTicketBtn.onClick.RemoveListener(OnRealtimeRerollClicked);
            rerollTicketBtn.onClick.AddListener(OnRealtimeRerollClicked);
        }
    }

    private void RefreshRealtimeRerollButtonState()
    {
        if (rerollTicketBtn == null)
        {
            return;
        }

        APIManager apiManager = APIManager.instance;
        bool shouldShow = IsRealtimeMode() && apiManager != null && apiManager.IsRealtimeRerollWindowOpen;
        if (rerollTicketBtn.gameObject.activeSelf != shouldShow)
        {
            rerollTicketBtn.gameObject.SetActive(shouldShow);
        }

        if (!shouldShow)
        {
            return;
        }

        rerollTicketBtn.interactable = apiManager != null && apiManager.CanRequestRealtimeTicketReroll();
    }

    private void OnRealtimeRerollClicked()
    {
        if (!IsRealtimeMode())
        {
            return;
        }

        APIManager.instance?.RequestRealtimeTicketReroll();
        RefreshRealtimeRerollButtonState();
    }

    private void EnsureRealtimeSingleCardRerollButtons()
    {
        if (!IsRealtimeMode() || Application.isBatchMode)
        {
            SetRealtimeSingleCardRerollButtonsVisible(false);
            return;
        }

        APIManager apiManager = APIManager.instance;
        NumberGenerator generator = FindObjectOfType<NumberGenerator>();
        RectTransform parent = playBtn != null ? playBtn.transform.parent as RectTransform : null;
        if (apiManager == null || generator == null || generator.cardClasses == null || parent == null)
        {
            return;
        }

        int buttonCount = apiManager.GetRealtimeVisibleCardCount();
        while (realtimeSingleCardRerollButtons.Count < buttonCount)
        {
            int visibleCardIndex = realtimeSingleCardRerollButtons.Count;
            realtimeSingleCardRerollButtons.Add(CreateRealtimeSingleCardRerollButton(parent, visibleCardIndex));
        }

        for (int cardIndex = 0; cardIndex < realtimeSingleCardRerollButtons.Count; cardIndex++)
        {
            Button button = realtimeSingleCardRerollButtons[cardIndex];
            if (button == null)
            {
                continue;
            }

            bool shouldExist = cardIndex < buttonCount;
            button.gameObject.SetActive(shouldExist);
            if (!shouldExist)
            {
                continue;
            }

            button.onClick.RemoveAllListeners();
            int capturedIndex = cardIndex;
            button.onClick.AddListener(() => OnRealtimeSingleCardRerollClicked(capturedIndex));
            PositionRealtimeSingleCardRerollButton(button, generator, parent, capturedIndex);
        }
    }

    private Button CreateRealtimeSingleCardRerollButton(RectTransform parent, int visibleCardIndex)
    {
        GameObject buttonObject = new($"RealtimeSingleCardRerollButton_{visibleCardIndex + 1}");
        buttonObject.transform.SetParent(parent, false);
        RectTransform rect = buttonObject.AddComponent<RectTransform>();
        rect.anchorMin = new Vector2(0.5f, 0.5f);
        rect.anchorMax = new Vector2(0.5f, 0.5f);
        rect.pivot = new Vector2(0.5f, 0.5f);
        rect.sizeDelta = new Vector2(138f, 34f);

        Image image = buttonObject.AddComponent<Image>();
        Button button = buttonObject.AddComponent<Button>();

        Image templateImage = (rerollTicketBtn != null ? rerollTicketBtn.GetComponent<Image>() : null) ??
                              (betDown != null ? betDown.GetComponent<Image>() : null) ??
                              (playBtn != null ? playBtn.GetComponent<Image>() : null);
        if (templateImage != null)
        {
            image.sprite = templateImage.sprite;
            image.type = templateImage.type;
            image.pixelsPerUnitMultiplier = templateImage.pixelsPerUnitMultiplier;
            image.color = templateImage.color;
            image.material = templateImage.material;
        }

        Button templateButton = rerollTicketBtn ?? betDown ?? playBtn;
        if (templateButton != null)
        {
            button.colors = templateButton.colors;
            button.transition = templateButton.transition;
            button.spriteState = templateButton.spriteState;
        }

        GameObject labelObject = new("Label");
        labelObject.transform.SetParent(buttonObject.transform, false);
        RectTransform labelRect = labelObject.AddComponent<RectTransform>();
        labelRect.anchorMin = Vector2.zero;
        labelRect.anchorMax = Vector2.one;
        labelRect.offsetMin = Vector2.zero;
        labelRect.offsetMax = Vector2.zero;

        TextMeshProUGUI label = labelObject.AddComponent<TextMeshProUGUI>();
        label.alignment = TextAlignmentOptions.Center;
        label.text = RealtimeSingleCardRerollButtonLabel;
        label.enableAutoSizing = true;
        label.fontSizeMin = 12f;
        label.fontSizeMax = 26f;
        label.fontSize = 20f;
        label.color = Color.white;

        TMP_Text templateLabel = (rerollTicketBtn != null ? rerollTicketBtn.GetComponentInChildren<TMP_Text>(true) : null) ??
                                 (betDown != null ? betDown.GetComponentInChildren<TMP_Text>(true) : null) ??
                                 (playBtn != null ? playBtn.GetComponentInChildren<TMP_Text>(true) : null);
        if (templateLabel != null)
        {
            label.color = templateLabel.color;
        }
        CandyTypographySystem.ApplyRole(label, CandyTypographyRole.Label);

        return button;
    }

    private void PositionRealtimeSingleCardRerollButton(
        Button button,
        NumberGenerator generator,
        RectTransform parent,
        int visibleCardIndex)
    {
        if (button == null || generator == null || generator.cardClasses == null || parent == null)
        {
            return;
        }

        if (visibleCardIndex < 0 || visibleCardIndex >= generator.cardClasses.Length)
        {
            button.gameObject.SetActive(false);
            return;
        }

        CardClass card = generator.cardClasses[visibleCardIndex];
        if (card == null || card.num_text == null || card.num_text.Count == 0)
        {
            button.gameObject.SetActive(false);
            return;
        }

        bool hasBounds = false;
        float minX = 0f;
        float maxX = 0f;
        float maxY = 0f;
        Vector3[] worldCorners = new Vector3[4];
        for (int textIndex = 0; textIndex < card.num_text.Count; textIndex++)
        {
            TextMeshProUGUI label = card.num_text[textIndex];
            if (label == null)
            {
                continue;
            }

            RectTransform labelRect = label.rectTransform;
            if (labelRect == null)
            {
                continue;
            }

            labelRect.GetWorldCorners(worldCorners);
            for (int cornerIndex = 0; cornerIndex < worldCorners.Length; cornerIndex++)
            {
                Vector3 localCorner = parent.InverseTransformPoint(worldCorners[cornerIndex]);
                if (!hasBounds)
                {
                    minX = localCorner.x;
                    maxX = localCorner.x;
                    maxY = localCorner.y;
                    hasBounds = true;
                    continue;
                }

                minX = Mathf.Min(minX, localCorner.x);
                maxX = Mathf.Max(maxX, localCorner.x);
                maxY = Mathf.Max(maxY, localCorner.y);
            }
        }

        if (!hasBounds)
        {
            button.gameObject.SetActive(false);
            return;
        }

        RectTransform buttonRect = button.GetComponent<RectTransform>();
        float cardWidth = Mathf.Max(120f, maxX - minX);
        buttonRect.sizeDelta = new Vector2(Mathf.Clamp(cardWidth * 0.6f, 128f, 170f), 34f);
        buttonRect.anchoredPosition = new Vector2((minX + maxX) * 0.5f, maxY + 20f);
        button.gameObject.SetActive(true);
    }

    private void RefreshRealtimeSingleCardRerollButtonsState()
    {
        EnsureRealtimeSingleCardRerollButtons();

        APIManager apiManager = APIManager.instance;
        bool shouldShow = IsRealtimeMode() && apiManager != null && apiManager.IsRealtimeRerollWindowOpen;
        int visibleCardCount = apiManager != null ? apiManager.GetRealtimeVisibleCardCount() : 0;
        for (int i = 0; i < realtimeSingleCardRerollButtons.Count; i++)
        {
            Button button = realtimeSingleCardRerollButtons[i];
            if (button == null)
            {
                continue;
            }

            bool showThisButton = shouldShow && i < visibleCardCount;
            if (button.gameObject.activeSelf != showThisButton)
            {
                button.gameObject.SetActive(showThisButton);
            }

            if (showThisButton)
            {
                button.interactable = apiManager.CanRequestRealtimeTicketRerollForVisibleCard(i);
            }
        }
    }

    private void SetRealtimeSingleCardRerollButtonsVisible(bool visible)
    {
        for (int i = 0; i < realtimeSingleCardRerollButtons.Count; i++)
        {
            if (realtimeSingleCardRerollButtons[i] != null)
            {
                realtimeSingleCardRerollButtons[i].gameObject.SetActive(visible);
            }
        }
    }

    private void OnRealtimeSingleCardRerollClicked(int visibleCardIndex)
    {
        if (!IsRealtimeMode())
        {
            return;
        }

        APIManager.instance?.RequestRealtimeTicketRerollForVisibleCard(visibleCardIndex);
        RefreshRealtimeSingleCardRerollButtonsState();
    }

    private void RefreshRealtimeBetControlsState()
    {
        if (!IsRealtimeMode())
        {
            return;
        }

        EnsurePlayButtonVisible();
        EnsureRealtimeStartNowButtonVisible();
        ApplyPlayButtonLabel();
        ApplyAutoPlayButtonLabel();

        APIManager apiManager = APIManager.instance;
        bool lockBetControls = apiManager != null && apiManager.IsRealtimeBetLocked;
        bool hasPlayableBet = HasPlayableConfiguredBet();
        GameManager gameManager = GameManager.instance;
        bool canIncreaseBet = gameManager == null || gameManager.betlevel < gameManager.totalBets.Count - 1;
        bool canDecreaseBet = gameManager == null || gameManager.betlevel > 0;

        if (betUp != null)
        {
            betUp.interactable = !lockBetControls && canIncreaseBet;
        }

        if (betDown != null)
        {
            betDown.interactable = !lockBetControls && canDecreaseBet;
        }

        if (playBtn != null)
        {
            playBtn.interactable = !lockBetControls && hasPlayableBet;
        }
    }

    public void Play()
    {
        if (!HasPlayableConfiguredBet())
        {
            RefreshLegacyPlayControlsState();
            return;
        }

        if (IsRealtimeMode())
        {
            if (playBtn != null)
            {
                playBtn.interactable = false;
            }

            APIManager.instance?.PlayRealtimeRound();
            Invoke(nameof(ActivePlayBtn), 0.5f);
            return;
        }

        if (playBtn != null)
        {
            playBtn.interactable = false;
        }

        if (EventManager.isPlayOver)
        {
            //Debug.Log("IsPlay Over : " + EventManager.isPlayOver);
            
            EventManager.AutoSpinStart(1);
            //ActiveAllButtons(false);  
        }
        else
        {
            
            EventManager.StartTimer();           
        }
        Invoke("ActivePlayBtn", 1);
        //EventManager.Play();
    }

    public void AutoSpin()
    {
        if (IsRealtimeMode())
        {
            StartNow();
            return;
        }

        if (!HasPlayableConfiguredBet())
        {
            RefreshLegacyPlayControlsState();
            return;
        }

        if (settingsPanel != null)
        {
            settingsPanel.SetActive(false);
        }

        if (IsValidIndex(settingsOption, 0) &&
            IsValidIndex(optionSelection, 0) &&
            IsValidIndex(optionDeSelection, 0))
        {
            SelectSettingsOption(0);
        }
    }

    public void StartAutoSpin()
    {
        if (IsProductionAutoPlayBlocked() && autoSpinCount > 1)
        {
            Debug.LogWarning("[UIManager] AutoSpin > 1 er deaktivert i production build.");
            return;
        }

        if (IsRealtimeMode())
        {
            APIManager.instance?.RequestRealtimeState();
            return;
        }

        if (!HasPlayableConfiguredBet())
        {
            RefreshLegacyPlayControlsState();
            return;
        }

        EventManager.isAutoSpinStart = true;
        EventManager.AutoSpinStart(autoSpinCount);
        Debug.Log(autoSpinCount);
        //ActiveAllButtons(false);
    }

    public void Settings()
    {
        if (settingsPanel != null)
        {
            settingsPanel.SetActive(true);
        }
    }

    public void StartNow()
    {
        if (!IsRealtimeMode())
        {
            return;
        }

        if (settingsPanel != null)
        {
            settingsPanel.SetActive(false);
        }

        APIManager.instance?.StartRealtimeRoundNow();
    }

    public void SelectSettingsOption(int index)
    {
        if (!IsValidIndex(settingsOption, index) ||
            !IsValidIndex(optionSelection, index) ||
            settingsOption[index] == null)
        {
            return;
        }

        Image selectedImage = settingsOption[index].GetComponent<Image>();
        if (selectedImage != null)
        {
            selectedImage.sprite = optionSelection[index];
        }

        for (int i = 0; i < settingsOption.Count; i++)
        {
            if (i != index &&
                IsValidIndex(optionDeSelection, i) &&
                settingsOption[i] != null)
            {
                Image image = settingsOption[i].GetComponent<Image>();
                if (image != null)
                {
                    image.sprite = optionDeSelection[i];
                }
            }
        }
    }

    public void ActivePlayBtn()
    {
        if (playBtn != null)
        {
            playBtn.interactable = IsRealtimeMode();
        }

        RefreshLegacyPlayControlsState();
    }

    public void AutoSpinOptionSelection(int index)
    {
        if (IsValidIndex(autoSpinBtnHighlighter, index) && autoSpinBtnHighlighter[index] != null)
        {
            autoSpinBtnHighlighter[index].SetActive(true);
            if (IsValidIndex(autoSpinOptions, index) && autoSpinOptions[index] != null)
            {
                Transform optionLabel = autoSpinOptions[index].transform.childCount > 0
                    ? autoSpinOptions[index].transform.GetChild(0)
                    : null;
                TextMeshProUGUI optionText = optionLabel != null ? optionLabel.GetComponent<TextMeshProUGUI>() : null;
                if (optionText != null && int.TryParse(optionText.text, out int parsedCount))
                {
                    autoSpinCount = parsedCount;
                }
            }
        }

        if (autoSpinOptions != null)
        {
            for (int i = 0; i < autoSpinOptions.Count; i++)
            {
                if (i != index && IsValidIndex(autoSpinBtnHighlighter, i) && autoSpinBtnHighlighter[i] != null)
                {
                    autoSpinBtnHighlighter[i].SetActive(false);
                }
            }
        }

        StartAutoSpin();
        if (settingsPanel != null)
        {
            Invoke(nameof(ClosePanel), 0.5f);
        }
    }

    public void ClosePanel()
    {
        if (settingsPanel != null)
        {
            settingsPanel.SetActive(false);
        }
    }


    public void ActiveAllButtons(bool isOver)
    {
        //playBtn.interactable = isOver;
        //autoPlayBtn.interactable = isOver;
        //settingsBtn.interactable = isOver;
        if (IsRealtimeMode())
        {
            RefreshRealtimeBetControlsState();
            return;
        }

        if (isOver)
        {
            GameManager.instance?.RefreshBetControls();
        }
        else
        {
            if (betUp != null)
            {
                betUp.interactable = false;
            }

            if (betDown != null)
            {
                betDown.interactable = false;
            }
        }

        if (rerollTicketBtn != null)
        {
            rerollTicketBtn.interactable = isOver;
        }

        RefreshLegacyPlayControlsState();
    }
    
}
