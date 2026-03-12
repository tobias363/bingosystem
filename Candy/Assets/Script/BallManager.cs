using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using DG.Tweening;
using TMPro;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using System.Text;

public class BallManager : MonoBehaviour
{
    private sealed class MachineClusterBall
    {
        public RectTransform Rect;
        public Vector2 BasePosition;
        public Vector2 CurrentPosition;
        public Vector2 Velocity;
        public float BaseScale;
        public float OrbitRadiusX;
        public float OrbitRadiusY;
        public float OrbitSpeed;
        public float OrbitPhase;
        public float FlowAmplitudeX;
        public float FlowAmplitudeY;
        public float FlowSpeed;
        public float FlowPhase;
        public float NoiseSeedX;
        public float NoiseSeedY;
        public float NoiseSpeed;
        public float JitterAmplitudeX;
        public float JitterAmplitudeY;
        public float RotationAmplitude;
        public float ScaleAmplitude;
        public float ScaleSpeed;
        public float ShakeSeedA;
        public float ShakeSeedB;
        public float ShakeSeedC;
    }

    private static readonly string[] GameplayOverlayPathsToHide =
    {
        "BingoCanvas/Image",
        "BingoCanvas/Cards/Image",
        "BonusCanvas/BG/Button",
    };

    private static readonly string[] GameplayOverlaySpriteNamesToHide =
    {
        "select-ui",
        "WhatsApp Image 2023-11-22 at 7.08.47 PM",
        "black-strip_0",
    };

    private const int RealtimeBallColumns = 15;
    private const float RealtimeBallSize = 76f;
    private const float RealtimeBallSpacingX = 82f;
    private const float RealtimeBallTopRowY = -314f;
    private const float RealtimeBallBottomRowY = -226f;
    private const float RealtimeBallTextBoxInset = 10f;
    private const float RealtimeBallNumberYOffset = 1f;
    private const float RealtimeBallNumberFontMin = 14f;
    private const float RealtimeBallNumberFontMax = 34f;
    private const float BigBallNumberYOffset = 4f;
    private const float BigBallNumberFontMin = 40f;
    private const float BigBallNumberFontMax = 62f;
    private const string NumberedBallSpriteResourcesPath = "CandyBallSprites";

    public NumberGenerator numberGenerator;
    public List<GameObject> balls;
    public List<Sprite> ballSprite;
    public GameObject ballPrefab;
    public Transform extraBallParent;
    public Sprite extraBallSprite;

    public GameObject ballOutMachineAnimParent;
    public Image bigBallImg;
    public GameObject ballMachine;
    public GameObject extraBallMachine;
    public List<Sprite> bigBallSprite;
    private List<Sprite> bigBallSpriteSequence = new List<Sprite>();
    public List<GameObject> extraBalls;
    private Vector3[] extraBaStartPos = new Vector3[5]; 
    public float ballAnimSpeed = 0.11f;

    [SerializeField]
    private List<int> ballIndexList = new List<int>();
    [SerializeField] private bool verboseDrawLogging = false;
    [SerializeField] [Range(0.1f, 1f)] private float glassAnimationSpeedMultiplier = 0.59f;
    [SerializeField] private bool overrideTheme1GlassMotion = false;
    private int[] extraBallPosArr = new int[5] { -140, -70, 140, 70, 0 };
    private List<GameObject> instantiatedExtraBall = new List<GameObject>();
    private readonly List<Vector3> realtimeBallLayoutPositions = new List<Vector3>();
    private readonly List<Transform> cachedBallTransforms = new List<Transform>();
    private readonly List<Image> cachedBallImages = new List<Image>();
    private readonly List<TextMeshProUGUI> cachedBallTexts = new List<TextMeshProUGUI>();
    private readonly Dictionary<GameObject, TextMeshProUGUI> cachedExtraBallTexts = new Dictionary<GameObject, TextMeshProUGUI>();
    private readonly Dictionary<GameObject, Coroutine> extraBallMoveRoutines = new Dictionary<GameObject, Coroutine>();
    private readonly Dictionary<int, Sprite> numberedBallSprites = new Dictionary<int, Sprite>();
    private Coroutine ballAnimationRoutine;
    private Coroutine extraBallBatchRoutine;
    private TextMeshProUGUI cachedBigBallText;
    private readonly List<Animator> cachedGlassAnimators = new List<Animator>();
    private readonly List<MachineClusterBall> machineClusterBalls = new List<MachineClusterBall>();
    private readonly Dictionary<string, GameObject> cachedOverlayObjects = new Dictionary<string, GameObject>();
    private float appliedGlassAnimatorSpeed = -1f;
    private float observedTimeScale = float.NaN;
    private float machineClusterRattleBoost;
    private Vector2 machineClusterBaseParentPosition;
    private bool machineClusterMotionReady;
    private bool customGlassMotionActive;
    private CandyBallViewBindingSet explicitViewBindings;
    private bool numberedBallSpritesLoaded;

    private void OnEnable()
    {
        EventManager.OnGenerateBall += GenerateBall;
        EventManager.OnGenerateExtraBall += GenerateExtraBall;
        EventManager.OnPlay += ResetBalls;

        EventManager.OnTapForExtraBall += ShowExtraBallOnTap;

        ApplyExplicitRealtimeViewBindingsFromComponent();
        HideGameplayOverlays();
        GetStartPosition_ExtraBalls();
        ApplyRealtimeBallSlotLayout();
        CacheBallComponentRefs();
        CacheExtraBallTextRefs();
        cachedBigBallText = ResolveBigBallText();
        CacheGlassAnimator();
        CacheTheme1MachineClusterBalls();
        EnsureNumberedBallSpritesLoaded();
        observedTimeScale = Time.timeScale;
        ApplyGlassAnimationSpeed(force: true);

        SetActiveIfChanged(ballOutMachineAnimParent, true);
        SetActiveIfChanged(bigBallImg != null ? bigBallImg.gameObject : null, false);

        SetActiveIfChanged(ballMachine, false);
        SetActiveIfChanged(extraBallMachine, false);

        CacheRealtimeBallLayoutPositions();


    }

    private void Start()
    {
        HideGameplayOverlays();
        // Ensure speed sync after all Awake calls and scene activation.
        EnsureNumberedBallSpritesLoaded();
        CacheTheme1MachineClusterBalls();
        observedTimeScale = Time.timeScale;
        ApplyGlassAnimationSpeed(force: true);
    }

    private void Update()
    {
        if (Mathf.Abs(observedTimeScale - Time.timeScale) < 0.001f)
        {
            return;
        }

        observedTimeScale = Time.timeScale;
        ApplyGlassAnimationSpeed(force: true);
    }

    private void LateUpdate()
    {
        if (overrideTheme1GlassMotion)
        {
            AnimateTheme1MachineCluster(Time.unscaledTime, Time.unscaledDeltaTime);
        }
    }

    private void CacheGlassAnimator()
    {
        if (cachedGlassAnimators.Count > 0)
        {
            return;
        }

        if (ballOutMachineAnimParent == null)
        {
            return;
        }

        Animator[] animators = ballOutMachineAnimParent.GetComponentsInChildren<Animator>(true);
        if (animators == null || animators.Length == 0)
        {
            return;
        }

        for (int i = 0; i < animators.Length; i++)
        {
            Animator animator = animators[i];
            if (animator != null)
            {
                cachedGlassAnimators.Add(animator);
            }
        }
    }

    private void ApplyRealtimeBallSlotLayout()
    {
        if (balls == null || balls.Count == 0)
        {
            return;
        }

        for (int i = 0; i < balls.Count; i++)
        {
            GameObject ball = balls[i];
            if (ball == null)
            {
                continue;
            }

            RectTransform rootRect = ball.GetComponent<RectTransform>();
            if (rootRect != null)
            {
                rootRect.anchorMin = new Vector2(0.5f, 0.5f);
                rootRect.anchorMax = new Vector2(0.5f, 0.5f);
                rootRect.pivot = new Vector2(0.5f, 0.5f);
                rootRect.anchoredPosition = GetBallSlotAnchoredPosition(i);
                rootRect.sizeDelta = new Vector2(RealtimeBallSize, RealtimeBallSize);
                rootRect.localScale = Vector3.one;
            }

            Image image = ball.GetComponent<Image>();
            if (image != null)
            {
                image.preserveAspect = true;
            }

            TextMeshProUGUI numberText = Theme1GameplayViewRepairUtils.FindDedicatedBallNumberLabel(ball);
            if (numberText != null)
            {
                RectTransform textRect = numberText.rectTransform;
                if (textRect != null)
                {
                    textRect.anchorMin = new Vector2(0.5f, 0.5f);
                    textRect.anchorMax = new Vector2(0.5f, 0.5f);
                    textRect.pivot = new Vector2(0.5f, 0.5f);
                    textRect.anchoredPosition = new Vector2(0f, RealtimeBallNumberYOffset);
                    textRect.sizeDelta = new Vector2(
                        RealtimeBallSize - RealtimeBallTextBoxInset,
                        RealtimeBallSize - RealtimeBallTextBoxInset);
                    textRect.localScale = Vector3.one;
                }

                numberText.alignment = TextAlignmentOptions.CenterGeoAligned;
                numberText.enableAutoSizing = true;
                numberText.fontSizeMin = RealtimeBallNumberFontMin;
                numberText.fontSizeMax = RealtimeBallNumberFontMax;
                numberText.textWrappingMode = TextWrappingModes.NoWrap;
                numberText.margin = new Vector4(2f, 0f, 2f, 0f);
                numberText.overflowMode = TextOverflowModes.Overflow;
            }
        }
    }

    private void EnsureNumberedBallSpritesLoaded()
    {
        if (numberedBallSpritesLoaded)
        {
            return;
        }

        numberedBallSpritesLoaded = true;
        numberedBallSprites.Clear();

        Sprite[] sprites = Resources.LoadAll<Sprite>(NumberedBallSpriteResourcesPath);
        if (sprites == null || sprites.Length == 0)
        {
            return;
        }

        for (int i = 0; i < sprites.Length; i++)
        {
            Sprite sprite = sprites[i];
            if (sprite == null)
            {
                continue;
            }

            if (!TryExtractBallNumber(sprite.name, out int ballNumber))
            {
                continue;
            }

            if (!numberedBallSprites.ContainsKey(ballNumber))
            {
                numberedBallSprites.Add(ballNumber, sprite);
            }
        }
    }

    private static bool TryExtractBallNumber(string spriteName, out int ballNumber)
    {
        ballNumber = 0;
        if (string.IsNullOrWhiteSpace(spriteName))
        {
            return false;
        }

        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < spriteName.Length; i++)
        {
            char current = spriteName[i];
            if (char.IsDigit(current))
            {
                builder.Append(current);
                continue;
            }

            if (builder.Length > 0)
            {
                break;
            }
        }

        if (builder.Length == 0)
        {
            return false;
        }

        return int.TryParse(builder.ToString(), out ballNumber);
    }

    private bool TryGetNumberedBallSprite(int ballNumber, out Sprite sprite)
    {
        if (CandyBallVisualCatalog.TryGetSmallSprite(ballNumber, out sprite))
        {
            return sprite != null;
        }

        EnsureNumberedBallSpritesLoaded();
        return numberedBallSprites.TryGetValue(ballNumber, out sprite) && sprite != null;
    }

    private static Sprite ResolveFallbackBallSprite(List<Sprite> sprites, int ballNumber)
    {
        if (sprites == null || sprites.Count == 0)
        {
            return null;
        }

        int index = Mathf.Abs(ballNumber - 1) % sprites.Count;
        return sprites[index];
    }

    private static void SetBallNumberVisibility(TextMeshProUGUI target, bool visible)
    {
        if (target == null || target.gameObject == null)
        {
            return;
        }

        if (target.gameObject.activeSelf != visible)
        {
            target.gameObject.SetActive(visible);
        }
    }

    private bool ApplyBallVisual(
        Image targetImage,
        TextMeshProUGUI targetText,
        int ballNumber,
        TMP_FontAsset numberFallbackFont,
        List<Sprite> fallbackSpriteSet = null,
        Sprite fallbackSprite = null)
    {
        if (TryGetNumberedBallSprite(ballNumber, out Sprite numberedSprite))
        {
            if (targetImage != null)
            {
                targetImage.sprite = numberedSprite;
                targetImage.preserveAspect = true;
            }

            if (targetText != null)
            {
                targetText.text = ballNumber.ToString();
            }

            SetBallNumberVisibility(targetText, false);
            return true;
        }

        CandyBallVisualCatalog.LogMissingVisual(ballNumber, targetImage != null ? targetImage.gameObject.name : "ball-target");

        Sprite resolvedFallbackSprite = fallbackSprite != null
            ? fallbackSprite
            : ResolveFallbackBallSprite(fallbackSpriteSet, ballNumber);

        if (targetImage != null && resolvedFallbackSprite != null)
        {
            targetImage.sprite = resolvedFallbackSprite;
            targetImage.preserveAspect = true;
        }

        SetBallNumberVisibility(targetText, true);
        RealtimeTextStyleUtils.ApplyBallNumber(targetText, ballNumber.ToString(), numberFallbackFont);
        return false;
    }

    private static Vector2 GetBallSlotAnchoredPosition(int slotIndex)
    {
        int row = slotIndex / RealtimeBallColumns;
        int col = slotIndex % RealtimeBallColumns;
        float x = (col - ((RealtimeBallColumns - 1) * 0.5f)) * RealtimeBallSpacingX;
        float y = row == 0 ? RealtimeBallTopRowY : RealtimeBallBottomRowY;
        return new Vector2(x, y);
    }

    private static void ApplyBigBallTextLayout(TextMeshProUGUI target)
    {
        if (target == null)
        {
            return;
        }

        RectTransform rect = target.rectTransform;
        if (rect != null)
        {
            rect.anchorMin = new Vector2(0.5f, 0.5f);
            rect.anchorMax = new Vector2(0.5f, 0.5f);
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.anchoredPosition = new Vector2(0f, BigBallNumberYOffset);
            rect.localScale = Vector3.one;
        }

        target.alignment = TextAlignmentOptions.CenterGeoAligned;
        target.enableAutoSizing = true;
        target.fontSizeMin = BigBallNumberFontMin;
        target.fontSizeMax = BigBallNumberFontMax;
        target.overflowMode = TextOverflowModes.Overflow;
    }

    private void HideGameplayOverlays()
    {
        // Legacy overlay suppression started hiding live controls after the scene cleanup.
        // Keep the method as a no-op so existing call sites stay harmless.
        return;

        for (int i = 0; i < GameplayOverlayPathsToHide.Length; i++)
        {
            string path = GameplayOverlayPathsToHide[i];
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            GameObject target = ResolveSceneObjectByPath(path);
            if (target != null && target.activeSelf)
            {
                target.SetActive(false);
            }
        }

        Image[] sceneImages = FindObjectsByType<Image>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        for (int i = 0; i < sceneImages.Length; i++)
        {
            Image image = sceneImages[i];
            if (image == null || image.sprite == null)
            {
                continue;
            }

            if (image.gameObject.scene != gameObject.scene)
            {
                continue;
            }

            string spriteName = image.sprite.name;
            for (int nameIndex = 0; nameIndex < GameplayOverlaySpriteNamesToHide.Length; nameIndex++)
            {
                if (spriteName == GameplayOverlaySpriteNamesToHide[nameIndex] && image.gameObject.activeSelf)
                {
                    image.gameObject.SetActive(false);
                    break;
                }
            }
        }
    }

    private GameObject ResolveSceneObjectByPath(string path)
    {
        if (cachedOverlayObjects.TryGetValue(path, out GameObject cached) && cached != null)
        {
            return cached;
        }

        string[] parts = path.Split('/');
        if (parts.Length == 0)
        {
            return null;
        }

        Scene activeScene = gameObject.scene;
        if (!activeScene.IsValid())
        {
            return null;
        }

        GameObject[] roots = activeScene.GetRootGameObjects();
        Transform current = null;
        for (int i = 0; i < roots.Length; i++)
        {
            if (roots[i] != null && roots[i].name == parts[0])
            {
                current = roots[i].transform;
                break;
            }
        }

        if (current == null)
        {
            return null;
        }

        for (int i = 1; i < parts.Length; i++)
        {
            current = current.Find(parts[i]);
            if (current == null)
            {
                return null;
            }
        }

        GameObject resolved = current.gameObject;
        cachedOverlayObjects[path] = resolved;
        return resolved;
    }

    private void ApplyGlassAnimationSpeed(bool force = false)
    {
        if (overrideTheme1GlassMotion && customGlassMotionActive)
        {
            return;
        }

        if (cachedGlassAnimators.Count == 0)
        {
            return;
        }

        // Keep a stable visual speed even when global testing Time.timeScale is > 1.
        float visualSpeed = Mathf.Clamp(glassAnimationSpeedMultiplier, 0.1f, 1f);
        float timeScaleCompensation = Mathf.Max(0.01f, Time.timeScale);
        float desiredSpeed = visualSpeed / timeScaleCompensation;

        if (!force && Mathf.Abs(appliedGlassAnimatorSpeed - desiredSpeed) < 0.001f)
        {
            return;
        }

        for (int i = 0; i < cachedGlassAnimators.Count; i++)
        {
            Animator animator = cachedGlassAnimators[i];
            if (animator != null)
            {
                animator.speed = desiredSpeed;
            }
        }

        appliedGlassAnimatorSpeed = desiredSpeed;
    }

    private void CacheTheme1MachineClusterBalls()
    {
        machineClusterBalls.Clear();
        machineClusterMotionReady = false;
        customGlassMotionActive = false;

        if (!overrideTheme1GlassMotion)
        {
            RestoreGlassAnimators();
            return;
        }

        if (ballOutMachineAnimParent == null)
        {
            return;
        }

        if (!string.Equals(SceneManager.GetActiveScene().name, "Theme1", System.StringComparison.Ordinal))
        {
            return;
        }

        RectTransform parentRect = ballOutMachineAnimParent.transform as RectTransform;
        if (parentRect == null)
        {
            return;
        }

        machineClusterBaseParentPosition = parentRect.anchoredPosition;

        System.Random random = new System.Random(31);
        for (int i = 0; i < parentRect.childCount; i++)
        {
            RectTransform childRect = parentRect.GetChild(i) as RectTransform;
            if (childRect == null || childRect.GetComponent<Image>() == null)
            {
                continue;
            }

            Vector2 basePosition = childRect.anchoredPosition;
            basePosition = new Vector2(basePosition.x * 1.26f, (basePosition.y * 1.06f) - 10f);
            MachineClusterBall clusterBall = new MachineClusterBall
            {
                Rect = childRect,
                BasePosition = basePosition,
                CurrentPosition = basePosition,
                Velocity = Vector2.zero,
                BaseScale = childRect.localScale.x,
                OrbitRadiusX = Mathf.Lerp(1.5f, 4.2f, (float)random.NextDouble()),
                OrbitRadiusY = Mathf.Lerp(2.5f, 6.5f, (float)random.NextDouble()),
                OrbitSpeed = Mathf.Lerp(0.65f, 1.05f, (float)random.NextDouble()),
                OrbitPhase = (float)(random.NextDouble() * Mathf.PI * 2f),
                FlowAmplitudeX = Mathf.Lerp(6f, 12f, (float)random.NextDouble()),
                FlowAmplitudeY = Mathf.Lerp(22f, 38f, (float)random.NextDouble()),
                FlowSpeed = Mathf.Lerp(2.8f, 4.8f, (float)random.NextDouble()),
                FlowPhase = (float)(random.NextDouble() * Mathf.PI * 2f),
                NoiseSeedX = Mathf.Lerp(4f, 96f, (float)random.NextDouble()),
                NoiseSeedY = Mathf.Lerp(104f, 196f, (float)random.NextDouble()),
                NoiseSpeed = Mathf.Lerp(1.8f, 3.4f, (float)random.NextDouble()),
                JitterAmplitudeX = Mathf.Lerp(9f, 17f, (float)random.NextDouble()),
                JitterAmplitudeY = Mathf.Lerp(16f, 28f, (float)random.NextDouble()),
                RotationAmplitude = Mathf.Lerp(10f, 22f, (float)random.NextDouble()),
                ScaleAmplitude = Mathf.Lerp(0.025f, 0.065f, (float)random.NextDouble()),
                ScaleSpeed = Mathf.Lerp(4.4f, 6.8f, (float)random.NextDouble()),
                ShakeSeedA = Mathf.Lerp(220f, 480f, (float)random.NextDouble()),
                ShakeSeedB = Mathf.Lerp(520f, 820f, (float)random.NextDouble()),
                ShakeSeedC = Mathf.Lerp(920f, 1280f, (float)random.NextDouble())
            };

            childRect.anchoredPosition = basePosition;
            childRect.localScale = Vector3.one * clusterBall.BaseScale;
            machineClusterBalls.Add(clusterBall);
        }

        if (machineClusterBalls.Count == 0)
        {
            return;
        }

        for (int i = 0; i < cachedGlassAnimators.Count; i++)
        {
            Animator animator = cachedGlassAnimators[i];
            if (animator != null)
            {
                animator.enabled = false;
            }
        }

        machineClusterMotionReady = true;
        customGlassMotionActive = true;
    }

    private void RestoreGlassAnimators()
    {
        customGlassMotionActive = false;
        machineClusterMotionReady = false;
        machineClusterBalls.Clear();

        if (ballOutMachineAnimParent != null && ballOutMachineAnimParent.transform is RectTransform parentRect)
        {
            parentRect.anchoredPosition = machineClusterBaseParentPosition;
            parentRect.localEulerAngles = Vector3.zero;
        }

        for (int i = 0; i < cachedGlassAnimators.Count; i++)
        {
            Animator animator = cachedGlassAnimators[i];
            if (animator != null && !animator.enabled)
            {
                animator.enabled = true;
            }
        }
    }

    private void AnimateTheme1MachineCluster(float time, float dt)
    {
        if (!machineClusterMotionReady || !customGlassMotionActive || machineClusterBalls.Count == 0)
        {
            return;
        }

        if (ballOutMachineAnimParent == null || !ballOutMachineAnimParent.activeInHierarchy)
        {
            return;
        }

        float shakeBoost = 1f + (machineClusterRattleBoost * 2.45f);
        Vector2 clusterShake = new Vector2(
            ((((Mathf.PerlinNoise(14.7f, time * 15.4f) - 0.5f) * 2f) * 9f) + Mathf.Sin(time * 37.4f) * 4.8f + Mathf.Cos(time * 29.5f) * 3.1f + Mathf.Sign(Mathf.Sin(time * 17.8f)) * 2.8f) * shakeBoost,
            ((((Mathf.PerlinNoise(27.4f, time * 16.9f) - 0.5f) * 2f) * 17f) + Mathf.Sin(time * 34.6f) * 12.6f + Mathf.Cos(time * 41.8f) * 10.1f + Mathf.Sign(Mathf.Sin(time * 21.7f)) * 5.2f) * shakeBoost);
        Vector2 globalLift = new Vector2(
            Mathf.Sin(time * 6.2f) * 2.4f,
            Mathf.Sin(time * 9.6f) * 6.8f + Mathf.Cos(time * 5.4f) * 4.2f);
        if (ballOutMachineAnimParent.transform is RectTransform clusterParentRect)
        {
            Vector2 parentShake = new Vector2(clusterShake.x * 0.16f, clusterShake.y * 0.13f);
            clusterParentRect.anchoredPosition = machineClusterBaseParentPosition + parentShake;
            clusterParentRect.localEulerAngles = new Vector3(
                0f,
                0f,
                (Mathf.Sin(time * 12.6f) * 1.6f + Mathf.Cos(time * 8.4f) * 0.8f) * (0.45f + machineClusterRattleBoost));
        }

        for (int i = 0; i < machineClusterBalls.Count; i++)
        {
            MachineClusterBall ball = machineClusterBalls[i];
            if (ball.Rect == null)
            {
                continue;
            }

            float orbitTime = (time * ball.OrbitSpeed) + ball.OrbitPhase;
            Vector2 orbitOffset = new Vector2(
                Mathf.Cos(orbitTime) * ball.OrbitRadiusX,
                Mathf.Sin((orbitTime * 1.18f) + ball.FlowPhase) * ball.OrbitRadiusY);

            float flowTime = (time * ball.FlowSpeed) + ball.FlowPhase;
            Vector2 flowOffset = new Vector2(
                Mathf.Sin(flowTime) * ball.FlowAmplitudeX,
                Mathf.Cos(flowTime * 1.21f) * ball.FlowAmplitudeY * shakeBoost);

            float noiseTime = time * ball.NoiseSpeed;
            Vector2 jitterOffset = new Vector2(
                (((Mathf.PerlinNoise(ball.NoiseSeedX, noiseTime) - 0.5f) * 2f) * ball.JitterAmplitudeX +
                 Mathf.Sin((time * 22.4f) + ball.ShakeSeedA) * 4.1f +
                 Mathf.Sign(Mathf.Sin((time * 18.7f) + ball.ShakeSeedB)) * 2.4f) * shakeBoost,
                (((Mathf.PerlinNoise(ball.NoiseSeedY, noiseTime * 1.24f) - 0.5f) * 2f) * ball.JitterAmplitudeY +
                 Mathf.Cos((time * 27.7f) + ball.ShakeSeedB) * 6.4f +
                 Mathf.Sign(Mathf.Sin((time * 24.8f) + ball.ShakeSeedC)) * 4.2f) * shakeBoost);
            Vector2 microShake = new Vector2(
                Mathf.Sin((time * 31.8f) + ball.ShakeSeedC) * 4.8f + Mathf.Sign(Mathf.Sin((time * 39.4f) + ball.ShakeSeedA)) * 2.6f,
                Mathf.Cos((time * 37.6f) + ball.ShakeSeedA) * 8.1f + Mathf.Sign(Mathf.Sin((time * 43.2f) + ball.ShakeSeedB)) * 3.8f) * shakeBoost;

            Vector2 desiredPosition = ConstrainMachineClusterToGlobe(ball, ball.BasePosition + clusterShake + globalLift + orbitOffset + flowOffset + jitterOffset + microShake);
            Vector2 springDelta = desiredPosition - ball.CurrentPosition;
            float springStrength = 24.5f;
            float damping = Mathf.Clamp01(1f - (dt * 4.9f));
            ball.Velocity += springDelta * springStrength * dt;
            ball.Velocity += new Vector2(
                Mathf.Sin((time * 33.7f) + ball.ShakeSeedB) * 22f + Mathf.Sign(Mathf.Sin((time * 41.8f) + ball.ShakeSeedC)) * 14f,
                Mathf.Cos((time * 39.1f) + ball.ShakeSeedC) * 34f + Mathf.Sign(Mathf.Sin((time * 46.5f) + ball.ShakeSeedA)) * 22f) * (dt * shakeBoost);
            ball.Velocity *= damping;
            ball.CurrentPosition = ConstrainMachineClusterToGlobe(ball, ball.CurrentPosition + (ball.Velocity * dt));
            ball.Rect.anchoredPosition = ball.CurrentPosition;

            float rotation = (((Mathf.PerlinNoise(ball.NoiseSeedX + 34.2f, noiseTime * 1.5f) - 0.5f) * 2f) * ball.RotationAmplitude
                + Mathf.Sin((time * 21.8f) + ball.ShakeSeedA) * 4.8f) * shakeBoost;
            ball.Rect.localEulerAngles = new Vector3(0f, 0f, rotation);

            float scalePulse = 1f + (Mathf.Sin((time * ball.ScaleSpeed) + ball.FlowPhase) * ball.ScaleAmplitude);
            ball.Rect.localScale = Vector3.one * (ball.BaseScale * scalePulse);
        }

        machineClusterBalls.Sort((left, right) => left.Rect.anchoredPosition.y.CompareTo(right.Rect.anchoredPosition.y));
        for (int i = 0; i < machineClusterBalls.Count; i++)
        {
            if (machineClusterBalls[i].Rect != null)
            {
                machineClusterBalls[i].Rect.SetSiblingIndex(i);
            }
        }

        if (machineClusterRattleBoost > 0f)
        {
            machineClusterRattleBoost = Mathf.MoveTowards(machineClusterRattleBoost, 0f, dt * 0.55f);
        }
    }

    private static Vector2 ConstrainMachineClusterToGlobe(MachineClusterBall ball, Vector2 targetPosition)
    {
        float ballRadius = (25f * ball.BaseScale) + 2f;
        Vector2 ellipseCenter = new Vector2(0f, -4f);
        float radiusX = Mathf.Max(24f, 138f - (ballRadius * 0.88f));
        float radiusY = Mathf.Max(20f, 118f - (ballRadius * 0.88f));

        Vector2 relative = targetPosition - ellipseCenter;
        float nx = relative.x / radiusX;
        float ny = relative.y / radiusY;
        float magnitude = (nx * nx) + (ny * ny);
        if (magnitude <= 1f)
        {
            return targetPosition;
        }

        float scale = 1f / Mathf.Sqrt(magnitude);
        return ellipseCenter + new Vector2(relative.x * scale, relative.y * scale);
    }

    private void OnDisable()
    {
        EventManager.OnGenerateBall -= GenerateBall;
        EventManager.OnGenerateExtraBall -= GenerateExtraBall;
        EventManager.OnPlay -= ResetBalls;
        EventManager.OnTapForExtraBall -= ShowExtraBallOnTap;

        if (ballAnimationRoutine != null)
        {
            StopCoroutine(ballAnimationRoutine);
            ballAnimationRoutine = null;
        }

        if (extraBallBatchRoutine != null)
        {
            StopCoroutine(extraBallBatchRoutine);
            extraBallBatchRoutine = null;
        }

        foreach (Coroutine routine in extraBallMoveRoutines.Values)
        {
            if (routine != null)
            {
                StopCoroutine(routine);
            }
        }
        extraBallMoveRoutines.Clear();

    }


    void GetStartPosition_ExtraBalls()
    {
        for(int i = 0; i< extraBalls.Count; i++)
        {
            extraBaStartPos[i] = extraBalls[i].transform.localPosition;
            SetActiveIfChanged(extraBalls[i], false);
        }
    }

    void CacheBallComponentRefs()
    {
        ApplyExplicitRealtimeViewBindingsFromComponent();
        TryAutoResolveBallsFromHierarchy();
        ApplyRealtimeBallSlotLayout();

        cachedBallTransforms.Clear();
        cachedBallImages.Clear();
        cachedBallTexts.Clear();

        if (balls == null)
        {
            return;
        }

        for (int i = 0; i < balls.Count; i++)
        {
            GameObject ball = balls[i];
            Transform transformRef = ball != null ? ball.transform : null;
            cachedBallTransforms.Add(transformRef);
            CandyBallSlotBinding slotBinding =
                explicitViewBindings != null &&
                explicitViewBindings.Slots != null &&
                i < explicitViewBindings.Slots.Count
                    ? explicitViewBindings.Slots[i]
                    : null;
            cachedBallImages.Add(slotBinding != null ? slotBinding.Image : (ball != null ? ball.GetComponent<Image>() : null));

            TextMeshProUGUI label = slotBinding != null
                ? slotBinding.NumberText
                : Theme1GameplayViewRepairUtils.FindDedicatedBallNumberLabel(ball);

            cachedBallTexts.Add(label);
        }
    }

    private void TryAutoResolveBallsFromHierarchy()
    {
        if (explicitViewBindings != null && explicitViewBindings.Slots != null && explicitViewBindings.Slots.Count > 0)
        {
            return;
        }

        if (balls != null && balls.Count > 0)
        {
            return;
        }

        if (ballMachine == null)
        {
            return;
        }

        Image[] images = ballMachine.GetComponentsInChildren<Image>(true);
        if (images == null || images.Length == 0)
        {
            return;
        }

        SortedDictionary<int, GameObject> numberedBalls = new SortedDictionary<int, GameObject>();
        List<GameObject> fallbackBalls = new List<GameObject>();
        HashSet<int> seenInstanceIds = new HashSet<int>();

        for (int i = 0; i < images.Length; i++)
        {
            Image image = images[i];
            if (image == null)
            {
                continue;
            }

            GameObject candidate = image.gameObject;
            if (candidate == null)
            {
                continue;
            }

            if (bigBallImg != null && candidate == bigBallImg.gameObject)
            {
                continue;
            }

            if (extraBalls != null && extraBalls.Contains(candidate))
            {
                continue;
            }

            if (candidate.GetComponent<Image>() == null)
            {
                continue;
            }

            int instanceId = candidate.GetInstanceID();
            if (!seenInstanceIds.Add(instanceId))
            {
                continue;
            }

            if (int.TryParse(candidate.name, out int parsedOrder))
            {
                if (!numberedBalls.ContainsKey(parsedOrder))
                {
                    numberedBalls.Add(parsedOrder, candidate);
                }
            }
            else
            {
                fallbackBalls.Add(candidate);
            }
        }

        List<GameObject> resolved = new List<GameObject>(numberedBalls.Count + fallbackBalls.Count);
        foreach (KeyValuePair<int, GameObject> pair in numberedBalls)
        {
            resolved.Add(pair.Value);
        }

        for (int i = 0; i < fallbackBalls.Count; i++)
        {
            resolved.Add(fallbackBalls[i]);
        }

        if (resolved.Count == 0)
        {
            return;
        }

        balls = resolved;
        if (verboseDrawLogging)
        {
            Debug.Log($"[BallManager] Auto-resolved {balls.Count} ball object(s) from scene hierarchy.");
        }
    }

    void CacheExtraBallTextRefs()
    {
        cachedExtraBallTexts.Clear();
        if (extraBalls == null)
        {
            return;
        }

        for (int i = 0; i < extraBalls.Count; i++)
        {
            CacheExtraBallText(extraBalls[i]);
        }
    }

    void CacheExtraBallText(GameObject obj)
    {
        if (obj == null || cachedExtraBallTexts.ContainsKey(obj))
        {
            return;
        }

        Transform tr = obj.transform;
        TextMeshProUGUI text = tr != null
            ? tr.GetComponentInChildren<TextMeshProUGUI>(true)
            : null;

        cachedExtraBallTexts[obj] = text;
    }

    TextMeshProUGUI ResolveBigBallText()
    {
        explicitViewBindings = explicitViewBindings != null
            ? explicitViewBindings
            : GetComponent<CandyBallViewBindingSet>();

        if (explicitViewBindings != null && explicitViewBindings.BigBallText != null)
        {
            cachedBigBallText = explicitViewBindings.BigBallText;
            ApplyBigBallTextLayout(cachedBigBallText);
            return cachedBigBallText;
        }

        if (cachedBigBallText != null)
        {
            ApplyBigBallTextLayout(cachedBigBallText);
            return cachedBigBallText;
        }

        if (bigBallImg == null)
        {
            return null;
        }

        cachedBigBallText = Theme1GameplayViewRepairUtils.FindDedicatedBigBallNumberLabel(bigBallImg);
        ApplyBigBallTextLayout(cachedBigBallText);
        return cachedBigBallText;
    }

    public void ApplyExplicitRealtimeViewBindingsFromComponent()
    {
        explicitViewBindings = explicitViewBindings != null
            ? explicitViewBindings
            : GetComponent<CandyBallViewBindingSet>();

        if (explicitViewBindings == null)
        {
            return;
        }

        if (explicitViewBindings.BigBallImage != null)
        {
            bigBallImg = explicitViewBindings.BigBallImage;
        }

        if (explicitViewBindings.BallOutMachineAnimParent != null)
        {
            ballOutMachineAnimParent = explicitViewBindings.BallOutMachineAnimParent;
        }

        if (explicitViewBindings.BallMachine != null)
        {
            ballMachine = explicitViewBindings.BallMachine;
        }

        if (explicitViewBindings.ExtraBallMachine != null)
        {
            extraBallMachine = explicitViewBindings.ExtraBallMachine;
        }

        if (explicitViewBindings.Slots != null && explicitViewBindings.Slots.Count > 0)
        {
            if (balls == null)
            {
                balls = new List<GameObject>(explicitViewBindings.Slots.Count);
            }
            else
            {
                balls.Clear();
            }

            for (int i = 0; i < explicitViewBindings.Slots.Count; i++)
            {
                balls.Add(explicitViewBindings.Slots[i] != null ? explicitViewBindings.Slots[i].Root : null);
            }
        }

        if (explicitViewBindings.ExtraBalls != null)
        {
            if (extraBalls == null)
            {
                extraBalls = new List<GameObject>(explicitViewBindings.ExtraBalls.Count);
            }
            else
            {
                extraBalls.Clear();
            }

            for (int i = 0; i < explicitViewBindings.ExtraBalls.Count; i++)
            {
                extraBalls.Add(explicitViewBindings.ExtraBalls[i]);
            }
        }

        cachedBigBallText = explicitViewBindings.BigBallText;
    }

    static void SetActiveIfChanged(GameObject obj, bool active)
    {
        if (obj != null && obj.activeSelf != active)
        {
            obj.SetActive(active);
        }
    }

    static void KillTransformTweens(Transform target)
    {
        if (target != null)
        {
            target.DOKill(false);
        }
    }

    void CacheRealtimeBallLayoutPositions()
    {
        if (balls == null || balls.Count == 0)
        {
            return;
        }

        if (realtimeBallLayoutPositions.Count == balls.Count)
        {
            return;
        }

        realtimeBallLayoutPositions.Clear();
        for (int i = 0; i < balls.Count; i++)
        {
            Transform transformRef = i < cachedBallTransforms.Count ? cachedBallTransforms[i] : balls[i].transform;
            realtimeBallLayoutPositions.Add(transformRef != null ? transformRef.localPosition : Vector3.zero);
        }
    }

    public void ShowRealtimeDrawBall(int drawIndex, int drawnNumber)
    {
        ApplyExplicitRealtimeViewBindingsFromComponent();
        TryAutoResolveBallsFromHierarchy();
        CacheBallComponentRefs();
        CacheTheme1MachineClusterBalls();
        if (overrideTheme1GlassMotion)
        {
            machineClusterRattleBoost = Mathf.Max(machineClusterRattleBoost, 1.15f);
        }

        TMP_FontAsset numberFallbackFont = RealtimeTextStyleUtils.ResolveFallbackFont();
        CacheRealtimeBallLayoutPositions();

        SetActiveIfChanged(ballOutMachineAnimParent, true);
        SetActiveIfChanged(ballMachine, true);
        SetActiveIfChanged(extraBallMachine, false);

        if (bigBallImg != null)
        {
            SetActiveIfChanged(bigBallImg.gameObject, true);
            TextMeshProUGUI bigBallText = ResolveBigBallText();
            bool usedNumberedBigBall = ApplyBallVisual(bigBallImg, bigBallText, drawnNumber, numberFallbackFont, bigBallSprite);
            if (bigBallText == null && !usedNumberedBigBall)
            {
                APIManager.instance?.ReportRealtimeRenderMismatch("draw received but no big ball text target", asError: true);
            }
        }

        if (balls == null || balls.Count == 0)
        {
            return;
        }

        int slotIndex = drawIndex;
        if (slotIndex < 0)
        {
            slotIndex = 0;
        }
        else if (slotIndex >= balls.Count)
        {
            slotIndex %= balls.Count;
        }

        GameObject ballObject = balls[slotIndex];
        if (ballObject == null)
        {
            return;
        }

        SetActiveIfChanged(ballObject, true);

        Image img = slotIndex < cachedBallImages.Count ? cachedBallImages[slotIndex] : ballObject.GetComponent<Image>();
        TextMeshProUGUI tmp = slotIndex < cachedBallTexts.Count ? cachedBallTexts[slotIndex] : null;
        TextMeshProUGUI bigBallLabel = ResolveBigBallText();
        bool usedNumberedSlotBall = ApplyBallVisual(img, tmp, drawnNumber, numberFallbackFont, ballSprite);
        int configuredOverlayTargetCount = cachedBallTexts.Count;
        if (configuredOverlayTargetCount <= 0 && usedNumberedSlotBall)
        {
            configuredOverlayTargetCount = 1;
        }

        if (tmp != null)
        {
            APIManager.instance?.RegisterRealtimeBallRendered(
                drawnNumber,
                slotIndex,
                configuredOverlayTargetCount,
                tmp,
                bigBallLabel);
        }
        else if (usedNumberedSlotBall)
        {
            APIManager.instance?.RegisterRealtimeBallRendered(
                drawnNumber,
                slotIndex,
                configuredOverlayTargetCount,
                null,
                bigBallLabel);
        }
        else
        {
            APIManager.instance?.ReportRealtimeRenderMismatch(
                $"draw received but no ball text target for slot {slotIndex}",
                asError: true);
        }

        Transform ballTransform = slotIndex < cachedBallTransforms.Count ? cachedBallTransforms[slotIndex] : null;
        if (ballTransform == null)
        {
            ballTransform = ballObject.transform;
        }

        if (ballTransform != null && slotIndex < realtimeBallLayoutPositions.Count)
        {
            ballTransform.localPosition = realtimeBallLayoutPositions[slotIndex];
        }
    }

    void GenerateBall(List<int> _ballIndexList)
    {
        if (APIManager.instance != null && APIManager.instance.UseRealtimeBackend)
        {
            APIManager.instance.ReportLegacyVisualWriteAttempt("BallManager.GenerateBall");
            return;
        }

        //Debug.Log(_ballIndexList.Count);
        ballIndexList = _ballIndexList;
        //debug.Log()
        TryAutoResolveBallsFromHierarchy();
        CacheBallComponentRefs();
        CacheTheme1MachineClusterBalls();
        if (overrideTheme1GlassMotion)
        {
            machineClusterRattleBoost = Mathf.Max(machineClusterRattleBoost, 1.15f);
        }
        bool realtimeMode = APIManager.instance != null && APIManager.instance.UseRealtimeBackend;
        SetActiveIfChanged(ballOutMachineAnimParent, realtimeMode);

        AddRandomBallSprites();
        if (ballAnimationRoutine != null)
        {
            StopCoroutine(ballAnimationRoutine);
        }

        ballAnimationRoutine = StartCoroutine(StartBallAnim());
    }



    void ShowExtraBallOnTap(bool isExtraBallLeft)
    {
        SetActiveIfChanged(extraBallMachine, isExtraBallLeft);
        SetActiveIfChanged(bigBallImg != null ? bigBallImg.gameObject : null, false);
        SetActiveIfChanged(ballMachine, !isExtraBallLeft);
        if (isExtraBallLeft)
        {
            for (int i = 0; i < 4; i++)
            {

                EventManager.ShowMissingPL(i, true);
            }
        }

        
    }

    int ballIndex = 0;
    void GenerateExtraBall(List<int> _ballIndexList, bool showExtraBall, bool showFreeExtraBall)
    {
        if (APIManager.instance != null && APIManager.instance.UseRealtimeBackend)
        {
            APIManager.instance.ReportLegacyVisualWriteAttempt("BallManager.GenerateExtraBall");
            return;
        }

        if (verboseDrawLogging)
        {
            Debug.Log("___showFreeExtraBall ------: " + showFreeExtraBall);
        }

        ballIndexList = _ballIndexList;
        if (showFreeExtraBall)
        {
            if (verboseDrawLogging)
            {
                Debug.Log("Show Extra Ball : " + ballIndexList.Count);
            }

            if (extraBallBatchRoutine != null)
            {
                StopCoroutine(extraBallBatchRoutine);
            }

            extraBallBatchRoutine = StartCoroutine(StartExtaBallAnim(ballIndexList, showExtraBall));        //For Auto show 5 extra balls
        }//StartCoroutine(StartExtaBallAnim(showExtraBall, ballIndex++));            //For Tap and show extra ball
        else
        {
            StartExtaBallAnim(showExtraBall, ballIndex++);
        }
    }

    void AddRandomBallSprites()
    {
        TMP_FontAsset numberFallbackFont = RealtimeTextStyleUtils.ResolveFallbackFont();
        bigBallSpriteSequence.Clear();
        int count = Mathf.Min(balls.Count, ballIndexList.Count);
        for(int i = 0; i < count; i++)
        {
            TextMeshProUGUI numberText = i < cachedBallTexts.Count ? cachedBallTexts[i] : null;
            Image img = i < cachedBallImages.Count ? cachedBallImages[i] : null;
            int ballNumber = ballIndexList[i];
            ApplyBallVisual(img, numberText, ballNumber, numberFallbackFont, ballSprite);

            Sprite bigSprite = null;
            if (!TryGetNumberedBallSprite(ballNumber, out bigSprite))
            {
                bigSprite = ResolveFallbackBallSprite(bigBallSprite, ballNumber);
            }

            if (bigSprite != null)
            {
                bigBallSpriteSequence.Add(bigSprite);
            }
        }
    }

 

    IEnumerator StartBallAnim()
    {
        TMP_FontAsset numberFallbackFont = RealtimeTextStyleUtils.ResolveFallbackFont();
        if (!bigBallImg.isActiveAndEnabled)
        {
            SetActiveIfChanged(ballMachine, true);
            SetActiveIfChanged(extraBallMachine, false);
            SetActiveIfChanged(bigBallImg.gameObject, true);
        }

        TextMeshProUGUI bigBallText = ResolveBigBallText();
        int count = Mathf.Min(balls.Count, ballIndexList.Count);
        for (int i = 0; i < count; i++)
        {
            ApplyBallVisual(
                bigBallImg,
                bigBallText,
                ballIndexList[i],
                numberFallbackFont,
                bigBallSprite,
                i < bigBallSpriteSequence.Count ? bigBallSpriteSequence[i] : null);


            Transform ballTransform = i < cachedBallTransforms.Count ? cachedBallTransforms[i] : balls[i].transform;
            ballTransform.localPosition = new Vector2(0, 100);
            SetActiveIfChanged(balls[i], true);
            yield return new WaitForSeconds(numberGenerator.ballAnimSpeed);
            KillTransformTweens(ballTransform);
            ballTransform.DOLocalMove(GetBallSlotAnchoredPosition(i), numberGenerator.ballAnimSpeed);
            
            EventManager.ShowBallOnCard(i);

            if (i == 14 || i == 29)
            {
                yield return null;
            }
            else {
                yield return new WaitForSeconds(numberGenerator.ballAnimSpeed);
            }
        }

        ballAnimationRoutine = null;
    }

    IEnumerator StartExtaBallAnim(List<int> ballIndexList, bool showExtraBall)
    {
        TMP_FontAsset numberFallbackFont = RealtimeTextStyleUtils.ResolveFallbackFont();
        if(showExtraBall){
            //Debug.Log("StartExtrBallAnim");
            TextMeshProUGUI bigBallText = ResolveBigBallText();
            if (bigBallText != null)
            {
                bigBallText.color = Color.white;
            }
            for (int i = 0; i < ballIndexList.Count-30; i++)
            {
                int ballNumber = ballIndexList[30 + i];
                ApplyBallVisual(bigBallImg, bigBallText, ballNumber, numberFallbackFont, null, extraBallSprite);
                if (bigBallText != null)
                {
                    bigBallText.color = Color.white;
                }
                if (!extraBalls[i].activeInHierarchy)
                {
                    Image extraBallImage = extraBalls[i] != null ? extraBalls[i].GetComponent<Image>() : null;
                    TextMeshProUGUI extraBallText = cachedExtraBallTexts.TryGetValue(extraBalls[i], out TextMeshProUGUI cachedText)
                        ? cachedText
                        : null;
                    ApplyBallVisual(extraBallImage, extraBallText, ballNumber, numberFallbackFont, null, extraBallSprite);
                    //extraBalls[i].transform.GetChild(0).GetComponent<TextMeshProUGUI>().text = ballIndexList[ballIndexList.Count-1].ToString(); //NumberGenerator.generatedNO[30+i]

                    extraBalls[i].transform.localPosition = new Vector2(0, 100);
                    SetActiveIfChanged(extraBalls[i], true);
                    KillTransformTweens(extraBalls[i].transform);
                    extraBalls[i].transform.DOLocalMove(extraBaStartPos[i], ballAnimSpeed);
                    numberGenerator.totalExtraBallCount--;
                    numberGenerator.extraBallCountText.text = numberGenerator.totalExtraBallCount.ToString();
                    yield return new WaitForSeconds(ballAnimSpeed + 0.5f);
                    EventManager.ShowBallOnCard(30 + i);
                }
            }
        }
        //NumberGenerator.isExtraBallDone = true;
        for (int i = 0; i < 4; i++)
        {
            EventManager.ShowMissingPL(i, true);
        }

        SetActiveIfChanged(bigBallImg.gameObject, false);
        TextMeshProUGUI resetBigBallText = ResolveBigBallText();
        if (resetBigBallText != null)
        {
            SetBallNumberVisibility(resetBigBallText, true);
            resetBigBallText.color = Color.black;
        }
        numberGenerator?.NotifyLegacyFreeExtraBallsCompleted();
        EventManager.AutoSpinOver(true);
        extraBallBatchRoutine = null;
    }


    void StartExtaBallAnim(bool showExtraBall, int index)
    {
        if (showExtraBall)
        {
            if (instantiatedExtraBall.Count == 0 || instantiatedExtraBall.Count-1 < index)
            {
                GameObject g = Instantiate(ballPrefab, extraBallParent);
                CacheExtraBallText(g);
                Image extraBallImage = g.GetComponent<Image>();
                TextMeshProUGUI extraBallText = cachedExtraBallTexts.TryGetValue(g, out TextMeshProUGUI cachedText) ? cachedText : null;
                int ballNumber = ballIndexList != null && ballIndexList.Count > 0 ? ballIndexList[ballIndexList.Count - 1] : 0;
                ApplyBallVisual(extraBallImage, extraBallText, ballNumber, RealtimeTextStyleUtils.ResolveFallbackFont(), ballSprite);
                StartExtraBallMoveRoutine(g, index);
                instantiatedExtraBall.Add(g);
            }
            else
            {
                StartExtraBallMoveRoutine(instantiatedExtraBall[index], index);
            }
            //extraBalls[index].transform.GetChild(0).GetComponent<TextMeshProUGUI>().text = ballIndexList[ballIndexList.Count - 1].ToString(); //NumberGenerator.generatedNO[30+i]

            //extraBalls[index].transform.localPosition = new Vector2(0, 100);
            //extraBalls[index].SetActive(true);
            //extraBalls[index].transform.DOLocalMove(extraBaStartPos[index], ballAnimSpeed);
            //yield return new WaitForSeconds(ballAnimSpeed + 0.5f);
            //EventManager.ShowBallOnCard(ballIndexList.Count - 1);


            ////extraBalls[i].transform.GetChild(0).GetComponent<TextMeshProUGUI>().text = ballIndexList[30 + i].ToString(); //NumberGenerator.generatedNO[30+i]
            //extraBalls[index].transform.GetChild(0).GetComponent<TextMeshProUGUI>().text = ballIndexList[ballIndexList.Count - 1].ToString(); //NumberGenerator.generatedNO[30+i]

            //extraBalls[index].transform.localPosition = new Vector2(0, 100);
            //extraBalls[index].SetActive(true);
            //extraBalls[index].transform.DOLocalMove(extraBaStartPos[index], ballAnimSpeed);
            //yield return new WaitForSeconds(ballAnimSpeed + 0.5f);
            //EventManager.ShowBallOnCard(ballIndexList.Count-1);

        }
        //NumberGenerator.isExtraBallDone = true;
        // Debug.Log("FA");
        for (int i = 0; i < 4; i++)
        {
            EventManager.ShowMissingPL(i, true);
        }
    }

    void StartExtraBallMoveRoutine(GameObject target, int index)
    {
        if (target == null)
        {
            return;
        }

        if (extraBallMoveRoutines.TryGetValue(target, out Coroutine existing) && existing != null)
        {
            StopCoroutine(existing);
        }

        Coroutine routine = StartCoroutine(ModifyExtraBallPos(target, index));
        extraBallMoveRoutines[target] = routine;
    }

    IEnumerator ModifyExtraBallPos(GameObject g, int index)
    {
        TMP_FontAsset numberFallbackFont = RealtimeTextStyleUtils.ResolveFallbackFont();
        CacheExtraBallText(g);
        TextMeshProUGUI extraBallText = cachedExtraBallTexts.TryGetValue(g, out TextMeshProUGUI cachedText) ? cachedText : null;
        Image extraBallImage = g != null ? g.GetComponent<Image>() : null;
        int ballNumber = ballIndexList[ballIndexList.Count - 1];
        ApplyBallVisual(extraBallImage, extraBallText, ballNumber, numberFallbackFont, ballSprite);
        g.transform.localPosition = new Vector2(0, 150);
        SetActiveIfChanged(g, true);

       // yield return new WaitForSeconds(numberGenerator.ballAnimSpeed);

        KillTransformTweens(g.transform);
        if (index < 5)
            g.transform.DOLocalMoveY(-235 + 100, numberGenerator.ballAnimSpeed);
        else if (index < 10)
            g.transform.DOLocalMoveY(-165 + 100, numberGenerator.ballAnimSpeed);
        else if (index < 15)
            g.transform.DOLocalMoveY(-95 + 100, numberGenerator.ballAnimSpeed);
        else
            g.transform.DOLocalMoveY(-25 + 100, numberGenerator.ballAnimSpeed);

        yield return new WaitForSeconds(numberGenerator.ballAnimSpeed);
        //Debug.Log(g.transform.localPosition.y);
        if ((index + 1) % 5 == 0)
        {
            yield return null;
        }
        else
        {
            KillTransformTweens(g.transform);
            g.transform.DOLocalMoveX(extraBallPosArr[index % 5], numberGenerator.ballAnimSpeed);

        }
        yield return new WaitForSeconds(numberGenerator.ballAnimSpeed);
        EventManager.ShowBallOnCard(ballIndexList.Count - 1);
        numberGenerator?.NotifyLegacyExtraBallAnimationCompleted();
        extraBallMoveRoutines.Remove(g);
    }

    public void ResetBalls()
    {
        if (extraBallMachine != null)
        {
            SetActiveIfChanged(extraBallMachine, false);
        }

        StopAllCoroutines();
        ballAnimationRoutine = null;
        extraBallBatchRoutine = null;
        extraBallMoveRoutines.Clear();
        if (balls != null)
        {
            foreach (var e in balls)
            {
                if (e != null)
                {
                    KillTransformTweens(e.transform);
                    SetActiveIfChanged(e, false);
                }
            }
        }

        if (extraBalls != null)
        {
            foreach (var e in extraBalls)
            {
                if (e != null)
                {
                    KillTransformTweens(e.transform);
                    SetActiveIfChanged(e, false);
                }
            }
        }

        ballIndex = 0;
        foreach (var g in instantiatedExtraBall)
        {
            if (g != null)
            {
                KillTransformTweens(g.transform);
                SetActiveIfChanged(g, false);
            }
        }

        if (bigBallImg != null)
        {
            SetActiveIfChanged(bigBallImg.gameObject, false);
        }

        if (ballMachine != null)
        {
            SetActiveIfChanged(ballMachine, false);
        }

        SetActiveIfChanged(ballOutMachineAnimParent, true);
    }


}
