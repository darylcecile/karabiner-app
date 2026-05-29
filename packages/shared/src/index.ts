export type Id = string;
export type ISODateTime = string;

export interface UserProfile {
  id: Id;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  status: "active" | "deletion_requested" | "deleted" | "suspended";
}

export interface Conversation {
  id: Id;
  kind: "direct" | "group" | "agent";
  title: string;
  visibility: "private" | "invite_only" | "discoverable";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  threadCount: number;
  unreadCount: number;
}

export type ConversationRole = "owner" | "moderator" | "member" | "guest";

export interface ConversationMember {
  conversationId: Id;
  userId: Id;
  role: ConversationRole;
  state: "active" | "invited" | "muted" | "banned" | "left";
  joinedAt?: ISODateTime;
}

export type MessageBlock =
  | TextBlock
  | CodeBlock
  | QuoteBlock
  | ImageBlock
  | FileBlock
  | WidgetBlock
  | AgentEventBlock;

export type ClientMessageBlock = TextBlock | CodeBlock | QuoteBlock | ImageBlock | FileBlock;
export type SystemMessageBlock = WidgetBlock | AgentEventBlock;

export interface TextBlock {
  type: "text";
  text: string;
  marks?: TextMark[];
}

export interface TextMark {
  kind: "bold" | "italic" | "code" | "mention" | "link" | "slugmoji";
  start: number;
  end: number;
  value?: string;
}

export interface CodeBlock {
  type: "code";
  code: string;
  language?: string;
}

export interface QuoteBlock {
  type: "quote";
  text: string;
  citedMessageId?: Id;
}

export interface ImageBlock {
  type: "image";
  mediaId: Id;
  alt: string;
  width?: number;
  height?: number;
}

export interface FileBlock {
  type: "file";
  mediaId: Id;
  fileName: string;
  byteSize: number;
  mimeType: string;
}

export interface WidgetBlock {
  type: "widget";
  widget: MessageWidget;
}

export interface AgentEventBlock {
  type: "agent_event";
  agentId: Id;
  event: "thinking" | "tool_call" | "tool_result" | "handoff" | "error";
  title: string;
  detail?: string;
}

export interface MessageWidget {
  id: Id;
  kind: "button_group" | "form" | "picker" | "confirmation";
  title: string;
  body?: string;
  actions: WidgetAction[];
}

export interface WidgetAction {
  id: Id;
  label: string;
  style: "default" | "primary" | "destructive";
  command?: SlashCommandInvocation;
}

export interface Message {
  id: Id;
  conversationId: Id;
  senderId: Id;
  parentMessageId?: Id;
  blocks: MessageBlock[];
  createdAt: ISODateTime;
  editedAt?: ISODateTime;
  deletedAt?: ISODateTime;
}

export type ClientMessage = Omit<Message, "blocks"> & { blocks: ClientMessageBlock[] };

export interface SlashCommand {
  id: Id;
  pluginId: Id;
  name: string;
  description: string;
  argumentHint?: string;
  requiredScopes: PluginScope[];
}

export interface SlashCommandInvocation {
  command: string;
  args: string;
  conversationId: Id;
  threadId?: Id;
}

export interface Slugmoji {
  slug: string;
  emoji: string;
  conversationId?: Id;
  createdBy: Id;
}

export type PluginScope =
  | "plugin:read"
  | "plugin:write"
  | "plugin:admin"
  | "messages:read"
  | "messages:write"
  | "media:read"
  | "media:write";

export interface PluginManifest {
  id: Id;
  name: string;
  version: string;
  description: string;
  webhookUrl: string;
  requestedScopes: PluginScope[];
  slashCommands: SlashCommand[];
  publicKey?: string;
  privacyUrl?: string;
}

export type RealtimeEnvelope =
  | MessageCreateEnvelope
  | MessageDeleteEnvelope
  | TypingEnvelope
  | WidgetActionEnvelope
  | SlashCommandEnvelope
  | PresenceEnvelope
  | ErrorEnvelope;

export type ClientRealtimeEnvelope =
  | BaseEnvelope<"message.create", { message: ClientMessage }>
  | WidgetActionEnvelope
  | SlashCommandEnvelope;

export type ServerAuthoredRealtimeEnvelope =
  | MessageDeleteEnvelope
  | TypingEnvelope
  | PresenceEnvelope
  | ErrorEnvelope;

export interface BaseEnvelope<TType extends string, TPayload> {
  id: Id;
  type: TType;
  conversationId: Id;
  sentAt: ISODateTime;
  payload: TPayload;
}

export type MessageCreateEnvelope = BaseEnvelope<"message.create", { message: Message }>;
export type MessageDeleteEnvelope = BaseEnvelope<"message.delete", { messageId: Id }>;
export type TypingEnvelope = BaseEnvelope<"typing", { userId: Id; isTyping: boolean }>;
export type WidgetActionEnvelope = BaseEnvelope<
  "widget.action",
  { messageId: Id; widgetId: Id; actionId: Id }
>;
export type SlashCommandEnvelope = BaseEnvelope<"slash.invoke", SlashCommandInvocation>;
export type PresenceEnvelope = BaseEnvelope<
  "presence",
  { userId: Id; state: "online" | "offline" | "away" }
>;
export type ErrorEnvelope = BaseEnvelope<"error", { code: string; message: string }>;

export interface PluginDispatchEvent {
  id: Id;
  pluginId: Id;
  conversationId: Id;
  actorUserId: Id;
  type: "slash_command" | "widget_action" | "message_created" | "agent_linked";
  payload: Record<string, unknown>;
  createdAt: ISODateTime;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Ingress guard: user-created messages cannot directly author widgets or agent events.
export function isMessageBlock(value: unknown): value is ClientMessageBlock {
  return isClientMessageBlock(value);
}

export function isRenderableMessageBlock(value: unknown): value is MessageBlock {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "text":
      return isTextBlock(value);
    case "code":
      return isCodeBlock(value);
    case "quote":
      return isQuoteBlock(value);
    case "image":
      return isImageBlock(value);
    case "file":
      return isFileBlock(value);
    case "widget":
      return isWidgetBlock(value);
    case "agent_event":
      return isAgentEventBlock(value);
    default:
      return false;
  }
}

export function isClientMessageBlock(value: unknown): value is ClientMessageBlock {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "text":
      return isTextBlock(value);
    case "code":
      return isCodeBlock(value);
    case "quote":
      return isQuoteBlock(value);
    case "image":
      return isImageBlock(value);
    case "file":
      return isFileBlock(value);
    default:
      return false;
  }
}

export function isMessage(value: unknown): value is Message {
  return isMessageWithBlockGuard(value, isRenderableMessageBlock);
}

export function isClientMessage(value: unknown): value is ClientMessage {
  return isMessageWithBlockGuard(value, isClientMessageBlock);
}

// Ingress guard: server-authored envelopes use isAnyRealtimeEnvelope when needed.
export function isRealtimeEnvelope(value: unknown): value is ClientRealtimeEnvelope {
  return isClientRealtimeEnvelope(value);
}

export function isClientRealtimeEnvelope(value: unknown): value is ClientRealtimeEnvelope {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "message.create":
      return isClientMessageCreateEnvelope(value);
    case "widget.action":
      return isWidgetActionEnvelope(value);
    case "slash.invoke":
      return isSlashCommandEnvelope(value);
    default:
      return false;
  }
}

export function isAnyRealtimeEnvelope(value: unknown): value is RealtimeEnvelope {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "message.create":
      return isMessageCreateEnvelope(value);
    case "message.delete":
      return isMessageDeleteEnvelope(value);
    case "typing":
      return isTypingEnvelope(value);
    case "widget.action":
      return isWidgetActionEnvelope(value);
    case "slash.invoke":
      return isSlashCommandEnvelope(value);
    case "presence":
      return isPresenceEnvelope(value);
    case "error":
      return isErrorEnvelope(value);
    default:
      return false;
  }
}

export function isServerAuthoredRealtimeEnvelope(
  value: unknown
): value is ServerAuthoredRealtimeEnvelope {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "message.delete":
      return isMessageDeleteEnvelope(value);
    case "typing":
      return isTypingEnvelope(value);
    case "presence":
      return isPresenceEnvelope(value);
    case "error":
      return isErrorEnvelope(value);
    default:
      return false;
  }
}

export function isSlashCommandInvocation(value: unknown): value is SlashCommandInvocation {
  return (
    isRecord(value) &&
    isSlashCommandToken(value.command) &&
    typeof value.args === "string" &&
    isId(value.conversationId) &&
    isOptionalId(value.threadId)
  );
}

export function isPluginManifest(value: unknown): value is PluginManifest {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.version) &&
    isNonEmptyString(value.description) &&
    isHttpsUrl(value.webhookUrl) &&
    isArrayOf(value.requestedScopes, isPluginScope) &&
    isArrayOf(value.slashCommands, isSlashCommand) &&
    isOptionalString(value.publicKey) &&
    isOptionalHttpsUrl(value.privacyUrl)
  );
}

export function isPluginDispatchEvent(value: unknown): value is PluginDispatchEvent {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isId(value.pluginId) &&
    isId(value.conversationId) &&
    isId(value.actorUserId) &&
    isPluginDispatchType(value.type) &&
    isRecord(value.payload) &&
    isISODateTime(value.createdAt)
  );
}

export function createEnvelopeId(prefix = "evt"): Id {
  if (!isEnvelopeIdPrefix(prefix)) {
    throw new TypeError("Envelope ID prefix must be a lowercase protocol token.");
  }

  return `${prefix}_${crypto.randomUUID()}`;
}

type EnvelopeRecord = Record<string, unknown> & {
  id: Id;
  type: string;
  conversationId: Id;
  sentAt: ISODateTime;
  payload: Record<string, unknown>;
};

function isBaseEnvelopeRecord(value: unknown, expectedType: string): value is EnvelopeRecord {
  return (
    isRecord(value) &&
    value.type === expectedType &&
    isId(value.id) &&
    isId(value.conversationId) &&
    isISODateTime(value.sentAt) &&
    isRecord(value.payload)
  );
}

function isMessageCreateEnvelope(value: unknown): value is MessageCreateEnvelope {
  return (
    isBaseEnvelopeRecord(value, "message.create") &&
    isMessage(value.payload.message) &&
    value.payload.message.conversationId === value.conversationId
  );
}

function isClientMessageCreateEnvelope(
  value: unknown
): value is BaseEnvelope<"message.create", { message: ClientMessage }> {
  return (
    isBaseEnvelopeRecord(value, "message.create") &&
    isClientMessage(value.payload.message) &&
    value.payload.message.conversationId === value.conversationId
  );
}

function isMessageDeleteEnvelope(value: unknown): value is MessageDeleteEnvelope {
  return (
    isBaseEnvelopeRecord(value, "message.delete") &&
    isId(value.payload.messageId)
  );
}

function isTypingEnvelope(value: unknown): value is TypingEnvelope {
  return (
    isBaseEnvelopeRecord(value, "typing") &&
    isId(value.payload.userId) &&
    typeof value.payload.isTyping === "boolean"
  );
}

function isWidgetActionEnvelope(value: unknown): value is WidgetActionEnvelope {
  return (
    isBaseEnvelopeRecord(value, "widget.action") &&
    isId(value.payload.messageId) &&
    isId(value.payload.widgetId) &&
    isId(value.payload.actionId)
  );
}

function isSlashCommandEnvelope(value: unknown): value is SlashCommandEnvelope {
  return (
    isBaseEnvelopeRecord(value, "slash.invoke") &&
    isSlashCommandInvocation(value.payload) &&
    value.payload.conversationId === value.conversationId
  );
}

function isPresenceEnvelope(value: unknown): value is PresenceEnvelope {
  return (
    isBaseEnvelopeRecord(value, "presence") &&
    isId(value.payload.userId) &&
    isPresenceState(value.payload.state)
  );
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    isBaseEnvelopeRecord(value, "error") &&
    isProtocolErrorCode(value.payload.code) &&
    typeof value.payload.message === "string"
  );
}

function isMessageWithBlockGuard<TBlock extends MessageBlock>(
  value: unknown,
  isBlock: (block: unknown) => block is TBlock
): value is Omit<Message, "blocks"> & { blocks: TBlock[] } {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isId(value.conversationId) &&
    isId(value.senderId) &&
    isOptionalId(value.parentMessageId) &&
    isArrayOf(value.blocks, isBlock) &&
    value.blocks.length > 0 &&
    isISODateTime(value.createdAt) &&
    isOptionalISODateTime(value.editedAt) &&
    isOptionalISODateTime(value.deletedAt)
  );
}

function isTextBlock(value: unknown): value is TextBlock {
  return (
    isRecord(value) &&
    value.type === "text" &&
    typeof value.text === "string" &&
    (value.marks === undefined || isTextMarks(value.marks, value.text))
  );
}

function isTextMarks(value: unknown, text: string): value is TextMark[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (const mark of value) {
    if (!isTextMark(mark, text)) {
      return false;
    }
  }

  return true;
}

function isTextMark(value: unknown, text: string): value is TextMark {
  return (
    isRecord(value) &&
    isTextMarkKind(value.kind) &&
    isNonNegativeInteger(value.start) &&
    isNonNegativeInteger(value.end) &&
    value.start <= value.end &&
    value.end <= text.length &&
    isOptionalString(value.value)
  );
}

function isCodeBlock(value: unknown): value is CodeBlock {
  return (
    isRecord(value) &&
    value.type === "code" &&
    typeof value.code === "string" &&
    (value.language === undefined || isLanguageToken(value.language))
  );
}

function isQuoteBlock(value: unknown): value is QuoteBlock {
  return (
    isRecord(value) &&
    value.type === "quote" &&
    typeof value.text === "string" &&
    isOptionalId(value.citedMessageId)
  );
}

function isImageBlock(value: unknown): value is ImageBlock {
  return (
    isRecord(value) &&
    value.type === "image" &&
    isId(value.mediaId) &&
    typeof value.alt === "string" &&
    isOptionalPositiveInteger(value.width) &&
    isOptionalPositiveInteger(value.height)
  );
}

function isFileBlock(value: unknown): value is FileBlock {
  return (
    isRecord(value) &&
    value.type === "file" &&
    isId(value.mediaId) &&
    isNonEmptyString(value.fileName) &&
    isNonNegativeInteger(value.byteSize) &&
    isMimeType(value.mimeType)
  );
}

function isWidgetBlock(value: unknown): value is WidgetBlock {
  return isRecord(value) && value.type === "widget" && isMessageWidget(value.widget);
}

function isAgentEventBlock(value: unknown): value is AgentEventBlock {
  return (
    isRecord(value) &&
    value.type === "agent_event" &&
    isId(value.agentId) &&
    isAgentEvent(value.event) &&
    isNonEmptyString(value.title) &&
    isOptionalString(value.detail)
  );
}

function isMessageWidget(value: unknown): value is MessageWidget {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isWidgetKind(value.kind) &&
    isNonEmptyString(value.title) &&
    isOptionalString(value.body) &&
    isArrayOf(value.actions, isWidgetAction)
  );
}

function isWidgetAction(value: unknown): value is WidgetAction {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isNonEmptyString(value.label) &&
    isWidgetActionStyle(value.style) &&
    (value.command === undefined || isSlashCommandInvocation(value.command))
  );
}

function isSlashCommand(value: unknown): value is SlashCommand {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isId(value.pluginId) &&
    isSlashCommandName(value.name) &&
    isNonEmptyString(value.description) &&
    isOptionalString(value.argumentHint) &&
    isArrayOf(value.requiredScopes, isPluginScope)
  );
}

function isId(value: unknown): value is Id {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalId(value: unknown): value is Id | undefined {
  return value === undefined || isId(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isISODateTime(value: unknown): value is ISODateTime {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isOptionalISODateTime(value: unknown): value is ISODateTime | undefined {
  return value === undefined || isISODateTime(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isOptionalPositiveInteger(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
  );
}

function isArrayOf<T>(value: unknown, isItem: (item: unknown) => item is T): value is T[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (const item of value) {
    if (!isItem(item)) {
      return false;
    }
  }

  return true;
}

function isTextMarkKind(value: unknown): value is TextMark["kind"] {
  switch (value) {
    case "bold":
    case "italic":
    case "code":
    case "mention":
    case "link":
    case "slugmoji":
      return true;
    default:
      return false;
  }
}

function isAgentEvent(value: unknown): value is AgentEventBlock["event"] {
  switch (value) {
    case "thinking":
    case "tool_call":
    case "tool_result":
    case "handoff":
    case "error":
      return true;
    default:
      return false;
  }
}

function isWidgetKind(value: unknown): value is MessageWidget["kind"] {
  switch (value) {
    case "button_group":
    case "form":
    case "picker":
    case "confirmation":
      return true;
    default:
      return false;
  }
}

function isWidgetActionStyle(value: unknown): value is WidgetAction["style"] {
  switch (value) {
    case "default":
    case "primary":
    case "destructive":
      return true;
    default:
      return false;
  }
}

function isPluginScope(value: unknown): value is PluginScope {
  switch (value) {
    case "plugin:read":
    case "plugin:write":
    case "plugin:admin":
    case "messages:read":
    case "messages:write":
    case "media:read":
    case "media:write":
      return true;
    default:
      return false;
  }
}

function isPresenceState(value: unknown): value is PresenceEnvelope["payload"]["state"] {
  switch (value) {
    case "online":
    case "offline":
    case "away":
      return true;
    default:
      return false;
  }
}

function isPluginDispatchType(value: unknown): value is PluginDispatchEvent["type"] {
  switch (value) {
    case "slash_command":
    case "widget_action":
    case "message_created":
    case "agent_linked":
      return true;
    default:
      return false;
  }
}

function isSlashCommandName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
}

function isSlashCommandToken(value: unknown): value is string {
  return typeof value === "string" && /^\/?[a-z][a-z0-9-]{0,63}$/.test(value);
}

function isProtocolErrorCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_:-]{0,63}$/.test(value);
}

function isLanguageToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9+_.-]{0,39}$/i.test(value);
}

function isMimeType(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value)
  );
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isOptionalHttpsUrl(value: unknown): value is string | undefined {
  return value === undefined || isHttpsUrl(value);
}

function isEnvelopeIdPrefix(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(value);
}
