import { NextResponse } from "next/server";
import { getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";
import {
  authorizeCompany,
  authorizationStatus,
  hasPermission,
} from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";

async function context(companyId: string, contactId: string) {
  const auth = await authorizeCompany(companyId, { module: "contacts" });
  if (!auth.ok)
    return {
      error: NextResponse.json(
        { error: "Access denied" },
        { status: authorizationStatus(auth.reason) },
      ),
    };
  const ref = getAdmin().db.doc(`companies/${companyId}/contacts/${contactId}`),
    contact = await ref.get();
  if (!contact.exists)
    return {
      error: NextResponse.json({ error: "Contact not found" }, { status: 404 }),
    };
  return { auth, ref, contact };
}
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string; contactId: string }> },
) {
  const { companyId, contactId } = await params,
    result = await context(companyId, contactId);
  if ("error" in result) return result.error;
  const path = result.contact.data()?.photoPath,
    bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!path || !bucketName) return new NextResponse(null, { status: 404 });
  try {
    const file = getStorage(getApps()[0]).bucket(bucketName).file(path);
    const [metadata] = await file.getMetadata(),
      [buffer] = await file.download();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": metadata.contentType ?? "image/jpeg",
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string; contactId: string }> },
) {
  const { companyId, contactId } = await params,
    result = await context(companyId, contactId);
  if ("error" in result) return result.error;
  if (!hasPermission(result.auth.access.membership, "contacts.manage"))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const file = (await req.formData()).get("file");
  if (
    !(file instanceof File) ||
    !file.size ||
    file.size > 4 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    return NextResponse.json(
      { error: "Select a JPG, PNG, or WebP image up to 4 MB" },
      { status: 400 },
    );
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName)
    return NextResponse.json(
      { error: "File storage is not configured" },
      { status: 503 },
    );
  const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg",
    path = `companies/${companyId}/contacts/${contactId}/photo.${extension}`,
    stored = getStorage(getApps()[0]).bucket(bucketName).file(path);
  await stored.save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
  });
  await result.ref.update({
    photoPath: path,
    updatedBy: result.auth.access.user.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}
