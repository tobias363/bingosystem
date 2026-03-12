using TMPro;
using UnityEngine;
using UnityEngine.UI;

public sealed class Theme1CellPulseController : MonoBehaviour
{
    [SerializeField] private RectTransform numberTarget;
    [SerializeField] private RectTransform prizeTarget;
    [SerializeField] private RectTransform glowTarget;
    [SerializeField] private Graphic glowGraphic;

    private bool pulsing;
    private Vector3 numberBaseScale = Vector3.one;
    private Vector3 prizeBaseScale = Vector3.one;
    private Vector3 glowBaseScale = Vector3.one;
    private float timeOffset;
    private Vector2 numberBasePosition;
    private Vector2 prizeBasePosition;
    private bool hasPreviewEmphasis;
    private float previewEmphasis;
    private RectTransform cellRoot;
    private int originalSiblingIndex = -1;
    private bool promotedToFront;

    public void Bind(TMP_Text numberLabel, TMP_Text prizeLabel, Graphic glow)
    {
        cellRoot = transform as RectTransform;
        numberTarget = numberLabel != null ? numberLabel.rectTransform : null;
        prizeTarget = prizeLabel != null ? prizeLabel.rectTransform : null;
        glowGraphic = glow;
        glowTarget = glowGraphic != null ? glowGraphic.rectTransform : null;
        originalSiblingIndex = cellRoot != null ? cellRoot.GetSiblingIndex() : -1;
        promotedToFront = false;
        numberBaseScale = numberTarget != null ? numberTarget.localScale : Vector3.one;
        prizeBaseScale = prizeTarget != null ? prizeTarget.localScale : Vector3.one;
        glowBaseScale = glowTarget != null ? glowTarget.localScale : Vector3.one;
        numberBasePosition = numberTarget != null ? numberTarget.anchoredPosition : Vector2.zero;
        prizeBasePosition = prizeTarget != null ? prizeTarget.anchoredPosition : Vector2.zero;
        timeOffset = Mathf.Abs(GetInstanceID() * 0.03125f);
        ResetVisuals();
    }

    public void SetPulsing(bool active)
    {
        if (pulsing == active)
        {
            if (!active && !hasPreviewEmphasis)
            {
                ResetVisuals();
            }

            return;
        }

        pulsing = active;
        if (!pulsing && !hasPreviewEmphasis)
        {
            ResetVisuals();
        }
    }

    public void SetPreviewEmphasis(float? emphasis)
    {
        if (emphasis.HasValue)
        {
            hasPreviewEmphasis = true;
            previewEmphasis = Mathf.Clamp01(emphasis.Value);
            ApplyPulse(previewEmphasis);
            return;
        }

        hasPreviewEmphasis = false;
        if (!pulsing)
        {
            ResetVisuals();
        }
    }

    private void LateUpdate()
    {
        if (hasPreviewEmphasis)
        {
            ApplyPulse(previewEmphasis);
            return;
        }

        if (!pulsing)
        {
            return;
        }

        float cycle = Mathf.Repeat((Time.unscaledTime + timeOffset) / Theme1BongStyle.PulseDuration, 1f);
        float emphasis = EvaluateCssPulse(cycle);
        ApplyPulse(emphasis);
    }

    private void ApplyPulse(float emphasis)
    {
        PromoteCellRootIfNeeded();
        float contentScale = Mathf.Lerp(1f, Theme1BongStyle.PulseContentScaleMax, emphasis);
        float glowScale = Mathf.Lerp(Theme1BongStyle.PulseGlowScaleMin, Theme1BongStyle.PulseGlowScaleMax, emphasis);
        float glowAlpha = Mathf.Lerp(Theme1BongStyle.PulseGlowAlphaMin, Theme1BongStyle.PulseGlowAlphaMax, emphasis);

        if (numberTarget != null)
        {
            numberTarget.localScale = numberBaseScale * contentScale;
            numberTarget.anchoredPosition = numberBasePosition + new Vector2(0f, Theme1BongStyle.PulseNumberOffsetY);
        }

        if (prizeTarget != null)
        {
            prizeTarget.localScale = prizeBaseScale * contentScale;
            prizeTarget.anchoredPosition = prizeBasePosition;
        }

        if (glowTarget != null)
        {
            glowTarget.localScale = glowBaseScale * glowScale;
        }

        if (glowGraphic != null)
        {
            if (!glowGraphic.enabled)
            {
                glowGraphic.enabled = true;
            }

            Color color = glowGraphic.color;
            color.a = glowAlpha;
            glowGraphic.color = color;
            Theme1RuntimeMaterialCatalog.ApplyCellGlowPulse(glowGraphic, emphasis);
        }
    }

    private void OnDisable()
    {
        hasPreviewEmphasis = false;
        ResetVisuals();
    }

    private void ResetVisuals()
    {
        RestoreCellRootSibling();
        if (numberTarget != null)
        {
            numberTarget.localScale = numberBaseScale;
            numberTarget.anchoredPosition = numberBasePosition;
        }

        if (prizeTarget != null)
        {
            prizeTarget.localScale = prizeBaseScale;
            prizeTarget.anchoredPosition = prizeBasePosition;
        }

        if (glowTarget != null)
        {
            glowTarget.localScale = glowBaseScale;
        }

        if (glowGraphic != null)
        {
            Color color = glowGraphic.color;
            color.a = 0f;
            glowGraphic.color = color;
            glowGraphic.enabled = false;
            Theme1RuntimeMaterialCatalog.ApplyCellGlowPulse(glowGraphic, 0f);
        }
    }

    private void PromoteCellRootIfNeeded()
    {
        if (promotedToFront || cellRoot == null || cellRoot.parent == null)
        {
            return;
        }

        originalSiblingIndex = cellRoot.GetSiblingIndex();
        cellRoot.SetAsLastSibling();
        promotedToFront = true;
    }

    private void RestoreCellRootSibling()
    {
        if (!promotedToFront || cellRoot == null || cellRoot.parent == null)
        {
            return;
        }

        if (!cellRoot.gameObject.activeInHierarchy || !cellRoot.parent.gameObject.activeInHierarchy)
        {
            promotedToFront = false;
            return;
        }

        int maxIndex = Mathf.Max(0, cellRoot.parent.childCount - 1);
        cellRoot.SetSiblingIndex(Mathf.Clamp(originalSiblingIndex, 0, maxIndex));
        promotedToFront = false;
    }

    private static float EvaluateCssPulse(float cycle)
    {
        if (cycle <= Theme1BongStyle.PulsePeak)
        {
            return EaseCssCurve(cycle / Theme1BongStyle.PulsePeak);
        }

        return 1f - EaseCssCurve((cycle - Theme1BongStyle.PulsePeak) / (1f - Theme1BongStyle.PulsePeak));
    }

    private static float EaseCssCurve(float t)
    {
        return SampleCubicBezierY(t, 0.22f, 1f, 0.36f, 1f);
    }

    private static float SampleCubicBezierY(float x, float x1, float y1, float x2, float y2)
    {
        x = Mathf.Clamp01(x);
        float t = x;
        for (int i = 0; i < 5; i++)
        {
            float currentX = CubicBezier(t, 0f, x1, x2, 1f);
            float derivative = CubicBezierDerivative(t, 0f, x1, x2, 1f);
            if (Mathf.Abs(derivative) < 0.0001f)
            {
                break;
            }

            t -= (currentX - x) / derivative;
            t = Mathf.Clamp01(t);
        }

        return CubicBezier(t, 0f, y1, y2, 1f);
    }

    private static float CubicBezier(float t, float p0, float p1, float p2, float p3)
    {
        float inv = 1f - t;
        return (inv * inv * inv * p0) +
               (3f * inv * inv * t * p1) +
               (3f * inv * t * t * p2) +
               (t * t * t * p3);
    }

    private static float CubicBezierDerivative(float t, float p0, float p1, float p2, float p3)
    {
        float inv = 1f - t;
        return (3f * inv * inv * (p1 - p0)) +
               (6f * inv * t * (p2 - p1)) +
               (3f * t * t * (p3 - p2));
    }
}
