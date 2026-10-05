"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Hash, UserRound } from "lucide-react";

export type TodoMention = {
  entityType: "member" | "contact" | "company" | "tag";
  entityId: string;
  label: string;
};
type Suggestion = TodoMention & { subtitle?: string };
type Groups = Record<
  "people" | "contacts" | "companies" | "tags",
  Suggestion[]
>;
const emptyGroups: Groups = {
  people: [],
  contacts: [],
  companies: [],
  tags: [],
};

function mentionHref(companyId: string, mention: TodoMention) {
  if (mention.entityType === "contact" || mention.entityType === "company")
    return `/workspace/${companyId}/contacts/${mention.entityId}`;
  if (mention.entityType === "member")
    return `/workspace/${companyId}/employees`;
  return `/workspace/${companyId}/contacts?tag=${mention.entityId}`;
}

export function TodoDescriptionEditor({
  companyId,
  value,
  mentions,
  onCommit,
}: {
  companyId: string;
  value: string;
  mentions: TodoMention[];
  onCommit: (description: string, references: TodoMention[]) => Promise<void>;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const queryRange = useRef<Range | null>(null);
  const [groups, setGroups] = useState<Groups>(emptyGroups);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ left: 12, top: 48 });
  const suggestions = Object.values(groups).flat();

  useEffect(() => {
    const root = editor.current;
    if (!root) return;
    root.replaceChildren();
    let cursor = 0;
    const sorted = [...mentions]
      .map((mention) => ({
        mention,
        index: value.indexOf(`@${mention.label}`, cursor),
      }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => a.index - b.index);
    for (const { mention, index } of sorted) {
      root.append(document.createTextNode(value.slice(cursor, index)));
      const token = document.createElement("a");
      token.textContent = `@${mention.label}`;
      token.href = mentionHref(companyId, mention);
      token.dataset.mentionType = mention.entityType;
      token.dataset.mentionId = mention.entityId;
      token.dataset.mentionLabel = mention.label;
      token.contentEditable = "false";
      token.className =
        "rounded bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-0.5 font-semibold text-[var(--accent)]";
      root.append(token);
      cursor = index + mention.label.length + 1;
    }
    root.append(document.createTextNode(value.slice(cursor)));
  }, [companyId, mentions, value]);

  function currentReferences() {
    return Array.from(
      editor.current?.querySelectorAll<HTMLElement>("[data-mention-id]") ?? [],
    ).map((node) => ({
      entityType: node.dataset.mentionType as TodoMention["entityType"],
      entityId: String(node.dataset.mentionId),
      label: String(node.dataset.mentionLabel),
    }));
  }

  async function commit() {
    const root = editor.current;
    if (!root) return;
    const description = root.innerText.replace(/\u00a0/g, " ").slice(0, 4000);
    if (
      description === value &&
      JSON.stringify(currentReferences()) === JSON.stringify(mentions)
    )
      return;
    setSaving(true);
    await onCommit(description, currentReferences());
    setSaving(false);
  }

  function detectMention() {
    const root = editor.current;
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount || !selection.isCollapsed) {
      setOpen(false);
      return;
    }
    const caret = selection.getRangeAt(0);
    if (!root.contains(caret.startContainer)) return;
    const before = caret.cloneRange();
    before.selectNodeContents(root);
    before.setEnd(caret.startContainer, caret.startOffset);
    const match = before.toString().match(/(?:^|\s)@([^\s@]{0,80})$/);
    if (!match) {
      setOpen(false);
      return;
    }
    const replacement = caret.cloneRange();
    replacement.setStart(
      caret.startContainer,
      caret.startOffset - match[1].length - 1,
    );
    queryRange.current = replacement;
    const caretRect = caret.getBoundingClientRect();
    const editorRect = root.getBoundingClientRect();
    setPopupPosition({
      left: Math.max(
        12,
        Math.min(caretRect.left - editorRect.left, editorRect.width - 300),
      ),
      top: Math.max(48, caretRect.bottom - editorRect.top + 8),
    });
    const query = match[1];
    fetch(
      `/api/companies/${companyId}/tasks/mentions?q=${encodeURIComponent(query)}`,
    )
      .then((response) => response.json())
      .then((result) => {
        const nextGroups = (result.groups ?? emptyGroups) as Groups;
        setGroups(
          Object.fromEntries(
            Object.entries(nextGroups).map(([group, items]) => [
              group,
              Array.isArray(items)
                ? items.filter(
                    (item) =>
                      Boolean(item.entityId) &&
                      Boolean(item.label) &&
                      Boolean(item.entityType),
                  )
                : [],
            ]),
          ) as Groups,
        );
        setActive(0);
        setOpen(true);
      })
      .catch(() => setOpen(false));
  }

  function insertMention(suggestion: Suggestion) {
    const range = queryRange.current;
    if (!range) return;
    range.deleteContents();
    const token = document.createElement("a");
    token.textContent = `@${suggestion.label}`;
    token.href = mentionHref(companyId, suggestion);
    token.dataset.mentionType = suggestion.entityType;
    token.dataset.mentionId = suggestion.entityId;
    token.dataset.mentionLabel = suggestion.label;
    token.contentEditable = "false";
    token.className =
      "rounded bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-0.5 font-semibold text-[var(--accent)]";
    const space = document.createTextNode("\u00a0");
    range.insertNode(space);
    range.insertNode(token);
    range.setStartAfter(space);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    setOpen(false);
    editor.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!open || !suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) =>
        event.key === "ArrowDown"
          ? (index + 1) % suggestions.length
          : (index - 1 + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertMention(suggestions[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  let suggestionIndex = 0;
  return (
    <div className="relative">
      <div
        ref={editor}
        className="input min-h-48 whitespace-pre-wrap leading-7"
        contentEditable
        role="textbox"
        aria-label="Description"
        aria-multiline="true"
        suppressContentEditableWarning
        onInput={detectMention}
        onKeyUp={(event) => {
          if (event.key === "@" || event.key === "Backspace") detectMention();
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          window.setTimeout(() => {
            if (!editor.current?.contains(document.activeElement))
              void commit();
          }, 100);
        }}
      />
      {saving && (
        <span className="absolute right-3 top-3 text-xs muted">Saving…</span>
      )}
      {open && (
        <div
          className="absolute z-40 max-h-80 w-[min(28rem,calc(100%-1.5rem))] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-2xl"
          style={popupPosition}
          onMouseDown={(event) => event.preventDefault()}
        >
          {(Object.entries(groups) as Array<[keyof Groups, Suggestion[]]>).map(
            ([group, items]) => {
              if (!items.length) return null;
              return (
                <section key={group}>
                  <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider muted">
                    {group}
                  </p>
                  {items.map((item) => {
                    const index = suggestionIndex++;
                    const Icon =
                      item.entityType === "tag"
                        ? Hash
                        : item.entityType === "company"
                          ? Building2
                          : UserRound;
                    return (
                      <button
                        type="button"
                        key={`${group}-${item.entityType}-${item.entityId}`}
                        className={`flex w-full items-center gap-3 rounded-lg p-2 text-left ${index === active ? "bg-[var(--soft)]" : ""}`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => insertMention(item)}
                      >
                        <Icon size={17} className="text-[var(--accent)]" />
                        <span className="min-w-0">
                          <b className="block truncate text-sm">{item.label}</b>
                          {item.subtitle && (
                            <small className="block truncate muted">
                              {item.subtitle}
                            </small>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </section>
              );
            },
          )}
          {!suggestions.length && (
            <p className="p-4 text-center text-sm muted">
              No matching references
            </p>
          )}
        </div>
      )}
    </div>
  );
}
