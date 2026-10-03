export type StageType = "OPEN" | "WON" | "LOST";

export function opportunityStatus(stageType: StageType) {
  if (stageType === "WON") return "won" as const;
  if (stageType === "LOST") return "lost" as const;
  return "open" as const;
}

export function relatedCollection(type: string) {
  return {
    lead: "crmLeads",
    contact: "contacts",
    organization: "contacts",
    opportunity: "crmOpportunities",
  }[type];
}

export function linkedModule(type: string) {
  if (["meeting", "call"].includes(type)) return "calendar" as const;
  if (["task", "follow-up"].includes(type)) return "todo" as const;
  return null;
}

export function crmEntityType(section: string) {
  return {
    leads: "lead",
    contacts: "contact",
    organizations: "organization",
    opportunities: "opportunity",
    activities: "activity",
    pipelines: "pipeline",
  }[section];
}
