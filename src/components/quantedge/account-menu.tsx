"use client";

// DEEYOUNG PRO — header account menu: identity, plan state, billing entry, sign out.

import { useState } from "react";
import { ChevronDown, CreditCard, LogOut, ShieldCheck } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { effectivePlan, trialTimeLeftLabel } from "@/lib/entitlements";
import { BillingModal } from "@/components/quantedge/billing-modal";

export function PlanBadge({ user, onClickUpgrade }: { user: SessionUser; onClickUpgrade?: () => void }) {
  const plan = effectivePlan(user);
  const trialLabel = trialTimeLeftLabel(user);
  const base = "rounded-lg px-2.5 py-1 text-[10px] font-bold tracking-wider";
  if (plan === "TRIAL") {
    return (
      <span className={`${base} border border-brand/40 bg-brand/10 text-brand-hi`}>
        TRIAL{trialLabel ? ` · ${trialLabel}` : ""}
      </span>
    );
  }
  if (plan === "PRO" || plan === "ELITE" || plan === "STARTER") {
    return (
      <span className={`${base} border border-warn/40 bg-warn/10 text-warn`}>{plan}</span>
    );
  }
  return (
    <button
      onClick={onClickUpgrade}
      className={`${base} border border-hairline bg-panel-2 text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand-hi`}
    >
      UPGRADE
    </button>
  );
}

export function AccountMenu({ user }: { user: SessionUser }) {
  const [billingOpen, setBillingOpen] = useState(false);
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-1.5 rounded-xl p-1 pr-1.5 transition-colors hover:bg-panel-2"
          aria-label="Account menu"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/15 text-[10px] font-bold text-brand-hi">
            {initials}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[240px] border-hairline bg-panel">
          <DropdownMenuLabel className="normal-case">
            <p className="truncate text-xs font-semibold">{user.name}</p>
            <p className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-hairline" />
          <DropdownMenuItem
            onClick={() => setBillingOpen(true)}
            className="cursor-pointer gap-2 text-xs"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Plan &amp; billing
          </DropdownMenuItem>
          {user.role === "ADMIN" && (
            <DropdownMenuItem disabled className="gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Administrator
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-hairline" />
          <DropdownMenuItem
            onClick={async () => { await authClient.signOut(); window.location.href = "/"; }}
            className="cursor-pointer gap-2 text-xs text-neg focus:text-neg"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <BillingModal open={billingOpen} onOpenChange={setBillingOpen} />
    </>
  );
}
