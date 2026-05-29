import { StyleSheet, Text, View, type ColorValue } from "react-native";

export interface SystemSymbolProps {
  name?: string;
  fallback: string;
  color: ColorValue;
  size?: number;
}

export function SystemSymbol({ fallback, color, size = 22 }: SystemSymbolProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.container, { height: size, width: size }]}
    >
      <Text style={[styles.symbol, { color, fontSize: size, lineHeight: size }]}>{fallback}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center"
  },
  symbol: {
    fontWeight: "700",
    textAlign: "center"
  }
});
