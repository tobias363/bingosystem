using System;
using System.Collections.Generic;
using UnityEngine;

public readonly struct CandyBallVisual
{
    public CandyBallVisual(Sprite smallSprite, Sprite bigSprite)
    {
        SmallSprite = smallSprite;
        BigSprite = bigSprite;
    }

    public Sprite SmallSprite { get; }
    public Sprite BigSprite { get; }
}

public static class CandyBallVisualCatalog
{
    private const string ResourcePath = "CandyBallSprites";
    public const int ExpectedBallCount = 60;
    private static readonly Dictionary<int, CandyBallVisual> VisualsByNumber = new Dictionary<int, CandyBallVisual>();
    private static readonly HashSet<int> MissingVisualWarnings = new HashSet<int>();
    private static bool loaded;

    public static int Count
    {
        get
        {
            EnsureLoaded();
            return VisualsByNumber.Count;
        }
    }

    public static bool TryGetVisual(int ballNumber, out CandyBallVisual visual)
    {
        if (ballNumber < 1 || ballNumber > ExpectedBallCount)
        {
            visual = default;
            return false;
        }

        EnsureLoaded();
        return VisualsByNumber.TryGetValue(ballNumber, out visual);
    }

    public static bool TryGetSmallSprite(int ballNumber, out Sprite sprite)
    {
        if (TryGetVisual(ballNumber, out CandyBallVisual visual))
        {
            sprite = visual.SmallSprite;
            return sprite != null;
        }

        sprite = null;
        return false;
    }

    public static bool TryGetBigSprite(int ballNumber, out Sprite sprite)
    {
        if (TryGetVisual(ballNumber, out CandyBallVisual visual))
        {
            sprite = visual.BigSprite != null ? visual.BigSprite : visual.SmallSprite;
            return sprite != null;
        }

        sprite = null;
        return false;
    }

    public static void ClearCache()
    {
        loaded = false;
        VisualsByNumber.Clear();
        MissingVisualWarnings.Clear();
    }

    public static void LogMissingVisual(int ballNumber, string context)
    {
        if (ballNumber <= 0 || MissingVisualWarnings.Contains(ballNumber))
        {
            return;
        }

        MissingVisualWarnings.Add(ballNumber);
        Debug.LogError($"[CandyBallVisualCatalog] Mangler ball-sprite for nummer {ballNumber} ({context}).");
    }

    public static bool TryValidateComplete(out string error)
    {
        EnsureLoaded();
        List<int> missingNumbers = new List<int>();
        for (int ballNumber = 1; ballNumber <= ExpectedBallCount; ballNumber++)
        {
            if (!VisualsByNumber.ContainsKey(ballNumber))
            {
                missingNumbers.Add(ballNumber);
            }
        }

        if (missingNumbers.Count == 0)
        {
            error = string.Empty;
            return true;
        }

        error =
            $"CandyBallVisualCatalog er ufullstendig. Mangler {missingNumbers.Count} ball-sprites: " +
            string.Join(", ", missingNumbers);
        return false;
    }

    private static void EnsureLoaded()
    {
        if (loaded)
        {
            return;
        }

        loaded = true;
        VisualsByNumber.Clear();
        Sprite[] sprites = Resources.LoadAll<Sprite>(ResourcePath);
        if (sprites == null || sprites.Length == 0)
        {
            Debug.LogError("[CandyBallVisualCatalog] Fant ingen sprites i Resources/CandyBallSprites.");
            return;
        }

        for (int i = 0; i < sprites.Length; i++)
        {
            Sprite sprite = sprites[i];
            if (sprite == null || !TryExtractBallNumber(sprite.name, out int ballNumber) || ballNumber <= 0)
            {
                continue;
            }

            if (ballNumber > ExpectedBallCount)
            {
                continue;
            }

            if (!VisualsByNumber.ContainsKey(ballNumber))
            {
                VisualsByNumber.Add(ballNumber, new CandyBallVisual(sprite, sprite));
            }
        }

        if (!TryValidateComplete(out string error))
        {
            Debug.LogError("[CandyBallVisualCatalog] " + error);
        }
    }

    private static bool TryExtractBallNumber(string spriteName, out int ballNumber)
    {
        ballNumber = 0;
        if (string.IsNullOrWhiteSpace(spriteName))
        {
            return false;
        }

        int start = -1;
        int end = -1;
        for (int i = 0; i < spriteName.Length; i++)
        {
            if (!char.IsDigit(spriteName[i]))
            {
                if (start >= 0)
                {
                    end = i;
                    break;
                }

                continue;
            }

            if (start < 0)
            {
                start = i;
            }
        }

        if (start < 0)
        {
            return false;
        }

        if (end < 0)
        {
            end = spriteName.Length;
        }

        return int.TryParse(spriteName.Substring(start, end - start), out ballNumber);
    }
}
