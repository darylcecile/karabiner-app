import { Stack, useRouter, type Href } from "expo-router";
import { useMemo, useState } from "react";
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

export default function CreateGroupScreen() {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const canContinue = selectedIds.length >= 2;
  const selectedSummary = useMemo(
    () => `${selectedIds.length} selected${selectedIds.length >= 2 ? "" : " · choose at least two"}`,
    [selectedIds.length]
  );

  function toggleParticipant(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
  }

  function openGroupDetails() {
    if (!canContinue) {
      return;
    }

    router.push(`/group-details?memberIds=${encodeURIComponent(selectedIds.join(","))}` as Href);
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          headerRight: () => (
            <Pressable
              accessibilityLabel="Next"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canContinue }}
              disabled={!canContinue}
              hitSlop={8}
              onPress={openGroupDetails}
              style={({ pressed }) => [
                styles.headerButton,
                !canContinue ? styles.disabled : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.headerButtonText}>Next</Text>
            </Pressable>
          ),
          title: "Create Group"
        }}
      />
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<Text style={styles.summary}>{selectedSummary}</Text>}
        renderItem={({ item }) => (
          <ParticipantRow
            onPress={() => toggleParticipant(item.id)}
            participant={item}
            selected={selectedIds.includes(item.id)}
          />
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
  selected: boolean;
}

function ParticipantRow({ onPress, participant, selected }: ParticipantRowProps) {
  return (
    <Pressable
      accessibilityHint="Toggles this group member"
      accessibilityLabel={`${selected ? "Remove" : "Add"} ${participant.displayName}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.rowSelected : null,
        pressed ? styles.rowPressed : null
      ]}
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
      <View style={[styles.checkbox, selected ? styles.checkboxSelected : null]}>
        {selected ? (
          <SystemSymbol color="white" fallback="✓" name="checkmark" size={14} />
        ) : null}
      </View>
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
  summary: {
    color: colors.secondaryLabel,
    fontSize: 15,
    lineHeight: 20,
    paddingBottom: 8,
    paddingHorizontal: 4
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
  rowSelected: {
    backgroundColor: colors.secondaryBackground
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
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.tertiaryLabel,
    borderRadius: 12,
    borderWidth: 1.5,
    height: 24,
    justifyContent: "center",
    width: 24
  },
  checkboxSelected: {
    backgroundColor: colors.systemBlue,
    borderColor: colors.systemBlue
  }
});
