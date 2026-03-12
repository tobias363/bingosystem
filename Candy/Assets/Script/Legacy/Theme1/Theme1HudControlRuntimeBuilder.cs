using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public static class Theme1HudControlRuntimeBuilder
{
    private const string ControlRootName = "Theme1RealtimeHudControls";
    private const string LegacyParkingName = "Theme1LegacyHudParking";
    private const string SaldoPanelName = "Theme1SaldoPanel";
    private const string GevinstPanelName = "Theme1GevinstPanel";
    private const string ShuffleButtonName = "Theme1ShuffleButton";
    private const string StakePanelName = "Theme1StakePanel";
    private const string PlaceBetButtonName = "Theme1PlaceBetButton";
    private const string NextDrawBannerName = "Theme1NextDrawBanner";
    private const string StakeValueHostName = "Theme1StakeValueHost";
    private const string SaldoValueHostName = "Theme1SaldoValueHost";
    private const string GevinstValueHostName = "Theme1GevinstValueHost";
    private const string CountdownHostName = "Theme1CountdownHost";
    private const string PlayerCountHostName = "Theme1PlayerCountHost";

    public static void EnsureControls(
        UIManager uiManager,
        GameManager gameManager,
        CandyTheme1HudBindingSet hudBindings)
    {
        if (uiManager == null || gameManager == null)
        {
            return;
        }

        RectTransform layoutRoot = ResolveCanvasRoot(uiManager, gameManager, hudBindings);
        if (layoutRoot == null)
        {
            return;
        }

        Transform legacyClusterRoot = ResolveLegacyClusterRoot(uiManager, gameManager, hudBindings);

        RectTransform controlRoot = EnsureStretchRoot(layoutRoot, ControlRootName);
        RectTransform parkingRoot = EnsureStretchRoot(layoutRoot, LegacyParkingName);
        parkingRoot.gameObject.SetActive(false);
        HashSet<Transform> staleParents = new HashSet<Transform>();
        BuildSaldoPanel(controlRoot, gameManager.displayTotalMoney, staleParents);
        BuildGevinstPanel(controlRoot, gameManager.winAmtText, staleParents);
        BuildShuffleButton(controlRoot, parkingRoot, uiManager.rerollTicketBtn, staleParents);
        BuildStakePanel(controlRoot, uiManager.betDown, uiManager.betUp, gameManager.displayCurrentBets, staleParents);
        BuildPlaceBetButton(controlRoot, uiManager.playBtn, staleParents);
        BuildNextDrawBanner(controlRoot, hudBindings, staleParents);

        ParkLegacyButton(uiManager.autoPlayBtn, parkingRoot, staleParents);
        CleanupStaleParents(staleParents, controlRoot);
        HideLegacyCluster(legacyClusterRoot, layoutRoot, controlRoot);
    }

    private static void BuildSaldoPanel(RectTransform controlRoot, TextMeshProUGUI valueLabel, HashSet<Transform> staleParents)
    {
        RectTransform panel = EnsureShell(controlRoot, SaldoPanelName, Theme1RuntimeAssetCatalog.GetSaldoPanelSprite());
        PositionRect(panel, Theme1HudControlStyle.SaldoPosition, Theme1HudControlStyle.SaldoSize);

        RectTransform valueHost = EnsureAnchorChild(panel, SaldoValueHostName);
        ConfigureHostRect(
            valueHost,
            Theme1HudControlStyle.SaldoValueOffset,
            Theme1HudControlStyle.MiniValueSize);
        ReparentLiveLabel(valueLabel, valueHost, staleParents);
        Theme1HudControlStyle.ApplyHudValueStyle(valueLabel, Theme1HudControlStyle.HudValueColor, 12f, 20f);
    }

    private static void BuildGevinstPanel(RectTransform controlRoot, TextMeshProUGUI valueLabel, HashSet<Transform> staleParents)
    {
        RectTransform panel = EnsureShell(controlRoot, GevinstPanelName, Theme1RuntimeAssetCatalog.GetGevinstPanelSprite());
        PositionRect(panel, Theme1HudControlStyle.GevinstPosition, Theme1HudControlStyle.GevinstSize);

        RectTransform valueHost = EnsureAnchorChild(panel, GevinstValueHostName);
        ConfigureHostRect(
            valueHost,
            Theme1HudControlStyle.GevinstValueOffset,
            Theme1HudControlStyle.MiniValueSize);
        ReparentLiveLabel(valueLabel, valueHost, staleParents);
        Theme1HudControlStyle.ApplyHudValueStyle(valueLabel, Theme1HudControlStyle.HudValueColor, 12f, 20f);
    }

    private static void BuildShuffleButton(RectTransform controlRoot, RectTransform parkingRoot, Button sourceButton, HashSet<Transform> staleParents)
    {
        RectTransform buttonRect = EnsureRectTransformChild(controlRoot, ShuffleButtonName);
        PositionRect(buttonRect, Theme1HudControlStyle.ShufflePosition, Theme1HudControlStyle.ShuffleSize);
        Image image = EnsureImageComponent(buttonRect.gameObject, Theme1RuntimeAssetCatalog.GetShuffleButtonSprite());
        image.type = Image.Type.Simple;
        image.preserveAspect = true;
        image.color = Color.white;
        image.raycastTarget = true;

        Button proxyButton = buttonRect.GetComponent<Button>();
        if (proxyButton == null)
        {
            proxyButton = buttonRect.gameObject.AddComponent<Button>();
        }

        proxyButton.targetGraphic = image;
        proxyButton.transition = Selectable.Transition.None;
        Theme1ButtonRelayProxy relay = buttonRect.GetComponent<Theme1ButtonRelayProxy>();
        if (relay == null)
        {
            relay = buttonRect.gameObject.AddComponent<Theme1ButtonRelayProxy>();
        }

        relay.Bind(sourceButton, image);
        EnsurePressFeedback(proxyButton, buttonRect);

        if (sourceButton == null)
        {
            proxyButton.interactable = false;
            image.color = Theme1HudControlStyle.DisabledTint;
            return;
        }

        Transform oldParent = sourceButton.transform.parent;
        if (oldParent != null && oldParent != parkingRoot)
        {
            staleParents.Add(oldParent);
        }

        sourceButton.transform.SetParent(parkingRoot, false);
        sourceButton.gameObject.SetActive(false);
    }

    private static void BuildStakePanel(
        RectTransform controlRoot,
        Button betDown,
        Button betUp,
        TextMeshProUGUI betLabel,
        HashSet<Transform> staleParents)
    {
        RectTransform panel = EnsureShell(controlRoot, StakePanelName, Theme1RuntimeAssetCatalog.GetStakePanelShellSprite());
        PositionRect(panel, Theme1HudControlStyle.StakePanelPosition, Theme1HudControlStyle.StakePanelSize);

        RectTransform valueHost = EnsureAnchorChild(panel, StakeValueHostName);
        ConfigureHostRect(valueHost, Theme1HudControlStyle.StakeValueOffset, Theme1HudControlStyle.StakeValueSize);
        ReparentLiveLabel(betLabel, valueHost, staleParents);
        Theme1HudControlStyle.ApplyHudValueStyle(betLabel, Theme1HudControlStyle.HudValueColor, 12f, 22f);

        if (betDown != null)
        {
            PositionButton(
                betDown,
                panel,
                Theme1HudControlStyle.StakeMinusOffset,
                Theme1HudControlStyle.StakeMinusSize,
                Theme1RuntimeAssetCatalog.GetStakeMinusButtonSprite(),
                staleParents);
            betDown.gameObject.name = "Theme1StakeMinusButton";
        }

        if (betUp != null)
        {
            PositionButton(
                betUp,
                panel,
                Theme1HudControlStyle.StakePlusOffset,
                Theme1HudControlStyle.StakePlusSize,
                Theme1RuntimeAssetCatalog.GetStakePlusButtonSprite(),
                staleParents);
            betUp.gameObject.name = "Theme1StakePlusButton";
        }
    }

    private static void BuildPlaceBetButton(RectTransform controlRoot, Button button, HashSet<Transform> staleParents)
    {
        if (button == null)
        {
            return;
        }

        PositionButton(
            button,
            controlRoot,
            Theme1HudControlStyle.PlaceBetPosition,
            Theme1HudControlStyle.PlaceBetSize,
            Theme1RuntimeAssetCatalog.GetPlaceBetButtonSprite(),
            staleParents);
        button.gameObject.name = PlaceBetButtonName;
    }

    private static void BuildNextDrawBanner(
        RectTransform controlRoot,
        CandyTheme1HudBindingSet hudBindings,
        HashSet<Transform> staleParents)
    {
        RectTransform banner = EnsureShell(controlRoot, NextDrawBannerName, Theme1RuntimeAssetCatalog.GetNextDrawBannerShellSprite());
        PositionRect(banner, Theme1HudControlStyle.NextDrawPosition, Theme1HudControlStyle.NextDrawSize);

        if (hudBindings?.CountdownText != null)
        {
            RectTransform countdownHost = EnsureAnchorChild(banner, CountdownHostName);
            ConfigureHostRect(countdownHost, Theme1HudControlStyle.NextDrawCountdownOffset, Theme1HudControlStyle.NextDrawCountdownSize);
            if (string.IsNullOrWhiteSpace(hudBindings.CountdownText.text))
            {
                hudBindings.CountdownText.text = "00:45";
            }

            ReparentLiveLabel(hudBindings.CountdownText, countdownHost, staleParents);
            Theme1HudControlStyle.ApplyHudValueStyle(hudBindings.CountdownText, Theme1HudControlStyle.CountdownColor, 10f, 18f);
        }

        if (hudBindings?.RoomPlayerCountText != null)
        {
            RectTransform playerCountHost = EnsureAnchorChild(banner, PlayerCountHostName);
            ConfigureHostRect(playerCountHost, Theme1HudControlStyle.NextDrawPlayerCountOffset, Theme1HudControlStyle.NextDrawPlayerCountSize);
            ReparentLiveLabel(hudBindings.RoomPlayerCountText, playerCountHost, staleParents);
            Theme1HudControlStyle.ApplyHudValueStyle(hudBindings.RoomPlayerCountText, Theme1HudControlStyle.PlayerCountColor, 8f, 13f);
            hudBindings.RoomPlayerCountText.alpha = 1f;
        }
    }

    private static void PositionButton(
        Button button,
        RectTransform parent,
        Vector2 designPosition,
        Vector2 designSize,
        Sprite sprite,
        HashSet<Transform> staleParents)
    {
        if (button == null || parent == null)
        {
            return;
        }

        RectTransform rect = button.transform as RectTransform;
        if (rect == null)
        {
            return;
        }

        Transform oldParent = rect.parent;
        if (oldParent != null && oldParent != parent)
        {
            staleParents.Add(oldParent);
        }

        rect.SetParent(parent, false);
        PositionRect(rect, designPosition, designSize);

        Image image = button.GetComponent<Image>();
        if (image == null)
        {
            image = button.gameObject.AddComponent<Image>();
        }

        image.sprite = sprite;
        image.type = Image.Type.Simple;
        image.preserveAspect = true;
        image.color = button.interactable ? Color.white : (Color)Theme1HudControlStyle.DisabledTint;
        image.raycastTarget = true;
        button.targetGraphic = image;
        button.transition = Selectable.Transition.None;
        button.gameObject.SetActive(true);

        HideLegacyButtonChildVisuals(button.transform);
        EnsurePressFeedback(button, rect);
    }

    private static void HideLegacyButtonChildVisuals(Transform buttonTransform)
    {
        if (buttonTransform == null)
        {
            return;
        }

        TMP_Text[] tmpLabels = buttonTransform.GetComponentsInChildren<TMP_Text>(true);
        for (int i = 0; i < tmpLabels.Length; i++)
        {
            if (tmpLabels[i] != null)
            {
                tmpLabels[i].gameObject.SetActive(false);
            }
        }

        Image[] images = buttonTransform.GetComponentsInChildren<Image>(true);
        for (int i = 0; i < images.Length; i++)
        {
            if (images[i] == null || images[i].transform == buttonTransform)
            {
                continue;
            }

            images[i].gameObject.SetActive(false);
        }
    }

    private static void EnsurePressFeedback(Button button, RectTransform target)
    {
        if (button == null)
        {
            return;
        }

        Theme1ButtonPressFeedback feedback = button.GetComponent<Theme1ButtonPressFeedback>();
        if (feedback == null)
        {
            feedback = button.gameObject.AddComponent<Theme1ButtonPressFeedback>();
        }

        feedback.Bind(target);
    }

    private static void ParkLegacyButton(Button button, RectTransform parkingRoot, HashSet<Transform> staleParents)
    {
        if (button == null || parkingRoot == null)
        {
            return;
        }

        Transform oldParent = button.transform.parent;
        if (oldParent != null && oldParent != parkingRoot)
        {
            staleParents.Add(oldParent);
        }

        button.transform.SetParent(parkingRoot, false);
        button.gameObject.SetActive(false);
    }

    private static void ReparentLiveLabel(TextMeshProUGUI label, RectTransform newParent, HashSet<Transform> staleParents)
    {
        if (label == null || newParent == null)
        {
            return;
        }

        Transform oldParent = label.transform.parent;
        if (oldParent != null && oldParent != newParent)
        {
            staleParents.Add(oldParent);
            DestroyVisibleBridges(oldParent, label);
        }

        label.transform.SetParent(newParent, false);
        RectTransform rect = label.rectTransform;
        rect.anchorMin = new Vector2(0.5f, 0.5f);
        rect.anchorMax = new Vector2(0.5f, 0.5f);
        rect.pivot = new Vector2(0.5f, 0.5f);
        rect.anchoredPosition = Vector2.zero;
        rect.sizeDelta = newParent.sizeDelta;
        rect.localScale = Vector3.one;
        rect.localRotation = Quaternion.identity;
        label.gameObject.SetActive(true);
        label.enabled = true;
        label.alpha = 1f;
        label.raycastTarget = false;
    }

    private static void DestroyVisibleBridges(Transform formerParent, TMP_Text source)
    {
        if (formerParent == null || source == null)
        {
            return;
        }

        Theme1VisibleTextBridge[] bridges = formerParent.GetComponentsInChildren<Theme1VisibleTextBridge>(true);
        for (int i = 0; i < bridges.Length; i++)
        {
            if (bridges[i] != null && bridges[i].Source == source)
            {
                DestroyBridgeObject(bridges[i].gameObject);
            }
        }
    }

    private static void CleanupStaleParents(HashSet<Transform> staleParents, RectTransform controlRoot)
    {
        if (staleParents == null)
        {
            return;
        }

        foreach (Transform staleParent in staleParents)
        {
            if (staleParent == null || staleParent == controlRoot || staleParent.IsChildOf(controlRoot))
            {
                continue;
            }

            int remainingButtons = staleParent.GetComponentsInChildren<Button>(true).Length;
            int remainingTmps = staleParent.GetComponentsInChildren<TextMeshProUGUI>(true).Length;
            if (remainingButtons == 0 && remainingTmps == 0)
            {
                staleParent.gameObject.SetActive(false);
            }
        }
    }

    private static RectTransform ResolveCanvasRoot(UIManager uiManager, GameManager gameManager, CandyTheme1HudBindingSet hudBindings)
    {
        Transform firstAnchor =
            (uiManager.playBtn != null ? uiManager.playBtn.transform : null) ??
            (uiManager.betUp != null ? uiManager.betUp.transform : null) ??
            (gameManager.displayTotalMoney != null ? gameManager.displayTotalMoney.transform : null) ??
            (hudBindings != null && hudBindings.CountdownText != null ? hudBindings.CountdownText.transform : null);
        if (firstAnchor == null)
        {
            return null;
        }

        Canvas rootCanvas = firstAnchor.GetComponentInParent<Canvas>()?.rootCanvas;
        return rootCanvas != null ? rootCanvas.transform as RectTransform : null;
    }

    private static Transform ResolveLegacyClusterRoot(UIManager uiManager, GameManager gameManager, CandyTheme1HudBindingSet hudBindings)
    {
        List<Transform> anchors = new List<Transform>
        {
            uiManager.playBtn != null ? uiManager.playBtn.transform : null,
            uiManager.betUp != null ? uiManager.betUp.transform : null,
            uiManager.betDown != null ? uiManager.betDown.transform : null,
            uiManager.rerollTicketBtn != null ? uiManager.rerollTicketBtn.transform : null,
            gameManager.displayTotalMoney != null ? gameManager.displayTotalMoney.transform : null,
            gameManager.winAmtText != null ? gameManager.winAmtText.transform : null,
            gameManager.displayCurrentBets != null ? gameManager.displayCurrentBets.transform : null,
            hudBindings != null && hudBindings.CountdownText != null ? hudBindings.CountdownText.transform : null
        };

        Transform common = null;
        for (int i = 0; i < anchors.Count; i++)
        {
            if (anchors[i] == null)
            {
                continue;
            }

            common = common == null ? anchors[i] : FindCommonAncestor(common, anchors[i]);
        }

        return common;
    }

    private static Transform FindCommonAncestor(Transform left, Transform right)
    {
        if (left == null)
        {
            return right;
        }

        if (right == null)
        {
            return left;
        }

        HashSet<Transform> ancestors = new HashSet<Transform>();
        Transform current = left;
        while (current != null)
        {
            ancestors.Add(current);
            current = current.parent;
        }

        current = right;
        while (current != null)
        {
            if (ancestors.Contains(current))
            {
                return current;
            }

            current = current.parent;
        }

        return null;
    }

    private static RectTransform EnsureStretchRoot(RectTransform parent, string objectName)
    {
        RectTransform rect = EnsureRectTransformChild(parent, objectName);
        rect.anchorMin = Vector2.zero;
        rect.anchorMax = Vector2.one;
        rect.pivot = new Vector2(0.5f, 0.5f);
        rect.offsetMin = Vector2.zero;
        rect.offsetMax = Vector2.zero;
        rect.localScale = Vector3.one;
        rect.localRotation = Quaternion.identity;
        rect.gameObject.SetActive(true);
        return rect;
    }

    private static void HideLegacyCluster(Transform legacyClusterRoot, RectTransform layoutRoot, RectTransform controlRoot)
    {
        if (legacyClusterRoot == null || layoutRoot == null || controlRoot == null)
        {
            return;
        }

        if (legacyClusterRoot == layoutRoot || legacyClusterRoot == controlRoot || legacyClusterRoot.IsChildOf(controlRoot))
        {
            return;
        }

        legacyClusterRoot.gameObject.SetActive(false);
    }

    private static RectTransform EnsureShell(RectTransform parent, string objectName, Sprite sprite)
    {
        RectTransform rect = EnsureRectTransformChild(parent, objectName);
        Image image = EnsureImageComponent(rect.gameObject, sprite);
        image.type = Image.Type.Simple;
        image.preserveAspect = true;
        image.color = Color.white;
        image.raycastTarget = false;
        return rect;
    }

    private static RectTransform EnsureAnchorChild(RectTransform parent, string objectName)
    {
        return EnsureRectTransformChild(parent, objectName);
    }

    private static RectTransform EnsureRectTransformChild(Transform parent, string objectName)
    {
        Transform existing = parent.Find(objectName);
        GameObject child = existing != null
            ? existing.gameObject
            : new GameObject(objectName, typeof(RectTransform));
        if (child.transform.parent != parent)
        {
            child.transform.SetParent(parent, false);
        }

        child.layer = parent.gameObject.layer;
        child.name = objectName;
        return child.GetComponent<RectTransform>();
    }

    private static Image EnsureImageComponent(GameObject target, Sprite sprite)
    {
        Image image = target.GetComponent<Image>();
        if (image == null)
        {
            image = target.AddComponent<Image>();
        }

        image.sprite = sprite;
        image.enabled = true;
        return image;
    }

    private static void PositionRect(RectTransform rect, Vector2 designPosition, Vector2 designSize)
    {
        rect.anchorMin = new Vector2(0.5f, 0f);
        rect.anchorMax = new Vector2(0.5f, 0f);
        rect.pivot = new Vector2(0.5f, 0f);
        rect.localScale = Vector3.one;
        rect.localRotation = Quaternion.identity;
        RectTransform root = ResolveScaleRoot(rect.parent as RectTransform);
        rect.anchoredPosition = Theme1HudControlStyle.Scale(root, designPosition);
        rect.sizeDelta = Theme1HudControlStyle.Scale(root, designSize);
    }

    private static void ConfigureHostRect(RectTransform rect, Vector2 designOffset, Vector2 designSize)
    {
        RectTransform root = ResolveScaleRoot(rect.parent as RectTransform);
        rect.anchorMin = new Vector2(0.5f, 0.5f);
        rect.anchorMax = new Vector2(0.5f, 0.5f);
        rect.pivot = new Vector2(0.5f, 0.5f);
        rect.localScale = Vector3.one;
        rect.localRotation = Quaternion.identity;
        rect.anchoredPosition = Theme1HudControlStyle.Scale(root, designOffset);
        rect.sizeDelta = Theme1HudControlStyle.Scale(root, designSize);
    }

    private static RectTransform ResolveScaleRoot(RectTransform start)
    {
        RectTransform current = start;
        while (current != null)
        {
            if (string.Equals(current.name, ControlRootName, System.StringComparison.Ordinal))
            {
                return current;
            }

            current = current.parent as RectTransform;
        }

        Canvas canvas = start != null ? start.GetComponentInParent<Canvas>()?.rootCanvas : null;
        return canvas != null ? canvas.transform as RectTransform : start;
    }

    private static void DestroyBridgeObject(GameObject target)
    {
        if (target == null)
        {
            return;
        }

        if (Application.isPlaying)
        {
            Object.Destroy(target);
        }
        else
        {
            Object.DestroyImmediate(target);
        }
    }
}
