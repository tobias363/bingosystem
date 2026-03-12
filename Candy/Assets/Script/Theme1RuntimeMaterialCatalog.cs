using System;
using System.Reflection;
using UnityEngine;
using UnityEngine.UI;

public static class Theme1RuntimeMaterialCatalog
{
    private const string UiEffectTypeName = "Coffee.UIEffects.UIEffect, Coffee.UIEffects";

    public static Material EnsureCellGlowMaterial(Graphic graphic)
    {
        if (graphic == null)
        {
            return null;
        }

        graphic.material = null;
        ApplyNeutralCellGlowUiEffect(GetOrAddUiEffect(graphic));
        return null;
    }

    public static void ApplyCellGlowPulse(Graphic graphic, float emphasis)
    {
        if (graphic == null)
        {
            return;
        }

        ApplyNeutralCellGlowUiEffect(GetUiEffect(graphic));
    }

    private static Component GetOrAddUiEffect(Graphic graphic)
    {
        if (graphic == null)
        {
            return null;
        }

        Type effectType = ResolveUiEffectType();
        if (effectType == null)
        {
            return null;
        }

        Component effect = graphic.GetComponent(effectType);
        if (effect == null)
        {
            effect = graphic.gameObject.AddComponent(effectType);
        }

        return effect;
    }

    private static Component GetUiEffect(Graphic graphic)
    {
        Type effectType = ResolveUiEffectType();
        return graphic != null && effectType != null ? graphic.GetComponent(effectType) : null;
    }

    private static Type ResolveUiEffectType()
    {
        Type effectType = Type.GetType(UiEffectTypeName, throwOnError: false);
        return effectType != null && typeof(Component).IsAssignableFrom(effectType)
            ? effectType
            : null;
    }

    private static void ApplyNeutralCellGlowUiEffect(Component effect)
    {
        if (effect == null)
        {
            return;
        }

        SetEnumMember(effect, "colorFilter", "None");
        SetEnumMember(effect, "samplingFilter", "None");
        SetEnumMember(effect, "shadowMode", "None");
        SetEnumMember(effect, "blendType", "AlphaBlend");
        SetFloatMember(effect, "samplingScale", 1f);
        SetFloatMember(effect, "samplingIntensity", 0f);
        SetFloatMember(effect, "samplingWidth", 0f);
        SetFloatMember(effect, "shadowBlurIntensity", 0f);
        SetVector2Member(effect, "shadowDistance", Vector2.zero);
        SetBoolMember(effect, "colorGlow", false);
        SetBoolMember(effect, "shadowColorGlow", false);
        SetColorMember(effect, "color", Color.white);
        SetColorMember(effect, "shadowColor", Color.clear);
        SetFloatMember(effect, "colorAlpha", 1f);
    }

    private static void SetEnumMember(Component target, string memberName, string enumValueName)
    {
        if (target == null || string.IsNullOrWhiteSpace(memberName))
        {
            return;
        }

        Type valueType = GetMemberType(target, memberName);
        if (valueType == null || !valueType.IsEnum)
        {
            return;
        }

        try
        {
            object parsedValue = Enum.Parse(valueType, enumValueName);
            SetMemberValue(target, memberName, parsedValue);
        }
        catch
        {
        }
    }

    private static void SetBoolMember(Component target, string memberName, bool value)
    {
        SetMemberValue(target, memberName, value);
    }

    private static void SetFloatMember(Component target, string memberName, float value)
    {
        SetMemberValue(target, memberName, value);
    }

    private static void SetColorMember(Component target, string memberName, Color value)
    {
        SetMemberValue(target, memberName, value);
    }

    private static void SetVector2Member(Component target, string memberName, Vector2 value)
    {
        SetMemberValue(target, memberName, value);
    }

    private static void SetMemberValue(Component target, string memberName, object value)
    {
        if (target == null || string.IsNullOrWhiteSpace(memberName))
        {
            return;
        }

        Type targetType = target.GetType();
        PropertyInfo property = targetType.GetProperty(memberName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        if (property != null && property.CanWrite)
        {
            property.SetValue(target, value);
            return;
        }

        FieldInfo field = targetType.GetField(memberName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        field?.SetValue(target, value);
    }

    private static Type GetMemberType(Component target, string memberName)
    {
        if (target == null || string.IsNullOrWhiteSpace(memberName))
        {
            return null;
        }

        Type targetType = target.GetType();
        PropertyInfo property = targetType.GetProperty(memberName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        if (property != null)
        {
            return property.PropertyType;
        }

        FieldInfo field = targetType.GetField(memberName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        return field?.FieldType;
    }
}
