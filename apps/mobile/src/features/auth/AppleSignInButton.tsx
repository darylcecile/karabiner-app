import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../styles/theme";

type Availability = "checking" | "available" | "unavailable";

export function AppleSignInButton() {
  const [availability, setAvailability] = useState<Availability>("checking");

  useEffect(() => {
    let mounted = true;

    if (Platform.OS !== "ios") {
      setAvailability("unavailable");
      return;
    }

    AppleAuthentication.isAvailableAsync()
      .then((isAvailable) => {
        if (mounted) {
          setAvailability(isAvailable ? "available" : "unavailable");
        }
      })
      .catch(() => {
        if (mounted) {
          setAvailability("unavailable");
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (availability === "available") {
    return (
      <AppleAuthentication.AppleAuthenticationButton
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        cornerRadius={14}
        onPress={signInWithApple}
        style={styles.nativeButton}
      />
    );
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign in with Apple"
        accessibilityState={{ disabled: true }}
        disabled
        style={styles.fallbackButton}
      >
        <Text style={styles.fallbackIcon}></Text>
        <Text style={styles.fallbackButtonText}>Sign in with Apple</Text>
      </Pressable>
      <Text style={styles.unavailableText}>
        {availability === "checking"
          ? "Checking Apple sign-in availability…"
          : "Requires Sign in with Apple support in an iOS simulator, device, or development client."}
      </Text>
    </View>
  );
}

async function signInWithApple() {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL
      ]
    });

    if (!credential.identityToken) {
      Alert.alert("Sign in failed", "Apple did not return an identity token.");
      return;
    }

    Alert.alert("Signed in", "The backend will exchange this Apple identity token for a session.");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ERR_REQUEST_CANCELED"
    ) {
      return;
    }

    Alert.alert("Sign in failed", "Please try again.");
  }
}

const styles = StyleSheet.create({
  nativeButton: {
    height: 50
  },
  fallbackButton: {
    alignItems: "center",
    backgroundColor: colors.label,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    height: 50,
    justifyContent: "center",
    opacity: 0.38
  },
  fallbackButtonText: {
    color: colors.elevatedBackground,
    fontSize: 17,
    fontWeight: "700"
  },
  fallbackIcon: {
    color: colors.elevatedBackground,
    fontSize: 19,
    fontWeight: "700"
  },
  unavailableText: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8
  }
});
