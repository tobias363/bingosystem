using System;

public sealed class Theme1DisplayState
{
    public string GameId = string.Empty;
    public Theme1CardRenderState[] Cards = Array.Empty<Theme1CardRenderState>();
    public Theme1BallRackRenderState BallRack = new Theme1BallRackRenderState();
    public Theme1HudRenderState Hud = new Theme1HudRenderState();
    public Theme1TopperRenderState Topper = new Theme1TopperRenderState();

    public static Theme1DisplayState CreateEmpty(int cardCount, int ballSlotCount, int topperSlotCount)
    {
        Theme1DisplayState state = new Theme1DisplayState
        {
            Cards = new Theme1CardRenderState[Math.Max(0, cardCount)],
            BallRack = Theme1BallRackRenderState.CreateEmpty(ballSlotCount),
            Topper = Theme1TopperRenderState.CreateEmpty(topperSlotCount)
        };

        for (int i = 0; i < state.Cards.Length; i++)
        {
            state.Cards[i] = Theme1CardRenderState.CreateEmpty();
        }

        return state;
    }

    public static Theme1DisplayState FromRoundRenderState(Theme1RoundRenderState source)
    {
        if (source == null)
        {
            return CreateEmpty(0, 0, 0);
        }

        Theme1DisplayState state = CreateEmpty(
            source.Cards != null ? source.Cards.Length : 0,
            source.BallRack?.Slots != null ? source.BallRack.Slots.Length : 0,
            source.Topper?.Slots != null ? source.Topper.Slots.Length : 0);
        state.GameId = source.GameId ?? string.Empty;
        state.Hud = source.Hud ?? new Theme1HudRenderState();
        state.BallRack = source.BallRack ?? Theme1BallRackRenderState.CreateEmpty(0);
        state.Topper = source.Topper ?? Theme1TopperRenderState.CreateEmpty(0);

        if (source.Cards != null)
        {
            for (int i = 0; i < source.Cards.Length && i < state.Cards.Length; i++)
            {
                state.Cards[i] = source.Cards[i] ?? Theme1CardRenderState.CreateEmpty();
            }
        }

        return state;
    }

    public Theme1RoundRenderState ToRoundRenderState()
    {
        Theme1RoundRenderState state = Theme1RoundRenderState.CreateEmpty(
            Cards != null ? Cards.Length : 0,
            BallRack?.Slots != null ? BallRack.Slots.Length : 0,
            Topper?.Slots != null ? Topper.Slots.Length : 0);
        state.GameId = GameId ?? string.Empty;
        state.Hud = Hud ?? new Theme1HudRenderState();
        state.BallRack = BallRack ?? Theme1BallRackRenderState.CreateEmpty(0);
        state.Topper = Topper ?? Theme1TopperRenderState.CreateEmpty(0);

        if (Cards != null)
        {
            for (int i = 0; i < Cards.Length && i < state.Cards.Length; i++)
            {
                state.Cards[i] = Cards[i] ?? Theme1CardRenderState.CreateEmpty();
            }
        }

        return state;
    }
}
