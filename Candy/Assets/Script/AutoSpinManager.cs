using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class AutoSpinManager : MonoBehaviour
{

    public int AutoSpinCount = 5;


    void StartAutoSpin()
    {
        if (!Application.isEditor && !Debug.isDebugBuild && AutoSpinCount > 1)
        {
            Debug.LogWarning("[AutoSpinManager] AutoSpin > 1 er deaktivert i production build.");
            return;
        }

        for(int i = 0; i< AutoSpinCount; i++)
        {
            EventManager.Play();
        }
    }

    
}
