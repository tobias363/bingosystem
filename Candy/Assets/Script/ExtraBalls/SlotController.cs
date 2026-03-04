using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Linq;
using DG.Tweening;
using System.Data.Common;

public class SlotController : MonoBehaviour
{

    public int currentWinAmt;
    public ControlChildObj[] controlChildObjs;
    public Winpoints[] winpoints = new Winpoints[4];
    public Winpoints currentWinPoints = new Winpoints();
   // public DisplayWinpoints displayWinpoints = new DisplayWinpoints();
    public Button playButton;
    public TextMeshProUGUI display_totalWin;
    public TextMeshProUGUI display_lastWin;
    public TextMeshProUGUI totalExtraBallText;
    //public Animation[] allAnimation;
    public bool extraBall;
    public int balls;
    int betPoints;
    public int[] finalVal;
    int totalSpins;
    int winSpins;
    public int[] spinRewards;
    public int[] spinpattern;
    public int[] allWinpoints;
    System.Random random = new System.Random();
    bool stopGame = false;
    int spinNumber;
    int singleAmt;
    int totalWinAmt;
    public int extraBallCount = 0;
    //public AnimationClip[] clip;
    //public AnimationClip[] exitClip;

    public NumberGenerator numberGenerator;


    private void OnEnable()
    {
        playButton.interactable = true;
        extraBallCount = numberGenerator.totalExtraBallCount;
        totalExtraBallText.text = extraBallCount.ToString();
        GameManager.instance.extraBallTotal = extraBallCount;
        Invoke(nameof(StartGame), 3);
    }

    void Start()
    {
        //betPoints = 24;
        //winpoints = new Winpoints[5];
        //SetWinPoints();
        //SetCurrentBetPoints();
        //SetRewards();
        

    }

    public void StartGame()
    {
        CancelInvoke(nameof(StartGame));
        //for (int i = 0; i < allAnimation.Length; i++)
        //{
        //    allAnimation[i].clip = exitClip[i % 3];
        //    allAnimation[i].Play();

        //    // allAnimation[i].Rewind();

        //}
        balls = Random.Range(0, 6);
        if (50-extraBallCount <= 5)
            balls = 50 - extraBallCount;
        Debug.Log("Balls : "+balls);
        playButton.interactable = false;
        // Debug.Log("spinNumber : " + spinNumber);
        //SetPattern(spinRewards[spinNumber], spinpattern[spinNumber]);
        singleAmt = 0;
        display_lastWin.text = singleAmt.ToString();
        StartCoroutine(StartMoving());
        if (extraBall)
        {
            finalVal[0] = balls;
        }
    }

    IEnumerator StartMoving()
    {
        for (int i = 0; i < controlChildObjs.Length; i++)
        {
            controlChildObjs[i].StartMoving();
            yield return new WaitForSeconds(0.1f);
        }
    }

    public void AfterStop()
    {
        //CheckWinner();
       
        CallNext();
        if (extraBall)
        {
            extraBallCount += finalVal[0];
            totalExtraBallText.text = extraBallCount.ToString();
            GameManager.instance.extraBallTotal = extraBallCount;
            Invoke(nameof(Generate), 2);

        }
    }

    void Generate()
    {
        numberGenerator.extraBallObj.SetActive(false);

        //numberGenerator.ShowExtraBalls(extraBallCount);
        numberGenerator.ShowExtraBallOnTap(extraBallCount);
    }


    //void CheckWinner()
    //{
    //    if (new[] { finalVal[0], finalVal[1] }.All(x => x == 4))
    //    {
    //        AwardPrize(4);
    //    }
    //    else if (new[] { finalVal[1], finalVal[2] }.All(x => x == 4))
    //    {
    //        AwardPrize(4);
    //    }
    //    else if (new[] { finalVal[2], finalVal[3] }.All(x => x == 4))
    //    {
    //        AwardPrize(4);
    //    }
    //    else if (new[] { finalVal[0], finalVal[2] }.All(x => x == 4))
    //    {
    //        AwardPrize(4);
    //    }
    //    else if (new[] { finalVal[1], finalVal[3] }.All(x => x == 4))
    //    {
    //        AwardPrize(4);
    //    }
    //    else if (new[] { finalVal[1], finalVal[3] }.All(x => x == 4))
    //    {
    //        AwardPrize(4);
    //    }
    //    else if (new[] { finalVal[0], finalVal[1], finalVal[2], finalVal[3] }.All(x => x == finalVal[0]))
    //    {
    //        AwardPrize(finalVal[0], 2);
    //    }
    //    else if (new[] { finalVal[0], finalVal[1], finalVal[2] }.All(x => x == finalVal[0]))
    //    {
    //        AwardPrize(finalVal[0], 1);
    //    }
    //    else if (new[] { finalVal[1], finalVal[2], finalVal[3] }.All(x => x == finalVal[1]))
    //    {
    //        AwardPrize(finalVal[1], 1);
    //    }
    //    else if (finalVal[0] == finalVal[1])
    //    {
    //        AwardPrize(finalVal[0], 0);
    //    }
    //    else if (finalVal[2] == finalVal[3])
    //    {
    //        AwardPrize(finalVal[2], 0);
    //    }
    //    else
    //    {
    //        CallNext();
    //    }

    //}

    //void AwardPrize(int pzNo, int patNo = 0)
    //{
    //    if (pzNo == 4)
    //    {
    //        stopGame = true;
    //        Debug.Log("ExitGame");
    //    }
    //    else
    //    {
    //        stopGame = false;
    //        if (pzNo == 0)
    //        {
    //            singleAmt = currentWinPoints.points_1[patNo];
    //            allAnimation[patNo].clip = clip[patNo];
    //            allAnimation[patNo].Play();
    //        }
    //        else if (pzNo == 1)
    //        {
    //            singleAmt = currentWinPoints.points_2[patNo];
    //            allAnimation[patNo + 3].clip = clip[patNo];
    //            allAnimation[patNo + 3].Play();
    //        }
    //        else if (pzNo == 2)
    //        {
    //            singleAmt = currentWinPoints.points_3[patNo];
    //            allAnimation[patNo + 6].clip = clip[patNo];
    //            allAnimation[patNo + 6].Play();
    //        }
    //        else if (pzNo == 3)
    //        {
    //            singleAmt = currentWinPoints.points_4[patNo];
    //            allAnimation[patNo + 9].clip = clip[patNo];
    //            allAnimation[patNo + 9].Play();
    //        }

    //        totalWinAmt += singleAmt;

    //        DOVirtual.Int(0, singleAmt, 1f, x => display_lastWin.text = x.ToString()).SetDelay(1f);
    //        DOVirtual.Int((totalWinAmt - singleAmt), totalWinAmt, 1f, x => display_totalWin.text = x.ToString()).SetDelay(2f).OnComplete(CallNext);

    //        // display_lastWin.text = singleAmt.ToString();
    //        // display_totalWin.text = totalWinAmt.ToString();
    //    }
    //}
    void CallNext()
    {
        if (!stopGame)
        {
            spinNumber++;
            
        }
    }

    void SetCurrentBetPoints()
    {
        int lvl = betPoints / 8;

        currentWinPoints = winpoints[lvl - 1];

        //for (int i = 0; i < 3; i++)
        //{
        //    displayWinpoints.points_1[i].text = currentWinPoints.points_1[i].ToString();
        //    displayWinpoints.points_2[i].text = currentWinPoints.points_2[i].ToString();
        //    displayWinpoints.points_3[i].text = currentWinPoints.points_3[i].ToString();
        //    displayWinpoints.points_4[i].text = currentWinPoints.points_4[i].ToString();
        //}

        allWinpoints = new int[12];

        for (int i = 0; i < allWinpoints.Length; i++)
        {
            if (i < 3)
            {
                allWinpoints[i] = currentWinPoints.points_1[i];
            }
            else if (i < 6)
            {
                allWinpoints[i] = currentWinPoints.points_2[i % 3];
            }
            else if (i < 9)
            {
                allWinpoints[i] = currentWinPoints.points_3[i % 3];
            }
            else if (i < 12)
            {
                allWinpoints[i] = currentWinPoints.points_4[i % 3];
            }

        }
    }

    void SetWinPoints()
    {

        for (int i = 0; i < winpoints.Length; i++)
        {
            winpoints[i] = new Winpoints();
            /* winpoints[i].points_1 = new int[3];
            winpoints[i].points_2 = new int[3];
            winpoints[i].points_3 = new int[3];
            winpoints[i].points_4 = new int[3]; */

        }

        int multplier = 1;
        // First
        winpoints[0].points_1[0] = 12;
        winpoints[0].points_1[1] = 60;
        winpoints[0].points_1[2] = 180;



        winpoints[0].points_2[0] = 15;
        winpoints[0].points_2[1] = 90;
        winpoints[0].points_2[2] = 270;

        winpoints[0].points_3[0] = 24;
        winpoints[0].points_3[1] = 120;
        winpoints[0].points_3[2] = 360;

        winpoints[0].points_4[0] = 36;
        winpoints[0].points_4[1] = 150;
        winpoints[0].points_4[2] = 450;

        //Second
        multplier = 2;

        winpoints[1].points_1[0] = 12 * multplier;
        winpoints[1].points_1[1] = 60 * multplier;
        winpoints[1].points_1[2] = 180 * multplier;

        winpoints[1].points_2[0] = 15 * multplier;
        winpoints[1].points_2[1] = 90 * multplier;
        winpoints[1].points_2[2] = 270 * multplier;

        winpoints[1].points_3[0] = 24 * multplier;
        winpoints[1].points_3[1] = 120 * multplier;
        winpoints[1].points_3[2] = 360 * multplier;

        winpoints[1].points_4[0] = 36 * multplier;
        winpoints[1].points_4[1] = 150 * multplier;
        winpoints[1].points_4[2] = 450 * multplier;

        // Third
        multplier = 3;

        winpoints[2].points_1[0] = 12 * multplier;
        winpoints[2].points_1[1] = 60 * multplier;
        winpoints[2].points_1[2] = 180 * multplier;

        winpoints[2].points_2[0] = 15 * multplier;
        winpoints[2].points_2[1] = 90 * multplier;
        winpoints[2].points_2[2] = 270 * multplier;

        winpoints[2].points_3[0] = 24 * multplier;
        winpoints[2].points_3[1] = 120 * multplier;
        winpoints[2].points_3[2] = 360 * multplier;

        winpoints[2].points_4[0] = 36 * multplier;
        winpoints[2].points_4[1] = 150 * multplier;
        winpoints[2].points_4[2] = 450 * multplier;

        //Fourth
        multplier = 4;

        winpoints[3].points_1[0] = 12 * multplier;
        winpoints[3].points_1[1] = 60 * multplier;
        winpoints[3].points_1[2] = 180 * multplier;

        winpoints[3].points_2[0] = 15 * multplier;
        winpoints[3].points_2[1] = 90 * multplier;
        winpoints[3].points_2[2] = 270 * multplier;

        winpoints[3].points_3[0] = 24 * multplier;
        winpoints[3].points_3[1] = 120 * multplier;
        winpoints[3].points_3[2] = 360 * multplier;

        winpoints[3].points_4[0] = 36 * multplier;
        winpoints[3].points_4[1] = 150 * multplier;
        winpoints[3].points_4[2] = 450 * multplier;

        // Fifth
        multplier = 5;

        winpoints[4].points_1[0] = 12 * multplier;
        winpoints[4].points_1[1] = 60 * multplier;
        winpoints[4].points_1[2] = 180 * multplier;

        winpoints[4].points_2[0] = 15 * multplier;
        winpoints[4].points_2[1] = 90 * multplier;
        winpoints[4].points_2[2] = 270 * multplier;

        winpoints[4].points_3[0] = 24 * multplier;
        winpoints[4].points_3[1] = 120 * multplier;
        winpoints[4].points_3[2] = 360 * multplier;

        winpoints[4].points_4[0] = 36 * multplier;
        winpoints[4].points_4[1] = 150 * multplier;
        winpoints[4].points_4[2] = 450 * multplier;
    }

    void SetRewards()
    {
        currentWinAmt = 800;

        totalSpins = Random.Range(5, 10);

        if (totalSpins < 7)
            winSpins = Random.Range(2, 5);
        else
            winSpins = Random.Range(2, 6);

        spinRewards = Enumerable.Repeat(-1, totalSpins - 1).ToArray();
        spinpattern = new int[totalSpins];

        if (winSpins == 2)
        {
            spinRewards[0] = Mathf.RoundToInt(currentWinAmt * 30) / 100;
            spinRewards[1] = Mathf.RoundToInt(currentWinAmt * 70) / 100;

        }
        else if (winSpins == 3)
        {
            spinRewards[0] = Mathf.RoundToInt(currentWinAmt * 20) / 100;
            spinRewards[1] = Mathf.RoundToInt(currentWinAmt * 30) / 100;
            spinRewards[2] = Mathf.RoundToInt(currentWinAmt * 50) / 100;
        }
        else if (winSpins == 4)
        {
            spinRewards[0] = Mathf.RoundToInt(currentWinAmt * 20) / 100;
            spinRewards[1] = Mathf.RoundToInt(currentWinAmt * 10) / 100;
            spinRewards[2] = Mathf.RoundToInt(currentWinAmt * 30) / 100;
            spinRewards[3] = Mathf.RoundToInt(currentWinAmt * 40) / 100;
        }
        else if (winSpins == 5)
        {
            spinRewards[0] = Mathf.RoundToInt(currentWinAmt * 10) / 100;
            spinRewards[1] = Mathf.RoundToInt(currentWinAmt * 20) / 100;
            spinRewards[2] = Mathf.RoundToInt(currentWinAmt * 10) / 100;
            spinRewards[3] = Mathf.RoundToInt(currentWinAmt * 20) / 100;
            spinRewards[4] = Mathf.RoundToInt(currentWinAmt * 40) / 100;
        }


        spinRewards = spinRewards.OrderBy(x => random.Next()).ToArray();

        System.Array.Resize(ref spinRewards, totalSpins);

        int nrst = 0;
        for (int i = 0; i < totalSpins; i++)
        {
            
            if (spinRewards[i] != -1)
            {
                nrst = allWinpoints.OrderBy(x => Mathf.Abs((long)x - spinRewards[i])).First();
                nrst = System.Array.IndexOf(allWinpoints, nrst);
                spinRewards[i] = nrst / 3;
                spinpattern[i] = nrst % 3;
            }
        }

        spinRewards[totalSpins - 1] = 4;
        spinpattern[totalSpins - 1] = Random.Range(0, 6);


         Debug.Log(System.Array.IndexOf(allWinpoints, nrst));
    }

    void SetPattern(int winNo, int patNo = 0)
    {
        finalVal = Enumerable.Range(0, 5).OrderBy(t => random.Next()).Where(num => num != winNo).Take(4).ToArray();

        if (winNo == -1)
            return;

        if (winNo != 4)
        {
            if (patNo == 0)
            {
                if (Random.Range(0, 2) == 1)
                {
                    finalVal[0] = winNo;
                    finalVal[1] = winNo;
                }
                else
                {
                    finalVal[2] = winNo;
                    finalVal[3] = winNo;
                }
            }
            else if (patNo == 1)
            {
                if (Random.Range(0, 2) == 1)
                {
                    finalVal[0] = winNo;
                    finalVal[1] = winNo;
                    finalVal[2] = winNo;
                }
                else
                {
                    finalVal[1] = winNo;
                    finalVal[2] = winNo;
                    finalVal[3] = winNo;
                }
            }
            else
            {
                finalVal[0] = winNo;
                finalVal[1] = winNo;
                finalVal[2] = winNo;
                finalVal[3] = winNo;
            }
        }
        else
        {
            int rn = Random.Range(0, 6);

            if (rn == 0)
            {
                finalVal[0] = winNo;
                finalVal[1] = winNo;
            }
            else if (rn == 1)
            {
                finalVal[1] = winNo;
                finalVal[2] = winNo;
            }
            else if (rn == 2)
            {
                finalVal[2] = winNo;
                finalVal[3] = winNo;
            }
            else if (rn == 3)
            {
                finalVal[0] = winNo;
                finalVal[2] = winNo;
            }
            else if (rn == 4)
            {
                finalVal[1] = winNo;
                finalVal[3] = winNo;
            }
            else if (rn == 5)
            {
                finalVal[0] = winNo;
                finalVal[3] = winNo;
            }
        }
    }
}
[System.Serializable]
public class Winpoints
{
    public int[] points_1 = new int[3];
    public int[] points_2 = new int[3];
    public int[] points_3 = new int[3];
    public int[] points_4 = new int[3];

}

//[System.Serializable]
//public class DisplayWinpoints
//{
//    public TextMeshProUGUI[] points_1 = new TextMeshProUGUI[3];
//    public TextMeshProUGUI[] points_2 = new TextMeshProUGUI[3];
//    public TextMeshProUGUI[] points_3 = new TextMeshProUGUI[3];
//    public TextMeshProUGUI[] points_4 = new TextMeshProUGUI[3];

//}
