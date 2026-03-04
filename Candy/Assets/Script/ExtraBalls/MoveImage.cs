using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using DG.Tweening;

public class MoveImage : MonoBehaviour
{
    public ControlChildObj controlChildObj;
    public float finalTarget;
    public bool onlyOnce = false;
    public bool isFinalObje = false;

    void Start()
    {

    }

    public void Move()
    {
        transform.DOLocalMoveY(finalTarget, 1000, false).SetSpeedBased(true).SetEase(Ease.Linear).OnUpdate(Updt).OnComplete(AtEnd);
    }

    void Updt()
    {
        if (transform.localPosition.y < 0 && !onlyOnce)
        {
            onlyOnce = true;
            controlChildObj.GenerateNewObj();
        }
    }
    void AtEnd()
    {
        if (!isFinalObje)
        {
            gameObject.SetActive(false);
        }
        else
        {
            if (transform.localPosition.y == 0)
            {
                controlChildObj.AfterStop();
            }
        }
    }
}
