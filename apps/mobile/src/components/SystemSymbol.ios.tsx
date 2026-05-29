import type { ComponentProps } from "react";
import { Host, Image } from "@expo/ui/swift-ui";
import { StyleSheet, Text, View, type ColorValue } from "react-native";

type NativeSymbolName = NonNullable<ComponentProps<typeof Image>["systemName"]>;

export interface SystemSymbolProps {
  name?: string;
  fallback: string;
  color: ColorValue;
  size?: number;
}

export function SystemSymbol({ name, fallback, color, size = 22 }: SystemSymbolProps) {
  const containerStyle = [styles.container, { height: size, width: size }];

  if (name) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={containerStyle}
      >
        <Host matchContents style={styles.host}>
          <Image color={color} size={size} systemName={name as NativeSymbolName} />
        </Host>
      </View>
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={containerStyle}
    >
      <Text style={[styles.fallback, { color, fontSize: size, lineHeight: size }]}>{fallback}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center"
  },
  fallback: {
    fontWeight: "700",
    textAlign: "center"
  },
  host: {
    alignItems: "center",
    justifyContent: "center"
  }
});
