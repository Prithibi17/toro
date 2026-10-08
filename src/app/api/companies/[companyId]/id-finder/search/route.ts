import { NextResponse } from "next/server";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { searchIdFinderPeople } from "@/lib/id-finder";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const authz = await authorizeCompany(companyId, {
    permission: "members.manage",
  });
  if (!authz.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(authz.reason) },
    );
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2)
    return NextResponse.json({ people: [] });
  try {
    return NextResponse.json({ people: await searchIdFinderPeople(query) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ID Finder is unavailable" },
      { status: 502 },
    );
  }
}
