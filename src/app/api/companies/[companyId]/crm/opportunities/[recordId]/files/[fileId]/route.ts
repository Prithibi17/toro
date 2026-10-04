import { getStorage } from "firebase-admin/storage";
import { getApps } from "firebase-admin/app";
import { crmError, opportunityAccess, CrmError } from "@/lib/crm-server";
import { getAdmin } from "@/lib/firebase-admin";
export async function GET(
  _: Request,
  {
    params,
  }: {
    params: Promise<{ companyId: string; recordId: string; fileId: string }>;
  },
) {
  try {
    const { companyId, recordId, fileId } = await params;
    await opportunityAccess(companyId, recordId);
    const doc = await getAdmin()
        .db.doc(`companies/${companyId}/files/${fileId}`)
        .get(),
      data = doc.data();
    if (!data || data.opportunityId !== recordId)
      throw new CrmError("File not found", 404);
    const [buffer] = await getStorage(getApps()[0])
      .bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
      .file(data.path)
      .download();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": data.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return crmError(e);
  }
}
