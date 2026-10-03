import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { getAdmin } from "@/lib/firebase-admin";
import { BriefcaseBusiness, CalendarDays, ChevronLeft } from "lucide-react";

const date = (v: unknown) =>
  v && typeof v === "object" && "toDate" in v
    ? (v as { toDate(): Date }).toDate().toISOString()
    : v;
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string; contactId: string }>;
}) {
  const { companyId, contactId } = await params,
    ctx = await requireMembership(companyId);
  if (!ctx || !ctx.membership.enabledModules?.includes("contacts")) notFound();
  const db = getAdmin().db,
    doc = await db.doc(`companies/${companyId}/contacts/${contactId}`).get();
  if (!doc.exists) notFound();
  const contact = { id: doc.id, ...doc.data() } as Record<string, unknown> & {
    id: string;
  };
  const [opportunities, meetings, related, timeline, activities, addresses] =
    await Promise.all([
      db
        .collection(`companies/${companyId}/crmOpportunities`)
        .where("customerId", "==", contactId)
        .limit(200)
        .get(),
      db
        .collection(`companies/${companyId}/calendarEvents`)
        .where("relatedId", "==", contactId)
        .limit(100)
        .get(),
      db
        .collection(`companies/${companyId}/contacts`)
        .where("parentContactId", "==", contactId)
        .limit(100)
        .get(),
      db
        .collection(`companies/${companyId}/crmTimeline`)
        .where("entityId", "==", contactId)
        .limit(100)
        .get(),
      db
        .collection(`companies/${companyId}/crmActivities`)
        .where("relatedId", "==", contactId)
        .limit(100)
        .get(),
      doc.ref.collection("addresses").limit(50).get(),
    ]);
  const pipelineValue = opportunities.docs.reduce(
    (n, d) => n + Number(d.data().value || 0),
    0,
  );
  return (
    <>
      <div className="mb-5">
        <Link
          href={`/workspace/${companyId}/contacts`}
          className="flex items-center gap-1 text-sm text-[var(--accent)]"
        >
          <ChevronLeft size={15} />
          Contacts
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold">
          {String(
            contact.displayName ?? contact.title ?? contact.name ?? "Contact",
          )}
        </h1>
        <p className="mt-1 muted capitalize">
          {String(contact.contactType ?? contact.status ?? "business contact")}
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <main className="space-y-5">
          <section className="panel p-6">
            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <Link
                href={`/workspace/${companyId}/crm?customerId=${contactId}`}
                className="rounded-xl bg-[var(--soft)] p-4"
              >
                <div className="flex items-center gap-2">
                  <BriefcaseBusiness size={17} />
                  <b>Opportunities</b>
                </div>
                <p className="mt-2 text-2xl font-extrabold">
                  {opportunities.size}
                </p>
                <p className="text-xs muted">
                  {pipelineValue.toLocaleString()} pipeline value
                </p>
              </Link>
              <div className="rounded-xl bg-[var(--soft)] p-4">
                <div className="flex items-center gap-2">
                  <CalendarDays size={17} />
                  <b>Meetings</b>
                </div>
                <p className="mt-2 text-2xl font-extrabold">{meetings.size}</p>
              </div>
            </div>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Info label="Email" value={contact.email ?? contact.subtitle} />
              <Info label="Phone" value={contact.phone} />
              <Info label="Website" value={contact.website} />
              <Info label="Industry" value={contact.industry} />
              <Info label="Address" value={contact.address} />
              <Info label="Account owner" value={contact.ownerName} />
            </div>
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <h2 className="font-bold">Addresses</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {addresses.docs.map((address) => (
                  <div
                    key={address.id}
                    className="rounded-xl bg-[var(--soft)] p-3"
                  >
                    <b className="capitalize">
                      {String(address.data().label || address.data().type)}
                    </b>
                    <p className="mt-1 text-sm muted">
                      {[
                        address.data().street,
                        address.data().city,
                        address.data().state,
                        address.data().postalCode,
                        address.data().country,
                      ]
                        .filter(Boolean)
                        .join(", ") || "No address details"}
                    </p>
                  </div>
                ))}
                {addresses.empty ? (
                  <p className="text-sm muted">No structured addresses.</p>
                ) : null}
              </div>
            </div>
          </section>
          <section className="panel p-6">
            <h2 className="font-bold">Related contacts</h2>
            <div className="mt-4 space-y-2">
              {related.docs.map((d) => (
                <Link
                  key={d.id}
                  href={`/workspace/${companyId}/contacts/${d.id}`}
                  className="block rounded-xl bg-[var(--soft)] p-3"
                >
                  <b>{String(d.data().title ?? d.data().name)}</b>
                  <p className="text-sm muted">
                    {String(d.data().jobTitle ?? d.data().subtitle ?? "")}
                  </p>
                </Link>
              ))}
              {related.empty ? (
                <p className="text-sm muted">No related contacts.</p>
              ) : null}
            </div>
          </section>
        </main>
        <aside className="panel p-5">
          <h2 className="font-bold">Chatter</h2>
          <div className="mt-4 space-y-3">
            {activities.docs.map((d) => (
              <article key={d.id} className="rounded-xl bg-[var(--soft)] p-3">
                <b>{String(d.data().title ?? d.data().type)}</b>
                <p className="mt-1 text-sm muted">
                  {String(d.data().description ?? "")}
                </p>
                <p className="mt-2 text-xs muted">
                  {String(date(d.data().dueAt) ?? "")}
                </p>
              </article>
            ))}
            {timeline.docs.map((d) => (
              <article key={d.id} className="rounded-xl bg-[var(--soft)] p-3">
                <b className="capitalize">
                  {String(d.data().eventType ?? "Update").replaceAll("_", " ")}
                </b>
                <p className="mt-2 text-xs muted">
                  {String(date(d.data().timestamp) ?? "")}
                </p>
              </article>
            ))}
            {timeline.empty && activities.empty ? (
              <p className="text-sm muted">No contact activity yet.</p>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider muted">
        {label}
      </p>
      <p className="mt-1 font-semibold">{String(value || "—")}</p>
    </div>
  );
}
