import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";

export default async function CreateCompany() {
  if (!(await currentUser())) redirect("/login");
  redirect("/select-company");
}
