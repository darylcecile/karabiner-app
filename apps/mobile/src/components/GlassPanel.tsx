import { PropsWithChildren, useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle
} from "react-native";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { colors } from "../styles/theme";

interface GlassPanelProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
}

export function GlassPanel({ children, style, tintColor }: GlassPanelProps) {
  const reduceTransparencyEnabled = useReduceTransparencyEnabled();
  const canUseGlass = canUseLiquidGlass(reduceTransparencyEnabled);

  return (
    <View style={styles.container}>
      {canUseGlass ? (
        <GlassView
          colorScheme="auto"
          glassEffectStyle="regular"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          {...(tintColor ? { tintColor } : {})}
        />
      ) : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}
      <View style={[styles.content, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderColor: colors.separator,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden"
  },
  content: {
    gap: 8
  },
  fallback: {
    backgroundColor: colors.glassFallback
  }
});

function canUseLiquidGlass(reduceTransparencyEnabled: boolean) {
  if (Platform.OS !== "ios" || reduceTransparencyEnabled) {
    return false;
  }

  try {
    return isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

function useReduceTransparencyEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") {
      return;
    }

    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (mounted) {
          setEnabled(value);
        }
      })
      .catch(() => {
        if (mounted) {
          setEnabled(false);
        }
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setEnabled
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
