using UnityEngine;
using UnityEngine.UI;

[DisallowMultipleComponent]
[RequireComponent(typeof(Button))]
public sealed class Theme1ButtonRelayProxy : MonoBehaviour
{
    [SerializeField] private Button source;
    [SerializeField] private Image targetImage;

    private Button targetButton;
    private bool configured;
    private bool? lastInteractable;
    private Color? lastTargetColor;

    public void Bind(Button sourceButton, Image image)
    {
        source = sourceButton;
        targetImage = image;
        configured = false;
        EnsureConfigured();
        SyncState(force: true);
    }

    private void Awake()
    {
        EnsureConfigured();
        SyncState(force: true);
    }

    private void OnEnable()
    {
        EnsureConfigured();
        UIManager.ControlStateChanged += HandleControlStateChanged;
        GameManager.GameplayControlsStateChanged += HandleControlStateChanged;
        APIManager.RealtimeControlsStateChanged += HandleControlStateChanged;
        SyncState(force: true);
    }

    private void OnDisable()
    {
        UIManager.ControlStateChanged -= HandleControlStateChanged;
        GameManager.GameplayControlsStateChanged -= HandleControlStateChanged;
        APIManager.RealtimeControlsStateChanged -= HandleControlStateChanged;
    }

    private void HandleControlStateChanged()
    {
        SyncState();
    }

    private void EnsureConfigured()
    {
        if (configured && targetButton != null)
        {
            return;
        }

        if (targetButton == null)
        {
            targetButton = GetComponent<Button>();
        }

        if (targetButton == null)
        {
            return;
        }

        targetButton.onClick.RemoveListener(HandleClick);
        targetButton.onClick.AddListener(HandleClick);
        targetButton.transition = Selectable.Transition.None;
        if (targetImage != null)
        {
            targetButton.targetGraphic = targetImage;
        }

        configured = true;
    }

    private void SyncState(bool force = false)
    {
        if (targetButton == null)
        {
            return;
        }

        bool interactable = source != null && source.enabled && source.interactable;
        if (force || lastInteractable != interactable)
        {
            targetButton.interactable = interactable;
            lastInteractable = interactable;
        }

        if (targetImage != null)
        {
            Color resolvedColor = interactable
                ? Color.white
                : (Color)Theme1HudControlStyle.DisabledTint;
            if (force || !lastTargetColor.HasValue || lastTargetColor.Value != resolvedColor)
            {
                targetImage.color = resolvedColor;
                lastTargetColor = resolvedColor;
            }
        }
    }

    private void HandleClick()
    {
        if (source == null || !source.enabled || !source.interactable)
        {
            return;
        }

        source.onClick.Invoke();
    }
}
