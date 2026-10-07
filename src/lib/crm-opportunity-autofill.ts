export type OpportunityContact = {
  id: string;
  displayName?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  mobile?: unknown;
  contactType?: unknown;
  tags?: unknown;
  address?: {
    city?: unknown;
    country?: unknown;
  } | null;
};

export type OpportunityDraft = {
  name: string;
  customerId: string;
  ownerId: string;
  value: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  tags: string[];
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export function blankOpportunityDraft(ownerId = ""): OpportunityDraft {
  return {
    name: "",
    customerId: "",
    ownerId,
    value: "0",
    email: "",
    phone: "",
    city: "",
    country: "",
    tags: [],
  };
}

export function autofillOpportunityFromContact(
  current: OpportunityDraft,
  contact: OpportunityContact | undefined,
): OpportunityDraft {
  if (!contact)
    return {
      ...current,
      customerId: "",
      email: "",
      phone: "",
      city: "",
      country: "",
      tags: [],
    };

  return {
    ...current,
    customerId: contact.id,
    email: text(contact.email),
    phone: text(contact.phone) || text(contact.mobile),
    city: text(contact.address?.city),
    country: text(contact.address?.country),
    tags: Array.isArray(contact.tags)
      ? contact.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
  };
}
