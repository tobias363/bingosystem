using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

[Serializable]
public sealed class Theme1BallSlotView
{
    [SerializeField] private GameObject root;
    [SerializeField] private Image spriteTarget;
    [SerializeField] private TextMeshProUGUI numberLabel;

    public GameObject Root => root;
    public Image SpriteTarget => spriteTarget;
    public TextMeshProUGUI NumberLabel => numberLabel;

    public void PullFrom(CandyBallSlotBinding binding)
    {
        root = binding != null ? binding.Root : null;
        spriteTarget = binding != null ? binding.Image : null;
        numberLabel = binding != null ? binding.NumberText : null;
    }
}

[Serializable]
public sealed class Theme1BallRackView
{
    [SerializeField] private Theme1BallSlotView[] slots = new Theme1BallSlotView[30];
    [SerializeField] private Image bigBallImage;
    [SerializeField] private TextMeshProUGUI bigBallText;
    [SerializeField] private GameObject ballOutMachineAnimParent;
    [SerializeField] private GameObject ballMachine;
    [SerializeField] private GameObject extraBallMachine;

    public Theme1BallSlotView[] Slots => slots;
    public Image BigBallImage => bigBallImage;
    public TextMeshProUGUI BigBallText => bigBallText;
    public GameObject BallOutMachineAnimParent => ballOutMachineAnimParent;
    public GameObject BallMachine => ballMachine;
    public GameObject ExtraBallMachine => extraBallMachine;

    public void PullFrom(CandyBallViewBindingSet bindings)
    {
        int slotCount = bindings?.Slots != null ? bindings.Slots.Count : 0;
        slots = new Theme1BallSlotView[slotCount];
        for (int i = 0; i < slotCount; i++)
        {
            slots[i] = new Theme1BallSlotView();
            slots[i].PullFrom(bindings.Slots[i]);
        }

        bigBallImage = bindings?.BigBallImage;
        bigBallText = bindings?.BigBallText;
        ballOutMachineAnimParent = bindings?.BallOutMachineAnimParent;
        ballMachine = bindings?.BallMachine;
        extraBallMachine = bindings?.ExtraBallMachine;
    }
}
