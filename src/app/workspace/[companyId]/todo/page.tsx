import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { TaskBoard } from "@/components/task-board";
import { getAdmin } from "@/lib/firebase-admin";
import { ensureTodoStages } from "@/lib/todo-stages";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const ctx = await requireMembership(companyId);
  if (!ctx || !ctx.membership.enabledModules?.includes("todo")) notFound();
  await ensureTodoStages(getAdmin().db, companyId, ctx.user.uid);
  return <TaskBoard companyId={companyId} />;
}
