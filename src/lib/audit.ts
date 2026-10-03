import { FieldValue, type Firestore, type Transaction, type WriteBatch } from "firebase-admin/firestore";

type AuditEvent = { actorId: string; action: string; entityType: string; entityId: string; metadata?: Record<string, string | number | boolean | null> };

export function auditRecord(companyId: string, event: AuditEvent) {
  return { companyId, ...event, metadata: event.metadata ?? {}, timestamp: FieldValue.serverTimestamp() };
}

export function appendAudit(db: Firestore, companyId: string, event: AuditEvent, writer?: Transaction | WriteBatch) {
  const ref = db.collection(`companies/${companyId}/auditLogs`).doc();
  const data = auditRecord(companyId, event);
  if (writer) writer.create(ref, data);
  else return ref.create(data);
}

