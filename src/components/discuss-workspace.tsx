"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import {
  ArrowLeft,
  Hash,
  Info,
  LoaderCircle,
  MessageCircle,
  Paperclip,
  Pin,
  Plus,
  Reply,
  Send,
  Smile,
  Star,
  CheckSquare2,
  X,
} from "lucide-react";
import { clientDb, clientStorage } from "@/lib/firebase-client";
import { CallLauncher } from "./call-launcher";
import { ActiveMeetingCard } from "./active-meeting-card";
import { WorkspaceEntityInput } from "./workspace-entity-input";
type Conversation = {
  id: string;
  name: string;
  description?: string;
  type: string;
  memberIds?: string[];
  lastMessage?: string;
  unreadBy?: string[];
  unreadCount?: number;
};
type Member = { id: string; displayName: string; email: string; role: string };
type Department = { id: string; name: string };
type Message = {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  createdAt?: { toDate: () => Date };
  attachment?: { name: string; url: string; type: string; size: number };
  parentMessageId?: string | null;
  reactions?: Record<string, string[]>;
  pinned?: boolean;
  starred?: boolean;
  todoCreated?: boolean;
  editedAt?: { toDate: () => Date } | null;
  deletedAt?: { toDate: () => Date } | null;
  deliveryStatus?: "sending" | "failed";
};
export function DiscussWorkspace({
  companyId,
  userId,
  initialConversations,
  members,
  departments,
  isAdmin,
  initialConversationId,
  initialMessageId,
}: {
  companyId: string;
  userId: string;
  initialConversations: Conversation[];
  members: Member[];
  departments: Department[];
  isAdmin: boolean;
  initialConversationId?: string;
  initialMessageId?: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selected, setSelected] = useState(
    initialConversationId ||
      initialConversations.find((c) => c.name.toLowerCase() === "general")
        ?.id ||
      initialConversations[0]?.id ||
      "",
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [modal, setModal] = useState<"channel" | "dm" | null>(null);
  const [upload, setUpload] = useState<{
    name: string;
    url: string;
    type: string;
    size: number;
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const [listenerError, setListenerError] = useState("");
  const [mobileChat, setMobileChat] = useState(false);
  const [details, setDetails] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [composerEmojis, setComposerEmojis] = useState(false);
  const nonce = useRef(crypto.randomUUID());
  const bottom = useRef<HTMLDivElement>(null);
  const active = conversations.find((c) => c.id === selected);
  useEffect(() => {
    if (!selected || !clientDb) return;
    const q = query(
      collection(
        clientDb,
        "companies",
        companyId,
        "channels",
        selected,
        "messages",
      ),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    let polling: ReturnType<typeof setInterval> | undefined;
    const loadFromServer = () =>
      fetch(`/api/companies/${companyId}/discuss/${selected}/messages`)
        .then((response) => response.json().then((body) => ({ response, body })))
        .then(({ response, body }) => {
          if (!response.ok) throw new Error(body.error);
          setMessages(body.messages ?? []);
          setListenerError("");
        })
        .catch(() =>
          setListenerError("Messages could not be loaded. Please try again."),
        );
    const unsubscribe = onSnapshot(
      q,
      (s) => {
        setListenerError("");
        setMessages((current) =>
          s.docs
            .map((d) => {
              const previous = current.find((message) => message.id === d.id);
              return {
                id: d.id,
                ...d.data(),
                starred: previous?.starred,
                todoCreated: previous?.todoCreated,
              } as Message;
            })
            .reverse(),
        );
        setTimeout(() => bottom.current?.scrollIntoView(), 40);
      },
      (error) => {
        if (error.code === "permission-denied") {
          void loadFromServer();
          polling = setInterval(loadFromServer, 3000);
        } else setListenerError("The real-time message connection could not be opened.");
      },
    );
    return () => {
      unsubscribe();
      if (polling) clearInterval(polling);
    };
  }, [companyId, selected]);
  useEffect(() => {
    if (
      !initialMessageId ||
      !messages.some((message) => message.id === initialMessageId)
    )
      return;
    document
      .getElementById(`message-${initialMessageId}`)
      ?.scrollIntoView({ block: "center" });
  }, [initialMessageId, messages]);
  useEffect(() => {
    if (!selected) return;
    fetch(`/api/companies/${companyId}/discuss/${selected}/read`, {
      method: "PATCH",
    }).then(() =>
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selected
            ? {
                ...conversation,
                unreadBy: conversation.unreadBy?.filter((id) => id !== userId),
                unreadCount: 0,
              }
            : conversation,
        ),
      ),
    );
  }, [companyId, selected, userId, messages.length]);
  const filtered = useMemo(
    () =>
      conversations.filter((c) =>
        conversationName(c, members, userId)
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [conversations, members, search, userId],
  );
  async function send() {
    if ((!text.trim() && !upload) || !selected) return;
    const content = text;
    const attachment = upload;
    const clientNonce = nonce.current;
    const optimisticId = `pending_${clientNonce}`;
    const optimistic: Message = {
      id: optimisticId,
      content,
      attachment: attachment ?? undefined,
      parentMessageId: replyTo?.id ?? null,
      senderId: userId,
      senderName:
        members.find((member) => member.id === userId)?.displayName || "You",
      createdAt: { toDate: () => new Date() },
      reactions: {},
      deliveryStatus: "sending",
    };
    setMessages((current) => [...current, optimistic]);
    setText("");
    setUpload(null);
    setProgress(0);
    setReplyTo(null);
    nonce.current = crypto.randomUUID();
    setSending(true);
    const r = await fetch(
      `/api/companies/${companyId}/discuss/${selected}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          attachment,
          clientNonce,
          parentMessageId: optimistic.parentMessageId,
        }),
      },
    );
    if (r.ok) {
      const result = await r.json();
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId
            ? { ...message, id: result.id, deliveryStatus: undefined }
            : message,
        ),
      );
    } else {
      const result = await r.json();
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId
            ? { ...message, deliveryStatus: "failed" }
            : message,
        ),
      );
      setListenerError(result.error || "Could not send message");
    }
    setSending(false);
  }
  async function messageAction(
    message: Message,
    body: Record<string, unknown>,
  ) {
    const before = messages;
    if (body.action === "pin") {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, pinned: Boolean(body.pinned) }
            : item,
        ),
      );
    }
    if (body.action === "star") {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, starred: Boolean(body.starred) }
            : item,
        ),
      );
    }
    if (body.action === "react" && typeof body.reaction === "string") {
      setMessages((current) =>
        current.map((item) => {
          if (item.id !== message.id) return item;
          const reactions = { ...(item.reactions || {}) };
          const users = new Set(reactions[body.reaction as string] || []);
          if (users.has(userId)) users.delete(userId);
          else users.add(userId);
          reactions[body.reaction as string] = [...users];
          return { ...item, reactions };
        }),
      );
    }
    const response = await fetch(
      `/api/companies/${companyId}/discuss/${selected}/messages/${message.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      setMessages(before);
      const result = await response.json();
      setListenerError(result.error || "Message action failed");
    } else if (body.action === "createTodo") {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, todoCreated: true } : item,
        ),
      );
    }
  }
  async function filePicked(file?: File) {
    if (!file || !clientStorage) return;
    setProgress(1);
    const task = uploadBytesResumable(
      ref(
        clientStorage,
        `companies/${companyId}/files/discuss/${selected}/${crypto.randomUUID()}-${file.name}`,
      ),
      file,
    );
    task.on(
      "state_changed",
      (s) => setProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      () => setProgress(0),
      async () =>
        setUpload({
          name: file.name,
          url: await getDownloadURL(task.snapshot.ref),
          type: file.type,
          size: file.size,
        }),
    );
  }
  async function createConversation(payload: object) {
    const r = await fetch(`/api/companies/${companyId}/discuss`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (r.ok) {
      const next = [
        ...conversations.filter((c) => c.id !== j.conversation.id),
        j.conversation,
      ];
      setConversations(next);
      setSelected(j.conversation.id);
      setModal(null);
      setMobileChat(true);
    }
  }
  return (
    <div className="-m-4 flex h-[calc(100vh-68px)] overflow-hidden border-t border-[var(--border)] sm:-m-7 lg:-m-10">
      <aside
        className={`${mobileChat ? "hidden" : "flex"} w-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)] md:flex md:w-[310px]`}
      >
        <div className="border-b border-[var(--border)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold">Discuss</h1>
              <p className="text-xs muted">Company conversations</p>
            </div>
            <button
              className="btn btn-primary !p-2.5"
              onClick={() => setModal("dm")}
              title="New message"
            >
              <Plus size={18} />
            </button>
          </div>
          <WorkspaceEntityInput
            companyId={companyId}
            value={search}
            onChange={setSearch}
            placeholder="Search conversations"
            className="input mt-4 !py-0 text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <Section
            title="Channels"
            action={isAdmin ? () => setModal("channel") : undefined}
          />
          {filtered
            .filter((c) => !["dm", "group"].includes(c.type))
            .map((c) => (
              <ConversationRow
                key={c.id}
                c={c}
                active={selected === c.id}
                name={conversationName(c, members, userId)}
                onClick={() => {
                  setSelected(c.id);
                  setMobileChat(true);
                }}
                userId={userId}
              />
            ))}
          <Section title="Direct Messages" action={() => setModal("dm")} />
          {filtered
            .filter((c) => ["dm", "group"].includes(c.type))
            .map((c) => (
              <ConversationRow
                key={c.id}
                c={c}
                active={selected === c.id}
                name={conversationName(c, members, userId)}
                onClick={() => {
                  setSelected(c.id);
                  setMobileChat(true);
                }}
                userId={userId}
              />
            ))}
        </div>
      </aside>
      <section
        className={`${mobileChat ? "flex" : "hidden"} min-w-0 flex-1 flex-col bg-[var(--bg)] md:flex`}
      >
        {active ? (
          <>
            <header className="flex h-17 items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4">
              <button
                className="md:hidden"
                onClick={() => setMobileChat(false)}
              >
                <ArrowLeft />
              </button>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--soft)]">
                {["dm", "group"].includes(active.type) ? (
                  <MessageCircle size={18} />
                ) : (
                  <Hash size={18} />
                )}
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-bold">
                  {conversationName(active, members, userId)}
                </h2>
                <p className="text-xs muted">
                  {active.memberIds?.length || 0} members · {active.type}
                </p>
              </div>
              <div className="ml-auto flex gap-1">
                <CallLauncher
                  companyId={companyId}
                  conversationId={active.id}
                  title={conversationName(active, members, userId)}
                  type="audio"
                />
                <CallLauncher
                  companyId={companyId}
                  conversationId={active.id}
                  title={conversationName(active, members, userId)}
                  type="video"
                />
                <button
                  className="btn btn-secondary !p-2.5"
                  title="Conversation info"
                  onClick={() => setDetails((value) => !value)}
                >
                  <Info size={17} />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8">
              {listenerError && (
                <div className="mx-auto mb-5 max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">
                  {listenerError}
                </div>
              )}
              <ActiveMeetingCard
                companyId={companyId}
                conversationId={active.id}
                title={conversationName(active, members, userId)}
              />
              {messages.length ? (
                messages.map((m, i) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    mine={m.senderId === userId}
                    grouped={i > 0 && messages[i - 1].senderId === m.senderId}
                    parent={messages.find(
                      (candidate) => candidate.id === m.parentMessageId,
                    )}
                    onReply={() => setReplyTo(m)}
                    onAction={(body) => messageAction(m, body)}
                    highlighted={m.id === initialMessageId}
                  />
                ))
              ) : (
                <div className="grid h-full place-items-center text-center">
                  <div>
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--soft)]">
                      <MessageCircle />
                    </span>
                    <h3 className="mt-4 font-bold">Start the conversation</h3>
                    <p className="mt-1 text-sm muted">
                      Messages are private to authorized conversation members.
                    </p>
                  </div>
                </div>
              )}
              <div ref={bottom} />
            </div>
            <div className="border-t border-[var(--border)] bg-[var(--panel)] p-3 sm:p-4">
              {replyTo && (
                <div className="mb-2 flex items-center justify-between rounded-xl bg-[var(--soft)] px-3 py-2 text-sm">
                  <span className="truncate">
                    <b>Replying to {replyTo.senderName}</b> · {replyTo.content}
                  </span>
                  <button onClick={() => setReplyTo(null)}>
                    <X size={15} />
                  </button>
                </div>
              )}
              {upload && (
                <div className="mb-2 flex items-center justify-between rounded-xl bg-[var(--soft)] p-2 text-sm">
                  <span>📎 {upload.name}</span>
                  <button onClick={() => setUpload(null)}>
                    <X size={15} />
                  </button>
                </div>
              )}
              {progress > 0 && progress < 100 && (
                <div className="mb-2 h-1 rounded bg-[var(--soft)]">
                  <div
                    className="h-1 rounded bg-[var(--accent)]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              <div className="relative flex min-h-14 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5">
                <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl muted hover:bg-[var(--soft)]" title="Attach a file">
                  <Paperclip size={18} />
                  <input
                    className="hidden"
                    type="file"
                    onChange={(e) => filePicked(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl muted hover:bg-[var(--soft)]"
                  title="Choose emoji"
                  onClick={() => setComposerEmojis((open) => !open)}
                >
                  <Smile size={18} />
                </button>
                {composerEmojis && (
                  <EmojiPicker
                    className="bottom-16 left-2"
                    onChoose={(emoji) => {
                      setText((current) => current + emoji);
                      setComposerEmojis(false);
                    }}
                    close={() => setComposerEmojis(false)}
                  />
                )}
                <textarea
                  rows={1}
                  className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 leading-5 outline-none"
                  placeholder={`Message ${conversationName(active, members, userId)}`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button
                  disabled={sending || (!text.trim() && !upload)}
                  title="Send message"
                  className="btn btn-primary h-10 w-10 shrink-0 !p-0"
                  onClick={send}
                >
                  {sending ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center text-center">
            <div>
              <MessageCircle className="mx-auto muted" />
              <h2 className="mt-3 font-bold">No conversation selected</h2>
              <button
                className="btn btn-primary mt-4"
                onClick={() => setModal("dm")}
              >
                Start a conversation
              </button>
            </div>
          </div>
        )}
      </section>
      {details && active && (
        <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] p-5 xl:block">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Conversation details</h3>
            <button onClick={() => setDetails(false)}>
              <X size={17} />
            </button>
          </div>
          <p className="mt-2 text-sm leading-6 muted">
            {active.description || "No description"}
          </p>
          <h4 className="mt-6 text-xs font-bold uppercase tracking-wider muted">
            Members
          </h4>
          <div className="mt-2 space-y-2">
            {(active.memberIds || []).map((id) => {
              const member = members.find((candidate) => candidate.id === id);
              return (
                <div
                  key={id}
                  className="rounded-lg bg-[var(--soft)] px-3 py-2 text-sm"
                >
                  {member?.displayName || "Former user"}
                </div>
              );
            })}
          </div>
          <h4 className="mt-6 text-xs font-bold uppercase tracking-wider muted">
            Pinned messages
          </h4>
          <div className="mt-2 space-y-2">
            {messages
              .filter((message) => message.pinned)
              .map((message) => (
                <div
                  key={message.id}
                  className="rounded-lg border border-[var(--border)] p-3 text-sm"
                >
                  {message.content || "Attachment"}
                </div>
              ))}
            {!messages.some((message) => message.pinned) && (
              <p className="text-sm muted">No pinned messages.</p>
            )}
          </div>
          <h4 className="mt-6 text-xs font-bold uppercase tracking-wider muted">
            Files
          </h4>
          <div className="mt-2 space-y-2">
            {messages
              .filter((message) => message.attachment)
              .map((message) => (
                <a
                  key={message.id}
                  href={message.attachment!.url}
                  target="_blank"
                  className="block truncate rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--accent)]"
                >
                  {message.attachment!.name}
                </a>
              ))}
            {!messages.some((message) => message.attachment) && (
              <p className="text-sm muted">No files shared.</p>
            )}
          </div>
        </aside>
      )}
      {modal && (
        <ConversationModal
          mode={modal}
          members={members.filter((m) => m.id !== userId)}
          departments={departments}
          onClose={() => setModal(null)}
          onCreate={createConversation}
        />
      )}
    </div>
  );
}
function Section({ title, action }: { title: string; action?: () => void }) {
  return (
    <div className="mb-1 mt-3 flex items-center justify-between px-2">
      <b className="text-[11px] uppercase tracking-[.15em] muted">{title}</b>
      {action && (
        <button onClick={action}>
          <Plus size={15} />
        </button>
      )}
    </div>
  );
}
function ConversationRow({
  c,
  active,
  name,
  onClick,
  userId,
}: {
  c: Conversation;
  active: boolean;
  name: string;
  onClick: () => void;
  userId: string;
}) {
  const unread = c.unreadCount || (c.unreadBy?.includes(userId) ? 1 : 0);
  return (
    <button
      onClick={onClick}
      className={`my-1 flex w-full items-center gap-3 rounded-xl p-3 text-left ${active ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--soft)]"}`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-black/5">
        {["dm", "group"].includes(c.type) ? (
          <MessageCircle size={16} />
        ) : (
          <Hash size={16} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm">{name}</b>
        <small
          className={`block truncate ${active ? "text-white/65" : "muted"}`}
        >
          {c.lastMessage || c.description || "No messages yet"}
        </small>
      </span>
      {unread > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
function conversationName(c: Conversation, members: Member[], uid: string) {
  if (c.type !== "dm") return c.name;
  const other = c.memberIds?.find((x) => x !== uid);
  return members.find((m) => m.id === other)?.displayName || "Direct message";
}
function MessageBubble({
  message: m,
  mine,
  grouped,
  parent,
  onReply,
  onAction,
  highlighted,
}: {
  message: Message;
  mine: boolean;
  grouped: boolean;
  parent?: Message;
  onReply: () => void;
  onAction: (body: Record<string, unknown>) => void;
  highlighted: boolean;
}) {
  const [reactionPicker, setReactionPicker] = useState(false);
  return (
    <div
      id={`message-${m.id}`}
      className={`flex gap-3 rounded-lg transition ${grouped ? "mt-1" : "mt-5"} ${highlighted ? "bg-orange-500/10 ring-1 ring-orange-500/30" : ""}`}
    >
      <div className="w-9 shrink-0">
        {!grouped && (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">
            {m.senderName?.[0]?.toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          {!grouped && (
            <>
              <b className="text-sm">{m.senderName}</b>
              <small className="muted">
                {m.createdAt?.toDate?.().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            </>
          )}
        </div>
        {parent && (
          <div className="mt-1 border-l-2 border-[var(--accent)] pl-3 text-xs muted">
            <b>{parent.senderName}</b> · {parent.content || "Attachment"}
          </div>
        )}
        {m.deletedAt ? (
          <p className="mt-1 text-sm italic muted">This message was deleted.</p>
        ) : (
          m.content && (
            <p
              className={`mt-1 inline-block rounded-2xl px-4 py-2 text-sm leading-6 ${mine ? "bg-orange-500/10" : "bg-[var(--panel)]"}`}
            >
              {m.content}
              {m.editedAt && <small className="ml-2 muted">Edited</small>}
            </p>
          )
        )}
        {m.attachment && (
          <a
            className="mt-2 block rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-sm text-[var(--accent)]"
            href={m.attachment.url}
            target="_blank"
          >
            📎 {m.attachment.name}
          </a>
        )}
        {!m.deletedAt && (
          <div className="relative mt-1 flex flex-wrap items-center gap-1 opacity-70 hover:opacity-100">
            <button
              className="rounded p-1 hover:bg-[var(--soft)]"
              title="Reply"
              onClick={onReply}
            >
              <Reply size={14} />
            </button>
            <button
              className="rounded p-1 hover:bg-[var(--soft)]"
              title="React"
              onClick={() => setReactionPicker((open) => !open)}
            >
              <Smile size={14} />
            </button>
            <button
              className="rounded p-1 hover:bg-[var(--soft)]"
              title="Star for later"
              aria-pressed={Boolean(m.starred)}
              onClick={() => onAction({ action: "star", starred: !m.starred })}
            >
              <Star size={14} fill={m.starred ? "currentColor" : "none"} />
            </button>
            <button
              className="rounded p-1 hover:bg-[var(--soft)]"
              title="Pin"
              aria-pressed={Boolean(m.pinned)}
              onClick={() => onAction({ action: "pin", pinned: !m.pinned })}
            >
              <Pin size={14} fill={m.pinned ? "currentColor" : "none"} />
            </button>
            <button
              className="rounded p-1 hover:bg-[var(--soft)]"
              title="Create To-Do"
              disabled={m.todoCreated}
              onClick={() => onAction({ action: "createTodo" })}
            >
              <CheckSquare2 size={14} className={m.todoCreated ? "text-emerald-600" : ""} />
            </button>
            {reactionPicker && (
              <EmojiPicker
                className="left-7 top-7"
                onChoose={(emoji) => {
                  onAction({ action: "react", reaction: emoji });
                  setReactionPicker(false);
                }}
                close={() => setReactionPicker(false)}
              />
            )}
            {Object.entries(m.reactions || {}).map(([reaction, users]) =>
              users.length ? (
                <span
                  key={reaction}
                  className="rounded-full bg-[var(--soft)] px-2 py-0.5 text-xs"
                >
                  {reaction} {users.length}
                </span>
              ) : null,
            )}
          </div>
        )}
        {m.deliveryStatus && (
          <small
            className={m.deliveryStatus === "failed" ? "text-red-500" : "muted"}
          >
            {m.deliveryStatus === "failed" ? "Could not send" : "Sending…"}
          </small>
        )}
      </div>
    </div>
  );
}

const EMOJI_GROUPS = [
  ["Smileys", "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕"],
  ["Gestures", "👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 👏 🙌 👐 🤲 🙏 ✍️ 💪 🦾 🫶 🫰"],
  ["People", "👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👮 👷 💂 🕵️ 👩‍⚕️ 👨‍🎓 👩‍🏫 👨‍💻 👩‍💼 👨‍🔧 👩‍🔬 👨‍🎨 👩‍🚒 👨‍✈️ 👩‍🚀"],
  ["Objects", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ⭐ 🌟 ✨ ⚡ 🔥 💥 🎉 🎊 ✅ ❌ ❓ ❗ 💡 📌 📍 📎 📝 📅 📞 💬 📢 🔔 🎯 🏆 🎁 🚀"],
  ["Nature", "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦄 🐝 🦋 🌸 🌹 🌻 🌞 🌈 ☀️ 🌙 ⛄ 🌊"],
  ["Food", "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🍕 🍔 🍟 🌭 🍿 🍩 🍪 🎂 🍰 ☕ 🍵 🥤 🍺 🥂"],
] as const;

function EmojiPicker({
  onChoose,
  close,
  className,
}: {
  onChoose: (emoji: string) => void;
  close: () => void;
  className: string;
}) {
  return (
    <div className={`absolute z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-2xl ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <b className="text-sm">Choose an emoji</b>
        <button type="button" onClick={close} className="rounded p-1 hover:bg-[var(--soft)]"><X size={15} /></button>
      </div>
      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
        {EMOJI_GROUPS.map(([label, emojiLine]) => (
          <section key={label}>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider muted">{label}</p>
            <div className="grid grid-cols-8 gap-1">
              {emojiLine.split(" ").map((emoji, index) => (
                <button type="button" title={emoji} key={`${label}-${index}`} onClick={() => onChoose(emoji)} className="grid h-8 w-8 place-items-center rounded text-lg hover:bg-[var(--soft)]">{emoji}</button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
function ConversationModal({
  mode,
  members,
  departments,
  onClose,
  onCreate,
}: {
  mode: "channel" | "dm";
  members: Member[];
  departments: Department[];
  onClose: () => void;
  onCreate: (x: object) => void;
}) {
  const [q, setQ] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="panel w-full max-w-lg p-6">
        <div className="flex justify-between">
          <h2 className="text-xl font-extrabold">
            {mode === "dm" ? "New direct message" : "Create channel"}
          </h2>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        {mode === "dm" ? (
          <>
            <input
              className="input mt-5"
              placeholder="Search employees"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="mt-3 max-h-72 overflow-auto">
              {members
                .filter((m) =>
                  (m.displayName + m.email)
                    .toLowerCase()
                    .includes(q.toLowerCase()),
                )
                .map((m) => (
                  <label
                    className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[var(--soft)]"
                    key={m.id}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(m.id)}
                      onChange={(event) =>
                        setSelectedMembers((current) =>
                          event.target.checked
                            ? [...current, m.id]
                            : current.filter((id) => id !== m.id),
                        )
                      }
                    />
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] font-bold text-white">
                      {m.displayName[0]}
                    </span>
                    <span>
                      <b className="block text-sm">{m.displayName}</b>
                      <small className="muted">{m.email}</small>
                    </span>
                  </label>
                ))}
            </div>
            {selectedMembers.length > 1 && (
              <input
                className="input mt-3"
                placeholder="Group conversation name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              />
            )}
            <button
              className="btn btn-primary mt-4 w-full"
              disabled={
                !selectedMembers.length ||
                (selectedMembers.length > 1 && groupName.trim().length < 2)
              }
              onClick={() =>
                selectedMembers.length === 1
                  ? onCreate({ kind: "dm", targetUserId: selectedMembers[0] })
                  : onCreate({
                      kind: "group",
                      name: groupName,
                      description: "",
                      memberIds: selectedMembers,
                    })
              }
            >
              {selectedMembers.length > 1
                ? "Create group conversation"
                : "Open conversation"}
            </button>
          </>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onCreate({
                kind: "channel",
                name: f.get("name"),
                description: f.get("description"),
                type: f.get("type"),
                departmentId: f.get("departmentId"),
                projectId: "",
                memberIds: f.getAll("memberIds"),
              });
            }}
          >
            <label>
              <span className="label">Channel name</span>
              <input className="input" name="name" required />
            </label>
            <label>
              <span className="label">Description</span>
              <textarea className="input" name="description" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="label">Type</span>
                <select className="input" name="type">
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="department">Department</option>
                  <option value="project">Project</option>
                </select>
              </label>
              <label>
                <span className="label">Department</span>
                <select className="input" name="departmentId">
                  <option value="">None</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset>
              <legend className="label">Members</legend>
              <div className="max-h-32 overflow-auto rounded-xl border border-[var(--border)] p-3">
                {members.map((m) => (
                  <label className="flex gap-2 py-1 text-sm" key={m.id}>
                    <input type="checkbox" name="memberIds" value={m.id} />
                    {m.displayName}
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="btn btn-primary w-full">Create channel</button>
          </form>
        )}
      </div>
    </div>
  );
}
