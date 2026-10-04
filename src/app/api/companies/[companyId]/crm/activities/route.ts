import { NextResponse } from "next/server";
import { createActivity, visibleActivities } from "@/lib/crm-activities";
import { crmError } from "@/lib/crm-server";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    return NextResponse.json(await visibleActivities((await params).companyId));
  } catch (e) {
    return crmError(e);
  }
}
export async function POST(req: Request, { params }: Context) {
  try {
    return NextResponse.json(
      {
        record: await createActivity(
          (await params).companyId,
          await req.json(),
        ),
      },
      { status: 201 },
    );
  } catch (e) {
    return crmError(e);
  }
}
