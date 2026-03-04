using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class ThemeMathEngine 
{
    public List<int> currentWinPoints = new List<int>();
    public int betAmt = 0;
    public int winAmt = 0;
    GameManager gameManager;
    public ThemeMathEngine(GameManager _gameManager)
    {
        gameManager = _gameManager;
        betAmt = gameManager.currentBet;
        currentWinPoints = gameManager.currentWinPoints;

        GetWinNumber();
    }
    public void GetWinNumber()
    {
        int randomIteration = Random.Range(0, currentWinPoints.Count);
    }
}
