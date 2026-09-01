import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LogOut,
  ChevronDown,
  Check,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useAuth as useOidcAuth } from "react-oidc-context";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { toast } from "sonner";
import LocationSwitcher from "./LocationSwitcher.tsx";
import { useLocationFilter } from "@/hooks/use-location-filter.tsx";
import { NAV_ITEMS, type NavRole } from "@/lib/nav-config.ts";

export default function Sidebar() {
  const { removeUser, user } = useOidcAuth();
  const navigate = useNavigate();
  const currentOrg = useQuery(api.organizations.getCurrentOrg, {});
  const myOrgs = useQuery(api.organizations.getMyOrgs, {});
  const myRole = useQuery(api.admin.getMyRole, {});
  const switchOrg = useMutation(api.organizations.switchOrg);
  const [switching, setSwitching] = useState<string | null>(null);
  const { selectedLocationId } = useLocationFilter();

  // Fetch notification badge counts
  const badges = useQuery(api.notifications.getBadgeCounts, selectedLocationId ? { locationId: selectedLocationId } : {});

  const role = myRole?.role ?? null;
  const hasAdminAccess = myRole?.hasAdminAccess ?? false;

  // Map routes to their badge counts
  const badgeMap: Record<string, number> = {
    "/schedule": badges?.pendingBookings ?? 0,
    "/invoices": badges?.overdueInvoices ?? 0,
    "/jobs": badges?.overdueJobs ?? 0,
    "/parts": badges?.lowStockParts ?? 0,
  };

  // Total alert count for dashboard indicator
  const totalAlerts = Object.values(badgeMap).reduce((sum, n) => sum + n, 0);
  if (totalAlerts > 0) {
    badgeMap["/dashboard"] = totalAlerts;
  }

  const visibleItems = role
    ? NAV_ITEMS.filter((item) => {
        // If member has admin access, show everything admin can see
        if (hasAdminAccess && item.roles.includes("admin")) return true;
        return item.roles.includes(role as NavRole);
      })
    : NAV_ITEMS;

  const handleSwitch = async (orgId: Id<"organizations">) => {
    setSwitching(orgId);
    try {
      await switchOrg({ orgId });
      toast.success("Switched location");
    } catch {
      toast.error("Failed to switch location");
    } finally {
      setSwitching(null);
    }
  };

  const handleSignout = async () => {
    try {
      await removeUser();
      navigate("/");
    } catch {
      toast.error("Failed to sign out");
    }
  };

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-sidebar-border bg-sidebar h-screen">
      {/* Logo + Org Switcher */}
      <div className="px-5 py-4 border-b border-sidebar-border">
        <h1
          className="text-xl font-bold text-primary tracking-wider"
          style={{ fontFamily: "Rajdhani, sans-serif" }}
        >
          ⚙ MechPro
        </h1>
        {currentOrg && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 mt-1 group w-full text-left cursor-pointer">
                <p className="text-xs text-muted-foreground truncate transition-colors flex-1 group-hover:text-foreground">
                  {currentOrg.name}
                </p>
                <ChevronDown size={12} className="text-muted-foreground shrink-0 group-hover:text-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Switch Location</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {myOrgs?.map((org) => (
                <DropdownMenuItem
                  key={org._id}
                  onClick={() => handleSwitch(org._id)}
                  className="cursor-pointer flex items-center gap-2"
                  disabled={switching === org._id}
                >
                  <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0",
                    org._id === currentOrg._id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 truncate text-sm">{org.name}</span>
                  {org._id === currentOrg._id && <Check size={12} className="text-primary shrink-0" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/locations")}
              >
                <Plus size={12} className="mr-2" /> Add Location
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {role && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5 capitalize">
            {role.replace("_", " ")}
          </p>
        )}
      </div>

      {/* Location filter */}
      <div className="px-3 pb-2">
        <LocationSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {visibleItems.map(({ to, icon: Icon, label, section }, idx) => {
          const prevSection = idx > 0 ? visibleItems[idx - 1].section : null;
          const badgeCount = badgeMap[to] ?? 0;
          return (
            <div key={to}>
              {section !== prevSection && (
                <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  {section}
                </p>
              )}
              <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} />
                  <span className="flex-1">{label}</span>
                  {badgeCount > 0 && (
                    <span
                      className={cn(
                        "ml-auto inline-flex items-center justify-center rounded-full text-[10px] font-bold min-w-[18px] h-[18px] px-1",
                        isActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-red-500 text-white"
                      )}
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
            </div>
          );
        })}
      </nav>

      {/* User / Signout */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        {/* Support & Legal links */}
        <div className="flex items-center gap-3 px-3 mb-2">
          <a
            href="/faq"
            onClick={(e) => { e.preventDefault(); navigate("/faq"); }}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Help & FAQ
          </a>
          <span className="text-muted-foreground/30">|</span>
          <a
            href="/contact"
            onClick={(e) => { e.preventDefault(); navigate("/contact"); }}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Support
          </a>
          <span className="text-muted-foreground/30">|</span>
          <a
            href="mailto:lee@yourcarguy806.com"
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Contact
          </a>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 rounded-md">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
            {user?.profile.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.profile.name ?? "User"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.profile.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 mt-1 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={handleSignout}
        >
          <LogOut size={16} />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
