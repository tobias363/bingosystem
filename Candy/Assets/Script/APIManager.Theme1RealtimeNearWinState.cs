using System.Collections.Generic;

public partial class APIManager
{
    private Dictionary<int, RealtimeNearWinState> BuildNearWinStates(Theme1DisplayState renderState)
    {
        Dictionary<int, RealtimeNearWinState> activeNearWinStates = new Dictionary<int, RealtimeNearWinState>();
        if (renderState?.Cards == null)
        {
            return activeNearWinStates;
        }

        for (int cardIndex = 0; cardIndex < renderState.Cards.Length; cardIndex++)
        {
            Theme1CardRenderState card = renderState.Cards[cardIndex];
            if (card?.Cells == null)
            {
                continue;
            }

            for (int cellIndex = 0; cellIndex < card.Cells.Length; cellIndex++)
            {
                Theme1CardCellRenderState cell = card.Cells[cellIndex];
                if (!cell.IsMissing || cell.NearWinPatternIndexes == null || cell.NearWinPatternIndexes.Length == 0)
                {
                    continue;
                }

                int missingNumber = cell.MissingNumber > 0
                    ? cell.MissingNumber
                    : TryParsePositiveInt(cell.NumberLabel);
                for (int nearWinIndex = 0; nearWinIndex < cell.NearWinPatternIndexes.Length; nearWinIndex++)
                {
                    int rawPatternIndex = cell.NearWinPatternIndexes[nearWinIndex];
                    if (rawPatternIndex < 0)
                    {
                        continue;
                    }

                    int key = BuildNearWinKey(cardIndex, rawPatternIndex, cellIndex);
                    activeNearWinStates[key] =
                        new RealtimeNearWinState(rawPatternIndex, cardIndex, cellIndex, missingNumber);
                }
            }
        }

        return activeNearWinStates;
    }
}
