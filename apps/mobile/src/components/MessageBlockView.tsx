import type { MessageBlock } from "@karabiner/shared";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { slugmojis } from "../features/messages/slugmoji";
import { colors } from "../styles/theme";
import { SystemSymbol } from "./SystemSymbol";

interface MessageBlockViewProps {
  block: MessageBlock;
  tone?: "incoming" | "outgoing";
}

type ImageBlock = Extract<MessageBlock, { type: "image" }>;
type FileBlock = Extract<MessageBlock, { type: "file" }>;

export function MessageBlockView({ block, tone = "incoming" }: MessageBlockViewProps) {
  const outgoing = tone === "outgoing";

  switch (block.type) {
    case "text":
      return <DecoratedText outgoing={outgoing} text={block.text} />;
    case "quote":
      return <Text style={[styles.quote, outgoing ? styles.outgoingQuote : null]}>{block.text}</Text>;
    case "code":
      return <Text style={[styles.code, outgoing ? styles.outgoingCode : null]}>{block.code}</Text>;
    case "image":
      return <ImageAttachment block={block} outgoing={outgoing} />;
    case "file":
      return <FileAttachment block={block} outgoing={outgoing} />;
    case "agent_event":
      return (
        <View style={styles.agentEvent}>
          <Text style={styles.agentTitle}>{block.title}</Text>
          {block.detail ? <Text style={styles.agentDetail}>{block.detail}</Text> : null}
        </View>
      );
    case "widget":
      return (
        <View style={styles.widget}>
          <Text style={styles.widgetTitle}>{block.widget.title}</Text>
          {block.widget.body ? <Text style={styles.widgetBody}>{block.widget.body}</Text> : null}
          <View style={styles.actions}>
            {block.widget.actions.map((action) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint="Shows the scoped widget action preview"
                key={action.id}
                hitSlop={4}
                onPress={() => {
                  Alert.alert(action.label, "Widget actions will run through scoped approvals.");
                }}
                style={({ pressed }) => [
                  styles.action,
                  action.style === "primary" ? styles.primaryAction : null,
                  pressed ? styles.actionPressed : null
                ]}
              >
                <Text style={action.style === "primary" ? styles.primaryActionText : styles.actionText}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
  }
}

function DecoratedText({ outgoing, text }: { outgoing: boolean; text: string }) {
  const segments = splitDecoratedText(text);

  return (
    <Text style={[styles.text, outgoing ? styles.outgoingText : null]}>
      {segments.map((segment, index) => {
        switch (segment.kind) {
          case "bold":
            return (
              <Text key={`${segment.value}-${index}`} style={styles.bold}>
                {segment.value}
              </Text>
            );
          case "italic":
            return (
              <Text key={`${segment.value}-${index}`} style={styles.italic}>
                {segment.value}
              </Text>
            );
          case "code":
            return (
              <Text key={`${segment.value}-${index}`} style={[styles.inlineCode, outgoing ? styles.outgoingInlineCode : null]}>
                {segment.value}
              </Text>
            );
          case "link":
            return (
              <Text
                accessibilityHint="Opens this link"
                accessibilityRole="link"
                key={`${segment.url}-${index}`}
                onPress={() => openLink(segment.url)}
                style={outgoing ? styles.outgoingLink : styles.link}
              >
                {segment.value}
              </Text>
            );
          case "slugmoji":
            return (
              <Text accessibilityLabel={segment.slug} key={`${segment.value}-${index}`} style={styles.inlineEmoji}>
                {segment.value}
              </Text>
            );
          case "mention":
            return (
              <Text key={`${segment.value}-${index}`} style={outgoing ? styles.outgoingMention : styles.mention}>
                {segment.value}
              </Text>
            );
          case "plain":
            return segment.value;
        }
      })}
    </Text>
  );
}

function ImageAttachment({ block, outgoing }: { block: ImageBlock; outgoing: boolean }) {
  const dimensions = block.width && block.height ? `${block.width}×${block.height}` : "Full size";

  return (
    <Pressable
      accessibilityHint="Opens a full-size image preview"
      accessibilityLabel={`Image attachment, ${block.alt}, ${dimensions}`}
      accessibilityRole="button"
      onPress={() => Alert.alert("Image preview", `${block.alt}\n${dimensions}`)}
      style={({ pressed }) => [
        styles.attachmentCard,
        outgoing ? styles.outgoingAttachmentCard : null,
        pressed ? styles.attachmentPressed : null
      ]}
    >
      <View style={[styles.attachmentIcon, outgoing ? styles.outgoingAttachmentIcon : null]}>
        <SystemSymbol color={outgoing ? "white" : colors.systemBlue} fallback="▧" name="photo.fill.on.rectangle.fill" size={22} />
      </View>
      <View style={styles.attachmentCopy}>
        <Text numberOfLines={1} style={[styles.attachmentTitle, outgoing ? styles.outgoingText : null]}>
          {block.alt}
        </Text>
        <Text style={[styles.attachmentMeta, outgoing ? styles.outgoingAttachmentMeta : null]}>
          Image • {dimensions}
        </Text>
      </View>
      <View style={styles.attachmentAccessory}>
        <Text style={[styles.attachmentActionText, outgoing ? styles.outgoingAttachmentActionText : null]}>View</Text>
      </View>
    </Pressable>
  );
}

function FileAttachment({ block, outgoing }: { block: FileBlock; outgoing: boolean }) {
  const fileType = mimeTypeLabel(block.mimeType);
  const size = formatByteSize(block.byteSize);

  return (
    <Pressable
      accessibilityHint="Opens the file viewer"
      accessibilityLabel={`File attachment, ${block.fileName}, ${fileType}, ${size}`}
      accessibilityRole="button"
      onPress={() => Alert.alert("File attachment", `${block.fileName}\n${fileType} • ${size}`)}
      style={({ pressed }) => [
        styles.fileCard,
        outgoing ? styles.outgoingAttachmentCard : null,
        pressed ? styles.attachmentPressed : null
      ]}
    >
      <View style={[styles.attachmentIcon, outgoing ? styles.outgoingAttachmentIcon : null]}>
        <SystemSymbol color={outgoing ? "white" : colors.systemBlue} fallback="□" name="doc.fill" size={22} />
      </View>
      <View style={styles.attachmentCopy}>
        <Text numberOfLines={1} style={[styles.attachmentTitle, outgoing ? styles.outgoingText : null]}>
          {block.fileName}
        </Text>
        <Text style={[styles.attachmentMeta, outgoing ? styles.outgoingAttachmentMeta : null]}>
          {fileType} • {size}
        </Text>
      </View>
      <View style={styles.attachmentAccessory}>
        <Text style={[styles.attachmentActionText, outgoing ? styles.outgoingAttachmentActionText : null]}>Open</Text>
      </View>
    </Pressable>
  );
}

type TextSegment =
  | { kind: "plain"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; value: string; url: string }
  | { kind: "mention"; value: string }
  | { kind: "slugmoji"; slug: string; value: string };

function splitDecoratedText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const token = matchDecoratedToken(text.slice(cursor));

    if (token) {
      segments.push(token.segment);
      cursor += token.length;
    } else {
      appendPlainSegment(segments, text[cursor] ?? "");
      cursor += 1;
    }
  }

  return segments;
}

function matchDecoratedToken(input: string): { segment: TextSegment; length: number } | null {
  const linkMatch = input.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/i);

  if (linkMatch?.[0] && linkMatch[1] && linkMatch[2]) {
    return { segment: { kind: "link", value: linkMatch[1], url: linkMatch[2] }, length: linkMatch[0].length };
  }

  const codeMatch = input.match(/^`([^`\n]+)`/);

  if (codeMatch?.[0] && codeMatch[1]) {
    return { segment: { kind: "code", value: codeMatch[1] }, length: codeMatch[0].length };
  }

  const boldMatch = input.match(/^\*\*([^*\n][\s\S]*?)\*\*/);

  if (boldMatch?.[0] && boldMatch[1]) {
    return { segment: { kind: "bold", value: boldMatch[1] }, length: boldMatch[0].length };
  }

  const italicMatch = input.match(/^\*([^*\n]+)\*/);

  if (italicMatch?.[0] && italicMatch[1]) {
    return { segment: { kind: "italic", value: italicMatch[1] }, length: italicMatch[0].length };
  }

  const slugmojiMatch = input.match(/^:([a-z0-9_-]+):/i);

  if (slugmojiMatch?.[0] && slugmojiMatch[1]) {
    const slug = slugmojiMatch[1].toLowerCase();
    const emoji = slugmojis.find((entry) => entry.slug.toLowerCase() === slug)?.emoji;

    return {
      segment: emoji ? { kind: "slugmoji", slug, value: emoji } : { kind: "plain", value: slugmojiMatch[0] },
      length: slugmojiMatch[0].length
    };
  }

  const mentionMatch = input.match(/^@[a-z0-9_.-]+/i);

  if (mentionMatch?.[0]) {
    return { segment: { kind: "mention", value: mentionMatch[0] }, length: mentionMatch[0].length };
  }

  return null;
}

function appendPlainSegment(segments: TextSegment[], value: string) {
  const lastSegment = segments.at(-1);

  if (lastSegment?.kind === "plain") {
    lastSegment.value += value;
    return;
  }

  segments.push({ kind: "plain", value });
}

function openLink(url: string) {
  void Linking.openURL(url).catch(() => {
    Alert.alert("Unable to open link", url);
  });
}

function formatByteSize(byteSize: number): string {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  if (byteSize < 1024 * 1024) {
    return `${Math.round(byteSize / 1024)} KB`;
  }

  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeTypeLabel(mimeType: string): string {
  if (mimeType === "application/pdf") {
    return "PDF document";
  }

  if (mimeType === "text/csv") {
    return "CSV file";
  }

  if (mimeType.startsWith("image/")) {
    return `${mimeType.slice(6).toUpperCase()} image`;
  }

  return mimeType;
}

const styles = StyleSheet.create({
  text: {
    color: colors.label,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    maxWidth: "100%"
  },
  outgoingText: {
    color: "white"
  },
  bold: {
    fontWeight: "800"
  },
  italic: {
    fontStyle: "italic"
  },
  inlineCode: {
    backgroundColor: colors.tertiaryBackground,
    borderRadius: 4,
    color: colors.label,
    fontFamily: "Menlo",
    fontSize: 13,
    lineHeight: 19
  },
  outgoingInlineCode: {
    backgroundColor: "rgba(255,255,255,0.22)",
    color: "white"
  },
  link: {
    color: colors.systemBlue,
    fontWeight: "700",
    textDecorationLine: "underline"
  },
  outgoingLink: {
    color: "white",
    fontWeight: "800",
    textDecorationLine: "underline"
  },
  inlineEmoji: {
    fontSize: 17,
    lineHeight: 21
  },
  mention: {
    color: colors.systemBlue,
    fontWeight: "700"
  },
  outgoingMention: {
    color: "white",
    fontWeight: "800",
    textDecorationLine: "underline"
  },
  quote: {
    borderLeftColor: colors.tertiaryLabel,
    borderLeftWidth: 3,
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    paddingLeft: 10
  },
  outgoingQuote: {
    borderLeftColor: "rgba(255,255,255,0.56)",
    color: "rgba(255,255,255,0.88)"
  },
  code: {
    backgroundColor: colors.label,
    borderRadius: 10,
    color: colors.elevatedBackground,
    fontFamily: "Menlo",
    fontSize: 13,
    lineHeight: 19,
    padding: 10
  },
  outgoingCode: {
    backgroundColor: "rgba(0,0,0,0.2)",
    color: "white"
  },
  attachmentCard: {
    alignItems: "center",
    backgroundColor: colors.secondaryBackground,
    borderRadius: 15,
    flexDirection: "row",
    gap: 10,
    maxWidth: "100%",
    minHeight: 62,
    minWidth: 188,
    overflow: "hidden",
    padding: 9
  },
  outgoingAttachmentCard: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.18)"
  },
  attachmentPressed: {
    opacity: 0.72
  },
  imagePreview: {
    alignItems: "center",
    backgroundColor: colors.tertiaryBackground,
    borderRadius: 14,
    height: 132,
    justifyContent: "center"
  },
  outgoingImagePreview: {
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  imageGlyph: {
    fontSize: 44,
    lineHeight: 50
  },
  attachmentFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 2
  },
  attachmentCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  attachmentTitle: {
    color: colors.label,
    fontSize: 15,
    fontWeight: "700"
  },
  attachmentMeta: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "600"
  },
  outgoingAttachmentMeta: {
    color: "rgba(255,255,255,0.78)"
  },
  attachmentAccessory: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 34
  },
  attachmentActionText: {
    color: colors.systemBlue,
    fontSize: 12,
    fontWeight: "700"
  },
  outgoingAttachmentActionText: {
    color: "white"
  },
  fileCard: {
    alignItems: "center",
    backgroundColor: colors.secondaryBackground,
    borderRadius: 15,
    flexDirection: "row",
    gap: 10,
    maxWidth: "100%",
    minHeight: 62,
    minWidth: 188,
    padding: 9
  },
  attachmentIcon: {
    alignItems: "center",
    backgroundColor: colors.elevatedBackground,
    borderRadius: 17,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  outgoingAttachmentIcon: {
    backgroundColor: "rgba(255,255,255,0.22)"
  },
  agentEvent: {
    backgroundColor: colors.agentBackground,
    borderRadius: 12,
    padding: 10
  },
  agentTitle: {
    color: colors.agentText,
    fontSize: 15,
    fontWeight: "800"
  },
  agentDetail: {
    color: colors.agentText,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4
  },
  widget: {
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 12
  },
  widgetTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "700"
  },
  widgetBody: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  action: {
    alignItems: "center",
    backgroundColor: colors.elevatedBackground,
    borderColor: colors.separator,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  actionPressed: {
    opacity: 0.72
  },
  actionText: {
    color: colors.label,
    fontSize: 14,
    fontWeight: "700"
  },
  primaryAction: {
    backgroundColor: colors.systemBlue,
    borderColor: colors.systemBlue
  },
  primaryActionText: {
    color: "white",
    fontSize: 14,
    fontWeight: "800"
  }
});
