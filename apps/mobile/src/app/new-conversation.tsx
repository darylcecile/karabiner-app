import { Stack, useRouter, type Href } from "expo-router";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import {
  agentParticipants,
  userParticipants,
  type ConversationParticipant
} from "../features/messages/participants";
import { SystemSymbol } from "../components/SystemSymbol";
import { colors } from "../styles/theme";

const sections = [
  { title: "Agents", data: agentParticipants },
  { title: "People", data: userParticipants }
];

export default function NewConversationScreen() {
  const router = useRouter();

  function openConversation(participant: ConversationParticipant) {
    router.push(
      toHref("/conversation/draft", {
        avatar: participant.avatar,
        conversationId: `draft-${participant.id}`,
        kind: participant.kind === "agent" ? "agent" : "direct",
        participantIds: participant.id,
        title: participant.displayName
      })
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerLargeTitle: false, title: "New Conversation" }} />
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <Pressable
            accessibilityHint="Starts a new group conversation"
            accessibilityLabel="New Group"
            accessibilityRole="button"
            onPress={() => router.push("/create-group" as Href)}
            style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
          >
            <View style={[styles.avatar, styles.groupAvatar]}>
              <SystemSymbol color="white" fallback="+" name="person.2.badge.plus" size={20} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.title}>New Group</Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                Create a group with people and agents.
              </Text>
            </View>
            <SystemSymbol color={colors.tertiaryLabel} fallback="›" name="chevron.right" size={14} />
          </Pressable>
        }
        renderItem={({ item }) => (
          <ParticipantRow onPress={() => openConversation(item)} participant={item} />
        )}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        sections={sections}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

interface ParticipantRowProps {
  onPress: () => void;
  participant: ConversationParticipant;
}

function ParticipantRow({ onPress, participant }: ParticipantRowProps) {
  return (
    <Pressable
      accessibilityHint="Creates and opens a conversation"
      accessibilityLabel={`Start conversation with ${participant.displayName}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={[styles.avatar, participant.kind === "agent" ? styles.agentAvatar : styles.userAvatar]}>
        <Text style={styles.avatarText}>{participant.avatar}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text numberOfLines={1} style={styles.title}>
          {participant.displayName}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {participant.handle} · {participant.description}
        </Text>
      </View>
      <SystemSymbol color={colors.tertiaryLabel} fallback="›" name="chevron.right" size={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1
  },
  list: {
    paddingBottom: 24
  },
  sectionHeader: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "400",
    paddingBottom: 6,
    paddingHorizontal: 16,
    paddingTop: 18,
    textTransform: "uppercase"
  },
  row: {
    alignItems: "center",
    backgroundColor: "transparent",
    flexDirection: "row",
    gap: 12,
    minHeight: 60,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 6
  },
  rowPressed: {
    backgroundColor: colors.tertiaryBackground
  },
  separator: {
    backgroundColor: colors.separator,
    height: StyleSheet.hairlineWidth,
    marginLeft: 68
  },
  avatar: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  agentAvatar: {
    backgroundColor: colors.agentBackground
  },
  userAvatar: {
    backgroundColor: colors.systemBlue
  },
  groupAvatar: {
    backgroundColor: colors.systemBlue
  },
  avatarText: {
    color: "white",
    fontSize: 17,
    fontWeight: "700"
  },
  rowContent: {
    flex: 1,
    gap: 2
  },
  title: {
    color: colors.label,
    fontSize: 17,
    fontWeight: "500"
  },
  subtitle: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 18
  }
});

function toHref(pathname: string, params: Record<string, string>): Href {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  return `${pathname}?${query}` as Href;
}
