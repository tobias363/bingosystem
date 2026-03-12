using TMPro;
using UnityEngine;
using UnityEngine.UI;

[ExecuteAlways]
[RequireComponent(typeof(Text))]
public sealed class Theme1VisibleTextBridge : MonoBehaviour
{
    [SerializeField] private TMP_Text source;
    [SerializeField] private bool hideWhenSourceInactive = true;
    [SerializeField] private bool hideWhenSourceBlank;
    [SerializeField] private Color colorOverride = new Color(0f, 0f, 0f, 0f);

    private Text target;
    private string lastText = string.Empty;
    private bool lastShouldHide = true;
    private Vector2 lastAnchoredPosition = new(float.NaN, float.NaN);
    private Vector2 lastSizeDelta = new(float.NaN, float.NaN);
    private Color lastColor = new(0f, 0f, 0f, 0f);
    private FontStyle lastFontStyle = (FontStyle)(-1);
    private int lastFontSize = -1;
    private TextAnchor lastAlignment = (TextAnchor)(-1);

    public TMP_Text Source => source;

    public void Bind(TMP_Text sourceLabel, bool hideBlank, Color preferredColor)
    {
        source = sourceLabel;
        hideWhenSourceBlank = hideBlank;
        colorOverride = preferredColor;
        EnsureConfigured();
        SyncNow();
    }

    private void Awake()
    {
        EnsureConfigured();
        SyncNow();
    }

    private void OnEnable()
    {
        EnsureConfigured();
        SyncNow();
    }

    private void LateUpdate()
    {
        SyncNow();
    }

    private void EnsureConfigured()
    {
        if (target == null)
        {
            target = GetComponent<Text>();
        }

        if (target == null)
        {
            return;
        }

        Theme1TextMirrorCommon.EnsureTarget(
            target,
            preferredFont: null,
            color: colorOverride.a > 0f ? colorOverride : Color.white,
            minFontSize: 12,
            maxFontSize: 64);
    }

    public void SyncNow()
    {
        EnsureConfigured();
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
            return;
        }

        string value = source.text ?? string.Empty;
        bool shouldHide = Theme1TextMirrorCommon.ShouldHide(source, hideWhenSourceInactive, hideWhenSourceBlank, value);
        string nextText = shouldHide ? string.Empty : value;

        bool rectChanged = Theme1TextMirrorCommon.CopyRectTransformIfChanged(source, target, ref lastAnchoredPosition, ref lastSizeDelta);
        bool formattingChanged = Theme1TextMirrorCommon.ApplySourceFormattingIfChanged(
            target,
            source,
            useColorOverride: colorOverride.a > 0f,
            colorOverride,
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
}
