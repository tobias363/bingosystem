using System;
using System.Collections.Generic;
using SimpleJSON;

public partial class APIManager
{
    private Theme1RoundRenderState lastDedicatedTheme1RoundState;

    private bool ShouldUseDedicatedTheme1RealtimeView()
    {
        return useRealtimeBackend && theme1RealtimeViewMode != Theme1RealtimeViewMode.LegacyOnly;
    }

    private bool TryResolveDedicatedTheme1GameplayView(out Theme1GameplayViewRoot viewRoot)
    {
        if (!TryResolveTheme1GameplayViewContract(out viewRoot))
        {
            ReportRealtimeRenderMismatch("Theme1GameplayViewRoot mangler eller er ugyldig. Faller tilbake til legacy-render.", asError: true);
            return false;
        }

        return true;
    }
}
