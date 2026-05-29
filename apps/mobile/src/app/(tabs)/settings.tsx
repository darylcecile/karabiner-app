import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AppleSignInButton } from "../../features/auth/AppleSignInButton";
import { GlassPanel } from "../../components/GlassPanel";
import { colors, layout } from "../../styles/theme";

export default function SettingsScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <GlassPanel style={styles.section}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.body}>
          Sign in with Apple will create your account and reserve your handle. Account deletion,
          data export, and session revocation belong in this surface.
        </Text>
        <AppleSignInButton />
      </GlassPanel>
      <View style={styles.row}>
        <Text style={styles.rowTitle}>Handle</Text>
        <Text style={styles.rowValue}>@daryl</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowTitle}>Privacy</Text>
        <Text style={styles.rowValue}>Private media, scoped plugins</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: "center",
    gap: 14,
    maxWidth: layout.listMaxWidth,
    padding: layout.screenPadding,
    width: "100%"
  },
  section: {
    gap: 12,
    padding: 18
  },
  title: {
    color: colors.label,
    fontSize: 24,
    fontWeight: "800"
  },
  body: {
    color: colors.secondaryLabel,
    fontSize: 16,
    lineHeight: 23
  },
  row: {
    backgroundColor: colors.elevatedBackground,
    borderColor: colors.separator,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16
  },
  rowTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "700"
  },
  rowValue: {
    color: colors.secondaryLabel,
    fontSize: 15,
    marginTop: 4
  }
});
