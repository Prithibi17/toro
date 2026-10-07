export type OpportunityContact = {
  id: string;
  displayName?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  mobile?: unknown;
};

export type OpportunityDraft = {
  name: string;
  customerId: string;
  ownerId: string;
  value: string;
  email: string;
  phone: string;
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
    };

  return {
    ...current,
    customerId: contact.id,
    email: text(contact.email),
    phone: text(contact.phone) || text(contact.mobile),
  };
}
