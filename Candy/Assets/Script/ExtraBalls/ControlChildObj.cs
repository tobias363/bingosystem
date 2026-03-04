using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class ControlChildObj : MonoBehaviour
{
    public int myPlace;
    public Transform instaPoint;
    public SlotController slotController;
    public GameObject[] allObj;
    public Sprite[] objImages;
    public float[] finalPos;
    public float lastPos = -180;
    bool stopMoving;
    int ctr = 2;
    //private Vector3 resetPos;
    void Start()
    {
        // Invoke("StartMoving", 2f);
    }

    public void StartMoving()
    {

        ctr = 2;
        stopMoving = false;
        for (int i = 0; i < allObj.Length; i++)
        {
            if (allObj[i].activeSelf)
            {
                allObj[i].GetComponent<MoveImage>().finalTarget = lastPos;
                allObj[i].GetComponent<MoveImage>().isFinalObje = false;
                // allObj[i].GetComponent<MoveText>().enabled = true;
                allObj[i].GetComponent<MoveImage>().Move();
            }
        }

        Invoke("Stop", 3f);
    }

    void Stop()
    {
        stopMoving = true;
    }

    public void AfterStop()
    {
        if (myPlace == 3)
        {
            slotController.AfterStop();
        }
        if(slotController.extraBall)
        {
            slotController.AfterStop();
        }
    }

    public void GenerateNewObj()
    {
        int no = Random.Range(0, allObj.Length);

        //while (allObj[no].activeSelf)
        //{
        //    no = Random.Range(0, allObj.Length);
        //}

        if(allObj[no].activeSelf)
        {
            if(no == allObj.Length - 1)
            {
                no = 0;
            }
            else
            {
                no = no + 1;
            }
        }
        allObj[no].transform.localPosition = instaPoint.localPosition;
        allObj[no].GetComponent<MoveImage>().onlyOnce = false;

        if (!stopMoving)
        {
            allObj[no].GetComponent<MoveImage>().isFinalObje = false;
            allObj[no].GetComponent<MoveImage>().finalTarget = lastPos;
            allObj[no].GetComponent<Image>().sprite = objImages[Random.Range(0, 5)];

        }
        else
        {
            allObj[no].GetComponent<MoveImage>().isFinalObje = true;
            allObj[no].GetComponent<MoveImage>().finalTarget = finalPos[ctr];
            if (ctr == 1)
            {
                allObj[no].GetComponent<Image>().sprite = objImages[slotController.finalVal[myPlace]];
            }
            ctr--;
        }

        allObj[no].GetComponent<Image>().SetNativeSize();
        allObj[no].SetActive(true);
        allObj[no].GetComponent<MoveImage>().Move();
    }
}
