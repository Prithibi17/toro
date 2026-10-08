import "server-only";

export type IdFinderProfile = {
  id: string;
  identifier: string;
  fullName: string;
  personType?: string;
  designation?: string;
  department?: string;
  status?: string;
  avatarUrl?: string | null;
  companyEmail?: string | null;
  workLocation?: string | null;
};

export type IdFinderConnection = IdFinderProfile & {
  cardNumber?: string;
  connectedAt?: string;
  connectedBy?: string;
};

const baseUrl = () =>
  (process.env.ID_FINDER_BASE_URL ||
    "https://go-repireo-employee-management.vercel.app").replace(/\/$/, "");

function apiKey() {
  const value = process.env.ID_FINDER_API_KEY?.trim();
  if (!value) throw new Error("ID Finder is not configured");
  return value;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function departmentName(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object")
    return text((value as Record<string, unknown>).name);
  return undefined;
}

function normalizePerson(value: unknown): IdFinderProfile | null {
  if (!value || typeof value !== "object") return null;
  const person = value as Record<string, unknown>;
  const id = text(person.id);
  const identifier = text(person.person_code) || text(person.identifier);
  const fullName = text(person.full_name) || text(person.name);
  if (!id || !identifier || !fullName) return null;
  return {
    id,
    identifier,
    fullName,
    personType: text(person.person_type),
    designation: text(person.designation),
    department: departmentName(person.department),
    status: text(person.status),
    avatarUrl: text(person.avatar_url) ?? null,
    companyEmail: text(person.company_email) ?? null,
    workLocation: text(person.work_location) ?? null,
  };
}

async function idFinderFetch(path: string, authenticated = false) {
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: authenticated
      ? { "X-API-Key": apiKey(), Authorization: `Bearer ${apiKey()}` }
      : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok)
    throw new Error(`ID Finder returned HTTP ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

export async function searchIdFinderPeople(query: string) {
  const payload = await idFinderFetch("/api/people", true);
  const people = Array.isArray(payload.people) ? payload.people : [];
  const term = query.trim().toLowerCase();
  return people
    .map(normalizePerson)
    .filter((person): person is IdFinderProfile => Boolean(person))
    .filter((person) =>
      [
        person.fullName,
        person.identifier,
        person.designation,
        person.department,
        person.companyEmail,
      ].some((value) => value?.toLowerCase().includes(term)),
    )
    .slice(0, 25);
}

export async function getIdFinderConnection(identifier: string) {
  const payload = await idFinderFetch(
    `/api/public/cards/${encodeURIComponent(identifier)}`,
  );
  if (payload.found !== true) throw new Error("ID Finder profile was not found");
  const profile = normalizePerson(payload.person);
  if (!profile) throw new Error("ID Finder returned an invalid profile");
  const card =
    payload.card && typeof payload.card === "object"
      ? (payload.card as Record<string, unknown>)
      : {};
  return {
    ...profile,
    cardNumber: text(card.card_number),
  } satisfies IdFinderConnection;
}

export function idFinderEmbedUrl(identifier: string) {
  return `${baseUrl()}/embed/id-card/${encodeURIComponent(identifier)}`;
}
