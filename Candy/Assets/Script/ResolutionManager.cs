using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;


public class ResolutionManager : MonoBehaviour
{
    // Define the reference resolution (the resolution your game is designed for)
    public Vector2 referenceResolution = new Vector2(1920, 1080);

    void Start()
    {
        // Call the function to adjust the screen resolution and UI scaling
        AdjustScreenAndUI();
    }

    void AdjustScreenAndUI()
    {
        // Get the current screen resolution
        float currentAspectRatio = (float)Screen.width / Screen.height;

        // Calculate the desired height based on the current aspect ratio and reference width
        float desiredHeight = referenceResolution.x / currentAspectRatio;

        // Set the screen resolution using the calculated width and height
        Screen.SetResolution((int)referenceResolution.x, (int)desiredHeight, true);

        // Get the CanvasScaler component on the Canvas (assuming it's on the same GameObject)
        CanvasScaler canvasScaler = GetComponent<CanvasScaler>();

        if (canvasScaler != null)
        {
            // Set the match width or height property based on the aspect ratio
            if (currentAspectRatio > referenceResolution.x / referenceResolution.y)
            {
                // Use match width
                canvasScaler.matchWidthOrHeight = 1;
            }
            else
            {
                // Use match height
                canvasScaler.matchWidthOrHeight = 0;
            }
        }
    }
}