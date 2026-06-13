import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View, type ColorValue } from "react-native";
import { useState } from "react";
import { conversations } from "../../features/messages/fixtures";
import { conversationParticipants } from "../../features/messages/participants";
import { SystemSymbol } from "../../components/SystemSymbol";
import { colors } from "../../styles/theme";

export default function ConversationDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = Array.isArray(id) ? id[0] : id;
  const conversation = conversations.find((c) => c.id === conversationId);
  const [muted, setMuted] = useState(false);

  if (!conversation) {
    return (
      <View style={styles.empty}>
        <Stack.Screen options={{ title: "Info" }} />
        <Text style={styles.emptyText}>Conversation not found.</Text>
      </View>
    );
  }

  const isGroup = conversation.kind === "group";
  const isAgent = conversation.kind === "agent";
  const subtitle = isAgent ? "bot" : isGroup ? "group" : "online";
  const initial = conversation.title.trim().charAt(0).toUpperCase() || "?";
  const members = isGroup
    ? conversationParticipants.slice(0, 4)
    : isAgent
      ? conversationParticipants.filter((p) => p.kind === "agent").slice(0, 1)
      : [];

  return (
    <>
      <Stack.Screen options={{ title: "Info", headerLargeTitle: false }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.title}>{conversation.title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.actionRow}>
          <ActionChip icon="bell.slash" label="Mute" onPress={() => setMuted((m) => !m)} active={muted} />
          <ActionChip icon="magnifyingglass" label="Search" onPress={() => undefined} disabled />
          <ActionChip icon="phone" label="Call" onPress={() => undefined} disabled />
          <ActionChip icon="video" label="Video" onPress={() => undefined} disabled />
        </View>

        <Section title="Notifications">
          <Row
            label="Mute notifications"
            right={<Switch value={muted} onValueChange={setMuted} />}
            last
          />
        </Section>

        {isGroup ? (
          <Section title={`Members · ${members.length}`}>
            {members.map((m, idx) => (
              <Row
                key={m.id}
                leading={
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{m.avatar}</Text>
                  </View>
                }
                label={m.displayName}
                sub={m.handle}
                last={idx === members.length - 1}
                onPress={() => Alert.alert(m.displayName, `Handle: ${m.handle}\n\nMember profile coming soon.`)}
              />
            ))}
            <Row
              leading={
                <View style={[styles.memberAvatar, styles.addMemberAvatar]}>
                  <SystemSymbol name="plus" fallback="+" color={colors.systemBlue} size={18} />
                </View>
              }
              label="Add Members"
              labelColor={colors.systemBlue}
              last
              onPress={() =>
                Alert.alert(
                  "Add Members",
                  "Inviting people to a group is not wired up to a backend yet."
                )
              }
            />
          </Section>
        ) : null}

        <Section title="Shared">
          <Row
            label="Media"
            right={<Chevron />}
            sub="0 photos & videos"
            onPress={() => Alert.alert("Shared Media", "No media has been shared in this chat yet.")}
          />
          <Row
            label="Files"
            right={<Chevron />}
            sub="0 documents"
            onPress={() => Alert.alert("Shared Files", "No files have been shared in this chat yet.")}
          />
          <Row
            label="Links"
            right={<Chevron />}
            sub="0 links"
            last
            onPress={() => Alert.alert("Shared Links", "No links have been shared in this chat yet.")}
          />
        </Section>

        <Section>
          <Row
            label="Clear History"
            labelColor={colors.systemRed}
            center
            last
            onPress={() =>
              Alert.alert(
                "Clear History?",
                "All messages in this chat will be deleted for you. This cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Clear",
                    style: "destructive",
                    onPress: () =>
                      Alert.alert(
                        "History cleared",
                        "Messages aren't persisted in this build, so they'll be back next time the app launches."
                      )
                  }
                ]
              )
            }
          />
        </Section>

        <Section>
          <Row
            label={isGroup ? "Leave Group" : "Delete Chat"}
            labelColor={colors.systemRed}
            center
            last
            onPress={() =>
              Alert.alert(
                isGroup ? "Leave Group?" : "Delete Chat?",
                isGroup
                  ? "You will be removed from this group. Other members will see that you left."
                  : "This conversation will be removed from your list.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: isGroup ? "Leave" : "Delete",
                    style: "destructive",
                    onPress: () => router.back()
                  }
                ]
              )
            }
          />
        </Section>
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionHeader}>{title.toUpperCase()}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  sub,
  right,
  leading,
  labelColor,
  center,
  last,
  onPress
}: {
  label: string;
  sub?: string;
  right?: React.ReactNode;
  leading?: React.ReactNode;
  labelColor?: ColorValue;
  center?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      {leading ? <View style={styles.rowLeading}>{leading}</View> : null}
      <View style={styles.rowLabels}>
        <Text style={[styles.rowLabel, labelColor ? { color: labelColor } : null, center ? styles.rowLabelCenter : null]}>
          {label}
        </Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, !last ? styles.rowDivider : null]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last ? styles.rowDivider : null, pressed ? styles.rowPressed : null]}
    >
      {content}
    </Pressable>
  );
}

function Chevron() {
  return <SystemSymbol name="chevron.right" fallback="›" color={colors.tertiaryLabel} size={14} />;
}

function ActionChip({
  icon,
  label,
  onPress,
  active,
  disabled
}: {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionChip,
        pressed && !disabled ? styles.actionChipPressed : null,
        disabled ? styles.actionChipDisabled : null
      ]}
    >
      <SystemSymbol
        name={icon}
        fallback="•"
        color={disabled ? colors.tertiaryLabel : active ? colors.systemRed : colors.systemBlue}
        size={20}
      />
      <Text
        style={[
          styles.actionChipLabel,
          disabled ? styles.actionChipLabelDisabled : null,
          active ? { color: colors.systemRed } : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.secondaryBackground, flex: 1 },
  content: { paddingBottom: 40 },
  empty: { alignItems: "center", flex: 1, justifyContent: "center" },
  emptyText: { color: colors.secondaryLabel, fontSize: 16 },
  hero: { alignItems: "center", paddingBottom: 16, paddingTop: 28 },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.telegramPurple,
    borderRadius: 50,
    height: 100,
    justifyContent: "center",
    width: 100
  },
  avatarText: { color: "white", fontSize: 44, fontWeight: "700" },
  title: { color: colors.label, fontSize: 24, fontWeight: "700", marginTop: 14 },
  subtitle: { color: colors.secondaryLabel, fontSize: 15, marginTop: 4 },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 8
  },
  actionChip: {
    alignItems: "center",
    backgroundColor: colors.elevatedBackground,
    borderRadius: 12,
    flex: 1,
    gap: 6,
    paddingVertical: 12
  },
  actionChipPressed: { opacity: 0.7 },
  actionChipDisabled: { opacity: 0.5 },
  actionChipLabel: { color: colors.systemBlue, fontSize: 13, fontWeight: "500" },
  actionChipLabelDisabled: { color: colors.tertiaryLabel },
  section: { marginTop: 28 },
  sectionHeader: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "400",
    marginBottom: 7,
    paddingHorizontal: 32
  },
  sectionBody: {
    backgroundColor: colors.elevatedBackground,
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: "hidden"
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  rowDivider: { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth },
  rowPressed: { backgroundColor: colors.tertiaryBackground },
  rowLeading: { marginRight: 12 },
  rowLabels: { flex: 1 },
  rowLabel: { color: colors.label, fontSize: 17 },
  rowLabelCenter: { textAlign: "center" },
  rowSub: { color: colors.secondaryLabel, fontSize: 13, marginTop: 2 },
  rowRight: { marginLeft: 8 },
  memberAvatar: {
    alignItems: "center",
    backgroundColor: colors.tertiaryBackground,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  memberAvatarText: { color: colors.label, fontSize: 16 },
  addMemberAvatar: { backgroundColor: "transparent", borderColor: colors.systemBlue, borderWidth: StyleSheet.hairlineWidth }
});
