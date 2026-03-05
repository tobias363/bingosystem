using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using TMPro;
using UnityEngine.UI;
public class TopperManager : MonoBehaviour
{
    public List<GameObject> patterns;
    public List<GameObject> matchedPatterns;
    public List<GameObject> missedPattern;
    public List<TextMeshProUGUI> prizes;

    [Header("Missing Pattern Blink")]
    [SerializeField] private Color missingPatternBlinkColor = new Color(1f, 0.87f, 0.22f, 1f);
    [SerializeField] private Color missingPrizeBlinkColor = new Color(1f, 0.92f, 0.3f, 1f);
    [SerializeField] private float missingPatternBlinkInterval = 0.2f;
    [SerializeField] private bool useSolidMissingHighlight = true;
    [SerializeField] private bool showMissingNumberInPrizeLabel = true;
    [SerializeField] private string missingNumberLabelPrefix = "Mangler";

    private readonly Dictionary<KeyValuePair<int, int>, Coroutine> missingPatternBlinkRoutines = new Dictionary<KeyValuePair<int, int>, Coroutine>();
    private readonly List<Color> defaultPrizeColors = new List<Color>();
    private readonly List<string> defaultPrizeTexts = new List<string>();
    private Sprite solidHighlightSprite;

    private void OnEnable()
    {
        EventManager.OnPlay += Reset;
        EventManager.OnMatchedPattern += ShowMatchedPattern;
        EventManager.OnMissingPattern += ShowMissingPattern;
        CacheDefaultPrizeColors();
        CacheDefaultPrizeTexts();
    }

    private void OnDisable()
    {
        EventManager.OnPlay -= Reset;
        EventManager.OnMatchedPattern -= ShowMatchedPattern;
        EventManager.OnMissingPattern -= ShowMissingPattern;

        StopAllCoroutines();
        missingPatternBlinkRoutines.Clear();
        NumberGenerator.isPrizeMissedByOneCard = false;
    }

    private void Start()
    {
        ShowAllPatterns();
        PrepareMissingPatternVisuals();
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
        for (int patternIndex = 0; patternIndex < missedPattern.Count; patternIndex++)
        {
            foreach (Transform t in missedPattern[patternIndex].transform)
            {
                t.gameObject.SetActive(false);
            }

            if (patternIndex < prizes.Count)
            {
                prizes[patternIndex].color = GetDefaultPrizeColor(patternIndex);
                prizes[patternIndex].text = GetDefaultPrizeText(patternIndex);
            }
        }
    }


    private void ShowMissingPattern(int patternIndex, int colIndex, bool active, int missingNumber)
    {
        patternIndex = GetPatternIndex(patternIndex);

        if (!TryGetMissingCell(patternIndex, colIndex, out GameObject missingCell))
        {
            return;
        }

        KeyValuePair<int, int> key = new KeyValuePair<int, int>(patternIndex, colIndex);

        if (active)
        {
            StartMissingPatternBlink(key, missingCell, missingNumber);
        }
        else
        {
            StopMissingPatternBlink(key, missingCell);
        }
    }

    private void StartMissingPatternBlink(KeyValuePair<int, int> key, GameObject missingCell, int missingNumber)
    {
        UpdatePatternMissingNumberLabel(key.Key, missingNumber);

        if (missingPatternBlinkRoutines.ContainsKey(key))
        {
            return;
        }

        missingCell.SetActive(false);
        Coroutine blinkRoutine = StartCoroutine(BlinkMissingPattern(key, missingCell));
        missingPatternBlinkRoutines.Add(key, blinkRoutine);
        NumberGenerator.isPrizeMissedByOneCard = true;
    }

    private void StopMissingPatternBlink(KeyValuePair<int, int> key, GameObject missingCell)
    {
        if (missingPatternBlinkRoutines.TryGetValue(key, out Coroutine blinkRoutine))
        {
            if (blinkRoutine != null)
            {
                StopCoroutine(blinkRoutine);
            }

            missingPatternBlinkRoutines.Remove(key);
        }

        missingCell.SetActive(false);

        if (key.Key < prizes.Count && !HasActiveBlinkForPattern(key.Key))
        {
            prizes[key.Key].color = GetDefaultPrizeColor(key.Key);
            prizes[key.Key].text = GetDefaultPrizeText(key.Key);
        }

        NumberGenerator.isPrizeMissedByOneCard = missingPatternBlinkRoutines.Count > 0;
    }

    private IEnumerator BlinkMissingPattern(KeyValuePair<int, int> key, GameObject missingCell)
    {
        bool isVisible = false;

        while (missingPatternBlinkRoutines.ContainsKey(key))
        {
            isVisible = !isVisible;
            missingCell.SetActive(isVisible);

            if (key.Key < prizes.Count)
            {
                prizes[key.Key].color = isVisible ? missingPrizeBlinkColor : GetDefaultPrizeColor(key.Key);
            }

            yield return new WaitForSeconds(missingPatternBlinkInterval);
        }

        missingCell.SetActive(false);
    }

    private bool TryGetMissingCell(int patternIndex, int colIndex, out GameObject missingCell)
    {
        missingCell = null;

        if (patternIndex < 0 || patternIndex >= missedPattern.Count)
        {
            return false;
        }

        Transform patternTransform = missedPattern[patternIndex].transform;
        if (colIndex < 0 || colIndex >= patternTransform.childCount)
        {
            return false;
        }

        missingCell = patternTransform.GetChild(colIndex).gameObject;
        return true;
    }

    private bool HasActiveBlinkForPattern(int patternIndex)
    {
        foreach (KeyValuePair<int, int> key in missingPatternBlinkRoutines.Keys)
        {
            if (key.Key == patternIndex)
            {
                return true;
            }
        }

        return false;
    }

    private void PrepareMissingPatternVisuals()
    {
        Sprite highlightSprite = useSolidMissingHighlight ? GetSolidHighlightSprite() : null;

        for (int patternIndex = 0; patternIndex < missedPattern.Count; patternIndex++)
        {
            foreach (Transform cell in missedPattern[patternIndex].transform)
            {
                Image cellImage = cell.GetComponent<Image>();
                if (cellImage == null)
                {
                    continue;
                }

                if (highlightSprite != null)
                {
                    cellImage.sprite = highlightSprite;
                    cellImage.type = Image.Type.Simple;
                    cellImage.preserveAspect = false;
                }

                cellImage.color = missingPatternBlinkColor;
            }
        }
    }

    private Sprite GetSolidHighlightSprite()
    {
        if (solidHighlightSprite != null)
        {
            return solidHighlightSprite;
        }

        Texture2D baseTexture = Texture2D.whiteTexture;
        solidHighlightSprite = Sprite.Create(baseTexture, new Rect(0, 0, 1, 1), new Vector2(0.5f, 0.5f), 1f);
        return solidHighlightSprite;
    }

    private void CacheDefaultPrizeColors()
    {
        defaultPrizeColors.Clear();

        for (int i = 0; i < prizes.Count; i++)
        {
            defaultPrizeColors.Add(prizes[i].color);
        }
    }

    private void CacheDefaultPrizeTexts()
    {
        defaultPrizeTexts.Clear();

        for (int i = 0; i < prizes.Count; i++)
        {
            defaultPrizeTexts.Add(prizes[i] != null ? prizes[i].text : string.Empty);
        }
    }

    private Color GetDefaultPrizeColor(int index)
    {
        if (index >= 0 && index < defaultPrizeColors.Count)
        {
            return defaultPrizeColors[index];
        }

        return Color.white;
    }

    private string GetDefaultPrizeText(int index)
    {
        if (index >= 0 && index < defaultPrizeTexts.Count)
        {
            return defaultPrizeTexts[index];
        }

        return string.Empty;
    }

    private void UpdatePatternMissingNumberLabel(int patternIndex, int missingNumber)
    {
        if (!showMissingNumberInPrizeLabel || missingNumber <= 0)
        {
            return;
        }

        if (patternIndex < 0 || patternIndex >= prizes.Count || prizes[patternIndex] == null)
        {
            return;
        }

        string baseLabel = GetDefaultPrizeText(patternIndex);
        string prefix = string.IsNullOrWhiteSpace(missingNumberLabelPrefix)
            ? "Mangler"
            : missingNumberLabelPrefix.Trim();
        prizes[patternIndex].text = $"{baseLabel} ({prefix} {missingNumber})";
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
        missingPatternBlinkRoutines.Clear();
        DisableAllMissedPattern();
        DisableAllMatchedPattern();
        for (int i = 0; i < prizes.Count; i++)
        {
            prizes[i].color = GetDefaultPrizeColor(i);
            prizes[i].text = GetDefaultPrizeText(i);
        }
        NumberGenerator.isPrizeMissedByOneCard = false;
    }

}
