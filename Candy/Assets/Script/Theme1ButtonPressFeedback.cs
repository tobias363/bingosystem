using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

[DisallowMultipleComponent]
public sealed class Theme1ButtonPressFeedback : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
{
    [SerializeField] private RectTransform target;
    [SerializeField] private float pressedScale = Theme1HudControlStyle.ButtonPressedScale;
    [SerializeField] private float pressedYOffset = Theme1HudControlStyle.ButtonPressedYOffset;

    private Vector3 releasedScale = Vector3.one;
    private Vector2 releasedPosition;
    private bool initialized;

    public void Bind(RectTransform pressTarget)
    {
        target = pressTarget;
        CaptureReleasedState(force: true);
        ApplyReleasedState();
    }

    private void Awake()
    {
        CaptureReleasedState(force: false);
    }

    private void OnEnable()
    {
        CaptureReleasedState(force: false);
        ApplyReleasedState();
    }

    private void OnDisable()
    {
        ApplyReleasedState();
    }

    public void OnPointerDown(PointerEventData eventData)
    {
        if (!IsInteractable())
        {
            return;
        }

        CaptureReleasedState(force: false);
        if (target == null)
        {
            return;
        }

        target.localScale = releasedScale * pressedScale;
        target.anchoredPosition = releasedPosition + new Vector2(0f, pressedYOffset);
    }

    public void OnPointerUp(PointerEventData eventData)
    {
        ApplyReleasedState();
    }

    public void OnPointerExit(PointerEventData eventData)
    {
        ApplyReleasedState();
    }

    private bool IsInteractable()
    {
        Button button = GetComponent<Button>();
        return button == null || button.IsInteractable();
    }

    private void CaptureReleasedState(bool force)
    {
        if (target == null)
        {
            target = transform as RectTransform;
        }

        if (target == null)
        {
            return;
        }

        if (!initialized || force)
        {
            releasedScale = target.localScale;
            releasedPosition = target.anchoredPosition;
            initialized = true;
        }
    }

    private void ApplyReleasedState()
    {
        if (target == null)
        {
            target = transform as RectTransform;
        }

        if (target == null)
        {
            return;
        }

        CaptureReleasedState(force: false);
        target.localScale = releasedScale;
        target.anchoredPosition = releasedPosition;
    }
}
