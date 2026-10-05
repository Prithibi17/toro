export type ModuleKey =
  | "discuss"
  | "calendar"
  | "todo"
  | "contacts"
  | "crm"
  | "sales"
  | "dashboards"
  | "pos"
  | "accounting"
  | "purchase"
  | "inventory"
  | "manufacturing"
  | "shop-floor"
  | "barcode";
export type PermissionKey =
  | "members.manage"
  | "security.manage"
  | "apps.manage"
  | "tasks.create"
  | "tasks.move"
  | "tasks.assign"
  | "crm.manage"
  | "contacts.manage"
  | "sales.manage";
export type UserType = "internal" | "portal" | "service";
export type AppAccessLevel =
  "none" | "user" | "manager" | "administrator" | "custom";
export type ResourceOperation = "read" | "create" | "write" | "delete";
export type RecordScope =
  | "none"
  | "own"
  | "assigned"
  | "own_assigned"
  | "team"
  | "department"
  | "company";
export type ResourcePermission = Partial<Record<ResourceOperation, boolean>> & {
  scope?: RecordScope;
};
export type FieldPermission = {
  read?: boolean;
  write?: boolean;
  mask?: boolean;
};
export type RoleDefinition = {
  id: string;
  name: string;
  description?: string;
  system?: boolean;
  active?: boolean;
  inheritedRoleIds?: string[];
  appAccess?: Partial<Record<ModuleKey, AppAccessLevel>>;
  resources?: Record<string, ResourcePermission>;
  actions?: Record<string, boolean>;
  fields?: Record<string, Record<string, FieldPermission>>;
  legacyPermissions?: Partial<Record<PermissionKey, boolean>>;
  approvalLimits?: Record<string, number>;
};
export type CrmSection =
  | "overview"
  | "leads"
  | "contacts"
  | "organizations"
  | "opportunities"
  | "activities"
  | "pipelines";
export type CrmScope = "none" | "own" | "team" | "department" | "all";
export type CrmAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "assign"
  | "moveStage"
  | "close"
  | "manage";
export type CrmPermissionSet = Partial<
  Record<CrmSection, Partial<Record<CrmAction, CrmScope | boolean>>>
>;
export type Membership = {
  companyId: string;
  companyName: string;
  companyLogo?: string;
  role: "owner" | "admin" | "manager" | "employee" | "intern" | "portal";
  status: "pending" | "active" | "invited" | "suspended" | "removed";
  userType?: UserType;
  roleIds?: string[];
  appAccess?: Partial<Record<ModuleKey, AppAccessLevel>>;
  resourcePermissions?: Record<string, ResourcePermission>;
  actionPermissions?: Record<string, boolean>;
  fieldPermissions?: Record<string, Record<string, FieldPermission>>;
  permissionVersion?: number;
  accessExpiresAt?: { toDate(): Date } | Date | string;
  enabledModules: ModuleKey[];
  departmentIds?: string[];
  permissions?: Partial<Record<PermissionKey, boolean>>;
  crmPermissions?: CrmPermissionSet;
  /** Human-facing CAN/CANNOT exceptions keyed by Toro's stable permission catalog. */
  permissionOverrides?: Record<string, "allow" | "deny">;
  /** Resolved from active company sales teams by server authorization. */
  crmTeamIds?: string[];
};
export type SessionUser = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
};
export const MODULES: { key: ModuleKey; name: string; description: string }[] =
  [
    {
      key: "discuss",
      name: "Discuss",
      description: "Channels and direct messages",
    },
    {
      key: "calendar",
      name: "Calendar",
      description: "Meetings and schedules",
    },
    { key: "todo", name: "To-Do", description: "Tasks and approvals" },
    { key: "contacts", name: "Contacts", description: "People and companies" },
    { key: "crm", name: "CRM", description: "Leads and opportunities" },
    { key: "sales", name: "Sales", description: "Quotes and orders" },
    {
      key: "dashboards",
      name: "Dashboards",
      description: "Business performance",
    },
    { key: "pos", name: "Point of Sale", description: "Retail transactions" },
    {
      key: "accounting",
      name: "Accounting",
      description: "Invoices and ledgers",
    },
    { key: "purchase", name: "Purchase", description: "Suppliers and orders" },
    { key: "inventory", name: "Inventory", description: "Products and stock" },
    {
      key: "manufacturing",
      name: "Manufacturing",
      description: "BOMs and production",
    },
    {
      key: "shop-floor",
      name: "Shop Floor",
      description: "Production operations",
    },
    { key: "barcode", name: "Barcode", description: "Scan and move stock" },
  ];
