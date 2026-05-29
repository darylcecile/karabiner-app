import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { findParticipant } from "../features/messages/participants";
import { colors, layout } from "../styles/theme";

const avatarOptions = ["💬", "🚀", "🦞", "🎨", "🧠", "✨", "🌈", "🔥"];

export default function GroupDetailsScreen() {
  const router = useRouter();
  const { memberIds } = useLocalSearchParams<{ memberIds?: string | string[] }>();
  const selectedIds = useMemo(() => parseIdList(paramString(memberIds)), [memberIds]);
  const selectedParticipants = useMemo(
    () => selectedIds.map(findParticipant).filter((participant) => participant !== undefined),
    [selectedIds]
  );
  const [groupName, setGroupName] = useState("");
  const [avatar, setAvatar] = useState("💬");
  const trimmedName = groupName.trim();
  const canCreate = trimmedName.length > 0;

  function createGroup() {
    if (!canCreate) {
      return;
    }

    router.replace(
      toHref("/conversation/draft", {
        avatar,
        conversationId: `group-${Date.now()}`,
        kind: "group",
        participantIds: selectedIds.join(","),
        title: trimmedName
      })
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          headerRight: () => (
            <Pressable
              accessibilityLabel="Create"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canCreate }}
              disabled={!canCreate}
              hitSlop={8}
              onPress={createGroup}
              style={({ pressed }) => [
                styles.headerButton,
                !canCreate ? styles.disabled : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.headerButtonText}>Create</Text>
            </Pressable>
          ),
          title: "Group Details"
        }}
      />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.preview}>
          <Text accessibilityLabel={`Selected group avatar ${avatar}`} style={styles.previewAvatar}>
            {avatar}
          </Text>
          <Text style={styles.previewTitle}>{trimmedName || "Group name"}</Text>
          <Text style={styles.previewSubtitle}>
            {selectedParticipants.length} member{selectedParticipants.length === 1 ? "" : "s"} selected
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Name</Text>
          <TextInput
            accessibilityHint="Enter a name for this group conversation"
            accessibilityLabel="Group name"
            autoCapitalize="words"
            onChangeText={setGroupName}
            placeholder="Group name"
            placeholderTextColor={colors.tertiaryLabel}
            returnKeyType="done"
            style={styles.input}
            value={groupName}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Emoji Avatar</Text>
          <View style={styles.emojiGrid}>
            {avatarOptions.map((option) => {
              const selected = option === avatar;

              return (
                <Pressable
                  accessibilityLabel={`Use ${option} as group profile picture`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option}
                  onPress={() => setAvatar(option)}
                  style={({ pressed }) => [
                    styles.emojiButton,
                    selected ? styles.emojiSelected : null,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Text style={styles.emojiText}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Members</Text>
          <View style={styles.memberCard}>
            {selectedParticipants.map((participant) => (
              <Text key={participant.id} style={styles.memberText}>
                {participant.avatar} {participant.displayName}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1
  },
  content: {
    alignSelf: "center",
    gap: 18,
    maxWidth: layout.listMaxWidth,
    padding: layout.screenPadding,
    width: "100%"
  },
  headerButton: {
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8
  },
  headerButtonText: {
    color: colors.systemBlue,
    fontSize: 17,
    fontWeight: "700"
  },
  disabled: {
    opacity: 0.35
  },
  pressed: {
    opacity: 0.72
  },
  preview: {
    alignItems: "center",
    gap: 7,
    paddingVertical: 12
  },
  previewAvatar: {
    backgroundColor: colors.elevatedBackground,
    borderRadius: 38,
    fontSize: 42,
    height: 76,
    lineHeight: 76,
    overflow: "hidden",
    textAlign: "center",
    width: 76
  },
  previewTitle: {
    color: colors.label,
    fontSize: 22,
    fontWeight: "800"
  },
  previewSubtitle: {
    color: colors.secondaryLabel,
    fontSize: 15
  },
  section: {
    gap: 8
  },
  sectionHeader: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    paddingHorizontal: 4,
    textTransform: "uppercase"
  },
  input: {
    backgroundColor: colors.elevatedBackground,
    borderRadius: 14,
    color: colors.label,
    fontSize: 17,
    minHeight: 50,
    paddingHorizontal: 14
  },
  emojiGrid: {
    backgroundColor: colors.elevatedBackground,
    borderRadius: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 10
  },
  emojiButton: {
    alignItems: "center",
    backgroundColor: colors.secondaryBackground,
    borderColor: "transparent",
    borderRadius: 24,
    borderWidth: 2,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  emojiSelected: {
    borderColor: colors.systemBlue
  },
  emojiText: {
    fontSize: 26,
    lineHeight: 32
  },
  memberCard: {
    backgroundColor: colors.elevatedBackground,
    borderRadius: 14,
    gap: 8,
    padding: 14
  },
  memberText: {
    color: colors.label,
    fontSize: 16,
    lineHeight: 22
  }
});

function paramString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseIdList(value: string | undefined): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function toHref(pathname: string, params: Record<string, string>): Href {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  return `${pathname}?${query}` as Href;
}
