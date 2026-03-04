using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class PaylineManager 
{
    Patterns patternData;
    public List<Patterns> patternList;
    int totalCountOfTrue;
    public NumberGenerator numberGenerator;
    public PaylineManager(NumberGenerator _numberGenerator)
    {
        numberGenerator = _numberGenerator;
        numberGenerator.patternList = Build_payline_templates();
        //NumberGenerator numberGenerator = new NumberGenerator(patternList);
    }

    public List<Patterns> Build_payline_templates ( )
    {
        
        patternData = new Patterns();
        patternList = new List<Patterns> ( );

        /*{ 1, 1, 1, 1, 1,
            1, 1, 1, 1, 1,
            1, 1, 1, 1, 1 } ----->>> 1 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 1, 1,
                                               1, 1, 1,
                                               1, 1, 1,
                                               1, 1, 1,
                                               1, 1, 1 };
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 1, 1, 1, 1, 1,
            1, 0, 0, 0, 1,
            1, 1, 1, 1, 1 } ------>>> 2 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 1, 1,
                                               1, 0, 1,
                                               1, 0, 1,
                                               1, 0, 1,
                                               1, 1, 1 };
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 1, 0, 1, 0, 1,
            1, 1, 1, 1, 1,
            1, 0, 1, 0, 1 } ------>>> 3 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 1, 1,
                                               0, 1, 0,
                                               1, 1, 1,
                                               0, 1, 0,
                                               1, 1, 1 };
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 1, 1, 1, 1, 1,
            0, 1, 0, 1, 0,
            0, 1, 1, 1, 0 } ------>>> 4 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 0, 0,
                                               1, 1, 1,
                                               1, 0, 1,
                                               1, 1, 1,
                                               1, 0, 0 };
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 1, 1, 1, 1, 1,
            0, 1, 0, 1, 0,
            0, 1, 0, 1, 0 } ------>>> 5 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 0, 0,
                                               1, 1, 1,
                                               1, 0, 0,
                                               1, 1, 1,
                                               1, 0, 0 };
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 1, 1, 1, 1, 1,
            1, 1, 1, 1, 1,
            0, 0, 0, 0, 0 } ------>>> 6 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 1, 0,
                                               1, 1, 0,
                                               1, 1, 0,
                                               1, 1, 0,
                                               1, 1, 0 }; //any 2 line
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 1, 1, 1, 1, 1,
            0, 0, 0, 0, 0,
            1, 1, 1, 1, 1 } ------>>> 7 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 0, 1,
                                               1, 0, 1,
                                               1, 0, 1,
                                               1, 0, 1,
                                               1, 0, 1 }; //any 2 line
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 0, 0, 0, 0, 0,
            1, 1, 1, 1, 1,
            1, 1, 1, 1, 1 } ------>>> 8 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 0, 1, 1,
                                               0, 1, 1,
                                               0, 1, 1,
                                               0, 1, 1,
                                               0, 1, 1 }; //any 2 line
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 1, 0, 1, 0, 1,
            0, 1, 0, 1, 0,
            1, 0, 1, 0, 1 } ------>>> 9 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 0, 1,
                                               0, 1, 0,
                                               1, 0, 1,
                                               0, 1, 0,
                                               1, 0, 1 };
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 1, 0, 0, 0, 1,
            1, 1, 1, 1, 1,
            0, 0, 1, 0, 0 } ------>>> 10 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 1, 0,
                                               0, 1, 0,
                                               0, 1, 1,
                                               0, 1, 0,
                                               1, 1, 0 };
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 0, 0, 1, 0, 0,
            0, 1, 0, 1, 0,
            1, 1, 1, 1, 1 } ------>>> 11 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 0, 0, 1,
                                               0, 1, 1,
                                               1, 0, 1,
                                               0, 1, 1,
                                               0, 0, 1 };
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 1, 0, 0, 0, 1,
            1, 0, 0, 0, 1,
            1, 0, 0, 0, 1 } ------>>> 12 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 1, 1,
                                               0, 0, 0,
                                               0, 0, 0,
                                               0, 0, 0,
                                               1, 1, 1 };
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 0, 0, 1, 0, 0,
            0, 1, 0, 1, 0,
            1, 0, 0, 0, 1 } ------>>> 13 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 0, 0, 1,
                                               0, 1, 0,
                                               1, 0, 0,
                                               0, 1, 0,
                                               0, 0, 1 };
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 1, 1, 1, 1, 1,
            0, 0, 0, 0, 0,
            0, 0, 0, 0, 0 } ------>>> 14 */
        patternData = new Patterns();
        patternData.pattern = new List<byte> { 1, 0, 0,
                                               1, 0, 0,
                                               1, 0, 0,
                                               1, 0, 0,
                                               1, 0, 0 }; //any 1 line
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 0, 0, 0, 0, 0,
            1, 1, 1, 1, 1,
            0, 0, 0, 0, 0 } ------>>> 15 */
        patternData = new Patterns();

        patternData.pattern = new List<byte> { 0, 1, 0,
                                               0, 1, 0,
                                               0, 1, 0,
                                               0, 1, 0,
                                               0, 1, 0 }; //any 1 line
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);

        /*{ 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0,
            1, 1, 1, 1, 1 } ------>>> 16    */
        patternData = new Patterns();

        patternData.pattern = new List<byte> { 0, 0, 1,
                                               0, 0, 1,
                                               0, 0, 1,
                                               0, 0, 1,
                                               0, 0, 1 }; //any 1 line
        patternData.totalCountOfTrue = GetTotalCountOfTrueCondition(patternData.pattern);
        patternList.Add(patternData);


        return (patternList);

    }

    public int GetTotalCountOfTrueCondition(List<byte> pattern)
    {
        int totalCount = 0;
        for (int i = 0; i < pattern.Count; i++)
        {
            if (pattern[i] == 1)
            {
                totalCount++;
            }
        }
        return totalCount;
    }

    void ShowMissingPayline()
    {

    }
}

public class Patterns
{
    public List<byte> pattern = new List<byte>();
    public int totalCountOfTrue;
}

public class IPayLine
{
    public Dictionary<int, int> matchedPaylineWithCount = new Dictionary<int, int>();
    public List<int> unMatchedPaylineList = new List<int>();
    public List<int> matchedPaylineList = new List<int>();
}
