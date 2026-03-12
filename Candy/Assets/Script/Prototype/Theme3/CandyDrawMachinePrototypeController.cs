using System;
using System.Collections.Generic;
using System.IO;
using DG.Tweening;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
#endif

[DefaultExecutionOrder(-1000)]
public sealed class CandyDrawMachinePrototypeController : MonoBehaviour
{
    private const string MachineSpritePath = "CandyPrototype/bingoballer";
    private const string NumberedBallSpriteResourcesPath = "CandyBallSprites";
    private const string FredokaBoldPath = "CandyTypography/TMP/CandyFredokaBoldSDF";
    private const string FredokaSemiBoldPath = "CandyTypography/TMP/CandyFredokaSemiBoldSDF";
    private const int TotalClusterBallCount = 60;
    private static readonly Vector2 GlobeMaskSize = new(526f, 492f);
    private static readonly Vector2 GlobeMaskPosition = new(0f, 24f);
    private static readonly Vector2 GlobeFrontOverlaySize = new(540f, 504f);
    private static readonly Vector2 GlobeFrontOverlayPosition = new(0f, 26f);
    private static readonly Vector2 GlobeClusterBasePosition = new(0f, -12f);
    private const float MotionHalfWidth = 276f;
    private const float MotionHalfHeight = 238f;
    private const float MotionBottomInset = 14f;
    private const float MotionCenterYOffset = -20f;
    private const float MotionSpring = 8.8f;
    private const float MotionDamping = 0.922f;
    private const float MotionMaxSpeed = 268f;
    private const float FlowVerticalStrength = 18f;
    private const float FlowHorizontalStrength = 12f;
    private const float GlobalShakeX = 1.55f;
    private const float GlobalShakeY = 2.05f;
    private const float LocalJitterStrength = 24f;
    private const float LocalNoiseSpatialScale = 0.013f;
    private const float SeparationPadding = 10f;
    private const float SeparationStrength = 2.45f;
    private const float UniformBallRadius = 17f;
    private const float DepthScaleMin = 1f;
    private const float DepthScaleMax = 1f;
    private const float BrightnessMin = 0.82f;
    private const float BrightnessMax = 1.03f;
    private const float ShakeImpulseStrength = 44f;
    private const float ShakeImpulseFrequencyMin = 5.2f;
    private const float ShakeImpulseFrequencyMax = 9.8f;
    private const float BoundaryInsetSide = 12f;
    private const float BoundaryInsetTop = 9f;
    private const float BoundaryInsetBottom = 22f;
    private const float BoundarySafetyInset = 5f;
    private const float WanderStrength = 72f;
    private const float WanderFrequencyMin = 0.24f;
    private const float WanderFrequencyMax = 0.86f;

    private sealed class ClusterBall
    {
        public RectTransform Rect;
        public Image Image;
        public Vector2 RestPosition;
        public Vector2 Position;
        public Vector2 Velocity;
        public Vector2 AxisA;
        public Vector2 AxisB;
        public Vector2 AxisC;
        public float AmplitudeA;
        public float AmplitudeB;
        public float AmplitudeC;
        public float FrequencyA;
        public float FrequencyB;
        public float FrequencyC;
        public float PhaseA;
        public float PhaseB;
        public float PhaseC;
        public Vector2 VortexAxis;
        public float VortexRadius;
        public float VortexFrequency;
        public float VortexPhase;
        public float VortexStrength;
        public float VortexDirection;
        public Vector2 NoiseOffset;
        public float NoiseFrequency;
        public float NoiseStrength;
        public float DepthBase;
        public float DepthDriftAmplitude;
        public float DepthDriftFrequency;
        public float DepthDriftPhase;
        public float Radius;
        public float Response;
        public float MassBias;
        public float Spin;
        public float SpinSpeed;
        public Vector2 ShakeAxisA;
        public Vector2 ShakeAxisB;
        public float ShakeFrequencyA;
        public float ShakeFrequencyB;
        public float ShakePhaseA;
        public float ShakePhaseB;
        public float ShakeStrength;
        public Vector2 WanderAxisA;
        public Vector2 WanderAxisB;
        public float WanderAmplitudeA;
        public float WanderAmplitudeB;
        public float WanderFrequencyA;
        public float WanderFrequencyB;
        public float WanderPhaseA;
        public float WanderPhaseB;
    }

    [SerializeField] private Vector2 referenceResolution = new(1600f, 900f);
    [SerializeField] private float autoDrawIntervalSeconds = 2.4f;
    [SerializeField] private int recentBallLimit = 12;

    private readonly List<ClusterBall> clusterBalls = new();
    private readonly List<Image> recentBallImages = new();
    private readonly Dictionary<int, Sprite> numberedBallSprites = new();
    private readonly List<int> drawSequence = new();

    private Canvas rootCanvas;
    private Camera sceneCamera;
    private RectTransform sceneRoot;
    private RectTransform machineRoot;
    private RectTransform machineImageRect;
    private RectTransform globeMaskRect;
    private RectTransform globeClusterRect;
    private RectTransform globeFrontOverlayRect;
    private RectTransform recentStripRoot;
    private RectTransform ejectBallRect;
    private Image ejectBallImage;
    private TMP_Text titleLabel;
    private TMP_Text subtitleLabel;
    private TMP_Text lastDrawLabel;
    private TMP_FontAsset boldFont;
    private TMP_FontAsset semiBoldFont;
    private Sprite machineSprite;
    private Sprite ellipseMaskSprite;
    private Sequence ejectSequence;

    private float timeSinceLastDraw;
    private int drawCursor;
    private float motionTime;

    private void Awake()
    {
        DOTween.Init(false, true, LogBehaviour.ErrorsOnly);
        EnsureAssetsLoaded();
        if (!TryBindExistingSceneGraph())
        {
            BuildSceneGraph();
            CreateClusterBalls();
            BuildRecentStrip();
        }
        else
        {
            RebindGeneratedCollections();
        }

        BindCanvasToCamera();
        ApplyPrototypeLayout();
        HideEjectBall();
        WarmSequence();
    }

    private void OnDestroy()
    {
        if (ejectSequence != null && ejectSequence.IsActive())
        {
            ejectSequence.Kill();
        }
    }

    private void Update()
    {
        if (ejectSequence != null && ejectSequence.IsActive() && ejectSequence.IsPlaying())
        {
            return;
        }

        timeSinceLastDraw += Time.unscaledDeltaTime;
        if (timeSinceLastDraw < autoDrawIntervalSeconds)
        {
            return;
        }

        timeSinceLastDraw = 0f;
        PlayNextDraw();
    }

    private void LateUpdate()
    {
        StepBallMotion(Mathf.Clamp(Time.unscaledDeltaTime, 0.001f, 0.033f));
    }

    private void EnsureAssetsLoaded()
    {
        machineSprite = Resources.Load<Sprite>(MachineSpritePath);
        if (machineSprite == null)
        {
            Texture2D machineTexture = Resources.Load<Texture2D>(MachineSpritePath);
            if (machineTexture != null)
            {
                machineSprite = Sprite.Create(
                    machineTexture,
                    new Rect(0f, 0f, machineTexture.width, machineTexture.height),
                    new Vector2(0.5f, 0.5f),
                    100f,
                    0,
                    SpriteMeshType.FullRect);
                machineSprite.name = machineTexture.name + "_RuntimeSprite";
                Debug.LogWarning($"[CandyPrototype] Maskinasset ble lastet som Texture2D. Opprettet runtime-sprite for {MachineSpritePath}.");
            }
        }

#if UNITY_EDITOR
        if (machineSprite == null)
        {
            const string editorAssetPath = "Assets/Resources/CandyPrototype/bingoballer.png";
            machineSprite = AssetDatabase.LoadAssetAtPath<Sprite>(editorAssetPath);
            if (machineSprite == null)
            {
                Texture2D editorTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(editorAssetPath);
                if (editorTexture != null)
                {
                    machineSprite = Sprite.Create(
                        editorTexture,
                        new Rect(0f, 0f, editorTexture.width, editorTexture.height),
                        new Vector2(0.5f, 0.5f),
                        100f,
                        0,
                        SpriteMeshType.FullRect);
                    machineSprite.name = editorTexture.name + "_EditorFallbackSprite";
                    Debug.LogWarning("[CandyPrototype] Bruker editor-fallback for maskinbildet.");
                }
            }
        }
#endif

        if (machineSprite == null)
        {
            string absoluteFallbackPath = Path.Combine(Application.dataPath, "Resources/CandyPrototype/bingoballer.png");
            if (File.Exists(absoluteFallbackPath))
            {
                byte[] bytes = File.ReadAllBytes(absoluteFallbackPath);
                Texture2D diskTexture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                if (diskTexture.LoadImage(bytes, false))
                {
                    machineSprite = Sprite.Create(
                        diskTexture,
                        new Rect(0f, 0f, diskTexture.width, diskTexture.height),
                        new Vector2(0.5f, 0.5f),
                        100f,
                        0,
                        SpriteMeshType.FullRect);
                    machineSprite.name = "bingoballer_DiskFallbackSprite";
                    Debug.LogWarning("[CandyPrototype] Bruker disk-fallback for maskinbildet.");
                }
            }
        }

        if (machineSprite == null)
        {
            throw new InvalidOperationException($"Fant ikke maskin-sprite eller texture på Resources/{MachineSpritePath}.");
        }

        boldFont = Resources.Load<TMP_FontAsset>(FredokaBoldPath);
        semiBoldFont = Resources.Load<TMP_FontAsset>(FredokaSemiBoldPath);

        Sprite[] ballSprites = Resources.LoadAll<Sprite>(NumberedBallSpriteResourcesPath);
        if (ballSprites == null || ballSprites.Length == 0)
        {
            throw new InvalidOperationException("Fant ikke nummererte ball-sprites under Resources/CandyBallSprites.");
        }

        numberedBallSprites.Clear();
        foreach (Sprite sprite in ballSprites)
        {
            if (sprite == null || !TryExtractLeadingNumber(sprite.name, out int ballNumber))
            {
                continue;
            }

            if (!numberedBallSprites.ContainsKey(ballNumber))
            {
                numberedBallSprites.Add(ballNumber, sprite);
            }
        }

        if (numberedBallSprites.Count < 60)
        {
            throw new InvalidOperationException($"Forventet 60 nummererte ball-sprites, fant {numberedBallSprites.Count}.");
        }

        drawSequence.Clear();
        for (int number = 1; number <= 60; number++)
        {
            drawSequence.Add(number);
        }

        ellipseMaskSprite = CreateEllipseMaskSprite(256);
    }

    private bool TryBindExistingSceneGraph()
    {
        rootCanvas = FindNamedComponentInChildren<Canvas>(transform, "PrototypeCanvas");
        sceneRoot = rootCanvas != null ? rootCanvas.GetComponent<RectTransform>() : null;
        machineRoot = FindNamedRectTransform("DrawMachineRoot");
        machineImageRect = FindNamedRectTransform("Machine");
        globeMaskRect = FindNamedRectTransform("GlobeMask");
        globeClusterRect = FindNamedRectTransform("BallCluster");
        globeFrontOverlayRect = FindNamedRectTransform("GlobeFrontOverlay");
        recentStripRoot = FindNamedRectTransform("RecentDrawStrip");
        ejectBallRect = FindNamedRectTransform("EjectBall");
        ejectBallImage = ejectBallRect != null ? ejectBallRect.GetComponent<Image>() : null;
        titleLabel = FindNamedComponentInChildren<TMP_Text>(transform, "PrototypeTitle");
        subtitleLabel = FindNamedComponentInChildren<TMP_Text>(transform, "PrototypeSubtitle");
        lastDrawLabel = FindNamedComponentInChildren<TMP_Text>(transform, "LastDrawLabel");

        return rootCanvas != null &&
               sceneRoot != null &&
               machineRoot != null &&
               machineImageRect != null &&
               globeMaskRect != null &&
               globeClusterRect != null &&
               globeFrontOverlayRect != null &&
               recentStripRoot != null &&
               ejectBallRect != null &&
               ejectBallImage != null;
    }

    private void RebindGeneratedCollections()
    {
        clusterBalls.Clear();
        recentBallImages.Clear();
        CreateClusterBalls();

        for (int index = 0; index < recentBallLimit; index++)
        {
            RectTransform rect = FindNamedRectTransform($"RecentBall{index + 1}");
            if (rect == null)
            {
                break;
            }

            Image image = rect.GetComponent<Image>();
            if (image != null)
            {
                recentBallImages.Add(image);
            }
        }

        if (recentBallImages.Count == 0)
        {
            BuildRecentStrip();
        }
    }

    private void BuildSceneGraph()
    {
        ClearGeneratedSceneGraph();

        rootCanvas = FindFirstObjectByType<Canvas>();
        if (rootCanvas == null)
        {
            GameObject canvasObject = CreateUiObject("PrototypeCanvas", transform);
            rootCanvas = canvasObject.AddComponent<Canvas>();
            rootCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvasObject.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvasObject.GetComponent<CanvasScaler>().referenceResolution = referenceResolution;
            canvasObject.GetComponent<CanvasScaler>().screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            canvasObject.GetComponent<CanvasScaler>().matchWidthOrHeight = 0.5f;
            canvasObject.AddComponent<GraphicRaycaster>();
        }

        sceneRoot = rootCanvas.GetComponent<RectTransform>();
        sceneRoot.sizeDelta = Vector2.zero;

        RectTransform panel = CreatePanel("PrototypeBackdrop", sceneRoot, new Color(0.18f, 0.08f, 0.21f, 1f));
        panel.anchorMin = Vector2.zero;
        panel.anchorMax = Vector2.one;
        panel.offsetMin = Vector2.zero;
        panel.offsetMax = Vector2.zero;

        machineRoot = CreateUiObject("DrawMachineRoot", sceneRoot).GetComponent<RectTransform>();
        machineRoot.anchorMin = new Vector2(0.5f, 0.5f);
        machineRoot.anchorMax = new Vector2(0.5f, 0.5f);
        machineRoot.pivot = new Vector2(0.5f, 0.5f);
        machineRoot.sizeDelta = new Vector2(620f, 720f);
        machineRoot.anchoredPosition = new Vector2(0f, 74f);

        Image machineImage = CreateUiObject("Machine", machineRoot).AddComponent<Image>();
        machineImageRect = machineImage.rectTransform;
        machineImageRect.anchorMin = new Vector2(0.5f, 0.5f);
        machineImageRect.anchorMax = new Vector2(0.5f, 0.5f);
        machineImageRect.pivot = new Vector2(0.5f, 0.5f);
        machineImageRect.sizeDelta = new Vector2(592f, 720f);
        machineImageRect.anchoredPosition = Vector2.zero;
        machineImage.sprite = machineSprite;
        machineImage.preserveAspect = true;

        globeMaskRect = CreateUiObject("GlobeMask", machineRoot).GetComponent<RectTransform>();
        globeMaskRect.anchorMin = new Vector2(0.5f, 0.5f);
        globeMaskRect.anchorMax = new Vector2(0.5f, 0.5f);
        globeMaskRect.pivot = new Vector2(0.5f, 0.5f);
        globeMaskRect.sizeDelta = GlobeMaskSize;
        globeMaskRect.anchoredPosition = GlobeMaskPosition;
        Image globeMaskImage = globeMaskRect.gameObject.AddComponent<Image>();
        globeMaskImage.sprite = ellipseMaskSprite;
        globeMaskImage.type = Image.Type.Simple;
        globeMaskImage.color = new Color(1f, 1f, 1f, 0.02f);
        Mask globeMask = globeMaskRect.gameObject.AddComponent<Mask>();
        globeMask.showMaskGraphic = false;

        globeClusterRect = CreateUiObject("BallCluster", globeMaskRect).GetComponent<RectTransform>();
        globeClusterRect.anchorMin = new Vector2(0.5f, 0.5f);
        globeClusterRect.anchorMax = new Vector2(0.5f, 0.5f);
        globeClusterRect.pivot = new Vector2(0.5f, 0.5f);
        globeClusterRect.sizeDelta = globeMaskRect.sizeDelta;
        globeClusterRect.anchoredPosition = GlobeClusterBasePosition;

        globeFrontOverlayRect = CreateUiObject("GlobeFrontOverlay", machineRoot).GetComponent<RectTransform>();
        globeFrontOverlayRect.anchorMin = new Vector2(0.5f, 0.5f);
        globeFrontOverlayRect.anchorMax = new Vector2(0.5f, 0.5f);
        globeFrontOverlayRect.pivot = new Vector2(0.5f, 0.5f);
        globeFrontOverlayRect.sizeDelta = GlobeFrontOverlaySize;
        globeFrontOverlayRect.anchoredPosition = GlobeFrontOverlayPosition;
        Image globeFrontOverlay = globeFrontOverlayRect.gameObject.AddComponent<Image>();
        globeFrontOverlay.sprite = ellipseMaskSprite;
        globeFrontOverlay.type = Image.Type.Simple;
        globeFrontOverlay.color = new Color(1f, 1f, 1f, 0.12f);

        Outline frontOutline = globeFrontOverlayRect.gameObject.AddComponent<Outline>();
        frontOutline.effectColor = new Color(1f, 0.76f, 0.88f, 0.42f);
        frontOutline.effectDistance = new Vector2(2f, -2f);

        RectTransform globeHighlight = CreateUiObject("GlobeFrontHighlight", globeFrontOverlayRect).GetComponent<RectTransform>();
        globeHighlight.anchorMin = new Vector2(0.18f, 0.68f);
        globeHighlight.anchorMax = new Vector2(0.42f, 0.9f);
        globeHighlight.offsetMin = Vector2.zero;
        globeHighlight.offsetMax = Vector2.zero;
        Image globeHighlightImage = globeHighlight.gameObject.AddComponent<Image>();
        globeHighlightImage.sprite = ellipseMaskSprite;
        globeHighlightImage.color = new Color(1f, 1f, 1f, 0.14f);

        RectTransform globeRim = CreateUiObject("GlobeFrontRim", machineRoot).GetComponent<RectTransform>();
        globeRim.anchorMin = new Vector2(0.5f, 0.5f);
        globeRim.anchorMax = new Vector2(0.5f, 0.5f);
        globeRim.pivot = new Vector2(0.5f, 0.5f);
        globeRim.sizeDelta = new Vector2(414f, 356f);
        globeRim.anchoredPosition = new Vector2(0f, 54f);
        Image globeRimImage = globeRim.gameObject.AddComponent<Image>();
        globeRimImage.sprite = ellipseMaskSprite;
        globeRimImage.color = new Color(1f, 1f, 1f, 0.015f);
        Outline globeRimOutline = globeRim.gameObject.AddComponent<Outline>();
        globeRimOutline.effectColor = new Color(0.96f, 0.28f, 0.38f, 0.75f);
        globeRimOutline.effectDistance = new Vector2(4f, -4f);

        ejectBallRect = CreateUiObject("EjectBall", machineRoot).GetComponent<RectTransform>();
        ejectBallRect.anchorMin = new Vector2(0.5f, 0.5f);
        ejectBallRect.anchorMax = new Vector2(0.5f, 0.5f);
        ejectBallRect.pivot = new Vector2(0.5f, 0.5f);
        ejectBallRect.sizeDelta = new Vector2(126f, 126f);
        ejectBallRect.anchoredPosition = new Vector2(0f, -218f);
        ejectBallImage = ejectBallRect.gameObject.AddComponent<Image>();
        ejectBallImage.preserveAspect = true;

        titleLabel = CreateText("PrototypeTitle", sceneRoot, "Theme 3 prototype", 44f, boldFont);
        titleLabel.rectTransform.anchorMin = new Vector2(0.5f, 1f);
        titleLabel.rectTransform.anchorMax = new Vector2(0.5f, 1f);
        titleLabel.rectTransform.pivot = new Vector2(0.5f, 1f);
        titleLabel.rectTransform.anchoredPosition = new Vector2(0f, -40f);
        titleLabel.color = Color.white;

        subtitleLabel = CreateText("PrototypeSubtitle", sceneRoot, "Ny glasskule med masket ballmasse og uttak", 22f, semiBoldFont);
        subtitleLabel.rectTransform.anchorMin = new Vector2(0.5f, 1f);
        subtitleLabel.rectTransform.anchorMax = new Vector2(0.5f, 1f);
        subtitleLabel.rectTransform.pivot = new Vector2(0.5f, 1f);
        subtitleLabel.rectTransform.anchoredPosition = new Vector2(0f, -92f);
        subtitleLabel.color = new Color(1f, 0.92f, 0.97f, 1f);

        recentStripRoot = CreateUiObject("RecentDrawStrip", sceneRoot).GetComponent<RectTransform>();
        recentStripRoot.anchorMin = new Vector2(0.5f, 0f);
        recentStripRoot.anchorMax = new Vector2(0.5f, 0f);
        recentStripRoot.pivot = new Vector2(0.5f, 0f);
        recentStripRoot.sizeDelta = new Vector2(1060f, 126f);
        recentStripRoot.anchoredPosition = new Vector2(0f, 46f);

        Image stripBackground = recentStripRoot.gameObject.AddComponent<Image>();
        stripBackground.color = new Color(0.32f, 0.1f, 0.29f, 0.86f);

        lastDrawLabel = CreateText("LastDrawLabel", recentStripRoot, "Siste trukne baller", 20f, semiBoldFont);
        lastDrawLabel.rectTransform.anchorMin = new Vector2(0f, 1f);
        lastDrawLabel.rectTransform.anchorMax = new Vector2(0f, 1f);
        lastDrawLabel.rectTransform.pivot = new Vector2(0f, 1f);
        lastDrawLabel.rectTransform.anchoredPosition = new Vector2(24f, -16f);
        lastDrawLabel.color = new Color(1f, 0.94f, 0.98f, 0.92f);
    }

    private void BindCanvasToCamera()
    {
        if (rootCanvas == null)
        {
            return;
        }

        sceneCamera = Camera.main;
        if (sceneCamera == null)
        {
            sceneCamera = FindFirstObjectByType<Camera>(FindObjectsInactive.Include);
        }

        if (sceneCamera == null)
        {
            return;
        }

        rootCanvas.renderMode = RenderMode.ScreenSpaceCamera;
        rootCanvas.worldCamera = sceneCamera;
        rootCanvas.planeDistance = 100f;
    }

    private void CreateClusterBalls()
    {
        clusterBalls.Clear();
        ClearChildren(globeClusterRect);
        System.Random random = new System.Random(31);
        List<int> availableNumbers = new List<int>(drawSequence);
        Shuffle(random, availableNumbers);
        motionTime = 0f;

        for (int index = 0; index < availableNumbers.Count; index++)
        {
            int number = availableNumbers[index];
            ClusterBall ball = CreateClusterBall(random, number, index);
            clusterBalls.Add(ball);
        }

        clusterBalls.Sort((left, right) => left.DepthBase.CompareTo(right.DepthBase));
        for (int index = 0; index < clusterBalls.Count; index++)
        {
            clusterBalls[index].Rect.SetSiblingIndex(index);
        }
    }

    private ClusterBall CreateClusterBall(System.Random random, int number, int index)
    {
        ClusterBall ball = new ClusterBall();
        ball.Rect = CreateUiObject($"Ball {number:00}", globeClusterRect).GetComponent<RectTransform>();
        ball.Rect.anchorMin = new Vector2(0.5f, 0.5f);
        ball.Rect.anchorMax = new Vector2(0.5f, 0.5f);
        ball.Rect.pivot = new Vector2(0.5f, 0.5f);
        ball.Image = ball.Rect.gameObject.AddComponent<Image>();
        ball.Image.sprite = numberedBallSprites[number];
        ball.Image.preserveAspect = true;

        float sequence = (index + 0.5f) / TotalClusterBallCount;
        float angle = (index * 2.39996323f) + Mathf.Lerp(-0.28f, 0.28f, (float)random.NextDouble());
        float radial = Mathf.Lerp(0.12f, 1.12f, Mathf.Pow(sequence, 0.8f)) * Mathf.Lerp(0.94f, 1.06f, (float)random.NextDouble());
        Vector2 direction = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle));
        Vector2 restPosition = new Vector2(
            direction.x * MotionHalfWidth * radial,
            direction.y * MotionHalfHeight * radial) + new Vector2(0f, MotionCenterYOffset * Mathf.Lerp(0.8f, 1.2f, (float)random.NextDouble()));
        restPosition.y += Mathf.Lerp(-44f, 16f, (float)random.NextDouble());

        ball.RestPosition = ClampToPrototypeEllipse(restPosition);
        ball.Position = ball.RestPosition;
        ball.Velocity = RandomInsideUnitCircle(random) * Mathf.Lerp(4f, 12f, (float)random.NextDouble());
        ball.AxisA = RandomDirection(random);
        ball.AxisB = RandomDirection(random);
        ball.AxisC = RandomDirection(random);
        ball.AmplitudeA = Mathf.Lerp(14f, 34f, (float)random.NextDouble());
        ball.AmplitudeB = Mathf.Lerp(10f, 28f, (float)random.NextDouble());
        ball.AmplitudeC = Mathf.Lerp(8f, 22f, (float)random.NextDouble());
        ball.FrequencyA = Mathf.Lerp(0.38f, 0.82f, (float)random.NextDouble());
        ball.FrequencyB = Mathf.Lerp(0.66f, 1.18f, (float)random.NextDouble());
        ball.FrequencyC = Mathf.Lerp(1.08f, 1.86f, (float)random.NextDouble());
        ball.PhaseA = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        ball.PhaseB = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        ball.PhaseC = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        ball.VortexAxis = RandomDirection(random);
        ball.VortexRadius = Mathf.Lerp(16f, 36f, (float)random.NextDouble());
        ball.VortexFrequency = Mathf.Lerp(0.18f, 0.54f, (float)random.NextDouble());
        ball.VortexPhase = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        ball.VortexStrength = Mathf.Lerp(8f, 20f, (float)random.NextDouble());
        ball.VortexDirection = random.NextDouble() > 0.5d ? 1f : -1f;
        ball.NoiseOffset = new Vector2(
            Mathf.Lerp(0f, 100f, (float)random.NextDouble()),
            Mathf.Lerp(0f, 100f, (float)random.NextDouble()));
        ball.NoiseFrequency = Mathf.Lerp(0.35f, 0.92f, (float)random.NextDouble());
        ball.NoiseStrength = Mathf.Lerp(12f, 28f, (float)random.NextDouble());
        ball.DepthBase = Mathf.Lerp(0f, 1f, (float)random.NextDouble());
        ball.DepthDriftAmplitude = Mathf.Lerp(0.04f, 0.12f, (float)random.NextDouble());
        ball.DepthDriftFrequency = Mathf.Lerp(0.22f, 0.58f, (float)random.NextDouble());
        ball.DepthDriftPhase = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        ball.Radius = UniformBallRadius;
        ball.Response = Mathf.Lerp(0.48f, 1.24f, (float)random.NextDouble());
        ball.MassBias = Mathf.Lerp(0.82f, 1.18f, (float)random.NextDouble());
        ball.Spin = Mathf.Lerp(0f, 360f, (float)random.NextDouble());
        ball.SpinSpeed = Mathf.Lerp(-14f, 14f, (float)random.NextDouble());
        ball.ShakeAxisA = RandomDirection(random);
        ball.ShakeAxisB = RandomDirection(random);
        ball.ShakeFrequencyA = Mathf.Lerp(ShakeImpulseFrequencyMin, ShakeImpulseFrequencyMax, (float)random.NextDouble());
        ball.ShakeFrequencyB = Mathf.Lerp(ShakeImpulseFrequencyMin * 0.82f, ShakeImpulseFrequencyMax * 1.12f, (float)random.NextDouble());
        ball.ShakePhaseA = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        ball.ShakePhaseB = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        ball.ShakeStrength = Mathf.Lerp(0.72f, 1.22f, (float)random.NextDouble());
        ball.WanderAxisA = RandomDirection(random);
        ball.WanderAxisB = RandomDirection(random);
        ball.WanderAmplitudeA = Mathf.Lerp(WanderStrength * 0.82f, WanderStrength * 1.52f, (float)random.NextDouble());
        ball.WanderAmplitudeB = Mathf.Lerp(WanderStrength * 0.54f, WanderStrength * 1.08f, (float)random.NextDouble());
        ball.WanderFrequencyA = Mathf.Lerp(WanderFrequencyMin, WanderFrequencyMax, (float)random.NextDouble());
        ball.WanderFrequencyB = Mathf.Lerp(WanderFrequencyMin * 0.78f, WanderFrequencyMax * 1.18f, (float)random.NextDouble());
        ball.WanderPhaseA = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        ball.WanderPhaseB = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        ball.Rect.sizeDelta = Vector2.one * (ball.Radius * 2f);
        ball.Rect.anchoredPosition = ball.Position;
        ball.Rect.localScale = Vector3.one;
        return ball;
    }

    private void BuildRecentStrip()
    {
        recentBallImages.Clear();
        ClearChildren(recentStripRoot, "LastDrawLabel");
        const int visibleBallCount = 10;
        float spacing = 86f;
        for (int index = 0; index < visibleBallCount; index++)
        {
            RectTransform rect = CreateUiObject($"RecentBall{index + 1}", recentStripRoot).GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0f, 0f);
            rect.anchorMax = new Vector2(0f, 0f);
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.sizeDelta = new Vector2(72f, 72f);
            rect.anchoredPosition = new Vector2(80f + (spacing * index), 40f);

            Image image = rect.gameObject.AddComponent<Image>();
            image.enabled = false;
            image.preserveAspect = true;
            recentBallImages.Add(image);
        }
    }

    private void PlayNextDraw()
    {
        if (drawSequence.Count == 0)
        {
            return;
        }

        int number = drawSequence[drawCursor % drawSequence.Count];
        drawCursor++;
        if (!numberedBallSprites.TryGetValue(number, out Sprite sprite) || sprite == null)
        {
            return;
        }

        ejectBallImage.sprite = sprite;
        ejectBallImage.enabled = true;
        ejectBallImage.color = Color.white;
        ejectBallRect.anchoredPosition = new Vector2(0f, -166f);
        ejectBallRect.localScale = Vector3.one * 0.34f;
        ejectBallRect.localEulerAngles = Vector3.zero;

        Vector2 holePoint = new Vector2(0f, -214f);
        Vector2 ejectPoint = new Vector2(0f, -244f);
        Vector2 settlePoint = new Vector2(154f, 26f);

        if (ejectSequence != null && ejectSequence.IsActive())
        {
            ejectSequence.Kill();
        }

        ejectSequence = DOTween.Sequence();
        ejectSequence.Append(ejectBallRect.DOAnchorPos(holePoint, 0.14f).SetEase(Ease.InQuad));
        ejectSequence.Join(ejectBallRect.DOScale(0.46f, 0.14f).SetEase(Ease.InQuad));
        ejectSequence.Append(ejectBallRect.DOAnchorPos(ejectPoint, 0.18f).SetEase(Ease.OutCubic));
        ejectSequence.Join(ejectBallRect.DOScale(0.82f, 0.18f).SetEase(Ease.OutBack));
        ejectSequence.Append(ejectBallRect.DOAnchorPos(settlePoint, 0.52f).SetEase(Ease.OutCubic));
        ejectSequence.Join(ejectBallRect.DOScale(1.16f, 0.52f).SetEase(Ease.OutBack));
        ejectSequence.Join(ejectBallRect.DORotate(new Vector3(0f, 0f, -14f), 0.42f, RotateMode.FastBeyond360).SetEase(Ease.OutQuad));
        ejectSequence.AppendInterval(0.18f);
        ejectSequence.OnComplete(() =>
        {
            PushRecentBall(sprite);
            HideEjectBall();
        });
        ejectSequence.Play();
    }

    private void PushRecentBall(Sprite sprite)
    {
        for (int index = recentBallImages.Count - 1; index > 0; index--)
        {
            recentBallImages[index].sprite = recentBallImages[index - 1].sprite;
            recentBallImages[index].enabled = recentBallImages[index - 1].enabled;
        }

        recentBallImages[0].sprite = sprite;
        recentBallImages[0].enabled = true;
    }

    private void HideEjectBall()
    {
        if (ejectBallImage == null)
        {
            return;
        }

        ejectBallImage.enabled = false;
        ejectBallRect.localScale = Vector3.one * 0.4f;
    }

    private void WarmSequence()
    {
        timeSinceLastDraw = autoDrawIntervalSeconds * 0.62f;
    }

    private void StepBallMotion(float dt)
    {
        if (globeClusterRect == null || clusterBalls.Count == 0)
        {
            return;
        }

        motionTime += dt;
        Vector2 globalShake = new Vector2(
            (Mathf.Sin((motionTime * 2.08f) + 0.21f) + (Mathf.Sin((motionTime * 4.12f) + 1.61f) * 0.55f)) * GlobalShakeX,
            (Mathf.Cos((motionTime * 1.64f) + 0.93f) + (Mathf.Sin((motionTime * 3.91f) + 2.27f) * 0.48f)) * GlobalShakeY);
        Vector2 clusterRattle = new Vector2(
            globalShake.x * 0.06f,
            globalShake.y * 0.05f);
        globeClusterRect.anchoredPosition = GlobeClusterBasePosition + clusterRattle;

        for (int index = 0; index < clusterBalls.Count; index++)
        {
            ClusterBall ball = clusterBalls[index];
            Vector2 target = ComputeTargetPosition(ball, globalShake, motionTime);
            Vector2 flow = ComputeFlow(ball, motionTime);
            Vector2 shakeImpulse = ComputeShakeImpulse(ball, motionTime);
            Vector2 acceleration = ((target - ball.Position) * MotionSpring) + flow + shakeImpulse;
            ball.Velocity += acceleration * dt;
        }

        for (int a = 0; a < clusterBalls.Count; a++)
        {
            ClusterBall first = clusterBalls[a];
            for (int b = a + 1; b < clusterBalls.Count; b++)
            {
                ClusterBall second = clusterBalls[b];
                Vector2 delta = second.Position - first.Position;
                float distance = delta.magnitude;
                float minimumDistance = first.Radius + second.Radius + SeparationPadding;
                if (distance <= 0.0001f || distance >= minimumDistance)
                {
                    continue;
                }

                Vector2 normal = delta / distance;
                float overlap = minimumDistance - distance;
                Vector2 force = normal * (overlap * SeparationStrength);
                first.Velocity -= force * 0.5f;
                second.Velocity += force * 0.5f;
            }
        }

        for (int index = 0; index < clusterBalls.Count; index++)
        {
            ClusterBall ball = clusterBalls[index];
            ball.Velocity *= MotionDamping;
            if (ball.Velocity.sqrMagnitude > MotionMaxSpeed * MotionMaxSpeed)
            {
                ball.Velocity = ball.Velocity.normalized * MotionMaxSpeed;
            }

            ball.Position += ball.Velocity * dt;
            ConstrainToPrototypeEllipse(ball);
            ApplyBallVisual(ball, dt);
        }
    }

    private static Vector2 ComputeTargetPosition(ClusterBall ball, Vector2 globalShake, float now)
    {
        Vector2 wander =
            (ball.WanderAxisA * Mathf.Sin((now * ball.WanderFrequencyA) + ball.WanderPhaseA) * ball.WanderAmplitudeA) +
            (ball.WanderAxisB * Mathf.Cos((now * ball.WanderFrequencyB) + ball.WanderPhaseB) * ball.WanderAmplitudeB);
        Vector2 oscillation =
            (ball.AxisA * Mathf.Sin((now * ball.FrequencyA) + ball.PhaseA) * ball.AmplitudeA) +
            (ball.AxisB * Mathf.Cos((now * ball.FrequencyB) + ball.PhaseB) * ball.AmplitudeB) +
            (ball.AxisC * Mathf.Sin((now * ball.FrequencyC) + ball.PhaseC) * ball.AmplitudeC);

        Vector2 jitter = new Vector2(
            Mathf.Sin((now * (ball.FrequencyC * 2.33f)) + ball.PhaseB) + (Mathf.Cos((now * (ball.FrequencyA * 1.87f)) + ball.PhaseC) * 0.55f),
            Mathf.Cos((now * (ball.FrequencyB * 2.11f)) + ball.PhaseA) + (Mathf.Sin((now * (ball.FrequencyC * 1.69f)) + ball.PhaseB) * 0.52f)) * (LocalJitterStrength * ball.Response);

        return ball.RestPosition + (wander * 1.42f) + oscillation + jitter + (globalShake * (ball.Response * 0.04f));
    }

    private static Vector2 ComputeShakeImpulse(ClusterBall ball, float now)
    {
        float a = Mathf.Sin((now * ball.ShakeFrequencyA) + ball.ShakePhaseA);
        float b = Mathf.Sin((now * ball.ShakeFrequencyB) + ball.ShakePhaseB);
        float c = Mathf.Cos((now * (ball.ShakeFrequencyA * 1.71f)) + (ball.ShakePhaseB * 0.83f));
        float rumbleX = (Mathf.PerlinNoise(ball.NoiseOffset.x + (now * (ball.ShakeFrequencyA * 0.47f)), ball.NoiseOffset.y + 11.7f) * 2f) - 1f;
        float rumbleY = (Mathf.PerlinNoise(ball.NoiseOffset.y + 71.3f, ball.NoiseOffset.x + (now * (ball.ShakeFrequencyB * 0.53f))) * 2f) - 1f;
        Vector2 impulse =
            (ball.ShakeAxisA * ((a + (c * 0.45f)) * (ShakeImpulseStrength * ball.ShakeStrength))) +
            (ball.ShakeAxisB * (b * (ShakeImpulseStrength * 0.72f * ball.ShakeStrength)));
        Vector2 rumble = new Vector2(rumbleX, rumbleY) * (ShakeImpulseStrength * 0.58f * ball.ShakeStrength);
        return impulse + rumble;
    }

    private static Vector2 ComputeFlow(ClusterBall ball, float now)
    {
        Vector2 pos = ball.Position;
        Vector2 normalized = new Vector2(
            MotionHalfWidth > 0.001f ? pos.x / MotionHalfWidth : 0f,
            MotionHalfHeight > 0.001f ? pos.y / MotionHalfHeight : 0f);
        float radial = Mathf.Clamp01(normalized.magnitude);

        Vector2 orbitAxis = new Vector2(-ball.VortexAxis.y, ball.VortexAxis.x);
        Vector2 vortexCenter = ball.RestPosition +
                               (ball.VortexAxis * Mathf.Sin((now * ball.VortexFrequency) + ball.VortexPhase) * ball.VortexRadius) +
                               (orbitAxis * Mathf.Cos((now * (ball.VortexFrequency * 0.78f)) + (ball.VortexPhase * 1.11f)) * (ball.VortexRadius * 0.64f));
        Vector2 localRelative = ball.Position - vortexCenter;
        float localDistance = Mathf.Max(1f, localRelative.magnitude);
        Vector2 localTangent = localDistance > 0.001f
            ? new Vector2(-localRelative.y, localRelative.x) / localDistance
            : Vector2.zero;

        Vector2 localSwirl = localTangent *
                             (ball.VortexStrength * Mathf.Lerp(0.76f, 0.32f, Mathf.Clamp01(localDistance / 136f)) * ball.VortexDirection * ball.MassBias);
        Vector2 localPull = (vortexCenter - ball.Position) * 0.18f;
        Vector2 pump = new Vector2(
            Mathf.Sin((now * (ball.FrequencyB * 0.84f)) + ball.PhaseC + (normalized.y * 1.9f)) * FlowHorizontalStrength,
            Mathf.Cos((now * (ball.FrequencyA * 0.92f)) + ball.PhaseB + (normalized.x * 2.2f)) * FlowVerticalStrength) * ball.Response;
        float noiseX = (Mathf.PerlinNoise(ball.NoiseOffset.x + (now * ball.NoiseFrequency), (ball.Position.y * LocalNoiseSpatialScale) + ball.NoiseOffset.y) * 2f) - 1f;
        float noiseY = (Mathf.PerlinNoise(ball.NoiseOffset.y + 31.7f + (now * (ball.NoiseFrequency * 0.81f)), (ball.Position.x * LocalNoiseSpatialScale) + ball.NoiseOffset.x + 17.3f) * 2f) - 1f;
        Vector2 noise = new Vector2(noiseX, noiseY) * ball.NoiseStrength;
        Vector2 directionalSway =
            (ball.WanderAxisA * Mathf.Sin((now * (ball.WanderFrequencyA * 1.24f)) + (ball.WanderPhaseA * 0.94f)) * (ball.WanderAmplitudeA * 0.72f)) +
            (ball.WanderAxisB * Mathf.Cos((now * (ball.WanderFrequencyB * 1.14f)) + (ball.WanderPhaseB * 1.08f)) * (ball.WanderAmplitudeB * 0.58f));
        Vector2 travelDrift =
            (ball.WanderAxisA * Mathf.Cos((now * (ball.WanderFrequencyA * 0.78f)) + (ball.WanderPhaseB * 0.81f)) * (ball.WanderAmplitudeA * 0.38f)) +
            (ball.WanderAxisB * Mathf.Sin((now * (ball.WanderFrequencyB * 0.73f)) + (ball.WanderPhaseA * 1.12f)) * (ball.WanderAmplitudeB * 0.34f));
        float edgePull = Mathf.InverseLerp(0.78f, 1f, radial);
        Vector2 centerPull = edgePull > 0f
            ? -normalized * Mathf.Lerp(0f, 18f, edgePull)
            : Vector2.zero;
        return localSwirl + localPull + pump + noise + directionalSway + travelDrift + centerPull;
    }

    private static void ConstrainToPrototypeEllipse(ClusterBall ball)
    {
        Vector2 position = ball.Position;
        float halfWidth = Mathf.Max(1f, MotionHalfWidth - ball.Radius - BoundaryInsetSide - BoundarySafetyInset);
        float halfHeight = Mathf.Max(
            1f,
            (position.y < 0f
                ? MotionHalfHeight - MotionBottomInset - ball.Radius - BoundaryInsetBottom - BoundarySafetyInset
                : MotionHalfHeight - ball.Radius - BoundaryInsetTop - BoundarySafetyInset));
        float normalizedX = halfWidth > 0.001f ? position.x / halfWidth : 0f;
        float normalizedY = halfHeight > 0.001f ? position.y / halfHeight : 0f;
        float ellipse = (normalizedX * normalizedX) + (normalizedY * normalizedY);
        if (ellipse <= 1f)
        {
            return;
        }

        float scale = 1f / Mathf.Sqrt(ellipse);
        Vector2 boundary = position * (scale * 0.985f);
        Vector2 normal = new Vector2(
            halfWidth > 0.001f ? boundary.x / (halfWidth * halfWidth) : 0f,
            halfHeight > 0.001f ? boundary.y / (halfHeight * halfHeight) : 0f);
        if (normal.sqrMagnitude > 0.0001f)
        {
            normal.Normalize();
        }

        ball.Position = boundary;
        float outwardVelocity = Vector2.Dot(ball.Velocity, normal);
        if (outwardVelocity > 0f)
        {
            ball.Velocity -= normal * (outwardVelocity * 1.9f);
        }
        ball.Velocity *= 0.72f;
    }

    private static void ApplyBallVisual(ClusterBall ball, float dt)
    {
        if (ball.Rect == null || ball.Image == null)
        {
            return;
        }

        float depth = Mathf.Clamp01(ball.DepthBase + (Mathf.Sin((Time.unscaledTime * ball.DepthDriftFrequency) + ball.DepthDriftPhase) * ball.DepthDriftAmplitude));
        float scale = Mathf.Lerp(DepthScaleMin, DepthScaleMax, depth);
        float brightness = Mathf.Lerp(BrightnessMin, BrightnessMax, depth);

        ball.Spin += ball.SpinSpeed * dt;
        ball.Rect.anchoredPosition = ball.Position;
        ball.Rect.localScale = Vector3.one * scale;
        ball.Rect.localEulerAngles = new Vector3(0f, 0f, ball.Spin);
        ball.Image.color = new Color(brightness, brightness, brightness, 1f);
    }

    private static Vector2 ClampToPrototypeEllipse(Vector2 position)
    {
        const float restInset = 26f;
        float halfWidth = Mathf.Max(1f, MotionHalfWidth - restInset);
        float halfHeight = Mathf.Max(
            1f,
            (position.y < 0f
                ? MotionHalfHeight - MotionBottomInset - restInset - 12f
                : MotionHalfHeight - restInset - 4f));
        float normalizedX = halfWidth > 0.001f ? position.x / halfWidth : 0f;
        float normalizedY = halfHeight > 0.001f ? position.y / halfHeight : 0f;
        float ellipse = (normalizedX * normalizedX) + (normalizedY * normalizedY);
        if (ellipse <= 1f)
        {
            return position;
        }

        float scale = 1f / Mathf.Sqrt(ellipse);
        return position * (scale * 0.96f);
    }

    private void ApplyPrototypeLayout()
    {
        if (globeMaskRect != null)
        {
            globeMaskRect.sizeDelta = GlobeMaskSize;
            globeMaskRect.anchoredPosition = GlobeMaskPosition;
        }

        if (globeClusterRect != null)
        {
            globeClusterRect.sizeDelta = GlobeMaskSize;
            globeClusterRect.anchoredPosition = GlobeClusterBasePosition;
            globeMaskRect?.SetAsLastSibling();
        }

        if (globeFrontOverlayRect != null)
        {
            globeFrontOverlayRect.sizeDelta = GlobeFrontOverlaySize;
            globeFrontOverlayRect.anchoredPosition = GlobeFrontOverlayPosition;
            globeFrontOverlayRect.SetAsLastSibling();
        }

        if (machineImageRect != null)
        {
            machineImageRect.sizeDelta = new Vector2(592f, 720f);
            machineImageRect.anchoredPosition = Vector2.zero;
            machineImageRect.SetAsFirstSibling();
        }

        if (ejectBallRect != null)
        {
            ejectBallRect.sizeDelta = new Vector2(138f, 138f);
            ejectBallRect.anchoredPosition = new Vector2(0f, -218f);
            ejectBallRect.SetAsLastSibling();
        }
    }

    private void ClearGeneratedSceneGraph()
    {
        for (int index = transform.childCount - 1; index >= 0; index--)
        {
            Transform child = transform.GetChild(index);
#if UNITY_EDITOR
            if (!Application.isPlaying)
            {
                DestroyImmediate(child.gameObject);
                continue;
            }
#endif
            Destroy(child.gameObject);
        }
    }

    private static void ClearChildren(Transform parent, string preserveChildName = null)
    {
        if (parent == null)
        {
            return;
        }

        for (int index = parent.childCount - 1; index >= 0; index--)
        {
            Transform child = parent.GetChild(index);
            if (!string.IsNullOrEmpty(preserveChildName) && child.name == preserveChildName)
            {
                continue;
            }

#if UNITY_EDITOR
            if (!Application.isPlaying)
            {
                DestroyImmediate(child.gameObject);
                continue;
            }
#endif
            Destroy(child.gameObject);
        }
    }

    private RectTransform FindNamedRectTransform(string name)
    {
        Transform found = FindDescendantByName(transform, name);
        return found as RectTransform;
    }

    private static T FindNamedComponentInChildren<T>(Transform root, string name) where T : Component
    {
        Transform found = FindDescendantByName(root, name);
        return found != null ? found.GetComponent<T>() : null;
    }

    private static Transform FindDescendantByName(Transform root, string name)
    {
        if (root == null)
        {
            return null;
        }

        for (int index = 0; index < root.childCount; index++)
        {
            Transform child = root.GetChild(index);
            if (child.name == name)
            {
                return child;
            }

            Transform nested = FindDescendantByName(child, name);
            if (nested != null)
            {
                return nested;
            }
        }

        return null;
    }

#if UNITY_EDITOR
    [ContextMenu("Candy/Theme3/Rebuild Prototype Hierarchy")]
    public void EditorRebuildPrototypeHierarchy()
    {
        EnsureAssetsLoaded();
        BuildSceneGraph();
        CreateClusterBalls();
        BuildRecentStrip();
        HideEjectBall();
        WarmSequence();
        EditorUtility.SetDirty(gameObject);
        if (rootCanvas != null)
        {
            EditorSceneManager.MarkSceneDirty(gameObject.scene);
        }
    }
#endif

    private static TMP_Text CreateText(string name, Transform parent, string content, float fontSize, TMP_FontAsset font)
    {
        GameObject textObject = CreateUiObject(name, parent);
        TMP_Text text = textObject.AddComponent<TextMeshProUGUI>();
        text.text = content;
        text.font = font;
        text.fontSize = fontSize;
        text.alignment = TextAlignmentOptions.Center;
        text.enableAutoSizing = false;
        text.color = Color.white;

        RectTransform rect = text.rectTransform;
        rect.sizeDelta = new Vector2(1000f, fontSize * 1.8f);
        return text;
    }

    private static RectTransform CreatePanel(string name, Transform parent, Color color)
    {
        GameObject panelObject = CreateUiObject(name, parent);
        Image panelImage = panelObject.AddComponent<Image>();
        panelImage.color = color;
        return panelImage.rectTransform;
    }

    private static GameObject CreateUiObject(string name, Transform parent)
    {
        GameObject gameObject = new GameObject(name, typeof(RectTransform));
        gameObject.transform.SetParent(parent, false);
        return gameObject;
    }

    private static bool TryExtractLeadingNumber(string spriteName, out int ballNumber)
    {
        ballNumber = 0;
        if (string.IsNullOrWhiteSpace(spriteName))
        {
            return false;
        }

        int index = 0;
        while (index < spriteName.Length && char.IsDigit(spriteName[index]))
        {
            index++;
        }

        if (index == 0)
        {
            return false;
        }

        return int.TryParse(spriteName.Substring(0, index), out ballNumber);
    }

    private static Vector2 RandomDirection(System.Random random)
    {
        float angle = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        return new Vector2(Mathf.Cos(angle), Mathf.Sin(angle));
    }

    private static Vector2 RandomInsideUnitCircle(System.Random random)
    {
        float angle = Mathf.Lerp(0f, Mathf.PI * 2f, (float)random.NextDouble());
        float radius = Mathf.Sqrt(Mathf.Lerp(0f, 1f, (float)random.NextDouble()));
        return new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * radius;
    }

    private static void Shuffle<T>(System.Random random, IList<T> values)
    {
        for (int index = values.Count - 1; index > 0; index--)
        {
            int swapIndex = random.Next(index + 1);
            (values[index], values[swapIndex]) = (values[swapIndex], values[index]);
        }
    }

    private static Sprite CreateEllipseMaskSprite(int size)
    {
        Texture2D texture = new Texture2D(size, size, TextureFormat.RGBA32, false)
        {
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            name = "RuntimeEllipseMask"
        };

        Vector2 center = new Vector2((size - 1) * 0.5f, (size - 1) * 0.5f);
        float radius = size * 0.48f;
        Color32[] pixels = new Color32[size * size];

        for (int y = 0; y < size; y++)
        {
            for (int x = 0; x < size; x++)
            {
                float distance = Vector2.Distance(new Vector2(x, y), center);
                byte alpha = distance <= radius ? (byte)255 : (byte)0;
                pixels[(y * size) + x] = new Color32(255, 255, 255, alpha);
            }
        }

        texture.SetPixels32(pixels);
        texture.Apply(false, false);
        return Sprite.Create(texture, new Rect(0f, 0f, size, size), new Vector2(0.5f, 0.5f), 100f);
    }
}
