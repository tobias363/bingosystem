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

    private const string RealtimeRerollButtonLabel = "↻";

    private bool IsRealtimeMode()
    {
        return APIManager.instance != null && APIManager.instance.UseRealtimeBackend;
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

        playBtn.interactable = true;
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
        RefreshRealtimeRerollButtonState();

        if (IsRealtimeMode())
        {
            EnsureRealtimeStartNowButtonVisible();
        }
        else if (autoPlayBtn != null && IsProductionAutoPlayBlocked())
        {
            autoPlayBtn.interactable = false;
        }
    }

    private void OnDisable()
    {
        EventManager.OnAutoSpinOver -= ActiveAllButtons;
        if (rerollTicketBtn != null)
        {
            rerollTicketBtn.onClick.RemoveListener(OnRealtimeRerollClicked);
        }
    }

    private void Update()
    {
        RefreshRealtimeRerollButtonState();
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
                rect.sizeDelta = templateRect.sizeDelta;
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
                    label.font = templateLabel.font;
                    label.color = templateLabel.color;
                }

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

        bool shouldShow = IsRealtimeMode();
        if (rerollTicketBtn.gameObject.activeSelf != shouldShow)
        {
            rerollTicketBtn.gameObject.SetActive(shouldShow);
        }

        if (!shouldShow)
        {
            return;
        }

        rerollTicketBtn.interactable = APIManager.instance != null && APIManager.instance.CanRequestRealtimeTicketReroll();
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

    public void Play()
    {
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
            playBtn.interactable = true;
        }
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
        if (betUp != null)
        {
            betUp.interactable = isOver;
        }

        if (betDown != null)
        {
            betDown.interactable = isOver;
        }

        if (rerollTicketBtn != null && !IsRealtimeMode())
        {
            rerollTicketBtn.interactable = isOver;
        }
    }
    
}
