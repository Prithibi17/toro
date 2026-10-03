import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdmin } from "@/lib/firebase-admin";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";
import { CRM_COLLECTIONS, opportunitySchema } from "@/lib/crm-model";

const dealInput = z.object({ name: z.string().trim().min(2).max(160), contactName: z.string().trim().max(120).default(""), email: z.string().trim().email().or(z.literal("")), value: z.coerce.number().min(0).max(999999999), stage: z.enum(["new", "qualified", "proposal", "won", "lost"]).default("new") });
export async function GET(_: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params; const auth = await authorizeCompany(companyId,{module:"crm"});
  if (!auth.ok) return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  const db=getAdmin().db;const [canonical,legacy]=await Promise.all([db.collection(`companies/${companyId}/${CRM_COLLECTIONS.opportunities}`).orderBy("createdAt","desc").limit(200).get(),db.collection(`companies/${companyId}/crmDeals`).orderBy("createdAt", "desc").limit(200).get()]);
  const current=canonical.docs.map(d=>{const x=d.data();return{id:d.id,name:x.name,contactName:x.contactName??"",email:x.email??"",value:x.value,stage:x.stageId??"new",createdAt:x.createdAt?.toDate?.()?.toISOString()??null}});
  const old=legacy.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null }));
  return NextResponse.json({ deals: [...current,...old].slice(0,200) });
}
export async function POST(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params; const auth = await authorizeCompany(companyId,{module:"crm",permission:"crm.manage"});
  if (!auth.ok) return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  try { const input = dealInput.parse(await req.json());const canonical=opportunitySchema.parse({name:input.name,pipelineId:"default",stageId:input.stage,contactId:null,organizationId:null,ownerId:auth.access.user.uid,value:input.value,status:input.stage==="won"?"won":input.stage==="lost"?"lost":"open",createdBy:auth.access.user.uid});const db=getAdmin().db;const ref=db.collection(`companies/${companyId}/${CRM_COLLECTIONS.opportunities}`).doc();const batch=db.batch();batch.create(ref,{...canonical,contactName:input.contactName,email:input.email,companyId,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});appendAudit(db,companyId,{actorId:auth.access.user.uid,action:"crm.opportunity_created",entityType:"opportunity",entityId:ref.id},batch);await batch.commit();return NextResponse.json({deal:{id:ref.id,...input}},{status:201}); }
  catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? "Invalid opportunity" : "Could not create opportunity" }, { status: 400 }); }
}
