import { NextResponse } from "next/server";
import {
  crmAccess,
  crmError,
  opportunityAccess,
  crmReadable,
} from "@/lib/crm-server";
import {
  deleteOpportunity,
  updateOpportunity,
} from "@/lib/crm-opportunities";
type Context = { params: Promise<{ companyId: string; recordId: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    const { companyId, recordId } = await params;
    const { access, record } = await opportunityAccess(companyId, recordId);
    return NextResponse.json({
      record: crmReadable(access, record),
    });
  } catch (e) {
    return crmError(e);
  }
}
export async function PATCH(req: Request, { params }: Context) {
  try {
    const { companyId, recordId } = await params;
    return NextResponse.json({
      record: await updateOpportunity(
        companyId,
        recordId,
        await crmAccess(companyId),
        await req.json(),
      ),
    });
  } catch (e) {
    return crmError(e);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    const { companyId, recordId } = await params;
    await deleteOpportunity(
      companyId,
      recordId,
      await crmAccess(companyId),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return crmError(e);
  }
}
