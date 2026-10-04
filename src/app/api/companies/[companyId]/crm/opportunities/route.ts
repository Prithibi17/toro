import { NextResponse } from "next/server";
import { crmAccess, crmError } from "@/lib/crm-server";
import { crmList } from "@/lib/crm-list";
import { parseCrmQuery } from "@/lib/crm-query";
import { createOpportunity } from "@/lib/crm-opportunities";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(req: Request, { params }: Context) {
  try {
    const { companyId } = await params;
    const search = new URL(req.url).searchParams;
    const after = search.get("after") ?? undefined;
    search.delete("after");
    return NextResponse.json(
      await crmList(
        companyId,
        parseCrmQuery(Object.fromEntries(search)),
        after,
      ),
    );
  } catch (e) {
    return crmError(e);
  }
}
export async function POST(req: Request, { params }: Context) {
  try {
    const { companyId } = await params;
    return NextResponse.json(
      {
        record: await createOpportunity(
          companyId,
          await crmAccess(companyId),
          await req.json(),
        ),
      },
      { status: 201 },
    );
  } catch (e) {
    return crmError(e);
  }
}
