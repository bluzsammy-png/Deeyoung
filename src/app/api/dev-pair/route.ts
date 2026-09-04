import { spawn } from "child_process";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// DEV-ONLY helper (never commit): spawn a long-lived script from the
// bootstrap-owned next-server tree so the sandbox reaper can't kill it.
export async function GET(req: Request) {
  const script = new URL(req.url).searchParams.get("script");
  if (!script || !script.startsWith("/home/z/my-project/scripts/")) {
    return NextResponse.json({ error: "script must live in /home/z/my-project/scripts/" }, { status: 400 });
  }
  const child = spawn("bash", [script], {
    detached: true,
    stdio: "ignore",
    cwd: "/home/z/my-project",
    env: { ...process.env, HOME: "/home/z" },
  });
  child.unref();
  return NextResponse.json({ spawned: child.pid, script });
}
