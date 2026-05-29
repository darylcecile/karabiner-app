import { Link, Stack, useRouter, type Href } from "expo-router";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import {
  agentParticipants,
  userParticipants,
  type ConversationParticipant
} from "../features/messages/participants";
import { SystemSymbol } from "../components/SystemSymbol";
import { colors, layout } from "../styles/theme";

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
        ListHeaderComponent={
          <Link href={"/create-group" as Href} asChild>
            <Pressable
              accessibilityHint="Starts a new group conversation"
              accessibilityLabel="New Group"
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, styles.topRow, pressed ? styles.rowPressed : null]}
            >
              <View style={[styles.avatar, styles.groupAvatar]}>
                <SystemSymbol color="white" fallback="+" name="person.2.badge.plus" size={21} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.title}>New Group</Text>
                <Text style={styles.subtitle}>Create a group with people and agents.</Text>
              </View>
              <SystemSymbol color={colors.tertiaryLabel} fallback="›" name="chevron.right" size={16} />
            </Pressable>
          </Link>
        }
        renderItem={({ item }) => (
          <ParticipantRow onPress={() => openConversation(item)} participant={item} />
        )}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
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
        <Text numberOfLines={2} style={styles.subtitle}>
          {participant.handle} · {participant.description}
        </Text>
      </View>
      <SystemSymbol color={colors.tertiaryLabel} fallback="›" name="chevron.right" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1
  },
  list: {
    alignSelf: "center",
    maxWidth: layout.listMaxWidth,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: 10,
    width: "100%"
  },
  topRow: {
    marginBottom: 12
  },
  sectionGap: {
    height: 8
  },
  sectionHeader: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginTop: 10,
    paddingBottom: 7,
    paddingHorizontal: 4,
    textTransform: "uppercase"
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.elevatedBackground,
    flexDirection: "row",
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  rowPressed: {
    backgroundColor: colors.tertiaryBackground
  },
  avatar: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44
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
    fontSize: 20,
    fontWeight: "800"
  },
  rowContent: {
    flex: 1,
    gap: 3
  },
  title: {
    color: colors.label,
    fontSize: 17,
    fontWeight: "700"
  },
  subtitle: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 19
  }
});

function toHref(pathname: string, params: Record<string, string>): Href {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  return `${pathname}?${query}` as Href;
}
