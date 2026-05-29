import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View
} from "react-native";
import type { Message } from "@karabiner/shared";
import { Composer } from "../../components/Composer";
import { MessageBlockView } from "../../components/MessageBlockView";
import { colors, layout } from "../../styles/theme";
import { findParticipant } from "../../features/messages/participants";

type DraftKind = "agent" | "direct" | "group";

export default function DraftConversationScreen() {
  const params = useLocalSearchParams<{
    avatar?: string | string[];
    conversationId?: string | string[];
    kind?: string | string[];
    participantIds?: string | string[];
    title?: string | string[];
  }>();
  const title = paramString(params.title)?.trim() || "New Conversation";
  const avatar = paramString(params.avatar) || "💬";
  const kind = parseKind(paramString(params.kind));
  const participantIds = useMemo(() => parseIdList(paramString(params.participantIds)), [params.participantIds]);
  const participants = useMemo(
    () => participantIds.map(findParticipant).filter((participant) => participant !== undefined),
    [participantIds]
  );
  const conversationId = paramString(params.conversationId) ?? `draft-${participantIds.join("-") || "conversation"}`;
  const [draftMessages, setDraftMessages] = useState<Message[]>([]);
  const subtitle = describeConversation(kind, participants.map((participant) => participant.displayName));

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      style={styles.screen}
    >
      <Stack.Screen options={{ headerLargeTitle: false, title }} />
      <FlatList
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={draftMessages}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(message) => message.id}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyBody}>Send the first message to start the conversation.</Text>
          </View>
        }
        ListHeaderComponent={
          <View style={styles.conversationHeader}>
            <Text accessibilityLabel={`${title} avatar ${avatar}`} style={styles.headerAvatar}>
              {avatar}
            </Text>
            <Text numberOfLines={2} style={styles.headerTitle}>
              {title}
            </Text>
            <Text numberOfLines={2} style={styles.headerSubtitle}>
              {subtitle}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.messageRow}>
            <View style={styles.ownMessage}>
              <View style={[styles.bubble, styles.outgoingBubble]}>
                {item.blocks.map((block, index) => (
                  <MessageBlockView block={block} key={`${item.id}-${index}`} tone="outgoing" />
                ))}
              </View>
            </View>
          </View>
        )}
      />
      <Composer
        conversationId={conversationId}
        onSend={(message) => setDraftMessages((current) => [...current, message])}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1
  },
  list: {
    alignSelf: "center",
    flexGrow: 1,
    gap: 12,
    maxWidth: layout.conversationMaxWidth,
    padding: layout.screenPadding,
    width: "100%"
  },
  conversationHeader: {
    alignItems: "center",
    gap: 7,
    paddingBottom: 12,
    paddingTop: 6
  },
  headerAvatar: {
    backgroundColor: colors.elevatedBackground,
    borderRadius: 34,
    fontSize: 38,
    height: 68,
    lineHeight: 68,
    overflow: "hidden",
    textAlign: "center",
    width: 68
  },
  headerTitle: {
    color: colors.label,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center"
  },
  headerSubtitle: {
    color: colors.secondaryLabel,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center"
  },
  emptyState: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 24
  },
  emptyTitle: {
    color: colors.label,
    fontSize: 18,
    fontWeight: "800"
  },
  emptyBody: {
    color: colors.secondaryLabel,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center"
  },
  messageRow: {
    width: "100%"
  },
  ownMessage: {
    alignSelf: "flex-end",
    maxWidth: "86%"
  },
  bubble: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  outgoingBubble: {
    backgroundColor: colors.outgoingBubble,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    overflow: "hidden"
  }
});

function paramString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseIdList(value: string | undefined): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function parseKind(value: string | undefined): DraftKind {
  if (value === "agent" || value === "group") {
    return value;
  }

  return "direct";
}

function describeConversation(kind: DraftKind, names: string[]): string {
  if (kind === "group") {
    const memberLabel = `${names.length} member${names.length === 1 ? "" : "s"}`;
    return names.length > 0 ? `${memberLabel} · ${names.join(", ")}` : "New group conversation";
  }

  if (kind === "agent") {
    return "Agent conversation";
  }

  return "Direct conversation";
}

