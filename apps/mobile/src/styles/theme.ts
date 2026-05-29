import { DynamicColorIOS, Platform, type ColorValue } from "react-native";

function semanticColor(light: string, dark: string): ColorValue {
  return Platform.OS === "ios" ? DynamicColorIOS({ light, dark }) : light;
}

export const colors = {
  appBackground: semanticColor("#ffffff", "#000000"),
  chatBackground: semanticColor("#e8f1f7", "#0f1418"),
  chatPattern: semanticColor("rgba(90,134,158,0.16)", "rgba(104,160,184,0.12)"),
  elevatedBackground: semanticColor("#ffffff", "#1c1f23"),
  contextSurface: semanticColor("#ffffff", "#1c1c1e"),
  glassFallback: semanticColor("rgba(255,255,255,0.9)", "rgba(28,31,35,0.9)"),
  secondaryBackground: semanticColor("#f2f2f7", "#1c1c1e"),
  tertiaryBackground: semanticColor("#e5e5ea", "#2c2c2e"),
  separator: semanticColor("rgba(60,60,67,0.18)", "rgba(84,84,88,0.4)"),
  label: semanticColor("#000000", "#f5f5f7"),
  secondaryLabel: semanticColor("rgba(60,60,67,0.68)", "#c7c7cc"),
  tertiaryLabel: semanticColor("#8e8e93", "#8e8e93"),
  systemBlue: semanticColor("#007aff", "#0a84ff"),
  telegramBlue: semanticColor("#2aabee", "#32ade6"),
  systemRed: semanticColor("#ff3b30", "#ff453a"),
  incomingBubble: semanticColor("rgba(255,255,255,0.96)", "rgba(35,39,44,0.96)"),
  outgoingBubble: semanticColor("#35aee2", "#2387d8"),
  outgoingPressed: semanticColor("#2c9bc9", "#1f78c1"),
  agentBackground: semanticColor("#eef2ff", "#1c2140"),
  agentText: semanticColor("#312e81", "#d8dcff"),
  warningBackground: semanticColor("#fff4d6", "#3a2d0b"),
  warningText: semanticColor("#6b4d00", "#ffd76a")
};

export const layout = {
  screenPadding: 16,
  listMaxWidth: 720,
  conversationMaxWidth: 840
};
