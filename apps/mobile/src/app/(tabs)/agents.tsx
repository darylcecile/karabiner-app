import { ScrollView, StyleSheet, Text, View } from "react-native";
import { GlassPanel } from "../../components/GlassPanel";
import { colors, layout } from "../../styles/theme";

export default function AgentsScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <GlassPanel style={styles.hero}>
        <Text style={styles.eyebrow}>Agent-native channels</Text>
        <Text style={styles.title}>Link OpenClaw when you are ready.</Text>
        <Text style={styles.body}>
          Karabiner treats AI agents as scoped channel participants. Each connection will declare
          permissions, slash commands, widgets, webhook URLs, and revocation behavior before it can
          read or write in a conversation.
        </Text>
      </GlassPanel>
      <View style={styles.callout}>
        <Text style={styles.calloutTitle}>V1 boundary</Text>
        <Text style={styles.calloutBody}>
          The app will connect to user-provided OpenClaw instances first. Managed agents and
          subscription tiers are a V2 entitlement.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: "center",
    gap: 16,
    maxWidth: layout.listMaxWidth,
    padding: layout.screenPadding,
    width: "100%"
  },
  hero: {
    gap: 10,
    padding: 18
  },
  eyebrow: {
    color: colors.systemBlue,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  title: {
    color: colors.label,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5
  },
  body: {
    color: colors.secondaryLabel,
    fontSize: 16,
    lineHeight: 23
  },
  callout: {
    backgroundColor: colors.warningBackground,
    borderRadius: 18,
    padding: 16
  },
  calloutTitle: {
    color: colors.warningText,
    fontSize: 16,
    fontWeight: "700"
  },
  calloutBody: {
    color: colors.warningText,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6
  }
});
