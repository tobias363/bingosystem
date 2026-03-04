using System.Collections.Generic;
using UnityEngine;

public class NumberManager : MonoBehaviour
{
    public static NumberManager instance;
    public int num;

    public int bonusAmt;
    public List<int> totalCombinations = new List<int>(); 
    [SerializeField]
    private List<Combinations> combinations = new List<Combinations>();

    public List<int> currentPatternIndex = new List<int>(); 

    void Awake()
    {
        instance = this;
    }

    void Start()
    {
        // Find and debug the specific combination based on num
        
    }

    public void DoAvailablePattern()
    {
        FindAndDebugCombination(num);
    }

    // Method to find and debug the combination based on num
    private void FindAndDebugCombination(int num)
    {
        currentPatternIndex.Clear();
        // Find the index of num in the totalCombinations list
        int index = totalCombinations.IndexOf(num);

        // Check if the index is valid
       if (index != -1)
        {
            // Make sure the index is within the bounds of the combinations list
            if (index < combinations.Count)
            {
                Combinations selectedCombination = combinations[index];
                float total = selectedCombination.CalculateTotal();
                
                foreach (int number in selectedCombination.CombinationNumbers)
                {
                   //Debug.Log(number);
                   currentPatternIndex.Add(number);
                   Debug.Log("Patter Index : " +number);
                }

            }
            else
            {
                Debug.LogWarning($"Index {index} is out of bounds for the combinations list.");
            }
        }
        else
        {
            Debug.LogWarning($"Number {num} not found in totalCombinations list.");
        }

        GameManager.instance.numberGenerator.PlaceBallAsPerFetch();
    }
    
}

[System.Serializable]
public class Combinations
{
    public List<int> CombinationNumbers = new List<int>(); 

    // Calculate the total of the numbers
    public float CalculateTotal()
    {
        float total = 0f;
        foreach (int number in CombinationNumbers)
        {
            total += number;
        }
        return total;
    }
}
