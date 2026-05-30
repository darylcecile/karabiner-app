import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  type GestureResponderEvent,
  useWindowDimensions,
  View
} from "react-native";
import type { Conversation, Message, MessageBlock } from "@karabiner/shared";
import { Composer } from "../../components/Composer";
import { MessageBlockView } from "../../components/MessageBlockView";
import { conversations, messages } from "../../features/messages/fixtures";
import { CURRENT_USER_ID, senderLabel } from "../../features/messages/participants";
import { colors, layout } from "../../styles/theme";
import { SystemSymbol } from "../../components/SystemSymbol";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const QUICK_REACTIONS = ["👍", "❤️", "😂"] as const;
const MORE_REACTIONS = ["🔥", "🎉", "👀", "✅"] as const;
const WALLPAPER_DOTS = Array.from({ length: 30 }, (_, index) => index);

type MessageReaction = {
  emoji: string;
  userId: string;
};

type MessageReactions = Record<string, MessageReaction[]>;

type EditingState = {
  messageId: string;
  text: string;
};

type MessageActionState = {
  frame?: MessageFrame;
  message: Message;
  pageX: number;
  pageY: number;
};

type MessageFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export default function ConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = Array.isArray(id) ? id[0] : id;
  const conversation = useMemo(() => resolveConversation(conversationId), [conversationId]);
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [editingMessage, setEditingMessage] = useState<EditingState | undefined>();
  const [messageReactions, setMessageReactions] = useState<MessageReactions>({});
  const [quoteDraft, setQuoteDraft] = useState<Message | undefined>();
  const [threadRootId, setThreadRootId] = useState<string | undefined>();
  const [threadReplyText, setThreadReplyText] = useState("");
  const [actionState, setActionState] = useState<MessageActionState | undefined>();
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState<Message | undefined>();
  const [typingParentId, setTypingParentId] = useState<string | null | undefined>();
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | undefined>();
  const listRef = useRef<FlatList<Message>>(null);
  const threadListRef = useRef<FlatList<Message>>(null);
  const localSequence = useRef(0);
  const agentTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const maxMessageWidth = Math.min(330, Math.max(190, screenWidth - 132));

  useEffect(() => {
    clearAgentTimers(agentTimers.current);
    setConversationMessages(conversationId ? messages.filter((message) => message.conversationId === conversationId) : []);
    setEditingMessage(undefined);
    setMessageReactions({});
    setQuoteDraft(undefined);
    setThreadRootId(undefined);
    setThreadReplyText("");
    setActionState(undefined);
    setPendingDeleteMessage(undefined);
    setTypingParentId(undefined);
    setHighlightedMessageId(undefined);
  }, [conversationId]);

  useEffect(() => {
    return () => {
      clearAgentTimers(agentTimers.current);
    };
  }, []);

  const rootMessages = useMemo(
    () => conversationMessages.filter((message) => !message.parentMessageId),
    [conversationMessages]
  );
  const replyCounts = useMemo(() => buildReplyCounts(conversationMessages), [conversationMessages]);
  const threadRoot = useMemo(
    () => conversationMessages.find((message) => message.id === threadRootId),
    [conversationMessages, threadRootId]
  );
  const threadReplies = useMemo(
    () => (threadRoot ? conversationMessages.filter((message) => message.parentMessageId === threadRoot.id) : []),
    [conversationMessages, threadRoot]
  );

  if (!conversation || !conversationId) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: "Conversation", headerLargeTitle: false }} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Conversation unavailable</Text>
          <Text style={styles.emptyBody}>Choose an existing conversation from Messages.</Text>
        </View>
      </View>
    );
  }

  function nextLocalId(prefix: string) {
    localSequence.current += 1;

    return `${prefix}-${Date.now()}-${localSequence.current}`;
  }

  function appendMessage(message: Message) {
    setConversationMessages((current) => [...current, message]);
  }

  function handleComposerSend(message: Message) {
    if (quoteDraft) {
      const quoteBlock: MessageBlock = {
        type: "quote",
        text: messageSnippet(quoteDraft),
        citedMessageId: quoteDraft.id
      };
      const enriched: Message = {
        ...message,
        blocks: [quoteBlock, ...message.blocks]
      };

      delete enriched.parentMessageId;
      appendMessage(enriched);
      setQuoteDraft(undefined);
      scheduleAgentResponse();
      return;
    }

    appendMessage(message);
    scheduleAgentResponse(message.parentMessageId);
  }

  function createLocalMessage(blocks: MessageBlock[], parentMessageId?: string, senderId = CURRENT_USER_ID): Message {
    if (!conversationId) {
      throw new Error("Cannot create a message without a conversation id.");
    }

    const message: Message = {
      id: nextLocalId(senderId === CURRENT_USER_ID ? "local" : "agent"),
      conversationId,
      senderId,
      blocks,
      createdAt: new Date().toISOString()
    };

    if (parentMessageId) {
      message.parentMessageId = parentMessageId;
    }

    return message;
  }

  function scheduleAgentResponse(parentMessageId?: string) {
    if (!conversation || conversation.kind !== "agent") {
      return;
    }

    const activeConversation = conversation;
    const responseParentId = parentMessageId ?? null;
    setTypingParentId(responseParentId);

    const timer = setTimeout(() => {
      const senderId = agentSenderId(activeConversation);
      const response = createLocalMessage(
        [
          {
            type: "text",
            text: simulatedAgentReply(activeConversation)
          }
        ],
        parentMessageId,
        senderId
      );

      appendMessage(response);
      setTypingParentId(undefined);
    }, 4000);

    agentTimers.current.push(timer);
  }

  function updateMessage(messageId: string, update: (message: Message) => Message) {
    setConversationMessages((current) =>
      current.map((message) => (message.id === messageId ? update(message) : message))
    );
  }

  function startEditing(message: Message) {
    if (!canEditMessage(message)) {
      return;
    }

    setEditingMessage({ messageId: message.id, text: messageTextForEditing(message) });
  }

  function saveEdit(messageId: string) {
    const trimmed = editingMessage?.text.trim();

    if (!trimmed) {
      return;
    }

    updateMessage(messageId, (message) => ({
      ...message,
      blocks: [{ type: "text", text: trimmed }],
      editedAt: new Date().toISOString()
    }));
    setEditingMessage(undefined);
  }

  function confirmDelete(message: Message) {
    if (!isOwnMessage(message) || message.deletedAt) {
      return;
    }

    setPendingDeleteMessage(message);
  }

  function deletePendingMessage() {
    const messageId = pendingDeleteMessage?.id;

    if (!messageId) {
      return;
    }

    updateMessage(messageId, (current) => ({
      ...current,
      blocks: [{ type: "text", text: "Message deleted" }],
      deletedAt: new Date().toISOString()
    }));
    setPendingDeleteMessage(undefined);
  }

  function addReaction(message: Message, emoji: string) {
    if (message.deletedAt) {
      return;
    }

    setMessageReactions((current) => {
      const existing = current[message.id] ?? [];
      const alreadyReacted = existing.some(
        (reaction) => reaction.emoji === emoji && reaction.userId === CURRENT_USER_ID
      );

      if (alreadyReacted) {
        return current;
      }

      return {
        ...current,
        [message.id]: [...existing, { emoji, userId: CURRENT_USER_ID }]
      };
    });
  }

  function openMessageActions(message: Message, event?: GestureResponderEvent, frame?: MessageFrame) {
    if (message.deletedAt) {
      return;
    }

    const nextState: MessageActionState = {
      message,
      pageX: event?.nativeEvent.pageX ?? 196,
      pageY: event?.nativeEvent.pageY ?? 260
    };

    if (frame) {
      nextState.frame = frame;
    }

    setActionState(nextState);
  }

  function closeMessageActions() {
    setActionState(undefined);
  }

  function chooseContextReaction(message: Message, emoji: string) {
    addReaction(message, emoji);
    closeMessageActions();
  }

  function chooseContextAction(message: Message, action: "reply" | "quote" | "edit" | "delete") {
    closeMessageActions();

    switch (action) {
      case "reply":
        openThread(message);
        break;
      case "quote":
        startQuote(message);
        break;
      case "edit":
        startEditing(message);
        break;
      case "delete":
        confirmDelete(message);
        break;
    }
  }

  function startQuote(message: Message) {
    if (message.deletedAt) {
      return;
    }

    setQuoteDraft(message);
  }

  function openThread(message: Message) {
    if (message.deletedAt) {
      return;
    }

    setThreadRootId(message.id);
    setThreadReplyText("");
  }

  function sendThreadReply() {
    const trimmed = threadReplyText.trim();

    if (!threadRoot || !trimmed) {
      return;
    }

    const message = createLocalMessage([{ type: "text", text: trimmed }], threadRoot.id);
    appendMessage(message);
    setThreadReplyText("");
    scheduleAgentResponse(threadRoot.id);
  }

  function jumpToMessage(messageId: string) {
    const index = rootMessages.findIndex((message) => message.id === messageId);

    setThreadRootId(undefined);

    if (index < 0) {
      return;
    }

    setHighlightedMessageId(messageId);
    listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 });

    setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? undefined : current));
    }, 1200);
  }

  function renderMessage({ item }: { item: Message }) {
    const own = isOwnMessage(item);
    const reactions = messageReactions[item.id] ?? [];
    const isEditing = editingMessage?.messageId === item.id;
    const replyCount = replyCounts[item.id] ?? 0;
    const quoteTargetId = firstQuotedMessageId(item);

    const isContextTarget = actionState?.message.id === item.id;

    return (
      <AnimatedMessageRow dimmed={Boolean(actionState && !isContextTarget)} own={own} selected={isContextTarget}>
        {!own ? <Avatar senderId={item.senderId} /> : null}
        <View style={[styles.messageStack, own ? styles.ownMessage : styles.otherMessage, { width: maxMessageWidth }]}>
          {!own ? <Text style={styles.senderLabel}>{senderLabel(item.senderId)}</Text> : null}
          <TelegramBubble
            accessibilityHint={quoteTargetId ? "Scrolls to the original quoted message" : undefined}
            accessibilityLabel={quoteTargetId ? "Open quoted message" : `${senderLabel(item.senderId)} message: ${messageSnippet(item)}`}
            highlighted={highlightedMessageId === item.id}
            interactive={!isEditing}
            onLongPress={(event: GestureResponderEvent, frame?: MessageFrame) => openMessageActions(item, event, frame)}
            onPress={quoteTargetId ? () => jumpToMessage(quoteTargetId) : undefined}
            own={own}
          >
            {item.deletedAt ? (
              <Text style={[styles.deletedText, own ? styles.outgoingDeletedText : null]}>Message deleted</Text>
            ) : isEditing ? (
              <InlineMessageEditor
                onCancel={() => setEditingMessage(undefined)}
                onChangeText={(text) => setEditingMessage({ messageId: item.id, text })}
                onSave={() => saveEdit(item.id)}
                outgoing={own}
                text={editingMessage.text}
              />
            ) : (
              item.blocks.map((block, index) => renderMessageBlock(item, block, index, own))
            )}
            {item.editedAt && !item.deletedAt && !isEditing ? (
              <Text style={[styles.editedLabel, own ? styles.outgoingEditedLabel : null]}>edited</Text>
            ) : null}
            {replyCount > 0 && !item.parentMessageId ? (
              <Pressable
                accessibilityLabel={`${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => openThread(item)}
                style={styles.threadSummary}
              >
                <SystemSymbol
                  color={own ? "rgba(255,255,255,0.9)" : colors.systemBlue}
                  fallback="↩"
                  name="bubble.left.and.bubble.right"
                  size={14}
                />
                <Text style={own ? styles.outgoingThread : styles.thread}>
                  {replyCount} {replyCount === 1 ? "reply" : "replies"}
                </Text>
              </Pressable>
            ) : null}
            {own && !item.deletedAt ? <ReadReceipt outgoing /> : null}
          </TelegramBubble>
          {reactions.length > 0 ? <ReactionSummary outgoing={own} reactions={reactions} /> : null}
        </View>
      </AnimatedMessageRow>
    );
  }

  function renderMessageBlock(message: Message, block: MessageBlock, index: number, own: boolean) {
    if (block.type === "quote") {
      return (
        <QuotedBlock
          citedMessageId={block.citedMessageId}
          key={`${message.id}-${index}`}
          onJump={jumpToMessage}
          outgoing={own}
          text={block.text}
        />
      );
    }

    return <MessageBlockView block={block} key={`${message.id}-${index}`} tone={own ? "outgoing" : "incoming"} />;
  }

  const mainTyping = typingParentId === null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
      style={styles.screen}
    >
      <Stack.Screen
        options={{
          headerShown: false
        }}
      />
      <ChatWallpaper />
      {actionState ? <View pointerEvents="none" style={styles.contextVisualBackdrop} /> : null}
      <ConversationHeader conversation={conversation} onBack={() => router.back()} topInset={insets.top} />
      <FlatList
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.list, { paddingTop: insets.top + 64 }]}
        data={rootMessages}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(message) => message.id}
        ListEmptyComponent={<Text style={styles.emptyBody}>No messages yet.</Text>}
        ListFooterComponent={mainTyping ? <TypingIndicator label={`${conversationAgentName(conversation)} is typing...`} /> : null}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ animated: true, index: info.index, viewPosition: 0.5 });
          }, 120);
        }}
        ref={listRef}
        renderItem={renderMessage}
      />
      <Composer
        conversationId={conversationId}
        onCancelReply={() => setQuoteDraft(undefined)}
        onSend={handleComposerSend}
        replyingTo={quoteDraft}
      />
      <MessageContextBackdrop onClose={closeMessageActions} visible={Boolean(actionState)} />
      <ThreadModal
        agentName={conversationAgentName(conversation)}
        messages={threadReplies}
        onChangeText={setThreadReplyText}
        onClose={() => setThreadRootId(undefined)}
        onJumpToOriginal={jumpToMessage}
        onLongPressMessage={openMessageActions}
        onSend={sendThreadReply}
        refList={threadListRef}
        renderBlock={renderMessageBlock}
        replyText={threadReplyText}
        root={threadRoot}
        typing={threadRoot ? typingParentId === threadRoot.id : false}
      />
      <MessageContextOverlay
        actionState={actionState}
        onAction={chooseContextAction}
        onClose={closeMessageActions}
        onReact={chooseContextReaction}
      />
      <DeleteConfirmationDialog
        message={pendingDeleteMessage}
        onCancel={() => setPendingDeleteMessage(undefined)}
        onDelete={deletePendingMessage}
      />
    </KeyboardAvoidingView>
  );
}

function DeleteConfirmationDialog({
  message,
  onCancel,
  onDelete
}: {
  message: Message | undefined;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={Boolean(message)} onRequestClose={onCancel}>
      <View style={styles.deleteDialogBackdrop}>
        <View accessibilityRole="alert" style={styles.deleteDialog}>
          <Text style={styles.deleteDialogTitle}>Delete Message</Text>
          <Text style={styles.deleteDialogBody}>Delete this message from the conversation?</Text>
          <View style={styles.deleteDialogActions}>
            <Pressable
              accessibilityLabel="Cancel delete"
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.deleteDialogAction, pressed ? styles.contextPressed : null]}
            >
              <Text style={styles.deleteDialogCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Confirm delete message"
              accessibilityRole="button"
              onPress={onDelete}
              style={({ pressed }) => [styles.deleteDialogAction, pressed ? styles.contextPressed : null]}
            >
              <Text style={styles.deleteDialogDeleteText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ConversationHeader({
  conversation,
  onBack,
  topInset
}: {
  conversation: Conversation;
  onBack: () => void;
  topInset: number;
}) {
  const subtitle = conversation.kind === "agent" ? "bot" : conversation.kind === "group" ? "group" : "online";
  const avatarInitial = conversation.title.trim().charAt(0).toUpperCase() || "?";

  return (
    <View pointerEvents="box-none" style={[styles.chatHeader, { paddingTop: topInset + 6 }]}>
      <Pressable
        accessibilityLabel="Back to chats"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.headerCircleButton, pressed ? styles.headerCirclePressed : null]}
      >
        <SystemSymbol color={colors.systemBlue} fallback="‹" name="chevron.left" size={22} />
      </Pressable>
      <View
        accessibilityLabel={`${conversation.title}, ${conversation.kind === "agent" ? "AI chat" : "chat"}`}
        style={styles.headerTitle}
      >
        <Text numberOfLines={1} style={styles.headerName}>
          {conversation.title}
        </Text>
        <Text numberOfLines={1} style={styles.headerStatus}>
          {subtitle}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Conversation info"
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => [styles.headerAvatarButton, pressed ? styles.headerCirclePressed : null]}
      >
        <Text style={styles.headerAvatarText}>{avatarInitial}</Text>
      </Pressable>
    </View>
  );
}

function ChatWallpaper() {
  return (
    <View pointerEvents="none" style={styles.wallpaper}>
      <View style={styles.wallpaperAccent} />
      {WALLPAPER_DOTS.map((dot) => (
        <View
          key={dot}
          style={[
            styles.wallpaperDot,
            {
              left: `${(dot % 6) * 18 + 4}%`,
              top: `${Math.floor(dot / 6) * 18 + 8}%`
            }
          ]}
        />
      ))}
    </View>
  );
}

function AnimatedMessageRow({
  children,
  dimmed,
  own,
  selected
}: {
  children: React.ReactNode;
  dimmed: boolean;
  own: boolean;
  selected: boolean;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      duration: 160,
      easing: Easing.out(Easing.quad),
      toValue: dimmed ? 0.18 : 1,
      useNativeDriver: true
    }).start();
  }, [dimmed, opacity]);

  useEffect(() => {
    if (!selected) {
      Animated.timing(scale, {
        duration: 120,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true
      }).start();
      return;
    }

    scale.setValue(0.985);
    Animated.sequence([
      Animated.timing(scale, {
        duration: 110,
        easing: Easing.out(Easing.cubic),
        toValue: 1.018,
        useNativeDriver: true
      }),
      Animated.timing(scale, {
        duration: 140,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true
      })
    ]).start();
  }, [scale, selected]);

  return (
    <Animated.View
      style={[
        styles.messageRow,
        own ? styles.ownMessageRow : styles.otherMessageRow,
        selected ? styles.contextSelectedMessage : null,
        { opacity, transform: [{ scale }] }
      ]}
    >
      {children}
    </Animated.View>
  );
}

function TelegramBubble({
  accessibilityHint,
  accessibilityLabel,
  children,
  highlighted,
  interactive = true,
  onLongPress,
  onPress,
  own
}: {
  accessibilityHint?: string | undefined;
  accessibilityLabel: string;
  children: React.ReactNode;
  highlighted?: boolean;
  interactive?: boolean;
  onLongPress?: (event: GestureResponderEvent, frame?: MessageFrame) => void;
  onPress?: (() => void) | undefined;
  own: boolean;
}) {
  const frameRef = useRef<View>(null);

  function handleLongPress(event: GestureResponderEvent) {
    frameRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress?.(event, { x, y, width, height });
    });
  }

  const bubbleStyle = [
    styles.bubble,
    own ? styles.outgoingBubble : styles.incomingBubble,
    highlighted ? styles.highlightedBubble : null
  ];

  return (
    <View
      collapsable={false}
      ref={frameRef}
      style={[styles.bubbleFrame, own ? styles.outgoingBubbleFrame : styles.incomingBubbleFrame]}
    >
      <View pointerEvents="none" style={[styles.bubbleTail, own ? styles.outgoingBubbleTail : styles.incomingBubbleTail]} />
      {interactive ? (
        <Pressable
          accessibilityHint={accessibilityHint ?? "Long press for message actions"}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          delayLongPress={260}
          onLongPress={handleLongPress}
          onPress={onPress}
          style={({ pressed }) => [bubbleStyle, pressed ? styles.bubblePressed : null]}
        >
          {children}
        </Pressable>
      ) : (
        <View style={bubbleStyle}>{children}</View>
      )}
    </View>
  );
}

function InlineMessageEditor({
  onCancel,
  onChangeText,
  onSave,
  outgoing,
  text
}: {
  onCancel: () => void;
  onChangeText: (text: string) => void;
  onSave: () => void;
  outgoing: boolean;
  text: string;
}) {
  const canSave = text.trim().length > 0;

  return (
    <View style={styles.editBox}>
      <TextInput
        accessibilityLabel="Edit message text"
        autoFocus
        multiline
        onChangeText={onChangeText}
        style={[styles.editInput, outgoing ? styles.outgoingEditInput : null]}
        value={text}
      />
      <View style={styles.editActions}>
        <Pressable accessibilityLabel="Cancel edit" accessibilityRole="button" onPress={onCancel} style={styles.editAction}>
          <Text style={[styles.editActionText, outgoing ? styles.outgoingEditActionText : null]}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Save edited message"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={onSave}
          style={[styles.editAction, !canSave ? styles.disabledAction : null]}
        >
          <Text style={[styles.editActionText, styles.saveActionText, outgoing ? styles.outgoingSaveText : null]}>
            Save
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReactionSummary({ outgoing, reactions }: { outgoing: boolean; reactions: MessageReaction[] }) {
  const groupedReactions = groupReactions(reactions);

  return (
    <View
      accessibilityLabel={reactionAccessibilityLabel(reactions)}
      style={[styles.reactionSummary, outgoing ? styles.outgoingReactionSummary : null]}
    >
      {groupedReactions.map((reaction) => (
        <View key={reaction.emoji} style={styles.reactionChip}>
          <Text style={styles.reactionChipText}>{reaction.emoji}</Text>
          {reaction.count > 1 ? <Text style={styles.reactionCountText}>{reaction.count}</Text> : null}
          <View accessibilityLabel={`${senderLabel(reaction.userIds[0] ?? CURRENT_USER_ID)} reaction`} style={styles.reactionAvatar}>
            <Text style={styles.reactionAvatarText}>{senderInitial(reaction.userIds[0] ?? CURRENT_USER_ID)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function MessageContextBackdrop({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel="Dismiss message menu"
      onPress={onClose}
      pointerEvents="auto"
      style={styles.contextBackdrop}
    />
  );
}

function MessageContextOverlay({
  actionState,
  onAction,
  onClose,
  onReact
}: {
  actionState: MessageActionState | undefined;
  onAction: (message: Message, action: "reply" | "quote" | "edit" | "delete") => void;
  onClose: () => void;
  onReact: (message: Message, emoji: string) => void;
}) {
  const [expandedReactions, setExpandedReactions] = useState(false);
  const reactionAnim = useRef(new Animated.Value(0)).current;
  const menuAnim = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef([...Array(8)].map(() => new Animated.Value(0))).current;
  const { height, width } = useWindowDimensions();

  useEffect(() => {
    if (!actionState) {
      reactionAnim.setValue(0);
      menuAnim.setValue(0);
      itemAnims.forEach((item) => item.setValue(0));
      return;
    }

    reactionAnim.setValue(0);
    menuAnim.setValue(0);
    itemAnims.forEach((item) => item.setValue(0));

    Animated.sequence([
      Animated.timing(reactionAnim, {
        duration: 130,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true
      }),
      Animated.stagger(
        22,
        itemAnims.map((item) =>
          Animated.spring(item, {
            damping: 13,
            mass: 0.55,
            stiffness: 260,
            toValue: 1,
            useNativeDriver: true
          })
        )
      ),
      Animated.timing(menuAnim, {
        duration: 150,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true
      })
    ]).start();
  }, [actionState, itemAnims, menuAnim, reactionAnim]);

  if (!actionState) {
    return null;
  }

  const { message } = actionState;
  const own = isOwnMessage(message);
  const visibleReactions = expandedReactions ? [...QUICK_REACTIONS, ...MORE_REACTIONS] : QUICK_REACTIONS;
  const menuWidth = Math.min(232, width - 32);
  const reactionWidth = Math.min(expandedReactions ? 300 : 196, width - 32);
  const frame = actionState.frame ?? {
    height: 56,
    width: Math.min(260, width * 0.72),
    x: clamp(actionState.pageX - 90, 16, width - 276),
    y: actionState.pageY - 24
  };
  const previewLeft = clamp(frame.x, 12, width - frame.width - 12);
  const reactionLeft = clamp(frame.x + frame.width / 2 - reactionWidth / 2, 16, width - reactionWidth - 16);
  const reactionTop = clamp(frame.y - 52, 76, height - 160);
  const menuLeft = clamp(own ? frame.x + frame.width - menuWidth : frame.x, 16, width - menuWidth - 16);
  const menuTop = clamp(frame.y + frame.height + 8, 132, height - 250);
  const actions: Array<{
    id: "reply" | "quote" | "edit" | "delete";
    label: string;
    symbol: string;
    destructive?: boolean;
  }> = [
    { id: "reply", label: "Reply", symbol: "arrowshape.turn.up.left" },
    { id: "quote", label: "Quote", symbol: "quote.bubble" },
    ...(own
      ? [
          { id: "edit" as const, label: "Edit", symbol: "pencil" },
          { id: "delete" as const, label: "Delete", symbol: "trash", destructive: true }
        ]
      : [])
  ];

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.contextReactionBar,
          {
            left: reactionLeft,
            opacity: reactionAnim,
            top: reactionTop,
            transform: [
              {
                translateY: reactionAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0]
                })
              }
            ],
            width: reactionWidth
          }
        ]}
      >
      <View style={styles.contextReactionHitArea}>
        {visibleReactions.map((emoji, index) => {
          const itemAnim = itemAnims[index] ?? reactionAnim;

          return (
          <Animated.View
            key={emoji}
            style={{
              opacity: itemAnim,
              transform: [
                {
                  scale: itemAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.82, 1]
                  })
                }
              ]
            }}
          >
            <Pressable
              accessibilityLabel={`React ${emoji}`}
              accessibilityRole="button"
              onPress={() => onReact(message, emoji)}
              style={({ pressed }) => [styles.contextReactionButton, pressed ? styles.contextPressed : null]}
            >
              <Text style={styles.contextReactionText}>{emoji}</Text>
            </Pressable>
          </Animated.View>
          );
        })}
        {(() => {
          const itemAnim = itemAnims[visibleReactions.length] ?? reactionAnim;

          return (
        <Animated.View
          style={{
            opacity: itemAnim,
            transform: [
              {
                scale: itemAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.82, 1]
                })
              }
            ]
          }}
        >
          <Pressable
            accessibilityLabel={expandedReactions ? "Show fewer reactions" : "More reactions"}
            accessibilityRole="button"
            accessibilityState={{ expanded: expandedReactions }}
            onPress={() => setExpandedReactions((current) => !current)}
            style={({ pressed }) => [styles.contextReactionButton, pressed ? styles.contextPressed : null]}
          >
            <Text style={styles.contextPlus}>{expandedReactions ? "−" : "+"}</Text>
          </Pressable>
        </Animated.View>
          );
        })()}
      </View>
      </Animated.View>
      <Animated.View
        style={[
          styles.contextMenu,
          {
            left: menuLeft,
            opacity: menuAnim,
            top: menuTop,
            transform: [
              {
                translateY: menuAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-4, 0]
                })
              }
            ],
            width: menuWidth
          }
        ]}
      >
        {actions.map((action, index) => (
          <Pressable
            accessibilityLabel={action.label}
            accessibilityRole="button"
            key={action.id}
            onPress={() => onAction(message, action.id)}
            style={({ pressed }) => [
              styles.contextMenuItem,
              index > 0 ? styles.contextMenuSeparator : null,
              pressed ? styles.contextPressed : null
            ]}
          >
            <SystemSymbol
              color={action.destructive ? colors.systemRed : colors.label}
              fallback="•"
              name={action.symbol}
              size={19}
            />
            <Text style={[styles.contextMenuText, action.destructive ? styles.contextMenuDestructive : null]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function ReadReceipt({ outgoing = false }: { outgoing?: boolean }) {
  return (
    <View accessibilityLabel="Seen read receipt" style={styles.readReceipt}>
      <Text style={[styles.readReceiptText, outgoing ? styles.outgoingReadReceiptText : null]}>✓✓</Text>
    </View>
  );
}

function Avatar({ senderId }: { senderId: string }) {
  return (
    <View accessibilityLabel={`${senderLabel(senderId)} profile image`} style={styles.avatar}>
      <Text style={styles.avatarText}>{senderInitial(senderId)}</Text>
    </View>
  );
}

function QuotedBlock({
  citedMessageId,
  onJump,
  outgoing,
  text
}: {
  citedMessageId: string | undefined;
  onJump: (messageId: string) => void;
  outgoing: boolean;
  text: string;
}) {
  const content = (
    <View style={[styles.quoteBlock, outgoing ? styles.outgoingQuoteBlock : null]}>
      <Text style={[styles.quoteLabel, outgoing ? styles.outgoingQuoteLabel : null]}>Quoted message</Text>
      <Text style={[styles.quoteText, outgoing ? styles.outgoingQuoteText : null]}>{text}</Text>
    </View>
  );

  if (!citedMessageId) {
    return content;
  }

  return (
    <Pressable
      accessibilityHint="Scrolls to the original message"
      accessibilityLabel="Open quoted message"
      accessibilityRole="button"
      onPress={() => onJump(citedMessageId)}
    >
      {content}
    </Pressable>
  );
}

function ThreadModal({
  agentName,
  messages,
  onChangeText,
  onClose,
  onJumpToOriginal,
  onLongPressMessage,
  onSend,
  refList,
  renderBlock,
  replyText,
  root,
  typing
}: {
  agentName: string;
  messages: Message[];
  onChangeText: (text: string) => void;
  onClose: () => void;
  onJumpToOriginal: (messageId: string) => void;
  onLongPressMessage: (message: Message) => void;
  onSend: () => void;
  refList: React.RefObject<FlatList<Message> | null>;
  renderBlock: (message: Message, block: MessageBlock, index: number, own: boolean) => React.ReactNode;
  replyText: string;
  root: Message | undefined;
  typing: boolean;
}) {
  const canSend = replyText.trim().length > 0;

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(root)}>
      <SafeAreaView style={styles.threadScreen}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.threadScreen}>
          <View style={styles.threadHeader}>
            <View>
              <Text style={styles.threadTitle}>Thread</Text>
              <Text style={styles.threadSubtitle}>{root ? senderLabel(root.senderId) : "Message"}</Text>
            </View>
            <View style={styles.threadHeaderActions}>
              <Pressable
                accessibilityLabel="Send thread reply"
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={onSend}
                style={[styles.threadHeaderAction, !canSend ? styles.threadHeaderActionDisabled : null]}
              >
                <Text style={[styles.threadHeaderSendText, !canSend ? styles.threadHeaderSendDisabledText : null]}>Send</Text>
              </Pressable>
              <Pressable accessibilityLabel="Close thread" accessibilityRole="button" onPress={onClose} style={styles.threadHeaderAction}>
                <Text style={styles.threadCloseText}>Done</Text>
              </Pressable>
            </View>
          </View>
          {root ? (
            <Pressable
              accessibilityHint="Scrolls the main conversation to the original message"
              accessibilityLabel="Show original message"
              accessibilityRole="button"
              onPress={() => onJumpToOriginal(root.id)}
              style={styles.originalCard}
            >
              <Text style={styles.originalLabel}>Original message</Text>
              <Text style={styles.originalText}>{messageSnippet(root)}</Text>
            </Pressable>
          ) : null}
          <FlatList
            contentContainerStyle={styles.threadList}
            data={messages}
            keyExtractor={(message) => message.id}
            ListEmptyComponent={<Text style={styles.emptyThread}>No replies yet. Start the thread.</Text>}
            ListFooterComponent={typing ? <TypingIndicator label={`${agentName} is typing...`} /> : null}
            onContentSizeChange={() => refList.current?.scrollToEnd({ animated: true })}
            ref={refList}
            renderItem={({ item }) => {
              const own = isOwnMessage(item);

              return (
                <View style={[styles.threadMessage, own ? styles.threadOwnMessage : null]}>
                  {!own ? <Text style={styles.senderLabel}>{senderLabel(item.senderId)}</Text> : null}
                  <TelegramBubble
                    accessibilityLabel={`${senderLabel(item.senderId)} thread reply: ${messageSnippet(item)}`}
                    onLongPress={() => onLongPressMessage(item)}
                    own={own}
                  >
                    {item.deletedAt ? (
                      <Text style={[styles.deletedText, own ? styles.outgoingDeletedText : null]}>Message deleted</Text>
                    ) : (
                      item.blocks.map((block, index) => renderBlock(item, block, index, own))
                    )}
                    {own && !item.deletedAt ? <ReadReceipt outgoing /> : null}
                  </TelegramBubble>
                </View>
              );
            }}
          />
          <View style={styles.threadComposer}>
            <TextInput
              accessibilityLabel="Thread reply"
              blurOnSubmit={false}
              multiline
              onChangeText={onChangeText}
              onSubmitEditing={onSend}
              placeholder="Reply in thread"
              placeholderTextColor={colors.tertiaryLabel}
              returnKeyType="send"
              style={styles.threadInput}
              value={replyText}
            />
            <Pressable
              accessibilityLabel="Send thread reply from composer"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={onSend}
              onPressIn={onSend}
              style={[styles.threadSend, !canSend ? styles.threadSendDisabled : null]}
            >
              <SystemSymbol color="white" fallback="↑" name="arrow.up" size={17} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <View accessibilityLabel={label} style={styles.typingIndicator}>
      <Text style={styles.typingDot}>•</Text>
      <Text style={styles.typingLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.chatBackground,
    flex: 1
  },
  chatHeader: {
    alignItems: "center",
    backgroundColor: "transparent",
    flexDirection: "row",
    gap: 10,
    left: 0,
    paddingBottom: 8,
    paddingHorizontal: 12,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 5
  },
  headerCircleButton: {
    alignItems: "center",
    backgroundColor: colors.floatingSurface,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    width: 44
  },
  headerCirclePressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }]
  },
  headerAvatarButton: {
    alignItems: "center",
    backgroundColor: colors.telegramPurple,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    width: 44
  },
  headerAvatarText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700"
  },
  headerTitle: {
    alignItems: "center",
    backgroundColor: colors.floatingSurface,
    borderRadius: 22,
    flex: 1,
    paddingHorizontal: 22,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 6
  },
  headerName: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20
  },
  headerStatus: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 15
  },
  wallpaper: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.chatBackground,
    overflow: "hidden"
  },
  wallpaperAccent: {
    backgroundColor: colors.chatBackgroundAccent,
    borderRadius: 999,
    height: "120%",
    left: "-30%",
    opacity: 0.85,
    position: "absolute",
    top: "-40%",
    width: "120%"
  },
  wallpaperDot: {
    backgroundColor: colors.chatPattern,
    borderRadius: 4,
    height: 8,
    opacity: 0.85,
    position: "absolute",
    width: 8
  },
  list: {
    alignSelf: "center",
    gap: 7,
    maxWidth: layout.conversationMaxWidth,
    paddingBottom: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    width: "100%"
  },
  messageRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 6,
    width: "100%"
  },
  contextDimmedMessage: {
    opacity: 0.18
  },
  contextSelectedMessage: {
    opacity: 1,
    zIndex: 4
  },
  ownMessageRow: {
    justifyContent: "flex-end"
  },
  otherMessageRow: {
    justifyContent: "flex-start"
  },
  messageStack: {
    flexShrink: 1
  },
  ownMessage: {
    alignItems: "flex-end",
    alignSelf: "flex-end"
  },
  otherMessage: {
    alignItems: "flex-start",
    alignSelf: "flex-start"
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.telegramBlue,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: "center",
    marginBottom: 1,
    width: 28
  },
  avatarText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700"
  },
  senderLabel: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
    marginLeft: 9
  },
  bubbleFrame: {
    maxWidth: "100%",
    position: "relative"
  },
  incomingBubbleFrame: {
    alignSelf: "flex-start"
  },
  outgoingBubbleFrame: {
    alignSelf: "flex-end"
  },
  bubbleTail: {
    bottom: 0,
    display: "none",
    height: 12,
    position: "absolute",
    width: 12
  },
  incomingBubbleTail: {
    backgroundColor: colors.incomingBubble,
    borderBottomRightRadius: 11,
    left: -3,
    transform: [{ rotate: "22deg" }]
  },
  outgoingBubbleTail: {
    backgroundColor: colors.outgoingBubble,
    borderBottomLeftRadius: 11,
    right: -3,
    transform: [{ rotate: "-22deg" }]
  },
  bubble: {
    alignSelf: "flex-start",
    gap: 5,
    maxWidth: "100%",
    minHeight: 30,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: "#000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 3
  },
  bubblePressed: {
    opacity: 0.78
  },
  highlightedBubble: {
    borderColor: colors.systemBlue,
    borderWidth: 2
  },
  incomingBubble: {
    backgroundColor: colors.incomingBubble,
    borderRadius: 22,
    borderBottomLeftRadius: 8
  },
  outgoingBubble: {
    backgroundColor: colors.outgoingBubble,
    borderRadius: 22,
    borderBottomRightRadius: 8
  },
  reactionSummary: {
    alignSelf: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: -2,
    paddingLeft: 4
  },
  outgoingReactionSummary: {
    alignSelf: "flex-end",
    paddingLeft: 0,
    paddingRight: 4
  },
  reactionChip: {
    alignItems: "center",
    backgroundColor: colors.glassFallback,
    borderColor: "rgba(255,255,255,0.52)",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 4,
    minHeight: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    shadowColor: "#000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 2
  },
  reactionChipText: {
    fontSize: 13,
    lineHeight: 17
  },
  reactionCountText: {
    color: colors.secondaryLabel,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  },
  reactionAvatar: {
    alignItems: "center",
    backgroundColor: colors.systemBlue,
    borderColor: "rgba(255,255,255,0.88)",
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    height: 14,
    justifyContent: "center",
    width: 14
  },
  reactionAvatarText: {
    color: "white",
    fontSize: 8,
    fontWeight: "800",
    lineHeight: 10
  },
  threadSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 2
  },
  thread: {
    color: colors.systemBlue,
    fontSize: 13,
    fontWeight: "700"
  },
  outgoingThread: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "700"
  },
  readReceipt: {
    alignItems: "center",
    alignSelf: "flex-end",
    flexDirection: "row",
    marginBottom: -2,
    marginTop: -1
  },
  readReceiptText: {
    color: colors.secondaryLabel,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 11
  },
  outgoingReadReceiptText: {
    color: "rgba(255,255,255,0.72)"
  },
  editedLabel: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontStyle: "italic"
  },
  outgoingEditedLabel: {
    color: "rgba(255,255,255,0.78)"
  },
  deletedText: {
    color: colors.secondaryLabel,
    fontSize: 15,
    fontStyle: "italic"
  },
  outgoingDeletedText: {
    color: "rgba(255,255,255,0.8)"
  },
  editBox: {
    gap: 8,
    minWidth: 220
  },
  editInput: {
    color: colors.label,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 42,
    padding: 0
  },
  outgoingEditInput: {
    color: "white"
  },
  editActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
  },
  editAction: {
    borderRadius: 11,
    minHeight: 30,
    paddingHorizontal: 10,
    justifyContent: "center"
  },
  disabledAction: {
    opacity: 0.45
  },
  editActionText: {
    color: colors.systemBlue,
    fontSize: 14,
    fontWeight: "700"
  },
  outgoingEditActionText: {
    color: "rgba(255,255,255,0.9)"
  },
  saveActionText: {
    fontWeight: "800"
  },
  outgoingSaveText: {
    color: "white"
  },
  quoteBlock: {
    backgroundColor: colors.secondaryBackground,
    borderLeftColor: colors.systemBlue,
    borderLeftWidth: 3,
    borderRadius: 12,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  outgoingQuoteBlock: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderLeftColor: "rgba(255,255,255,0.72)"
  },
  quoteLabel: {
    color: colors.systemBlue,
    fontSize: 12,
    fontWeight: "800"
  },
  outgoingQuoteLabel: {
    color: "white"
  },
  quoteText: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 19
  },
  outgoingQuoteText: {
    color: "rgba(255,255,255,0.88)"
  },
  quoteComposer: {
    backgroundColor: colors.elevatedBackground,
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10
  },
  quoteComposerHeader: {
    alignItems: "center",
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  quoteComposerCopy: {
    borderLeftColor: colors.systemBlue,
    borderLeftWidth: 3,
    flex: 1,
    gap: 2,
    paddingLeft: 8
  },
  quoteComposerLabel: {
    color: colors.systemBlue,
    fontSize: 13,
    fontWeight: "800"
  },
  quoteComposerSnippet: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18
  },
  quoteInputRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8
  },
  quoteInput: {
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.label,
    flex: 1,
    fontSize: 15,
    maxHeight: 92,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  quoteSend: {
    alignItems: "center",
    backgroundColor: colors.systemBlue,
    borderRadius: 16,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  quoteSendText: {
    color: "white",
    fontSize: 15,
    fontWeight: "800"
  },
  typingIndicator: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.elevatedBackground,
    borderRadius: 15,
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  contextBackdrop: {
    flex: 1,
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 18,
    zIndex: 5
  },
  contextVisualBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.34)",
    zIndex: 0
  },
  contextBackdropGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassFallback,
    opacity: 0
  },
  contextSheet: {
    gap: 8,
    left: 18,
    maxWidth: 330,
    position: "absolute",
    right: 18,
    width: "100%"
  },
  contextReactionBar: {
    alignSelf: "center",
    backgroundColor: colors.contextSurface,
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 5,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    zIndex: 6
  },
  contextReactionHitArea: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    justifyContent: "center"
  },
  contextReactionButton: {
    alignItems: "center",
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  contextReactionText: {
    fontSize: 22,
    lineHeight: 27
  },
  contextPlus: {
    color: colors.label,
    fontSize: 24,
    fontWeight: "500",
    lineHeight: 28
  },
  contextPreviewRow: {
    alignItems: "flex-end",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    maxWidth: "80%"
  },
  contextOwnPreviewRow: {
    alignSelf: "flex-end"
  },
  contextPreview: {
    backgroundColor: colors.contextSurface,
    borderRadius: 18,
    gap: 4,
    maxWidth: 265,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 14
  },
  contextIncomingPreview: {
    borderBottomLeftRadius: 6
  },
  contextOutgoingPreview: {
    backgroundColor: colors.outgoingBubble,
    borderBottomRightRadius: 6
  },
  contextSender: {
    color: colors.secondaryLabel,
    fontSize: 11,
    fontWeight: "700"
  },
  contextOutgoingSender: {
    color: "rgba(255,255,255,0.76)"
  },
  contextSnippet: {
    color: colors.label,
    fontSize: 15,
    lineHeight: 20
  },
  contextOutgoingSnippet: {
    color: "white"
  },
  contextMenu: {
    alignSelf: "center",
    backgroundColor: colors.contextSurface,
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 232,
    overflow: "hidden",
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    width: "72%",
    zIndex: 6
  },
  contextMenuItem: {
    alignItems: "center",
    backgroundColor: colors.contextSurface,
    flexDirection: "row",
    gap: 11,
    minHeight: 42,
    paddingHorizontal: 14
  },
  contextMenuSeparator: {
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  contextMenuText: {
    color: colors.label,
    flex: 1,
    fontSize: 16,
    fontWeight: "500"
  },
  contextMenuDestructive: {
    color: colors.systemRed
  },
  contextPressed: {
    backgroundColor: colors.tertiaryBackground
  },
  deleteDialogBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.24)",
    justifyContent: "center",
    paddingHorizontal: 28
  },
  deleteDialog: {
    backgroundColor: colors.contextSurface,
    borderRadius: 18,
    maxWidth: 310,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    width: "100%"
  },
  deleteDialogTitle: {
    color: colors.label,
    fontSize: 17,
    fontWeight: "700",
    paddingHorizontal: 18,
    paddingTop: 18,
    textAlign: "center"
  },
  deleteDialogBody: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 19,
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 6,
    textAlign: "center"
  },
  deleteDialogActions: {
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row"
  },
  deleteDialogAction: {
    alignItems: "center",
    flex: 1,
    minHeight: 48,
    justifyContent: "center"
  },
  deleteDialogCancelText: {
    color: colors.systemBlue,
    fontSize: 17,
    fontWeight: "500"
  },
  deleteDialogDeleteText: {
    color: colors.systemRed,
    fontSize: 17,
    fontWeight: "600"
  },
  typingDot: {
    color: colors.systemBlue,
    fontSize: 20,
    lineHeight: 20
  },
  typingLabel: {
    color: colors.secondaryLabel,
    fontSize: 14,
    fontWeight: "700"
  },
  threadScreen: {
    backgroundColor: colors.appBackground,
    flex: 1
  },
  threadHeader: {
    alignItems: "center",
    backgroundColor: colors.elevatedBackground,
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  threadTitle: {
    color: colors.label,
    fontSize: 20,
    fontWeight: "800"
  },
  threadSubtitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "600"
  },
  threadHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14
  },
  threadHeaderAction: {
    minHeight: 36,
    justifyContent: "center"
  },
  threadHeaderActionDisabled: {
    opacity: 0.42
  },
  threadHeaderSendText: {
    color: colors.systemBlue,
    fontSize: 17,
    fontWeight: "700"
  },
  threadHeaderSendDisabledText: {
    color: colors.secondaryLabel
  },
  threadCloseText: {
    color: colors.systemBlue,
    fontSize: 17,
    fontWeight: "700"
  },
  originalCard: {
    backgroundColor: colors.elevatedBackground,
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  originalLabel: {
    color: colors.systemBlue,
    fontSize: 13,
    fontWeight: "800"
  },
  originalText: {
    color: colors.label,
    fontSize: 15,
    lineHeight: 21
  },
  threadList: {
    gap: 12,
    padding: 16
  },
  threadMessage: {
    alignSelf: "flex-start",
    maxWidth: "88%"
  },
  threadOwnMessage: {
    alignSelf: "flex-end"
  },
  emptyThread: {
    color: colors.secondaryLabel,
    fontSize: 15,
    paddingVertical: 20,
    textAlign: "center"
  },
  threadComposer: {
    alignItems: "flex-end",
    backgroundColor: colors.elevatedBackground,
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  threadInput: {
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.label,
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  threadSend: {
    alignItems: "center",
    backgroundColor: colors.systemBlue,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  threadSendDisabled: {
    backgroundColor: colors.tertiaryBackground
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: layout.screenPadding
  },
  emptyTitle: {
    color: colors.label,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center"
  },
  emptyBody: {
    color: colors.secondaryLabel,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center"
  }
});

function resolveConversation(conversationId: string | undefined): Conversation | undefined {
  const existing = conversations.find((item) => item.id === conversationId);

  if (existing || !conversationId) {
    return existing;
  }

  return {
    id: conversationId,
    kind: "agent",
    title: "Assistant Chat",
    visibility: "private",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    threadCount: 0,
    unreadCount: 0
  };
}

function buildReplyCounts(messagesToCount: Message[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const message of messagesToCount) {
    const parentId = message.parentMessageId;

    if (parentId && !message.deletedAt) {
      counts[parentId] = (counts[parentId] ?? 0) + 1;
    }
  }

  return counts;
}

function clearAgentTimers(timers: ReturnType<typeof setTimeout>[]) {
  for (const timer of timers) {
    clearTimeout(timer);
  }

  timers.length = 0;
}

function canEditMessage(message: Message) {
  return isOwnMessage(message) && !message.deletedAt;
}

function isOwnMessage(message: Message) {
  return message.senderId === CURRENT_USER_ID;
}

function messageTextForEditing(message: Message): string {
  return message.blocks.map(blockText).filter(Boolean).join("\n");
}

function firstQuotedMessageId(message: Message): string | undefined {
  return message.blocks.find((block): block is Extract<MessageBlock, { type: "quote" }> => block.type === "quote")?.citedMessageId;
}

function messageSnippet(message: Message): string {
  if (message.deletedAt) {
    return "Message deleted";
  }

  const snippet = message.blocks.map(blockText).filter(Boolean).join(" ").trim();

  return snippet || "Message";
}

function blockText(block: MessageBlock): string {
  switch (block.type) {
    case "text":
    case "quote":
      return block.text;
    case "code":
      return block.code;
    case "widget":
      return block.widget.title;
    case "agent_event":
      return block.title;
    case "file":
      return block.fileName;
    case "image":
      return block.alt;
  }
}

function reactionAccessibilityLabel(reactions: MessageReaction[]) {
  return reactions.map((reaction) => `${reaction.emoji} by ${senderLabel(reaction.userId)}`).join(", ");
}

function groupReactions(reactions: MessageReaction[]) {
  const grouped: Array<{ emoji: string; count: number; userIds: string[] }> = [];

  for (const reaction of reactions) {
    const existing = grouped.find((item) => item.emoji === reaction.emoji);

    if (existing) {
      existing.count += 1;
      existing.userIds.push(reaction.userId);
    } else {
      grouped.push({ emoji: reaction.emoji, count: 1, userIds: [reaction.userId] });
    }
  }

  return grouped;
}

function agentSenderId(conversation: Conversation) {
  if (conversation.id === "openclaw-lab") {
    return "agent-openclaw";
  }

  if (conversation.id === "sage-assistant") {
    return "agent-sage";
  }

  return `agent-${conversation.id}`;
}

function conversationAgentName(conversation: Conversation) {
  if (conversation.id === "openclaw-lab") {
    return "OpenClaw";
  }

  if (conversation.kind === "agent") {
    return conversation.title.replace(/\s+(assistant|agent)$/i, "") || "Agent";
  }

  return "Avery";
}

function simulatedAgentReply(conversation: Conversation) {
  const name = conversationAgentName(conversation);

  return `${name} received your message and is ready to help.`;
}

function senderInitial(senderId: string): string {
  return senderLabel(senderId).slice(0, 1).toUpperCase();
}
