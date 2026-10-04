import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { getApps } from "firebase-admin/app";
import { FieldValue } from "firebase-admin/firestore";
import {
  crmError,
  opportunityAccess,
  CrmError,
  history,
  plainDoc,
} from "@/lib/crm-server";
import { getAdmin } from "@/lib/firebase-admin";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string; recordId: string }> },
) {
  try {
    const { companyId, recordId } = await params,
      { access } = await opportunityAccess(companyId, recordId, "edit"),
      data = await req.formData(),
      file = data.get("file");
    if (
      !(file instanceof File) ||
      file.size > 4 * 1024 * 1024 ||
      file.size === 0
    )
      throw new CrmError("Select a file up to 4 MB");
    const allowed = [
      "application/pdf",
      "text/plain",
      "text/csv",
      "image/png",
      "image/jpeg",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (!allowed.includes(file.type))
      throw new CrmError("Unsupported file type");
    const db = getAdmin().db,
      ref = db.collection(`companies/${companyId}/files`).doc(),
      path = `companies/${companyId}/files/crm/${recordId}/${ref.id}`;
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucketName) throw new CrmError("File storage is not configured", 503);
    const stored = getStorage(getApps()[0]).bucket(bucketName).file(path);
    await stored.save(Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      resumable: false,
    });
    try {
      const batch = db.batch();
      batch.create(ref, {
        companyId,
        opportunityId: recordId,
        name: file.name.slice(0, 200),
        path,
        size: file.size,
        contentType: file.type,
        createdBy: access.user.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      history(
        db,
        batch,
        companyId,
        access,
        recordId,
        "file_attached",
        {},
        file.name,
      );
      await batch.commit();
    } catch (error) {
      await stored.delete().catch(() => {});
      throw error;
    }
    return NextResponse.json(
      { file: plainDoc(await ref.get()) },
      { status: 201 },
    );
  } catch (e) {
    return crmError(e);
  }
}
