import { NextResponse } from "next/server";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { crmAllowed } from "@/lib/crm-server";
import { getAdmin } from "@/lib/firebase-admin";

function rank(value: string, query: string) {
  const text = value.toLocaleLowerCase();
  if (!query) return 0;
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  if (text.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  return text.includes(query) ? 3 : 99;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId, { module: "todo" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );

  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .toLocaleLowerCase()
    .slice(0, 80);
  const db = getAdmin().db;
  const [members, contacts, tags] = await Promise.all([
    db
      .collection(`companies/${companyId}/members`)
      .where("status", "==", "active")
      .limit(100)
      .get(),
    db.collection(`companies/${companyId}/contacts`).limit(150).get(),
    db.collection(`companies/${companyId}/crmTags`).limit(100).get(),
  ]);
  const take = (
    entries: Array<{
      id: string;
      label: string;
      subtitle?: string;
      entityType: "member" | "contact" | "company" | "tag";
    }>,
  ) =>
    entries
      .map((entry) => ({
        ...entry,
        score: Math.min(
          rank(entry.label, query),
          rank(entry.subtitle ?? "", query),
        ),
      }))
      .filter((entry) => entry.label && entry.score < 99)
      .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
      .slice(0, 6)
      .map((entry) => ({
        entityId: entry.id,
        label: entry.label,
        subtitle: entry.subtitle,
        entityType: entry.entityType,
      }));

  const visibleContacts = contacts.docs.filter(
    (doc) =>
      doc.data().archived !== true &&
      crmAllowed(auth.access, "contacts", "view", doc.data()),
  );
  return NextResponse.json({
    groups: {
      people: take(
        members.docs.map((doc) => ({
          id: doc.id,
          label: String(doc.data().displayName ?? doc.data().email ?? "Member"),
          subtitle: String(
            doc.data().jobTitle ??
              doc.data().departmentName ??
              doc.data().email ??
              "",
          ),
          entityType: "member" as const,
        })),
      ),
      contacts: take(
        visibleContacts
          .filter((doc) => doc.data().contactType !== "company")
          .map((doc) => ({
            id: doc.id,
            label: String(
              doc.data().displayName ??
                doc.data().name ??
                doc.data().title ??
                "",
            ),
            subtitle: String(doc.data().email ?? doc.data().companyName ?? ""),
            entityType: "contact" as const,
          })),
      ),
      companies: take(
        visibleContacts
          .filter((doc) => doc.data().contactType === "company")
          .map((doc) => ({
            id: doc.id,
            label: String(
              doc.data().displayName ??
                doc.data().name ??
                doc.data().title ??
                "",
            ),
            subtitle: String(doc.data().city ?? doc.data().email ?? ""),
            entityType: "company" as const,
          })),
      ),
      tags: take(
        tags.docs
          .filter((doc) => doc.data().active !== false)
          .map((doc) => ({
            id: doc.id,
            label: String(doc.data().name ?? ""),
            entityType: "tag" as const,
          })),
      ),
    },
  });
}
