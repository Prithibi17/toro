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
  Plus,
  Search,
  Send,
  Smile,
  X,
} from "lucide-react";
import { clientDb, clientStorage } from "@/lib/firebase-client";
import { CallLauncher } from "./call-launcher";
import { ActiveMeetingCard } from "./active-meeting-card";
type Conversation = {
  id: string;
  name: string;
  description?: string;
  type: string;
  memberIds?: string[];
  lastMessage?: string;
  unreadBy?: string[];
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
};
export function DiscussWorkspace({
  companyId,
  userId,
  initialConversations,
  members,
  departments,
  isAdmin,
}: {
  companyId: string;
  userId: string;
  initialConversations: Conversation[];
  members: Member[];
  departments: Department[];
  isAdmin: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selected, setSelected] = useState(
    initialConversations.find((c) => c.name.toLowerCase() === "general")?.id ||
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
    return onSnapshot(
      q,
      (s) => {
        setListenerError("");
        setMessages(
          s.docs.map((d) => ({ id: d.id, ...d.data() }) as Message).reverse(),
        );
        setTimeout(() => bottom.current?.scrollIntoView(), 40);
      },
      (error) => {
        setMessages([]);
        setListenerError(
          error.code === "permission-denied"
            ? "Real-time messages are blocked by the currently deployed Firestore rules. Ask a Firebase project owner to publish the repository rules."
            : "The real-time message connection could not be opened.",
        );
      },
    );
  }, [companyId, selected]);
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
    setSending(true);
    const r = await fetch(
      `/api/companies/${companyId}/discuss/${selected}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text, attachment: upload }),
      },
    );
    if (r.ok) {
      setText("");
      setUpload(null);
      setProgress(0);
    }
    setSending(false);
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
          <div className="relative mt-4">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 muted"
            />
            <input
              className="input !py-2 !pl-9 text-sm"
              placeholder="Search conversations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <Section
            title="Channels"
            action={isAdmin ? () => setModal("channel") : undefined}
          />
          {filtered
            .filter((c) => c.type !== "dm")
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
            .filter((c) => c.type === "dm")
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
                {active.type === "dm" ? (
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
                <CallLauncher companyId={companyId} conversationId={active.id} title={conversationName(active,members,userId)} type="audio" />
                <CallLauncher companyId={companyId} conversationId={active.id} title={conversationName(active,members,userId)} type="video" />
                <button
                  className="btn btn-secondary !p-2.5"
                  title="Conversation info"
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
              <ActiveMeetingCard companyId={companyId} conversationId={active.id} title={conversationName(active,members,userId)} />
              {messages.length ? (
                messages.map((m, i) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    mine={m.senderId === userId}
                    grouped={i > 0 && messages[i - 1].senderId === m.senderId}
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
              <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-2">
                <label className="btn !p-2 muted">
                  <Paperclip size={18} />
                  <input
                    className="hidden"
                    type="file"
                    onChange={(e) => filePicked(e.target.files?.[0])}
                  />
                </label>
                <button
                  className="btn !p-2 muted"
                  onClick={() => setText((x) => x + " 🙂")}
                >
                  <Smile size={18} />
                </button>
                <textarea
                  className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none"
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
                  className="btn btn-primary !p-2.5"
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
  const unread = c.unreadBy?.includes(userId);
  return (
    <button
      onClick={onClick}
      className={`my-1 flex w-full items-center gap-3 rounded-xl p-3 text-left ${active ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--soft)]"}`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-black/5">
        {c.type === "dm" ? <MessageCircle size={16} /> : <Hash size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm">{name}</b>
        <small
          className={`block truncate ${active ? "text-white/65" : "muted"}`}
        >
          {c.lastMessage || c.description || "No messages yet"}
        </small>
      </span>
      {unread && <i className="h-2.5 w-2.5 rounded-full bg-orange-400" />}
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
}: {
  message: Message;
  mine: boolean;
  grouped: boolean;
}) {
  return (
    <div className={`flex gap-3 ${grouped ? "mt-1" : "mt-5"}`}>
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
        {m.content && (
          <p
            className={`mt-1 inline-block rounded-2xl px-4 py-2 text-sm leading-6 ${mine ? "bg-orange-500/10" : "bg-[var(--panel)]"}`}
          >
            {m.content}
          </p>
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
                  <button
                    className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[var(--soft)]"
                    key={m.id}
                    onClick={() => onCreate({ kind: "dm", targetUserId: m.id })}
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] font-bold text-white">
                      {m.displayName[0]}
                    </span>
                    <span>
                      <b className="block text-sm">{m.displayName}</b>
                      <small className="muted">{m.email}</small>
                    </span>
                  </button>
                ))}
            </div>
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
