import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { Message, MessageBlock } from "@karabiner/shared";
import { Composer } from "../../../components/Composer";
import { MessageBlockView } from "../../../components/MessageBlockView";
import { conversations, messages as fixtureMessages } from "../../../features/messages/fixtures";
import {
  agentSenderId,
  conversationAgentName,
  isOwnMessage,
  messageSnippet,
  nextLocalId,
  simulatedAgentReply
} from "../../../features/messages/conversation-helpers";
import { CURRENT_USER_ID, senderLabel } from "../../../features/messages/participants";
import { colors } from "../../../styles/theme";

export default function ThreadScreen() {
  const router = useRouter();
  const { messageId, cid } = useLocalSearchParams<{ messageId?: string | string[]; cid?: string | string[] }>();
  const rootId = Array.isArray(messageId) ? messageId[0] : messageId;
  const conversationId = Array.isArray(cid) ? cid[0] : cid;
  const conversation = useMemo(() => conversations.find((c) => c.id === conversationId), [conversationId]);
  const rootFromFixtures = useMemo(() => fixtureMessages.find((m) => m.id === rootId), [rootId]);

  const [localMessages, setLocalMessages] = useState<Message[]>(() =>
    fixtureMessages.filter((m) => m.parentMessageId === rootId)
  );
  const [typing, setTyping] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  if (!rootFromFixtures || !conversation) {
    return (
      <View style={styles.empty}>
        <Stack.Screen options={{ title: "Thread" }} />
        <Text style={styles.emptyText}>This thread is no longer available.</Text>
      </View>
    );
  }

  function appendMessage(message: Message) {
    setLocalMessages((current) => [...current, message]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }

  function handleSend(message: Message) {
    if (!conversation || !rootFromFixtures) {
      return;
    }
    const threaded: Message = { ...message, parentMessageId: rootFromFixtures.id };
    appendMessage(threaded);

    if (conversation.kind === "agent") {
      setTyping(true);
      setTimeout(() => {
        const agentReply: Message = {
          id: nextLocalId("agent"),
          conversationId: conversation.id,
          senderId: agentSenderId(conversation),
          parentMessageId: rootFromFixtures.id,
          blocks: [{ type: "text", text: simulatedAgentReply(conversation) }],
          createdAt: new Date().toISOString()
        };
        appendMessage(agentReply);
        setTyping(false);
      }, 1100);
    }
  }

  function renderItem({ item }: { item: Message }) {
    const own = isOwnMessage(item);
    return (
      <View style={[styles.row, own ? styles.rowOwn : null]}>
        {!own ? <Text style={styles.sender}>{senderLabel(item.senderId)}</Text> : null}
        <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleIncoming]}>
          {item.blocks.map((block, idx) => (
            <ThreadBlock block={block} key={`${item.id}-${idx}`} own={own} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Thread",
          headerBackTitle: conversation.title.length > 12 ? "Back" : conversation.title
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <Pressable
          accessibilityHint="Returns to the main conversation"
          accessibilityLabel="Original message"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.originalCard}
        >
          <Text style={styles.originalLabel}>Original message · {senderLabel(rootFromFixtures.senderId)}</Text>
          <Text numberOfLines={2} style={styles.originalText}>
            {messageSnippet(rootFromFixtures)}
          </Text>
        </Pressable>
        <FlatList
          contentContainerStyle={styles.list}
          data={localMessages}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.emptyThread}>No replies yet. Start the thread.</Text>}
          ListFooterComponent={
            typing ? (
              <View style={styles.typing}>
                <Text style={styles.typingText}>{conversationAgentName(conversation)} is typing…</Text>
              </View>
            ) : null
          }
          ref={listRef}
          renderItem={renderItem}
        />
        <Composer conversationId={conversation.id} onSend={handleSend} />
      </KeyboardAvoidingView>
    </>
  );
}

function ThreadBlock({ block, own }: { block: MessageBlock; own: boolean }) {
  if (block.type === "quote") {
    return (
      <View style={[styles.quote, own ? styles.quoteOwn : null]}>
        <Text style={[styles.quoteText, own ? styles.quoteTextOwn : null]} numberOfLines={3}>
          {block.text}
        </Text>
      </View>
    );
  }
  return <MessageBlockView block={block} tone={own ? "outgoing" : "incoming"} />;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.chatBackground, flex: 1 },
  empty: { alignItems: "center", flex: 1, justifyContent: "center", padding: 32 },
  emptyText: { color: colors.secondaryLabel, fontSize: 16, textAlign: "center" },
  originalCard: {
    backgroundColor: colors.elevatedBackground,
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  originalLabel: { color: colors.systemBlue, fontSize: 13, fontWeight: "600", marginBottom: 2 },
  originalText: { color: colors.label, fontSize: 15, lineHeight: 20 },
  list: { paddingBottom: 12, paddingHorizontal: 12, paddingTop: 12 },
  row: { marginBottom: 8 },
  rowOwn: { alignItems: "flex-end" },
  sender: { color: colors.tertiaryLabel, fontSize: 12, marginBottom: 2, marginLeft: 12 },
  bubble: { borderRadius: 16, maxWidth: "82%", paddingHorizontal: 12, paddingVertical: 8 },
  bubbleIncoming: { backgroundColor: colors.incomingBubble },
  bubbleOwn: { backgroundColor: colors.outgoingBubble },
  quote: { borderLeftColor: colors.systemBlue, borderLeftWidth: 3, marginBottom: 4, paddingLeft: 8 },
  quoteOwn: { borderLeftColor: "rgba(255,255,255,0.8)" },
  quoteText: { color: colors.secondaryLabel, fontSize: 13, fontStyle: "italic" },
  quoteTextOwn: { color: "rgba(255,255,255,0.85)" },
  emptyThread: { color: colors.secondaryLabel, fontSize: 14, padding: 24, textAlign: "center" },
  typing: { paddingHorizontal: 16, paddingVertical: 8 },
  typingText: { color: colors.tertiaryLabel, fontSize: 13, fontStyle: "italic" }
});

// keep CURRENT_USER_ID import live for type narrowing tools
void CURRENT_USER_ID;
