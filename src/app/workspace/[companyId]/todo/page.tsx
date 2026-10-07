import { notFound } from "next/navigation";
import { authorizeCompany } from "@/lib/authorization";
import { TaskBoard } from "@/components/task-board";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const ctx = await authorizeCompany(companyId, { module: "todo" });
  if (!ctx.ok) notFound();
  return <TaskBoard companyId={companyId} />;
}
