"use client";

// DEEYOUNG PRO — Admin & Trust: user list, moderation ladder (warn → suspend → ban),
// signup-velocity flags. Visible only to role=ADMIN; the API enforces the same.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, Loader2, PauseCircle, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface AdminUser {
  id: string; name: string | null; email: string; role: string; status: string; plan: string;
  trialEndsAt: string | null; emailVerified: boolean; signupCountFromIp: number; createdAt: string;
}
interface AdminWarning { id: string; userId: string; reason: string; message: string; createdAt: string }
interface AdminPayload { users: AdminUser[]; warnings: AdminWarning[]; stats: Record<string, number> }

type Action = "WARN" | "SUSPEND" | "BAN" | "UNBAN";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "border-pos/40 bg-pos/10 text-pos",
  WARNED: "border-warn/40 bg-warn/10 text-warn",
  SUSPENDED: "border-warn/50 bg-warn/20 text-warn",
  BANNED: "border-neg/40 bg-neg/10 text-neg",
};

export function AdminView() {
  const { toast } = useToast();
  const [data, setData] = useState<AdminPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [dialog, setDialog] = useState<{ user: AdminUser; action: Action } | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 403) { setForbidden(true); return; }
      const json = await res.json();
      setData(json);
    } catch {
      toast({ title: "Couldn't load admin data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const act = async () => {
    if (!dialog) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: dialog.user.id, action: dialog.action, reason, message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Action failed");
      toast({ title: "Done", description: `${dialog.action.toLowerCase()} applied to ${dialog.user.email}.` });
      setDialog(null);
      setReason(""); setMessage("");
      load();
    } catch (e) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (forbidden) {
    return (
      <div className="qe-panel p-10 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-semibold">Admin access required</p>
        <p className="mt-1 text-xs text-muted-foreground">This area is restricted to platform administrators.</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stat = (label: string, value: number, cls = "") => (
    <div className={`rounded-2xl border border-hairline bg-panel-2 px-4 py-3 ${cls}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="qe-num mt-1 text-xl font-bold">{value}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Users className="h-5 w-5 text-pos" /> Admin &amp; Trust
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Moderation ladder: warn → suspend → ban. Every action is audited and sessions are revoked on suspension.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Users", data.stats.total)}
        {stat("Paid", data.stats.premium)}
        {stat("Suspended", data.stats.suspended)}
        {stat("Banned", data.stats.banned)}
      </div>

      <div className="qe-panel overflow-hidden">
        <div className="qe-scroll max-h-[52vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-panel">
              <TableRow className="border-hairline">
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Signups/IP</TableHead>
                <TableHead className="hidden lg:table-cell">Joined</TableHead>
                <TableHead className="text-right">Moderate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((u) => (
                <TableRow key={u.id} className="border-hairline">
                  <TableCell>
                    <p className="text-xs font-semibold">{u.name ?? "…"}</p>
                    <p className="text-[11px] text-muted-foreground">{u.email}</p>
                  </TableCell>
                  <TableCell>
                    <span className="text-[11px] font-medium">{u.plan}</span>
                  </TableCell>
                  <TableCell>
                    <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[u.status] ?? "border-hairline"}`}>
                      {u.status}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className={`text-[11px] ${u.signupCountFromIp >= 3 ? "font-bold text-neg" : "text-muted-foreground"}`}>
                      {u.signupCountFromIp}{u.signupCountFromIp >= 3 ? " !" : ""}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-[11px] text-muted-foreground lg:table-cell">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.role === "ADMIN" ? (
                      <span className="text-[10px] text-muted-foreground">admin</span>
                    ) : (
                      <div className="flex justify-end gap-1">
                        {u.status !== "BANNED" && u.status !== "SUSPENDED" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 gap-1 border-hairline px-2 text-[10px]"
                              onClick={() => setDialog({ user: u, action: "WARN" })}>
                              <AlertTriangle className="h-3 w-3" /> Warn
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 gap-1 border-hairline px-2 text-[10px]"
                              onClick={() => setDialog({ user: u, action: "SUSPEND" })}>
                              <PauseCircle className="h-3 w-3" /> Suspend
                            </Button>
                          </>
                        )}
                        {u.status !== "BANNED" ? (
                          <Button size="sm" variant="outline" className="h-7 gap-1 border-neg/40 px-2 text-[10px] text-neg hover:bg-neg/10"
                            onClick={() => setDialog({ user: u, action: "BAN" })}>
                            <Ban className="h-3 w-3" /> Ban
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 gap-1 border-hairline px-2 text-[10px]"
                            onClick={() => setDialog({ user: u, action: "UNBAN" })}>
                            <RotateCcw className="h-3 w-3" /> Unban
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <div className="qe-panel p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Recent warnings</p>
          <div className="qe-scroll mt-3 max-h-52 space-y-2 overflow-y-auto">
            {data.warnings.map((w) => (
              <div key={w.id} className="rounded-xl border border-hairline bg-panel-2 px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{w.reason}</p>
                  <span className="text-[10px] text-muted-foreground">{new Date(w.createdAt).toLocaleDateString()}</span>
                </div>
                {w.message && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{w.message}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="max-w-[420px] border-hairline bg-panel text-foreground">
          <DialogHeader>
            <DialogTitle className="text-left">
              {dialog?.action === "UNBAN" ? "Restore account" : `Confirm ${dialog?.action.toLowerCase()}`}
            </DialogTitle>
            <DialogDescription className="text-left">
              {dialog?.action === "UNBAN"
                ? `${dialog?.user.email} will regain full access immediately.`
                : dialog?.action === "BAN"
                  ? `This permanently blocks ${dialog?.user.email} and revokes all sessions.`
                  : `Applies to ${dialog?.user.email}. Sessions are revoked on suspension.`}
            </DialogDescription>
          </DialogHeader>
          {dialog?.action !== "UNBAN" && (
            <div className="space-y-3">
              <div>
                <label htmlFor="mod-reason" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason (required, shown to user)</label>
                <Input id="mod-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Multiple accounts from one device" className="border-hairline bg-panel-2" />
              </div>
              <div>
                <label htmlFor="mod-message" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Message (optional context)</label>
                <Textarea id="mod-message" value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder="Extra context for the user… (e.g. deadline to respond)" className="border-hairline bg-panel-2" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-hairline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={act}
              disabled={busy || (dialog?.action !== "UNBAN" && reason.trim().length < 3)}
              className={`gap-1.5 ${dialog?.action === "BAN" ? "bg-neg text-white hover:bg-neg/90" : "bg-pos text-[#04110a] hover:brightness-110"}`}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {dialog?.action === "UNBAN" ? "Restore access" : `Confirm ${dialog?.action.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
