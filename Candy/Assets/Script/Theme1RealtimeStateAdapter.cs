public sealed class Theme1RealtimeStateAdapter
{
    private readonly Theme1StateBuilder builder = new Theme1StateBuilder();

    public Theme1DisplayState Build(Theme1StateBuildInput input)
    {
        return Theme1DisplayState.FromRoundRenderState(builder.Build(input));
    }
}
