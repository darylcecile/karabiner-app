import "react-native-gesture-handler";

import { Stack } from "expo-router";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../styles/theme";

export default function RootLayout() {
  const defaultHeaderEffects =
    Platform.OS === "ios"
      ? ({
          headerBlurEffect: "systemChromeMaterial",
          headerTransparent: true
        } as const)
      : {};
  const conversationHeaderEffects =
    Platform.OS === "ios"
      ? ({
          headerBlurEffect: "systemChromeMaterial",
          headerTransparent: false
        } as const)
      : {};

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            contentStyle: {
              backgroundColor: colors.appBackground
            },
            headerLargeTitle: Platform.OS === "ios",
            headerShadowVisible: false,
            ...defaultHeaderEffects
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="conversation/[id]"
            options={{
              headerShown: false,
              headerLargeTitle: false,
              headerShadowVisible: false,
              ...conversationHeaderEffects
            }}
          />
        </Stack>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
