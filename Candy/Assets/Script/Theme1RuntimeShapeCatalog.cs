using UnityEngine;

public static class Theme1RuntimeShapeCatalog
{
    private static Sprite roundedRectSprite;
    private static Sprite solidSprite;
    private static Sprite softGlowSprite;
    private static Sprite verticalFadeSprite;
    private static Sprite boardShellGradientSprite;
    private static Sprite footerGradientSprite;
    private static Sprite highlightCellGradientSprite;
    private static Sprite prizeCellGradientSprite;
    private static Sprite cellGlowSprite;

    public static Sprite GetRoundedRectSprite()
    {
        roundedRectSprite ??= CreateRoundedRectSprite("Theme1RoundedRect", 128, 28);
        return roundedRectSprite;
    }

    public static Sprite GetSolidSprite()
    {
        solidSprite ??= CreateSolidSprite("Theme1Solid");
        return solidSprite;
    }

    public static Sprite GetSoftGlowSprite()
    {
        softGlowSprite ??= CreateSoftGlowSprite("Theme1SoftGlow", 128);
        return softGlowSprite;
    }

    public static Sprite GetCellGlowSprite()
    {
        cellGlowSprite ??= CreateRoundedRectGlowRingSprite(
            "Theme1CellGlow",
            136,
            96,
            16f,
            5f,
            5f);
        return cellGlowSprite;
    }

    public static Sprite GetVerticalFadeSprite()
    {
        verticalFadeSprite ??= CreateVerticalFadeSprite("Theme1VerticalFade", 8, 128);
        return verticalFadeSprite;
    }

    public static Sprite GetBoardShellGradientSprite()
    {
        boardShellGradientSprite ??= CreateRoundedRectGradientSprite(
            "Theme1BoardShellGradient",
            256,
            34,
            new Color32(255, 153, 220, 255),
            new Color32(255, 72, 178, 255),
            new Color32(255, 153, 220, 255),
            0.52f);
        return boardShellGradientSprite;
    }

    public static Sprite GetFooterGradientSprite()
    {
        footerGradientSprite ??= CreateRoundedRectGradientSprite(
            "Theme1FooterGradient",
            256,
            18,
            new Color32(255, 146, 221, 220),
            new Color32(255, 98, 194, 226),
            new Color32(255, 62, 173, 230),
            0.62f);
        return footerGradientSprite;
    }

    public static Sprite GetHighlightCellGradientSprite()
    {
        highlightCellGradientSprite ??= CreateVerticalGradientSprite(
            "Theme1HighlightCellGradient",
            8,
            128,
            Theme1BongStyle.HighlightCellTopColor,
            Theme1BongStyle.HighlightCellBottomColor);
        return highlightCellGradientSprite;
    }

    public static Sprite GetPrizeCellGradientSprite()
    {
        prizeCellGradientSprite ??= CreateVerticalGradientSprite(
            "Theme1PrizeCellGradient",
            8,
            128,
            Theme1BongStyle.PrizeCellTopColor,
            Theme1BongStyle.PrizeCellBottomColor);
        return prizeCellGradientSprite;
    }

    private static Sprite CreateRoundedRectSprite(string name, int size, int radius)
    {
        Texture2D texture = new Texture2D(size, size, TextureFormat.RGBA32, mipChain: false)
        {
            name = name,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            hideFlags = HideFlags.HideAndDontSave
        };

        Color32[] pixels = new Color32[size * size];
        float halfSize = size * 0.5f;
        float innerHalf = halfSize - radius;
        for (int y = 0; y < size; y++)
        {
            for (int x = 0; x < size; x++)
            {
                float px = (x + 0.5f) - halfSize;
                float py = (y + 0.5f) - halfSize;
                float dx = Mathf.Max(Mathf.Abs(px) - innerHalf, 0f);
                float dy = Mathf.Max(Mathf.Abs(py) - innerHalf, 0f);
                float distance = Mathf.Sqrt((dx * dx) + (dy * dy));
                float alpha = Mathf.Clamp01(radius + 0.9f - distance);
                pixels[(y * size) + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(alpha * 255f));
            }
        }

        texture.SetPixels32(pixels);
        texture.Apply(updateMipmaps: false, makeNoLongerReadable: true);
        Sprite sprite = Sprite.Create(
            texture,
            new Rect(0f, 0f, size, size),
            new Vector2(0.5f, 0.5f),
            100f,
            0,
            SpriteMeshType.FullRect,
            new Vector4(radius, radius, radius, radius));
        sprite.name = name;
        return sprite;
    }

    private static Sprite CreateSolidSprite(string name)
    {
        Texture2D texture = new Texture2D(4, 4, TextureFormat.RGBA32, mipChain: false)
        {
            name = name,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            hideFlags = HideFlags.HideAndDontSave
        };

        Color32[] pixels = new Color32[16];
        for (int i = 0; i < pixels.Length; i++)
        {
            pixels[i] = new Color32(255, 255, 255, 255);
        }

        texture.SetPixels32(pixels);
        texture.Apply(updateMipmaps: false, makeNoLongerReadable: true);
        Sprite sprite = Sprite.Create(texture, new Rect(0f, 0f, 4f, 4f), new Vector2(0.5f, 0.5f), 100f);
        sprite.name = name;
        return sprite;
    }

    private static Sprite CreateSoftGlowSprite(string name, int size)
    {
        Texture2D texture = new Texture2D(size, size, TextureFormat.RGBA32, mipChain: false)
        {
            name = name,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            hideFlags = HideFlags.HideAndDontSave
        };

        Color32[] pixels = new Color32[size * size];
        float halfSize = size * 0.5f;
        float maxDistance = halfSize * 0.92f;
        for (int y = 0; y < size; y++)
        {
            for (int x = 0; x < size; x++)
            {
                float px = (x + 0.5f) - halfSize;
                float py = (y + 0.5f) - halfSize;
                float distance = Mathf.Sqrt((px * px) + (py * py));
                float normalized = Mathf.Clamp01(distance / maxDistance);
                float alpha = Mathf.Pow(1f - normalized, 2.6f);
                pixels[(y * size) + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(alpha * 255f));
            }
        }

        texture.SetPixels32(pixels);
        texture.Apply(updateMipmaps: false, makeNoLongerReadable: true);
        Sprite sprite = Sprite.Create(texture, new Rect(0f, 0f, size, size), new Vector2(0.5f, 0.5f), 100f);
        sprite.name = name;
        return sprite;
    }

    private static Sprite CreateSoftRoundedRectGlowSprite(string name, int width, int height, float radius, float feather)
    {
        Texture2D texture = new Texture2D(width, height, TextureFormat.RGBA32, mipChain: false)
        {
            name = name,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            hideFlags = HideFlags.HideAndDontSave
        };

        Color32[] pixels = new Color32[width * height];
        Vector2 halfSize = new Vector2(width * 0.5f, height * 0.5f);
        Vector2 box = new Vector2(
            Mathf.Max(1f, halfSize.x - feather - radius),
            Mathf.Max(1f, halfSize.y - feather - radius));

        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                Vector2 point = new Vector2((x + 0.5f) - halfSize.x, (y + 0.5f) - halfSize.y);
                float distance = SignedDistanceRoundedBox(point, box, radius);
                float alpha = 1f - Mathf.SmoothStep(0f, feather, distance);
                pixels[(y * width) + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(Mathf.Clamp01(alpha) * 255f));
            }
        }

        texture.SetPixels32(pixels);
        texture.Apply(updateMipmaps: false, makeNoLongerReadable: true);
        Sprite sprite = Sprite.Create(texture, new Rect(0f, 0f, width, height), new Vector2(0.5f, 0.5f), 100f);
        sprite.name = name;
        return sprite;
    }

    private static Sprite CreateRoundedRectGlowRingSprite(
        string name,
        int width,
        int height,
        float radius,
        float ringWidth,
        float feather)
    {
        Texture2D texture = new Texture2D(width, height, TextureFormat.RGBA32, mipChain: false)
        {
            name = name,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            hideFlags = HideFlags.HideAndDontSave
        };

        Color32[] pixels = new Color32[width * height];
        Vector2 halfSize = new Vector2(width * 0.5f, height * 0.5f);
        Vector2 outerBox = new Vector2(
            Mathf.Max(1f, halfSize.x - feather - radius),
            Mathf.Max(1f, halfSize.y - feather - radius));
        Vector2 innerBox = new Vector2(
            Mathf.Max(1f, outerBox.x - ringWidth),
            Mathf.Max(1f, outerBox.y - ringWidth));
        float innerRadius = Mathf.Max(1f, radius - (ringWidth * 0.65f));
        float innerFeather = Mathf.Max(1f, feather * 0.9f);

        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                Vector2 point = new Vector2((x + 0.5f) - halfSize.x, (y + 0.5f) - halfSize.y);
                float outerDistance = SignedDistanceRoundedBox(point, outerBox, radius);
                float innerDistance = SignedDistanceRoundedBox(point, innerBox, innerRadius);
                float outerAlpha = 1f - Mathf.SmoothStep(0f, feather, outerDistance);
                float innerAlpha = 1f - Mathf.SmoothStep(0f, innerFeather, innerDistance);
                float alpha = Mathf.Clamp01(outerAlpha - innerAlpha);
                pixels[(y * width) + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(alpha * 255f));
            }
        }

        texture.SetPixels32(pixels);
        texture.Apply(updateMipmaps: false, makeNoLongerReadable: true);
        Sprite sprite = Sprite.Create(texture, new Rect(0f, 0f, width, height), new Vector2(0.5f, 0.5f), 100f);
        sprite.name = name;
        return sprite;
    }

    private static Sprite CreateVerticalFadeSprite(string name, int width, int height)
    {
        Texture2D texture = new Texture2D(width, height, TextureFormat.RGBA32, mipChain: false)
        {
            name = name,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            hideFlags = HideFlags.HideAndDontSave
        };

        Color32[] pixels = new Color32[width * height];
        for (int y = 0; y < height; y++)
        {
            float normalized = height <= 1 ? 0f : (float)y / (height - 1);
            float alpha = Mathf.Clamp01(1f - normalized);
            byte alphaByte = (byte)Mathf.RoundToInt(alpha * 255f);
            for (int x = 0; x < width; x++)
            {
                pixels[(y * width) + x] = new Color32(255, 255, 255, alphaByte);
            }
        }

        texture.SetPixels32(pixels);
        texture.Apply(updateMipmaps: false, makeNoLongerReadable: true);
        Sprite sprite = Sprite.Create(texture, new Rect(0f, 0f, width, height), new Vector2(0.5f, 1f), 100f);
        sprite.name = name;
        return sprite;
    }

    private static Sprite CreateVerticalGradientSprite(string name, int width, int height, Color32 top, Color32 bottom)
    {
        Texture2D texture = new Texture2D(width, height, TextureFormat.RGBA32, mipChain: false)
        {
            name = name,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            hideFlags = HideFlags.HideAndDontSave
        };

        Color32[] pixels = new Color32[width * height];
        for (int y = 0; y < height; y++)
        {
            float t = height <= 1 ? 0f : (float)y / (height - 1);
            Color color = Color.Lerp(bottom, top, t);
            Color32 color32 = color;
            for (int x = 0; x < width; x++)
            {
                pixels[(y * width) + x] = color32;
            }
        }

        texture.SetPixels32(pixels);
        texture.Apply(updateMipmaps: false, makeNoLongerReadable: true);
        Sprite sprite = Sprite.Create(texture, new Rect(0f, 0f, width, height), new Vector2(0.5f, 0.5f), 100f);
        sprite.name = name;
        return sprite;
    }

    private static Sprite CreateRoundedRectGradientSprite(
        string name,
        int size,
        int radius,
        Color32 top,
        Color32 middle,
        Color32 bottom,
        float middleStop)
    {
        Texture2D texture = new Texture2D(size, size, TextureFormat.RGBA32, mipChain: false)
        {
            name = name,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            hideFlags = HideFlags.HideAndDontSave
        };

        Color32[] pixels = new Color32[size * size];
        float halfSize = size * 0.5f;
        float innerHalf = halfSize - radius;
        for (int y = 0; y < size; y++)
        {
            float gradientT = size <= 1 ? 0f : (float)y / (size - 1);
            Color fill = gradientT >= middleStop
                ? Color.Lerp(middle, top, (gradientT - middleStop) / Mathf.Max(0.0001f, 1f - middleStop))
                : Color.Lerp(bottom, middle, gradientT / Mathf.Max(0.0001f, middleStop));

            for (int x = 0; x < size; x++)
            {
                float px = (x + 0.5f) - halfSize;
                float py = (y + 0.5f) - halfSize;
                float dx = Mathf.Max(Mathf.Abs(px) - innerHalf, 0f);
                float dy = Mathf.Max(Mathf.Abs(py) - innerHalf, 0f);
                float distance = Mathf.Sqrt((dx * dx) + (dy * dy));
                float alpha = Mathf.Clamp01(radius + 0.9f - distance);
                Color result = fill;
                result.a *= alpha;
                pixels[(y * size) + x] = result;
            }
        }

        texture.SetPixels32(pixels);
        texture.Apply(updateMipmaps: false, makeNoLongerReadable: true);
        Sprite sprite = Sprite.Create(
            texture,
            new Rect(0f, 0f, size, size),
            new Vector2(0.5f, 0.5f),
            100f,
            0,
            SpriteMeshType.FullRect,
            new Vector4(radius, radius, radius, radius));
        sprite.name = name;
        return sprite;
    }

    private static float SignedDistanceRoundedBox(Vector2 point, Vector2 halfExtents, float radius)
    {
        Vector2 q = new Vector2(Mathf.Abs(point.x), Mathf.Abs(point.y)) - halfExtents;
        Vector2 outer = new Vector2(Mathf.Max(q.x, 0f), Mathf.Max(q.y, 0f));
        return outer.magnitude + Mathf.Min(Mathf.Max(q.x, q.y), 0f) - radius;
    }
}
