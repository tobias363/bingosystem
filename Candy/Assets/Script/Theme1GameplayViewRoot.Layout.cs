using UnityEngine;

public sealed partial class Theme1GameplayViewRoot
{
    public Theme1LayoutMode CurrentLayoutMode => ResolveLayoutController() != null
        ? ResolveLayoutController().CurrentLayoutMode
        : Theme1LayoutMode.Desktop;

    public void SetResponsiveViewportOverride(Vector2 viewportPixels)
    {
        ResolveLayoutController()?.SetViewportOverride(viewportPixels);
    }

    public void ClearResponsiveViewportOverride()
    {
        ResolveLayoutController()?.ClearViewportOverride();
    }
}
