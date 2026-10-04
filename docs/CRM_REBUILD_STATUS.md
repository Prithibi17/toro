# CRM rebuild — verification and rollout notes

## Implemented in this working tree

- Pipeline/list workspace with salesperson-based My Pipeline, empty and foldable stage columns, quick creation, independent 0–3 priority, search, filters, grouping, saved searches, record navigation, and cursor-based loading.
- Opportunity editing with optimistic version checks; stage transitions, required lost reasons, reopening, audit history, internal notes, private attachments, and draft Sales quotations.
- Activities with company-timezone due states, completion/cancellation, linked Calendar meetings, assignment notifications, and batched parent reads. Scheduling does not duplicate activities into personal To-Do.
- Configuration for stages, sales teams, tags, and lost reasons; canonical Contacts references; lead conversion into open opportunities.
- CSV/XLSX mapping, row validation, bounded/resumable import jobs, duplicate handling, and selected/filtered exports. Formula-like CSV text is escaped on export.
- Server-side company/record checks, role grants, active sales-team visibility, field restrictions on the new opportunity endpoints, and regression coverage for partial updates, stale writes, and pagination.

## Verification

- 51 unit and mocked-transaction tests pass. The transaction tests are not a replacement for Firebase emulator/integration testing.
- Production build and type checking pass. Lint has no errors; three pre-existing hook dependency warnings remain in unrelated components.
- Local production-server smoke check: `/login` returns 200; the new opportunity list/detail, activity list, and configuration APIs return 401 without a session.
- No production records, Firebase rules, or Firebase indexes were changed for testing.

## Remaining acceptance work / limitations

- Perform authenticated, two-user browser tests against a dedicated staging company: drag/drop conflict, read-only roles, invitations, meetings, file upload/download, quotation visibility, and import resume after an interrupted request.
- Pipeline queries load 1,000 records per cursor page, with Load more and explicit partial-total messaging. Sorting and counts apply to loaded matches. Exports scan up to 10,000 records and refuse an incomplete export. Contact selectors still load at most 500 contacts; searchable contact selection remains needed for larger companies.
- Existing companies without a Lost stage need an administrator to create one in CRM Configuration. New company defaults include Lost. Lost reasons are administrator-configured.
- Team scope uses sales-team membership resolved on the server for each CRM access check. Unit tests cover inactive teams, membership revocation, and company isolation; validate the complete role-editing flow in staging too.
- Outbound email delivery is not configured: chatter stores internal notes, and email activities are reminders, not sent email.
- Quotations are linked draft Sales records; this rebuild does not implement outbound quotation delivery, accounting, or a complete Sales order lifecycle.
- Inline contact creation, the full requested reporting suite, and comprehensive end-to-end coverage remain follow-up work.
- Legacy CRM endpoints and other modules require a separate field-policy audit; do not treat the new opportunity endpoint tests as an application-wide security certification.

This is a core-workflow implementation checkpoint, not completion of every item in the 191-section master specification.
