using TMPro;
using UnityEngine;
using UnityEngine.UI;

[ExecuteAlways]
[RequireComponent(typeof(Text))]
public sealed class Theme1HudTextMirror : MonoBehaviour
{
    private const string FredokaResourcePath = "CandyTypography/Fredoka/Fredoka-Medium";

    [SerializeField] private TMP_Text source;
    [SerializeField] private bool hideWhenBlank;
    [SerializeField] private bool countdownOnly;

    private Text target;
    private static Font cachedFont;
    private string lastText = string.Empty;
    private bool lastShouldHide = true;
    private Vector2 lastAnchoredPosition = new(float.NaN, float.NaN);
    private Vector2 lastSizeDelta = new(float.NaN, float.NaN);
    private Color lastColor = new(0f, 0f, 0f, 0f);
    private FontStyle lastFontStyle = (FontStyle)(-1);
    private int lastFontSize = -1;
    private TextAnchor lastAlignment = (TextAnchor)(-1);

    public void Bind(TMP_Text sourceLabel, bool hideBlank, bool useCountdownFormatting, Color color, int minFontSize, int maxFontSize)
    {
        source = sourceLabel;
        hideWhenBlank = hideBlank;
        countdownOnly = useCountdownFormatting;
        EnsureConfigured(color, minFontSize, maxFontSize);
        SyncNow();
    }

    private void Awake()
    {
        EnsureConfigured(Color.white, 10, 18);
        SyncNow();
    }

    private void OnEnable()
    {
        EnsureConfigured(Color.white, 10, 18);
        SyncNow();
    }

    private void LateUpdate()
    {
        SyncNow();
    }

    private void EnsureConfigured(Color color, int minFontSize, int maxFontSize)
    {
        if (target == null)
        {
            target = GetComponent<Text>();
        }

        if (target == null)
        {
            return;
        }

        if (cachedFont == null)
        {
            cachedFont = Resources.Load<Font>(FredokaResourcePath);
        }

        Theme1TextMirrorCommon.EnsureTarget(
            target,
            cachedFont,
            color,
            minFontSize,
            maxFontSize);
    }

    public void SyncNow()
    {
        if (target == null)
        {
            return;
        }

        if (Application.isPlaying && Theme1ManagedTypographyRegistry.BelongsToTheme1Presentation(source))
        {
            Theme1TextMirrorCommon.ApplyVisibility(target, true);
            target.text = string.Empty;
            enabled = false;
            return;
        }

        if (source == null)
        {
            if (!string.Equals(target.text, string.Empty))
            {
                target.text = string.Empty;
            }
            Theme1TextMirrorCommon.ApplyVisibility(target, true);
            return;
        }

        string value = NormalizeValue(source.text ?? string.Empty);
        bool shouldHide = Theme1TextMirrorCommon.ShouldHide(source, hideWhenSourceInactive: false, hideWhenBlank, value);
        string nextText = shouldHide ? string.Empty : value;
        bool rectChanged = Theme1TextMirrorCommon.CopyRectTransformIfChanged(source, target, ref lastAnchoredPosition, ref lastSizeDelta);
        bool formattingChanged = Theme1TextMirrorCommon.ApplySourceFormattingIfChanged(
            target,
            source,
            useColorOverride: false,
            Color.white,
            ref lastColor,
            ref lastFontStyle,
            ref lastFontSize,
            ref lastAlignment);
        if (!string.Equals(lastText, nextText, System.StringComparison.Ordinal))
        {
            target.text = nextText;
            lastText = nextText;
        }

        if (lastShouldHide != shouldHide)
        {
            Theme1TextMirrorCommon.ApplyVisibility(target, shouldHide);
            lastShouldHide = shouldHide;
        }
        else if (rectChanged || formattingChanged)
        {
            Theme1TextMirrorCommon.ApplyVisibility(target, shouldHide);
        }
    }

    private string NormalizeValue(string rawValue)
    {
        if (!countdownOnly)
        {
            return rawValue;
        }

        string[] lines = rawValue.Split('\n');
        for (int i = lines.Length - 1; i >= 0; i--)
        {
            string line = lines[i].Trim();
            if (LooksLikeCountdown(line))
            {
                return line;
            }
        }

        return string.Empty;
    }

    private static bool LooksLikeCountdown(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        if (value.Length != 5 || value[2] != ':')
        {
            return false;
        }

        return char.IsDigit(value[0]) &&
               char.IsDigit(value[1]) &&
               char.IsDigit(value[3]) &&
               char.IsDigit(value[4]);
    }
}
