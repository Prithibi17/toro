# Toro CRM architecture

This document is the implementation contract for the connected CRM migration. Existing Firebase Authentication, company membership, module enablement and server authorization remain authoritative.

## Ownership and storage

Every record is stored below `companies/{companyId}` and carries `companyId`, ownership, creator/updater and timestamps. Toro Contacts (`contacts`) is the canonical identity source for people and companies. CRM stores leads, opportunities, company-level stages, sales activities, associations, stage history, timeline events and notes. Legacy CRM contact, organization and pipeline collections remain migration-only. Operational tasks and calendar events remain in their existing company collections and link back using `crmActivityId`.

Relationships are explicit association records (`fromType`, `fromId`, `toType`, `toId`, `role`). Business records are archived rather than silently deleted. Direct client access to canonical CRM collections is denied; server routes enforce tenant, module, action and record scope.

## State machines

- Lead: New -> Contacted -> Qualified -> Converted, or Nurture / Disqualified / Archived. Conversion preserves the source lead and attribution.
- Opportunity: company stages drive the default Kanban directly; ordinary users never create pipeline objects. Open stages -> WON or LOST semantic stage types. Stage names are configurable; backend behavior uses `stageType`.
- Activity: scheduled -> completed or cancelled. Calls/meetings link to Calendar; tasks/follow-ups link to To-Do.
- Quotation (future slice): draft -> sent -> accepted / cancelled, with immutable revisions before Sales Order creation.

## API and events

Company-scoped server routes are the write boundary. Multi-record workflows use Firestore transactions or batches. Each important mutation writes both an immutable administrative audit event and a user-facing structured CRM timeline event. Automation will consume these semantic events after the core lifecycle is stable.

## Pages and components

The CRM opens on My Pipeline, with Leads, Activities and a contextual Customers view of Toro Contacts. Record detail is the composition boundary for timeline, activities, communication, files, notes and commercial documents. Only actions backed by working APIs are rendered.

## Delivery order

Company auth/RBAC -> contacts and organizations -> associations -> leads and conversion -> opportunities and pipeline -> activities/calendar/tasks -> timeline -> communication -> products -> quotations -> orders -> automation/notifications -> reports/forecasting -> configuration and integration tests.
