import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, HardHat, MoreHorizontal, X, Search,
  Users, Wrench, Sparkles, Settings, Shield, Car, Calendar, FileText,
  TrendingUp, UserCog, Package,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useLocationFilter } from "@/hooks/use-location-filter.tsx";
import { ADMIN_MORE_NAV, ADMIN_PRIMARY_NAV } from "@/lib/nav-config.ts";
import GlobalSearch from "./GlobalSearch.tsx";

const ADMIN_PRIMARY = [...ADMIN_PRIMARY_NAV];
const ADMIN_MORE_ITEMS = [...ADMIN_MORE_NAV];

const TECH_PRIMARY = [
  { to: "/tech", icon: HardHat, label: "My Jobs" },
  { to: "/ai", icon: Sparkles, label: "AI Tools" },
];

const TECH_ADMIN_PRIMARY = [
  { to: "/tech", icon: HardHat, label: "My Jobs" },
  { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/jobs", icon: Wrench, label: "Jobs" },
];

const TECH_ADMIN_MORE = [
  { to: "/customers", icon: Users, label: "Customers" },
  { to: "/vehicles", icon: Car, label: "Lookup" },
  { to: "/schedule", icon: Calendar, label: "Schedule" },
  { to: "/invoices", icon: FileText, label: "Invoices" },
  { to: "/revenue", icon: TrendingUp, label: "Revenue Report" },
  { to: "/employees", icon: UserCog, label: "Employees" },
  { to: "/parts", icon: Package, label: "Parts" },
  { to: "/ai", icon: Sparkles, label: "AI Tools" },
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/admin", icon: Shield, label: "Admin Portal" },
];

const TECH_ROLES = ["mechanic", "mobile_mechanic"];

export default function MobileNav() {
  const myRole = useQuery(api.admin.getMyRole, {});
  const role = myRole?.role ?? null;
  const isTech = role ? TECH_ROLES.includes(role) : false;
  const hasAdminAccess = myRole?.hasAdminAccess ?? false;
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const { selectedLocationId } = useLocationFilter();

  // Fetch notification badge counts
  const badges = useQuery(api.notifications.getBadgeCounts, selectedLocationId ? { locationId: selectedLocationId } : {});

  const badgeMap: Record<string, number> = {
    "/schedule": badges?.pendingBookings ?? 0,
    "/invoices": badges?.overdueInvoices ?? 0,
    "/jobs": badges?.overdueJobs ?? 0,
    "/parts": badges?.lowStockParts ?? 0,
  };
  const totalAlerts = Object.values(badgeMap).reduce((sum, n) => sum + n, 0);
  if (totalAlerts > 0) {
    badgeMap["/dashboard"] = totalAlerts;
  }

  let primaryItems;
  let moreItems: typeof ADMIN_MORE_ITEMS | typeof TECH_ADMIN_MORE;
  if (isTech && hasAdminAccess) {
    primaryItems = TECH_ADMIN_PRIMARY;
    moreItems = TECH_ADMIN_MORE;
  } else if (isTech) {
    primaryItems = TECH_PRIMARY;
    moreItems = [];
  } else {
    primaryItems = ADMIN_PRIMARY;
    moreItems = ADMIN_MORE_ITEMS;
  }

  // Check if current page is in the "More" menu
  const isMoreActive = moreItems.some((item) => location.pathname.startsWith(item.to));

  return (
    <>
      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm md:hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <div className="flex-1">
              <GlobalSearch />
            </div>
            <button
              onClick={() => setSearchOpen(false)}
              className="p-2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-12">
            Search customers, repair orders, and invoices
          </p>
        </div>
      )}

      {/* More menu overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm md:hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2
              className="text-lg font-bold text-foreground"
              style={{ fontFamily: "Rajdhani, sans-serif" }}
            >
              All Pages
            </h2>
            <button
              onClick={() => setMoreOpen(false)}
              className="p-2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
          <nav className="p-4 grid grid-cols-3 gap-3 overflow-y-auto max-h-[calc(100vh-80px)]">
            {moreItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors cursor-pointer",
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30"
                  )
                }
              >
                <Icon size={22} />
                <span className="text-xs font-medium text-center leading-tight">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 left-0 right-0 flex justify-around items-center border-t border-border bg-sidebar md:hidden z-50 pb-[env(safe-area-inset-bottom)]">
        {primaryItems.map(({ to, icon: Icon, label }) => {
          const badgeCount = badgeMap[to] ?? 0;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] transition-colors cursor-pointer min-w-0",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <div className="relative">
                <Icon size={20} />
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold min-w-[14px] h-[14px] px-0.5">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </div>
              {label}
            </NavLink>
          );
        })}

        {/* Search button */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] text-muted-foreground transition-colors cursor-pointer"
        >
          <Search size={20} />
          Search
        </button>

        {/* More button (only if there are more items) */}
        {moreItems.length > 0 && (
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] transition-colors cursor-pointer",
              isMoreActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal size={20} />
            More
          </button>
        )}
      </nav>
    </>
  );
}
