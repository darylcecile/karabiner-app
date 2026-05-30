import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Message, MessageBlock } from "@karabiner/shared";
import { Host, TextField, type TextFieldRef } from "@expo/ui/swift-ui";
import {
  autocorrectionDisabled,
  accessibilityHint,
  accessibilityLabel,
  fixedSize,
  lineLimit,
  onSubmit,
  submitLabel,
  textInputAutocapitalization
} from "@expo/ui/swift-ui/modifiers";
import { expandSlugmojis, slugmojis } from "../features/messages/slugmoji";
import { senderLabel } from "../features/messages/participants";
import { SystemSymbol } from "./SystemSymbol";
import { colors } from "../styles/theme";

interface ComposerProps {
  conversationId: string;
  onCancelReply?: () => void;
  onSend: (message: Message) => void;
  replyingTo?: Message | undefined;
}

type AttachmentBlock = Extract<MessageBlock, { type: "file" | "image" }>;
type ActivePicker = "attachments" | "emoji" | null;

interface EmojiOption {
  emoji: string;
  label: string;
  slug?: string;
}

interface MentionOption {
  id: string;
  displayName: string;
  handle: string;
  kind: "user" | "agent";
}

interface AttachmentOption {
  id: string;
  title: string;
  subtitle: string;
  symbol: string;
  fallback: string;
  block: AttachmentBlock;
}

const emojiOptions: EmojiOption[] = [
  { emoji: "😀", label: "Grinning face", slug: "smiley" },
  { emoji: "✨", label: "Sparkles", slug: "spark" },
  { emoji: "🚢", label: "Ship it", slug: "shipit" },
  { emoji: "🦀", label: "OpenClaw crab", slug: "openclaw" },
  { emoji: "👍", label: "Thumbs up" },
  { emoji: "❤️", label: "Red heart" },
  { emoji: "😂", label: "Face with tears of joy" },
  { emoji: "🎉", label: "Party popper" }
];

const emojiCategoryTabs = [
  { icon: "🕘", label: "Recent" },
  { icon: "😀", label: "Smileys" },
  { icon: "👋", label: "People" },
  { icon: "🍔", label: "Food" },
  { icon: "💡", label: "Objects" },
  { icon: "🏁", label: "Flags" }
];

const mentionOptions: MentionOption[] = [
  { id: "user-daryl", displayName: "Daryl", handle: "daryl", kind: "user" },
  { id: "user-avery", displayName: "Avery", handle: "avery", kind: "user" },
  { id: "agent-openclaw", displayName: "OpenClaw", handle: "openclaw", kind: "agent" }
];

const attachmentOptions: AttachmentOption[] = [
  {
    id: "demo-image",
    title: "Demo image",
    subtitle: "Photo • 1600×900",
    symbol: "photo.on.rectangle.angled",
    fallback: "▧",
    block: {
      type: "image",
      mediaId: "demo-image-karabiner-trail",
      alt: "Karabiner trail demo image",
      width: 1600,
      height: 900
    }
  },
  {
    id: "demo-pdf",
    title: "Project brief",
    subtitle: "PDF document • 242 KB",
    symbol: "doc.richtext",
    fallback: "□",
    block: {
      type: "file",
      mediaId: "demo-file-project-brief",
      fileName: "Project brief.pdf",
      byteSize: 247808,
      mimeType: "application/pdf"
    }
  },
  {
    id: "demo-sheet",
    title: "Fixture data",
    subtitle: "CSV file • 18 KB",
    symbol: "tablecells",
    fallback: "▦",
    block: {
      type: "file",
      mediaId: "demo-file-fixture-data",
      fileName: "fixture-data.csv",
      byteSize: 18432,
      mimeType: "text/csv"
    }
  }
];

export function Composer({ conversationId, onCancelReply, onSend, replyingTo }: ComposerProps) {
  const inputRef = useRef<TextFieldRef>(null);
  const programmaticDisplayText = useRef<string | null>(null);
  const [text, setText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [activeEmojiCategory, setActiveEmojiCategory] = useState(0);
  const [attachments, setAttachments] = useState<AttachmentBlock[]>([]);
  const insets = useSafeAreaInsets();
  const expanded = useMemo(() => expandSlugmojis(sourceText, slugmojis), [sourceText]);
  const trimmed = sourceText.trim();
  const isSlashCommand = trimmed.startsWith("/") && attachments.length === 0;
  const canSend = trimmed.length > 0 || attachments.length > 0;
  const mentionTrigger = getMentionTrigger(text, selection?.start ?? text.length);
  const mentionSuggestions = useMemo(() => {
    if (!mentionTrigger) {
      return [];
    }

    const normalizedQuery = mentionTrigger.query.toLowerCase();

    return mentionOptions.filter((option) => {
      return (
        option.handle.toLowerCase().startsWith(normalizedQuery) ||
        option.displayName.toLowerCase().startsWith(normalizedQuery)
      );
    });
  }, [mentionTrigger]);

  function send() {
    if (!canSend) {
      return;
    }

    const blocks: Message["blocks"] = [];

    if (isSlashCommand) {
      blocks.push({
        type: "agent_event",
        agentId: "openclaw",
        event: "tool_call",
        title: "Slash command queued",
        detail: trimmed
      });
    } else {
      if (trimmed.length > 0) {
        blocks.push({ type: "text", text: trimmed });
      }

      blocks.push(...attachments);
    }

    const message: Message = {
      id: `local-${Date.now()}`,
      conversationId,
      senderId: "user-daryl",
      blocks,
      createdAt: new Date().toISOString()
    };

    if (replyingTo) {
      message.parentMessageId = replyingTo.id;
    }

    onSend(message);
    setText("");
    setSourceText("");
    setAttachments([]);
    setActivePicker(null);
    inputRef.current?.setText("");
  }

  function replaceText(nextText: string, nextCursor = nextText.length) {
    const nextDisplayText = expandSlugmojis(nextText, slugmojis);
    const displayCursor = Math.min(nextCursor, nextDisplayText.length);

    setSourceText(nextText);
    setText(nextDisplayText);
    setSelection({ start: displayCursor, end: displayCursor });
    programmaticDisplayText.current = nextDisplayText;
    void inputRef.current?.setText(nextDisplayText);
    void inputRef.current?.focus();
    void inputRef.current?.setSelection(displayCursor, displayCursor).catch(() => undefined);
  }

  function handleValueChange(nextText: string) {
    if (programmaticDisplayText.current === nextText) {
      programmaticDisplayText.current = null;
      setText(nextText);
      return;
    }

    const nextDisplayText = expandSlugmojis(nextText, slugmojis);

    setSourceText(nextText);
    setText(nextDisplayText);

    if (nextDisplayText !== nextText) {
      const cursor = nextDisplayText.length;

      programmaticDisplayText.current = nextDisplayText;
      setSelection({ start: cursor, end: cursor });
      void inputRef.current?.setText(nextDisplayText);
      void inputRef.current?.setSelection(cursor, cursor).catch(() => undefined);
    }
  }

  function insertText(value: string) {
    const start = Math.min(selection?.start ?? text.length, selection?.end ?? text.length);
    const end = Math.max(selection?.start ?? text.length, selection?.end ?? text.length);
    const nextText = `${text.slice(0, start)}${value}${text.slice(end)}`;

    replaceText(nextText, start + value.length);
    setActivePicker(null);
  }

  function insertMention(option: MentionOption) {
    const trigger = getMentionTrigger(text, selection?.start ?? text.length);

    if (!trigger) {
      insertText(`@${option.handle} `);
      return;
    }

    const nextText = `${text.slice(0, trigger.start)}@${option.handle} ${text.slice(trigger.end)}`;
    replaceText(nextText, trigger.start + option.handle.length + 2);
  }

  function addAttachment(option: AttachmentOption) {
    setAttachments((current) => {
      if (current.some((attachment) => attachment.mediaId === option.block.mediaId)) {
        return current;
      }

      return [...current, option.block];
    });
    setActivePicker(null);
  }

  function removeAttachment(mediaId: string) {
    setAttachments((current) => current.filter((attachment) => attachment.mediaId !== mediaId));
  }

  function togglePicker(picker: Exclude<ActivePicker, null>) {
    setActivePicker((current) => (current === picker ? null : picker));
  }

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {replyingTo ? (
        <View style={styles.replyPreview}>
          <SystemSymbol color={colors.telegramPurple} fallback="↩︎" name="arrowshape.turn.up.left.fill" size={18} />
          <View style={styles.replyCopy}>
            <Text numberOfLines={1} style={styles.replyLabel}>
              Reply to {senderLabel(replyingTo.senderId)}
            </Text>
            <Text numberOfLines={1} style={styles.replySnippet}>
              {messageSnippet(replyingTo)}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Cancel reply"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onCancelReply}
            style={styles.replyClose}
          >
            <SystemSymbol color={colors.secondaryLabel} fallback="×" name="xmark" size={16} />
          </Pressable>
        </View>
      ) : null}
      {isSlashCommand ? (
        <Text style={styles.commandHint}>Slash command will be routed through scoped plugins.</Text>
      ) : null}
      {mentionTrigger ? (
        <View accessibilityLabel="Mention suggestions" style={styles.suggestionTray}>
          <View style={styles.suggestionHeader}>
            <Text style={styles.suggestionTitle}>Mention</Text>
            <Text numberOfLines={1} style={styles.suggestionMeta}>
              {mentionTrigger.query ? `@${mentionTrigger.query}` : "Start typing a name"}
            </Text>
          </View>
          {mentionSuggestions.length > 0 ? (
            <View style={styles.mentionList}>
              {mentionSuggestions.map((option, index) => (
                <Pressable
                  accessibilityHint={`Inserts @${option.handle} into the composer`}
                  accessibilityLabel={`Mention ${option.displayName}`}
                  accessibilityRole="button"
                  key={option.id}
                  onPress={() => insertMention(option)}
                  style={({ pressed }) => [
                    styles.mentionRow,
                    index < mentionSuggestions.length - 1 ? styles.mentionRowBorder : null,
                    pressed ? styles.mentionRowPressed : null
                  ]}
                >
                  <View style={styles.avatarToken}>
                    <Text style={styles.avatarTokenText}>{option.kind === "agent" ? "⌁" : option.displayName[0]}</Text>
                  </View>
                  <View style={styles.mentionCopy}>
                    <Text numberOfLines={1} style={styles.mentionName}>
                      {option.displayName}
                    </Text>
                    <Text numberOfLines={1} style={styles.mentionHandle}>
                      @{option.handle}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.emptySuggestion}>No matching people or agents.</Text>
          )}
        </View>
      ) : null}
      {activePicker ? (
        <View
          accessibilityLabel={activePicker === "emoji" ? "Emoji picker" : "Attachment picker"}
          accessibilityRole="menu"
          style={styles.pickerSurface}
        >
          <View style={styles.pickerGrabber} />
          <View style={styles.surfaceHeader}>
            <View>
              <Text style={styles.surfaceTitle}>{activePicker === "emoji" ? "Emoji" : "Attachments"}</Text>
              <Text style={styles.surfaceCaption}>
                {activePicker === "emoji" ? "Search, recents, and categories" : "Add a demo file or image"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close picker"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setActivePicker(null)}
              style={styles.closeButton}
            >
              <SystemSymbol color={colors.secondaryLabel} fallback="×" name="xmark" size={16} />
            </Pressable>
          </View>
          {activePicker === "emoji" ? (
            <>
              <View accessibilityLabel="Search emoji" style={styles.emojiSearch}>
                <SystemSymbol color={colors.tertiaryLabel} fallback="⌕" name="magnifyingglass" size={16} />
                <Text style={styles.emojiSearchText}>Search emoji</Text>
              </View>
              <View style={styles.emojiCategories}>
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryScroller}
                >
                  {emojiCategoryTabs.map((category, index) => (
                    <Pressable
                      accessibilityLabel={`${category.label} emoji category`}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: index === activeEmojiCategory }}
                      key={category.label}
                      onPress={() => setActiveEmojiCategory(index)}
                      style={({ pressed }) => [
                        styles.categoryTab,
                        index === activeEmojiCategory ? styles.categoryTabActive : null,
                        pressed ? styles.optionPressed : null
                      ]}
                    >
                      <Text style={styles.categoryIcon}>{category.icon}</Text>
                      {index === activeEmojiCategory ? (
                        <Text style={[styles.categoryText, styles.categoryTextActive]}>{category.label}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.emojiSectionHeader}>
                <Text style={styles.emojiSectionTitle}>{emojiCategoryTabs[activeEmojiCategory]?.label ?? "Frequently used"}</Text>
                <Text style={styles.emojiSectionMeta}>Tap to insert</Text>
              </View>
              <View style={styles.emojiGrid}>
                {emojiOptions.map((option) => (
                  <Pressable
                    accessibilityHint={option.slug ? `Inserts ${option.emoji}; slug shortcut :${option.slug}:` : "Inserts this emoji"}
                    accessibilityLabel={option.label}
                    accessibilityRole="button"
                    key={`${option.label}-${option.emoji}`}
                    onPress={() => insertText(option.emoji)}
                    style={({ pressed }) => [styles.emojiOption, pressed ? styles.optionPressed : null]}
                  >
                    <Text style={styles.emoji}>{option.emoji}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.attachmentList}>
              {attachmentOptions.map((option, index) => (
                <Pressable
                  accessibilityHint="Adds this demo attachment to the outgoing message"
                  accessibilityLabel={`Add ${option.title}`}
                  accessibilityRole="button"
                  key={option.id}
                  onPress={() => addAttachment(option)}
                  style={({ pressed }) => [
                    styles.attachmentRow,
                    index < attachmentOptions.length - 1 ? styles.attachmentRowBorder : null,
                    pressed ? styles.optionPressed : null
                  ]}
                >
                  <View style={styles.attachmentIcon}>
                    <SystemSymbol color={colors.systemBlue} fallback={option.fallback} name={option.symbol} size={24} />
                  </View>
                  <View style={styles.attachmentCopy}>
                    <Text style={styles.attachmentTitle}>{option.title}</Text>
                    <Text style={styles.attachmentSubtitle}>{option.subtitle}</Text>
                  </View>
                  <SystemSymbol color={colors.tertiaryLabel} fallback="›" name="chevron.right" size={13} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}
      {attachments.length > 0 ? (
        <View accessibilityLabel="Selected attachments" style={styles.pendingAttachments}>
          {attachments.map((attachment) => (
            <View key={attachment.mediaId} style={styles.pendingAttachment}>
              <Text numberOfLines={1} style={styles.pendingAttachmentText}>
                {attachment.type === "image" ? attachment.alt : attachment.fileName}
              </Text>
              <Pressable
                accessibilityLabel={`Remove ${attachment.type === "image" ? attachment.alt : attachment.fileName}`}
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => removeAttachment(attachment.mediaId)}
                style={styles.pendingRemove}
              >
                <SystemSymbol color={colors.secondaryLabel} fallback="×" name="xmark.circle.fill" size={16} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable
          accessibilityHint="Opens native-style attachment choices"
          accessibilityLabel="Open composer menu"
          accessibilityRole="button"
          accessibilityState={{ expanded: activePicker === "attachments" }}
          hitSlop={8}
          onPress={() => togglePicker("attachments")}
          style={({ pressed }) => [
            styles.menuButton,
            activePicker === "attachments" ? styles.menuButtonActive : null,
            pressed ? styles.utilityButtonPressed : null
          ]}
        >
          <SystemSymbol color="white" fallback="≡" name="line.3.horizontal" size={20} />
        </Pressable>
        <Pressable
          accessibilityHint="Attach a file or photo"
          accessibilityLabel="Attach file"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => togglePicker("attachments")}
          style={({ pressed }) => [
            styles.attachButton,
            pressed ? styles.utilityButtonPressed : null
          ]}
        >
          <SystemSymbol color={colors.secondaryLabel} fallback="📎" name="paperclip" size={20} />
        </Pressable>
        <View style={styles.inputShell}>
          <Host matchContents style={styles.inputHost}>
            <TextField
              axis="vertical"
              modifiers={[
                lineLimit({ min: 1, max: 5 }),
                fixedSize({ horizontal: false, vertical: true }),
                accessibilityLabel("Message composer"),
                accessibilityHint("Type a message, slash command, mention, or slugmoji"),
                submitLabel("send"),
                onSubmit(send),
                autocorrectionDisabled(false),
                textInputAutocapitalization("sentences")
              ]}
              onSelectionChange={setSelection}
              onValueChange={handleValueChange}
              placeholder="Message"
              ref={inputRef}
            />
          </Host>
          <Pressable
            accessibilityHint="Opens stickers and emoji"
            accessibilityLabel="Open emoji picker"
            accessibilityRole="button"
            accessibilityState={{ expanded: activePicker === "emoji" }}
            hitSlop={6}
            onPress={() => togglePicker("emoji")}
            style={({ pressed }) => [styles.inputIconButton, pressed ? styles.optionPressed : null]}
          >
            <SystemSymbol color={colors.secondaryLabel} fallback="☺" name="face.smiling" size={22} />
          </Pressable>
        </View>
        {canSend ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityHint="Sends the current message"
            hitSlop={6}
            onPress={send}
            style={({ pressed }) => [
              styles.send,
              pressed ? styles.sendPressed : null
            ]}
          >
            <SystemSymbol color="white" fallback="↑" name="arrow.up" size={19} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Record voice message"
            accessibilityHint="Hold to record a voice message"
            hitSlop={6}
            style={({ pressed }) => [styles.voiceButton, pressed ? styles.utilityButtonPressed : null]}
          >
            <SystemSymbol color={colors.secondaryLabel} fallback="●" name="mic.fill" size={20} />
          </Pressable>
        )}
      </View>
      {expanded !== sourceText && expanded !== text ? <Text style={styles.preview}>Preview: {expanded}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "transparent",
    gap: 7,
    paddingHorizontal: 10,
    paddingTop: 6
  },
  replyPreview: {
    alignItems: "center",
    backgroundColor: colors.elevatedBackground,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 4
  },
  replyCopy: {
    borderLeftColor: colors.telegramPurple,
    borderLeftWidth: 3,
    flex: 1,
    gap: 2,
    paddingLeft: 8
  },
  replyLabel: {
    color: colors.telegramPurple,
    fontSize: 13,
    fontWeight: "700"
  },
  replySnippet: {
    color: colors.secondaryLabel,
    fontSize: 13
  },
  replyClose: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32
  },
  row: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8
  },
  utilityButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 18,
    height: 38,
    justifyContent: "center",
    marginBottom: 2,
    width: 38
  },
  utilityButtonActive: {
    backgroundColor: colors.systemBlue
  },
  utilityButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }]
  },
  menuButton: {
    alignItems: "center",
    backgroundColor: colors.telegramPurple,
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    marginBottom: 2,
    shadowColor: colors.telegramPurple,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    width: 42
  },
  menuButtonActive: {
    backgroundColor: colors.systemBlue
  },
  attachButton: {
    alignItems: "center",
    backgroundColor: colors.elevatedBackground,
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    marginBottom: 2,
    shadowColor: "#000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    width: 42
  },
  voiceButton: {
    alignItems: "center",
    backgroundColor: colors.elevatedBackground,
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    marginBottom: 2,
    shadowColor: "#000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    width: 42
  },
  inputShell: {
    alignItems: "flex-end",
    backgroundColor: colors.elevatedBackground,
    borderRadius: 21,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    maxHeight: 116,
    minHeight: 42,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 4
  },
  inputHost: {
    flex: 1,
    minHeight: 26,
    width: "100%"
  },
  inputIconButton: {
    alignItems: "center",
    borderRadius: 18,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  send: {
    alignItems: "center",
    backgroundColor: colors.systemBlue,
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    marginBottom: 2,
    shadowColor: colors.systemBlue,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    width: 42
  },
  sendDisabled: {
    backgroundColor: colors.tertiaryBackground
  },
  sendPressed: {
    backgroundColor: colors.outgoingPressed,
    transform: [{ scale: 0.96 }]
  },
  commandHint: {
    color: colors.systemBlue,
    fontSize: 13,
    fontWeight: "700"
  },
  preview: {
    color: colors.secondaryLabel,
    fontSize: 13
  },
  pickerSurface: {
    backgroundColor: colors.elevatedBackground,
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 11,
    marginHorizontal: -10,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { height: -3, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 10
  },
  pickerGrabber: {
    alignSelf: "center",
    backgroundColor: colors.tertiaryBackground,
    borderRadius: 2,
    height: 4,
    width: 36
  },
  suggestionTray: {
    backgroundColor: colors.elevatedBackground,
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginHorizontal: -10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  suggestionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  suggestionTitle: {
    color: colors.label,
    fontSize: 14,
    fontWeight: "800"
  },
  suggestionMeta: {
    color: colors.secondaryLabel,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600"
  },
  suggestionScroller: {
    marginHorizontal: -2
  },
  surfaceHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  surfaceTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "700"
  },
  surfaceCaption: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: colors.secondaryBackground,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  emojiSearch: {
    alignItems: "center",
    backgroundColor: colors.secondaryBackground,
    borderRadius: 14,
    flexDirection: "row",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 12
  },
  emojiSearchText: {
    color: colors.tertiaryLabel,
    fontSize: 15,
    fontWeight: "600"
  },
  emojiCategories: {
    marginHorizontal: -2
  },
  categoryScroller: {
    gap: 8,
    paddingHorizontal: 2
  },
  categoryTab: {
    alignItems: "center",
    backgroundColor: colors.secondaryBackground,
    borderRadius: 16,
    flexDirection: "row",
    gap: 5,
    minHeight: 34,
    justifyContent: "center",
    minWidth: 34,
    paddingHorizontal: 9
  },
  categoryTabActive: {
    backgroundColor: colors.systemBlue
  },
  categoryIcon: {
    fontSize: 17,
    lineHeight: 20
  },
  categoryText: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "700"
  },
  categoryTextActive: {
    color: "white"
  },
  emojiSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  emojiSectionTitle: {
    color: colors.label,
    fontSize: 14,
    fontWeight: "700"
  },
  emojiSectionMeta: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "600"
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  emojiOption: {
    alignItems: "center",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 48
  },
  emoji: {
    fontSize: 30,
    lineHeight: 34
  },
  attachmentList: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 16,
    overflow: "hidden"
  },
  attachmentRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  attachmentRowBorder: {
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  attachmentIcon: {
    alignItems: "center",
    backgroundColor: colors.elevatedBackground,
    borderRadius: 18,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  attachmentCopy: {
    flex: 1,
    gap: 2
  },
  attachmentTitle: {
    color: colors.label,
    fontSize: 15,
    fontWeight: "600"
  },
  attachmentSubtitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "600"
  },
  optionPressed: {
    opacity: 0.68,
    transform: [{ scale: 0.98 }]
  },
  mentionChip: {
    alignItems: "center",
    backgroundColor: colors.secondaryBackground,
    borderRadius: 18,
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 2,
    minHeight: 44,
    paddingLeft: 8,
    paddingRight: 12
  },
  mentionList: {
    backgroundColor: colors.elevatedBackground,
    borderRadius: 14,
    overflow: "hidden"
  },
  mentionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  mentionRowBorder: {
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  mentionRowPressed: {
    backgroundColor: colors.tertiaryBackground
  },
  avatarToken: {
    alignItems: "center",
    backgroundColor: colors.systemBlue,
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  avatarTokenText: {
    color: "white",
    fontSize: 15,
    fontWeight: "800"
  },
  mentionCopy: {
    gap: 1
  },
  mentionName: {
    color: colors.label,
    fontSize: 15,
    fontWeight: "600"
  },
  mentionHandle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "500"
  },
  emptySuggestion: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "600"
  },
  pendingAttachments: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  pendingAttachment: {
    alignItems: "center",
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    maxWidth: "100%",
    minHeight: 32,
    paddingLeft: 10,
    paddingRight: 4
  },
  pendingAttachmentText: {
    color: colors.label,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    maxWidth: 220
  },
  pendingRemove: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28
  }
});

function messageSnippet(message: Message): string {
  const firstBlock = message.blocks[0];

  if (!firstBlock) {
    return "Message";
  }

  switch (firstBlock.type) {
    case "text":
    case "quote":
      return firstBlock.text;
    case "code":
      return firstBlock.code;
    case "widget":
      return firstBlock.widget.title;
    case "agent_event":
      return firstBlock.title;
    case "file":
      return firstBlock.fileName;
    case "image":
      return firstBlock.alt;
  }
}

function getMentionTrigger(text: string, cursor: number): { start: number; end: number; query: string } | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const beforeCursor = text.slice(0, safeCursor);
  const atIndex = beforeCursor.lastIndexOf("@");

  if (atIndex < 0) {
    return null;
  }

  if (atIndex > 0 && !/\s/.test(beforeCursor[atIndex - 1] ?? "")) {
    return null;
  }

  const query = beforeCursor.slice(atIndex + 1);

  if (!/^[a-z0-9_.-]*$/i.test(query)) {
    return null;
  }

  return { start: atIndex, end: safeCursor, query };
}
