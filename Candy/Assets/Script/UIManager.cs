using System.Collections;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
public class UIManager : MonoBehaviour
{
    public Button playBtn;
    public Button autoPlayBtn;
    
    public Button betUp;
    public Button betDown;

    public Button settingsBtn;
    public GameObject settingsPanel;
    public List<Button> settingsOption;
    public List<Button> autoSpinOptions;
    public List<GameObject> autoSpinBtnHighlighter;

    public List<Sprite> optionSelection;
    public List<Sprite> optionDeSelection;

    public int autoSpinCount = 5;

    private bool IsRealtimeMode()
    {
        return APIManager.instance != null && APIManager.instance.UseRealtimeBackend;
    }

    private bool IsProductionAutoPlayBlocked()
    {
        return !Application.isEditor && !Debug.isDebugBuild;
    }

    private void OnEnable()
    {
        EventManager.OnAutoSpinOver += ActiveAllButtons;
        settingsPanel.SetActive(false);
        SelectSettingsOption(0);
        for (int i = 0; i < autoSpinOptions.Count; i++)
        {
                autoSpinBtnHighlighter[i].SetActive(false);
         }

        if (autoPlayBtn != null && IsProductionAutoPlayBlocked())
        {
            autoPlayBtn.interactable = false;
        }
    }

    private void OnDisable()
    {
        EventManager.OnAutoSpinOver -= ActiveAllButtons;
    }

    public void Play()
    {
        if (IsRealtimeMode())
        {
            playBtn.interactable = false;
            APIManager.instance.JoinOrCreateRoom();
            APIManager.instance.RequestRealtimeState();
            Invoke(nameof(ActivePlayBtn), 0.5f);
            return;
        }

        playBtn.interactable = false;
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
        settingsPanel.SetActive(false);
        SelectSettingsOption(0);
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
            APIManager.instance.RequestRealtimeState();
            return;
        }

        EventManager.isAutoSpinStart = true;
        EventManager.AutoSpinStart(autoSpinCount);
        Debug.Log(autoSpinCount);
        //ActiveAllButtons(false);
    }

    public void Settings()
    {
        settingsPanel.SetActive(true);
    }

    public void SelectSettingsOption(int index)
    {
        settingsOption[index].GetComponent<Image>().sprite = optionSelection[index];
        for (int i = 0; i < settingsOption.Count; i++)
        {
            if(i != index)
            {
                settingsOption[i].GetComponent<Image>().sprite = optionDeSelection[i];
            }
        }
    }

    public void ActivePlayBtn()
    {

            playBtn.interactable = true;
        
    }

    public void AutoSpinOptionSelection(int index)
    {
        if (index != -1)
        {
            autoSpinBtnHighlighter[index].SetActive(true);
            autoSpinCount = int.Parse(autoSpinOptions[index].transform.GetChild(0).GetComponent<TextMeshProUGUI>().text);
        }
        for (int i = 0; i < autoSpinOptions.Count; i++)
        {
            if (i != index)
            {
                autoSpinBtnHighlighter[i].SetActive(false);
            }
        }

        StartAutoSpin();
        Invoke(nameof(ClosePanel), 0.5f);
    }

    public void ClosePanel()
    {
        settingsPanel.SetActive(false);
    }


    public void ActiveAllButtons(bool isOver)
    {
        //playBtn.interactable = isOver;
        //autoPlayBtn.interactable = isOver;
        //settingsBtn.interactable = isOver;
        betUp.interactable = isOver;
        betDown.interactable = isOver;
    }
    
}
