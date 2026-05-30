import { Tabs, useRouter, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Conversation } from "@karabiner/shared";
import { conversations, messages } from "../../features/messages/fixtures";
import { SystemSymbol } from "../../components/SystemSymbol";
import { colors, layout } from "../../styles/theme";

export default function MessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [friendHandles, setFriendHandles] = useState(["@avery", "@sam"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const visibleConversations = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    return conversations
      .filter((conversation) => !hiddenIds.includes(conversation.id))
      .filter((conversation) =>
        trimmed.length === 0 ? true : conversation.title.toLowerCase().includes(trimmed)
      );
  }, [hiddenIds, searchQuery]);

  function confirmDelete(conversation: Conversation) {
    Alert.alert(
      `Delete "${conversation.title}"?`,
      "This will remove the chat from your list. The conversation history isn't persisted in this demo.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setHiddenIds((current) =>
              current.includes(conversation.id) ? current : [...current, conversation.id]
            );
          }
        }
      ]
    );
  }

  function openAddFriend() {
    Alert.prompt(
      "Add Friend",
      "Enter a handle to send a friend request.",
      (value) => {
        const handle = normalizeHandle(value);

        if (!handle) {
          Alert.alert("Invalid handle", "Use 3-30 letters, numbers, dots, dashes, or underscores.");
          return;
        }

        setFriendHandles((current) => (current.includes(handle) ? current : [...current, handle]));
      },
      "plain-text",
      "",
      "default"
    );
  }

  return (
    <>
      <Tabs.Screen
        options={{
          headerShown: false
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.list}
        data={visibleConversations}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(conversation) => conversation.id}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          searchQuery.trim().length > 0 ? (
            <Text style={styles.emptyResults}>No chats match "{searchQuery.trim()}".</Text>
          ) : null
        }
        ListHeaderComponent={
          <View style={[styles.headerContent, { paddingTop: insets.top + 10 }]}>
            <View style={styles.largeTitleRow}>
              <Text style={styles.largeTitle}>Chats</Text>
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityLabel="Add Friend"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={openAddFriend}
                  style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressed : null]}
                >
                  <SystemSymbol color={colors.systemBlue} fallback="+" name="person.badge.plus" size={22} />
                </Pressable>
                <Pressable
                  accessibilityHint="Starts a new chat or group"
                  accessibilityLabel="New Conversation"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => router.push("/new-conversation" as Href)}
                  style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressed : null]}
                >
                  <SystemSymbol color={colors.systemBlue} fallback="+" name="square.and.pencil" size={22} />
                </Pressable>
              </View>
            </View>
            <View style={styles.searchBar}>
              <SystemSymbol color={colors.tertiaryLabel} fallback="⌕" name="magnifyingglass" size={16} />
              <TextInput
                accessibilityLabel="Search chats"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                onChangeText={setSearchQuery}
                placeholder="Search"
                placeholderTextColor={colors.tertiaryLabel}
                returnKeyType="search"
                style={styles.searchInput}
                value={searchQuery}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const unreadLabel = item.unreadCount > 0 ? `, ${item.unreadCount} unread` : "";
          const presentation = conversationPresentation(item.id);
          const lastMessage = lastMessagePreview(item.id);
          const unread = item.unreadCount > 0;

          return (
            <ReanimatedSwipeable
              friction={2}
              overshootRight={false}
              rightThreshold={40}
              renderRightActions={() => (
                <Pressable
                  accessibilityLabel={`Delete ${item.title}`}
                  accessibilityRole="button"
                  onPress={() => confirmDelete(item)}
                  style={styles.swipeDelete}
                >
                  <SystemSymbol color="white" fallback="🗑" name="trash" size={20} />
                  <Text style={styles.swipeDeleteText}>Delete</Text>
                </Pressable>
              )}
            >
              <Pressable
                accessibilityHint="Opens the conversation"
                accessibilityLabel={`Open ${item.title}${unreadLabel}`}
                accessibilityRole="button"
                onPress={() => router.push(`/conversation/${item.id}` as Href)}
                style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.avatar, { backgroundColor: presentation.color }]}
                >
                  <Text style={styles.avatarText}>{presentation.avatar}</Text>
                </View>
                <View style={styles.rowContent}>
                  <View style={styles.rowHeader}>
                    <Text style={[styles.title, unread ? styles.unreadTitle : null]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.timestamp, unread ? styles.unreadTimestamp : null]}>
                      {presentation.time}
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={[styles.subtitle, unread ? styles.unreadSubtitle : null]} numberOfLines={1}>
                      {lastMessage}
                    </Text>
                    {item.unreadCount > 0 ? (
                      <Text
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                        style={styles.badge}
                      >
                        {item.unreadCount}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            </ReanimatedSwipeable>
          );
        }}
        style={styles.screen}
      />
    </>
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
    paddingBottom: 8,
    width: "100%"
  },
  headerContent: {
    gap: 10,
    paddingBottom: 8,
    paddingHorizontal: 16
  },
  largeTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44
  },
  largeTitle: {
    color: colors.label,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 40
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  headerIconButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  searchBar: {
    alignItems: "center",
    backgroundColor: colors.secondaryBackground,
    borderRadius: 10,
    flexDirection: "row",
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 12
  },
  searchInput: {
    color: colors.label,
    flex: 1,
    fontSize: 17,
    fontWeight: "400",
    paddingVertical: 8
  },
  swipeDelete: {
    alignItems: "center",
    backgroundColor: colors.systemRed,
    gap: 4,
    justifyContent: "center",
    paddingHorizontal: 22
  },
  swipeDeleteText: {
    color: "white",
    fontSize: 13,
    fontWeight: "600"
  },
  emptyResults: {
    color: colors.secondaryLabel,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 24,
    textAlign: "center"
  },
  pressed: {
    opacity: 0.72
  },
  rowPressed: {
    backgroundColor: colors.tertiaryBackground
  },
  row: {
    alignItems: "center",
    backgroundColor: "transparent",
    flexDirection: "row",
    gap: 12,
    minHeight: 65,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 6
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
  avatarText: {
    color: "white",
    fontSize: 17,
    fontWeight: "700"
  },
  rowContent: {
    flex: 1,
    gap: 3
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  title: {
    color: colors.label,
    flex: 1,
    fontSize: 17,
    fontWeight: "500"
  },
  unreadTitle: {
    fontWeight: "600"
  },
  timestamp: {
    color: colors.tertiaryLabel,
    fontSize: 13,
    fontWeight: "400"
  },
  unreadTimestamp: {
    color: colors.systemBlue
  },
  previewRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  subtitle: {
    color: colors.secondaryLabel,
    flex: 1,
    fontSize: 15,
    lineHeight: 19
  },
  unreadSubtitle: {
    color: colors.label,
    fontWeight: "500"
  },
  badge: {
    backgroundColor: "#34c759",
    borderRadius: 8,
    color: "white",
    fontSize: 11,
    fontWeight: "700",
    minWidth: 17,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 1,
    textAlign: "center"
  }
});

function conversationPresentation(id: string): { avatar: string; color: string; time: string } {
  switch (id) {
    case "general":
      return { avatar: "G", color: "#22a06b", time: "09:41" };
    case "openclaw-lab":
      return { avatar: "🦞", color: "#6f5bd8", time: "Yesterday" };
    case "sage-assistant":
      return { avatar: "S", color: "#0a84ff", time: "Tue" };
    case "design-review":
      return { avatar: "D", color: "#ff9f0a", time: "Mon" };
    default:
      return { avatar: "?", color: "#8e8e93", time: "" };
  }
}

function lastMessagePreview(conversationId: string): string {
  const message = [...messages].reverse().find((candidate) => candidate.conversationId === conversationId);
  const block = message?.blocks[0];

  if (!block) {
    return "No messages yet";
  }

  switch (block.type) {
    case "text":
    case "quote":
      return block.text;
    case "agent_event":
      return block.title;
    case "widget":
      return block.widget.title;
    case "file":
      return block.fileName;
    case "image":
      return block.alt;
    case "code":
      return block.code;
  }
}

function normalizeHandle(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/^@/, "").toLowerCase();

  if (!trimmed || !/^[a-z0-9_][a-z0-9_.-]{2,29}$/.test(trimmed)) {
    return null;
  }

  return `@${trimmed}`;
}
