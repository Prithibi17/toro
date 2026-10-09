const labels: Record<string, string> = {
  owner: "Owner",
  admin: "Company Admin",
  manager: "Manager",
  employee: "Employee",
  intern: "Employee (Intern)",
  portal: "Portal User",
};

export function memberRoleLabel(role: unknown) {
  const value = String(role ?? "").trim().toLowerCase();
  return labels[value] ?? (value || "—");
}
