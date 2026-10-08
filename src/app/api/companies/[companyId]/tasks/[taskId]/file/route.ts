import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getAdmin } from "@/lib/firebase-admin";
import {
  authorizeCompany,
  authorizationStatus,
  canReadTask,
} from "@/lib/authorization";
import { todoAttachmentError } from "@/lib/todo-completion";

async function context(companyId: string, taskId: string, edit = false) {
  const auth = await authorizeCompany(companyId, { module: "todo" });
  if (!auth.ok)
    return { response: NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) }) };
  const ref = getAdmin().db.doc(`companies/${companyId}/tasks/${taskId}`);
  const task = await ref.get();
  if (!task.exists)
    return { response: NextResponse.json({ error: "To-Do not found" }, { status: 404 }) };
  const data = task.data()!;
  if (!canReadTask(auth.access.user.uid, auth.access.membership, data))
    return { response: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  const elevated = ["owner", "admin", "manager"].includes(auth.access.membership.role);
  if (edit && !elevated && data.creatorId !== auth.access.user.uid && !data.assigneeIds?.includes(auth.access.user.uid))
    return { response: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  return { auth: auth.access, ref, task, data };
}

export async function POST(req: Request, { params }: { params: Promise<{ companyId: string; taskId: string }> }) {
  const { companyId, taskId } = await params;
  const ctx = await context(companyId, taskId, true);
  if ("response" in ctx) return ctx.response;
  const file = (await req.formData()).get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "Select one file up to 4 MB" }, { status: 400 });
  const fileError = todoAttachmentError(file);
  if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName)
    return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  const id = crypto.randomUUID();
  const path = `companies/${companyId}/files/todo/${taskId}/${id}`;
  const bucket = getStorage(getApps()[0]).bucket(bucketName);
  const stored = bucket.file(path);
  await stored.save(Buffer.from(await file.arrayBuffer()), { contentType: file.type, resumable: false });
  const attachment = {
    id,
    name: file.name.slice(0, 200),
    path,
    size: file.size,
    contentType: file.type,
    createdBy: ctx.auth.user.uid,
    createdByName: ctx.auth.user.name ?? ctx.auth.user.email ?? "User",
    createdAt: new Date().toISOString(),
  };
  try {
    const batch = getAdmin().db.batch();
    batch.update(ctx.ref, { attachment, updatedAt: FieldValue.serverTimestamp() });
    batch.create(getAdmin().db.collection(`companies/${companyId}/todoHistory`).doc(), {
      todoId: taskId,
      actorId: ctx.auth.user.uid,
      actorName: attachment.createdByName,
      eventType: "file_attached",
      fileName: attachment.name,
      timestamp: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    await stored.delete().catch(() => {});
    throw error;
  }
  const previousPath = (ctx.data.attachment as { path?: string } | undefined)?.path;
  if (previousPath && previousPath !== path) await bucket.file(previousPath).delete({ ignoreNotFound: true }).catch(() => {});
  return NextResponse.json({ attachment }, { status: 201 });
}

export async function GET(_: Request, { params }: { params: Promise<{ companyId: string; taskId: string }> }) {
  const { companyId, taskId } = await params;
  const ctx = await context(companyId, taskId);
  if ("response" in ctx) return ctx.response;
  const attachment = ctx.data.attachment as { name?: string; path?: string; contentType?: string } | undefined;
  if (!attachment?.path) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  const [buffer] = await getStorage(getApps()[0]).bucket(bucketName).file(attachment.path).download();
  return new Response(new Uint8Array(buffer), { headers: {
    "Content-Type": attachment.contentType ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name ?? "attachment")}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  }});
}

export async function DELETE(_: Request, { params }: { params: Promise<{ companyId: string; taskId: string }> }) {
  const { companyId, taskId } = await params;
  const ctx = await context(companyId, taskId, true);
  if ("response" in ctx) return ctx.response;
  const attachment = ctx.data.attachment as { name?: string; path?: string } | undefined;
  if (!attachment?.path) return NextResponse.json({ ok: true });
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  const batch = getAdmin().db.batch();
  batch.update(ctx.ref, { attachment: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  batch.create(getAdmin().db.collection(`companies/${companyId}/todoHistory`).doc(), {
    todoId: taskId,
    actorId: ctx.auth.user.uid,
    actorName: ctx.auth.user.name ?? ctx.auth.user.email ?? "User",
    eventType: "file_removed",
    fileName: attachment.name ?? "Attachment",
    timestamp: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await getStorage(getApps()[0]).bucket(bucketName).file(attachment.path).delete({ ignoreNotFound: true }).catch(() => {});
  return NextResponse.json({ ok: true });
}
