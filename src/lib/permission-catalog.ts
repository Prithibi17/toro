import type { Membership } from "./types";

export type SimplePermission = {
  key: string;
  group: string;
  label: string;
  description: string;
  app?: string;
  protected?: boolean;
};

export const SIMPLE_PERMISSIONS: SimplePermission[] = [
  {
    key: "crm.opportunity.company_view",
    group: "CRM",
    label: "See all CRM opportunities",
    description: "View opportunities beyond records assigned to this person.",
    app: "crm",
  },
  {
    key: "crm.opportunity.assign",
    group: "CRM",
    label: "Assign opportunities",
    description: "Assign CRM opportunities to eligible workspace members.",
    app: "crm",
  },
  {
    key: "crm.opportunity.delete",
    group: "CRM",
    label: "Delete opportunities",
    description: "Permanently delete accessible CRM opportunities.",
    app: "crm",
  },
  {
    key: "crm.pipeline.configure",
    group: "CRM",
    label: "Configure CRM pipeline",
    description: "Manage stages, lost reasons, teams, and CRM tags.",
    app: "crm",
  },
  {
    key: "crm.export",
    group: "CRM",
    label: "Export CRM data",
    description: "Download accessible CRM information.",
    app: "crm",
  },
  {
    key: "contacts.company_view",
    group: "Contacts",
    label: "See all contacts",
    description: "View contacts beyond directly assigned records.",
    app: "contacts",
  },
  {
    key: "contacts.create",
    group: "Contacts",
    label: "Create contacts",
    description: "Create people and company contact records.",
    app: "contacts",
  },
  {
    key: "contacts.edit",
    group: "Contacts",
    label: "Edit contacts",
    description: "Update accessible people and company records.",
    app: "contacts",
  },
  {
    key: "contacts.delete",
    group: "Contacts",
    label: "Delete contacts",
    description: "Delete accessible contact records.",
    app: "contacts",
  },
  {
    key: "contacts.export",
    group: "Contacts",
    label: "Export contacts",
    description: "Download accessible contact information.",
    app: "contacts",
  },
  {
    key: "sales.company_view",
    group: "Sales",
    label: "View all sales",
    description: "View company-wide quotations and sales orders.",
    app: "sales",
  },
  {
    key: "sales.quotation.create",
    group: "Sales",
    label: "Create quotations",
    description: "Create quotations for accessible opportunities.",
    app: "sales",
  },
  {
    key: "sales.order.confirm",
    group: "Sales",
    label: "Confirm sales orders",
    description: "Confirm eligible quotations as orders.",
    app: "sales",
  },
  {
    key: "sales.quotation.delete",
    group: "Sales",
    label: "Delete quotations",
    description: "Delete accessible draft quotations.",
    app: "sales",
  },
  {
    key: "sales.export",
    group: "Sales",
    label: "Export sales",
    description: "Download accessible sales information.",
    app: "sales",
  },
  {
    key: "todo.company_view",
    group: "To-Do",
    label: "See all tasks",
    description: "View tasks across the company.",
    app: "todo",
  },
  {
    key: "todo.assign",
    group: "To-Do",
    label: "Assign tasks",
    description: "Assign tasks to eligible workspace members.",
    app: "todo",
  },
  {
    key: "todo.reassign",
    group: "To-Do",
    label: "Reassign tasks",
    description: "Change responsibility for existing tasks.",
    app: "todo",
  },
  {
    key: "todo.team_manage",
    group: "To-Do",
    label: "Manage team tasks",
    description: "Manage tasks in this person's department.",
    app: "todo",
  },
  {
    key: "calendar.team_view",
    group: "Calendar",
    label: "See team calendars",
    description: "View relevant team and department schedules.",
    app: "calendar",
  },
  {
    key: "calendar.create_for_others",
    group: "Calendar",
    label: "Create meetings for others",
    description: "Schedule meetings for eligible members.",
    app: "calendar",
  },
  {
    key: "employees.view",
    group: "Employees",
    label: "View employees",
    description: "View the company employee directory.",
  },
  {
    key: "employees.invite",
    group: "Employees",
    label: "Invite employees",
    description: "Invite new employees to this workspace.",
  },
  {
    key: "employees.manage",
    group: "Employees",
    label: "Manage employees",
    description: "Update and remove eligible employees.",
  },
  {
    key: "reports.company_view",
    group: "Reports",
    label: "View company reports",
    description: "View company-wide business reporting.",
    app: "dashboards",
  },
  {
    key: "reports.export",
    group: "Reports",
    label: "Export reports",
    description: "Download accessible company reports.",
    app: "dashboards",
  },
];

const managerDefaults = new Set([
  "crm.opportunity.assign",
  "todo.assign",
  "todo.reassign",
  "todo.team_manage",
  "calendar.team_view",
  "calendar.create_for_others",
  "reports.company_view",
]);
const adminDefaults = new Set(SIMPLE_PERMISSIONS.map((item) => item.key));
const employeeDefaults = new Set([
  "contacts.create",
  "contacts.edit",
  "sales.quotation.create",
]);

export function basePermissionAllowed(role: Membership["role"], key: string) {
  if (role === "owner" || role === "admin") return adminDefaults.has(key);
  if (role === "manager")
    return employeeDefaults.has(key) || managerDefaults.has(key);
  if (role === "employee" || role === "intern")
    return employeeDefaults.has(key);
  return false;
}

export function simplePermissionAllowed(
  membership: Membership,
  key: string,
  enabledApp?: string,
) {
  if (membership.role === "owner") return true;
  if (
    enabledApp &&
    membership.appAccess?.[enabledApp as keyof typeof membership.appAccess] ===
      "none"
  )
    return false;
  const effect = membership.permissionOverrides?.[key];
  if (effect === "deny") return false;
  if (effect === "allow") return true;
  return basePermissionAllowed(membership.role, key);
}
