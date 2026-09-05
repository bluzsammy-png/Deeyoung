// DEEYOUNG PRO — /admin/login: standalone admin sign-in route.
// /admin already renders this same sign-in for anonymous visitors, but owners
// (and password managers) expect /admin/login to exist. Signed-in admins are
// bounced straight to the console; everyone else gets the sign-in card.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSignIn } from "../console";

export const dynamic = "force-dynamic";

const GOOGLE_ENABLED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export default async function AdminLoginPage() {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    if (session?.user) redirect("/admin");
  } catch {
    // auth/db warming — show the sign-in rather than crashing
  }
  return <AdminSignIn googleEnabled={GOOGLE_ENABLED} />;
}
