using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using DG.Tweening;
public class MoveText : MonoBehaviour
{
    public BonusControl bonusControl;
    public float finalTarget;
    public bool onlyOnce = false;
    public bool isFinalObje = false;

    void OnEnable()
    {

    }
    public void Move()
    {
        transform.DOLocalMoveY(finalTarget, 1000, false).SetSpeedBased(true).SetEase(Ease.Linear).OnUpdate(Updt).OnComplete(AtEnd);
    }
    void Start()
    {

    }


    void Updt()
    {
        if (transform.localPosition.y < 0 && !onlyOnce)
        {
            onlyOnce = true;
            bonusControl.GenerateNewObj();
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
                bonusControl.WhenReached();
            }
        }
    }
}
