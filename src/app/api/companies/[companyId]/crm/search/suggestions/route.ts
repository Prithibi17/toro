import { NextResponse } from "next/server";
import {
  crmAccess,
  crmAllowed,
  crmError,
  crmReadable,
  plainDoc,
} from "@/lib/crm-server";
import { getAdmin } from "@/lib/firebase-admin";
function rank(name: string, q: string) {
  const value = name.toLowerCase(),
    words = value.split(/\s+/);
  return value === q
    ? 0
    : value.startsWith(q)
      ? 1
      : words.some((word) => word.startsWith(q))
        ? 2
        : value.includes(q)
          ? 3
          : 99;
}
export async function GET(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params,
      access = await crmAccess(companyId),
      q = (new URL(req.url).searchParams.get("q") ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 80),
      db = getAdmin().db;
    const [tags, contacts, members] = await Promise.all([
      db.collection(`companies/${companyId}/crmTags`).limit(100).get(),
      db.collection(`companies/${companyId}/contacts`).limit(150).get(),
      db
        .collection(`companies/${companyId}/members`)
        .where("status", "==", "active")
        .limit(100)
        .get(),
    ]);
    const take = (
      items: Array<{
        id: string;
        name: string;
        subtitle?: string;
        type: string;
      }>,
    ) =>
      items
        .map((item) => ({ ...item, score: rank(item.name, q) }))
        .filter((item) => !q || item.score < 99)
        .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          name: item.name,
          subtitle: item.subtitle,
          type: item.type,
        }));
    const visibleContacts = contacts.docs
      .filter(
        (doc) =>
          doc.data().archived !== true &&
          crmAllowed(access, "contacts", "view", doc.data()),
      )
      .map((doc) => crmReadable(access, plainDoc(doc), "contacts.contact"));
    return NextResponse.json({
      groups: {
        tags: take(
          tags.docs
            .filter((doc) => doc.data().active !== false)
            .map((doc) => ({
              id: doc.id,
              name: String(doc.data().name ?? ""),
              type: "tag",
            })),
        ),
        contacts: take(
          visibleContacts
            .filter((item) => item.contactType !== "company")
            .map((item) => ({
              id: item.id,
              name: String(item.displayName ?? item.title ?? item.name ?? ""),
              subtitle: String(item.email ?? ""),
              type: "contact",
            })),
        ),
        companies: take(
          visibleContacts
            .filter((item) => item.contactType === "company")
            .map((item) => ({
              id: item.id,
              name: String(item.displayName ?? item.title ?? item.name ?? ""),
              subtitle: String(item.email ?? ""),
              type: "company",
            })),
        ),
        people: take(
          members.docs.map((doc) => ({
            id: doc.id,
            name: String(
              doc.data().displayName ?? doc.data().email ?? "Member",
            ),
            subtitle: String(doc.data().email ?? ""),
            type: "salesperson",
          })),
        ),
      },
    });
  } catch (error) {
    return crmError(error);
  }
}
