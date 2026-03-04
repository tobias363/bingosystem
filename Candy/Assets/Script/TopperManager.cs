using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using TMPro;
public class TopperManager : MonoBehaviour
{
    public List<GameObject> patterns;
    public List<GameObject> matchedPatterns;
    public List<GameObject> missedPattern;
    public List<TextMeshProUGUI> prizes;
    private Color prizeColor = new Color();
    private List<KeyValuePair<int, int>> patternHighlightList = new List<KeyValuePair<int, int>> ();
    private List<Coroutine> blinkMissingPattern = new List<Coroutine>();

    private void OnEnable()
    {
        EventManager.OnPlay += Reset;
        EventManager.OnMatchedPattern += ShowMatchedPattern;
        EventManager.OnMissingPattern += ShowMissingPattern;

        prizeColor = prizes[0].color;
    }

    private void OnDisable()
    {
        EventManager.OnPlay -= Reset;
        EventManager.OnMatchedPattern -= ShowMatchedPattern;
        EventManager.OnMissingPattern -= ShowMissingPattern;
    }

    private void Start()
    {
        ShowAllPatterns();
        DisableAllMatchedPattern();
        DisableAllMissedPattern();

    }

    private void ShowAllPatterns()
    {
        for (int i = 0; i < patterns.Count; i++)
        {
            ShowPattern(i, true);
        }
    }
    private void ShowPattern(int index, bool active)
    {
        patterns[index].SetActive(active);
    }


    private void DisableAllMatchedPattern()
    {
        for (int i = 0; i < matchedPatterns.Count; i++)
        {
            matchedPatterns[i].SetActive(false);
        }
    }
    private void ShowMatchedPattern(int index, bool active)
    {
        StartCoroutine(BlinkPattern(index, active));
    }
    private IEnumerator BlinkPattern(int index, bool active)
    {
        matchedPatterns[index].SetActive(true);
        index = GetPatternIndex(index);
        prizes[index].color = Color.green;

        yield return new WaitForSeconds(0.2f);
    }


    private void DisableAllMissedPattern()
    {
        for (int i = 0; i < missedPattern.Count; i++)
        {
            foreach (Transform t in missedPattern[i].transform)
            {
                t.gameObject.SetActive(false);
            }
        }
    }


    private void ShowMissingPattern(int patternIndex, int colIndex, bool active)
    {
        patternIndex = GetPatternIndex(patternIndex);
       
        // Debug.Log("pat " + patternIndex);

        if (!patternHighlightList.Contains(new KeyValuePair<int, int>(patternIndex, colIndex)))
        {
            patternHighlightList.Add(new KeyValuePair<int, int>(patternIndex, colIndex));
            Coroutine _blinkMissingPattern = StartCoroutine(BlinkMissingPattern(patternIndex, colIndex, active));
            blinkMissingPattern.Add(_blinkMissingPattern);
        }
        else
        {
            if(active == false)
            {
                int index = patternHighlightList.FindIndex(a => a.Key == patternIndex && a.Value == colIndex);
                missedPattern[patternIndex].transform.GetChild(colIndex).gameObject.SetActive(false);
                prizes[patternIndex].color = Color.green;

                if (blinkMissingPattern[index] == null)
                    return;
                StopCoroutine(blinkMissingPattern[index]);
                patternHighlightList.RemoveAt(index);
                blinkMissingPattern.RemoveAt(index);
                NumberGenerator.isPrizeMissedByOneCard = false;
            }
        }
        
    }

    IEnumerator BlinkMissingPattern(int patternIndex, int colIndex, bool active)
    {
        Color prizeColor = prizes[patternIndex].color;
        while (active )
        {
            NumberGenerator.isPrizeMissedByOneCard = true;
            missedPattern[patternIndex].transform.GetChild(colIndex).gameObject.SetActive(true);
            prizes[patternIndex].color = Color.black;
            yield return new WaitForSeconds(0.2f);

            missedPattern[patternIndex].transform.GetChild(colIndex).gameObject.SetActive(false);
            prizes[patternIndex].color = prizeColor;
            yield return new WaitForSeconds(0.2f);
        }
        missedPattern[patternIndex].transform.GetChild(colIndex).gameObject.SetActive(false);
        prizes[patternIndex].color = prizeColor;
    }


    public int GetPatternIndex(int index)
    {
        if (index >= 5 && index <= 7) //For 2L
        {
            index = 5;
        }
        else if (index > 7 && index < 13)
        {
            index = index - 2;
        }
        else if (index >= 13) //For 1L
        {
            index = missedPattern.Count - 1;
        }
        return index;
    }

    private void Reset()
    {
        StopAllCoroutines();

        if (blinkMissingPattern.Count != 0)
            blinkMissingPattern.Clear();
        if (patternHighlightList.Count != 0)
            patternHighlightList.Clear();
        DisableAllMissedPattern();
        DisableAllMatchedPattern();
        for (int i = 0; i < prizes.Count; i++)
        {
            prizes[i].color = prizeColor;

        }
    }

}
