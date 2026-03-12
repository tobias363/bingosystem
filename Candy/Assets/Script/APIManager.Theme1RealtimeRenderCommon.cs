using System;
using System.Collections.Generic;
using TMPro;

public partial class APIManager
{
    private static int[] ToSortedArray(HashSet<int> values)
    {
        if (values == null || values.Count == 0)
        {
            return Array.Empty<int>();
        }

        int[] result = new int[values.Count];
        values.CopyTo(result);
        Array.Sort(result);
        return result;
    }

    private static int TryParsePositiveInt(string value)
    {
        return int.TryParse(value, out int parsed) && parsed > 0 ? parsed : 0;
    }

    private static string ReadText(TMP_Text label)
    {
        return label != null ? (label.text ?? string.Empty) : string.Empty;
    }
}
