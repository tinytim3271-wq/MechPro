import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import Sidebar from "./_components/Sidebar.tsx";
import MobileNav from "./_components/MobileNav.tsx";
import GlobalSearch from "./_components/GlobalSearch.tsx";
import NotificationBell from "./_components/NotificationBell.tsx";
import MessageNotificationWatcher from "@/components/MessageNotificationWatcher.tsx";
import OnboardingFlow from "@/pages/onboarding/page.tsx";
import { LocationFilterProvider } from "@/hooks/use-location-filter.tsx";
import { AccessProvider, useAccess } from "@/hooks/use-access.tsx";
import { useDeviceSession } from "@/hooks/use-device-session.ts";
import Paywall from "@/pages/paywall/page.tsx";
import DeviceBlocked from "./_components/DeviceBlocked.tsx";

// Routes that require admin access or non-tech role
const RESTRICTED_ROUTES = [
  "/admin", "/employees", "/marketing", "/import", "/settings", "/duplicates",
  "/dashboard", "/customers", "/vehicles", "/jobs", "/schedule",
  "/invoices", "/parts", "/revenue", "/locations", "/payroll",
];
const TECH_ROLES = ["mechanic", "mobile_mechanic"];

function AuthenticatedLayout() {
  const { hasAccess } = useAccess();
  const { isActiveDevice } = useDeviceSession();
  const currentOrg = useQuery(api.organizations.getCurrentOrg, {});
  const myOrgs = useQuery(api.organizations.getMyOrgs, {});
  const myRole = useQuery(api.admin.getMyRole, {});
  const setCurrentOrg = useMutation(api.users.setCurrentOrg);
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-select first org if user has orgs but none selected
  useEffect(() => {
    if (myOrgs && myOrgs.length > 0 && currentOrg === null) {
      void setCurrentOrg({ orgId: myOrgs[0]._id });
    }
  }, [myOrgs, currentOrg, setCurrentOrg]);

  // Role-based redirect: mechanics go to /tech by default
  useEffect(() => {
    if (!myRole) return;
    const isTech = TECH_ROLES.includes(myRole.role);
    const hasAdminAccess = myRole.hasAdminAccess;

    if (!isTech) return; // Non-tech users have no restrictions

    const isRestrictedRoute = RESTRICTED_ROUTES.some((r) => location.pathname.startsWith(r));

    // Techs without admin access can only visit /tech
    if (!hasAdminAccess && isRestrictedRoute) {
      navigate("/tech", { replace: true });
    }
  }, [myRole, location.pathname, navigate]);

  // Access check loading
  if (hasAccess === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  // No subscription — redirect customers to portal, show paywall for shop owners
  if (!hasAccess) {
    // If user has no org membership they're likely a customer who signed in
    // Redirect them to the free customer portal instead of the purchase page
    if (myOrgs !== undefined && myOrgs.length === 0) {
      navigate("/portal", { replace: true });
      return null;
    }
    return <Paywall />;
  }

  // Device session check — another device took over
  if (isActiveDevice === false) {
    return <DeviceBlocked />;
  }

  // Still loading org data (or device session still registering)
  if (currentOrg === undefined || myOrgs === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  // No org yet — show onboarding
  if (myOrgs.length === 0) {
    return <OnboardingFlow />;
  }

  return (
    <LocationFilterProvider>
      <MessageNotificationWatcher />
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar with global search and notifications */}
          <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-background shrink-0">
            <GlobalSearch />
            <NotificationBell />
          </header>
          <main className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
            <Outlet />
          </main>
        </div>
        <MobileNav />
      </div>
    </LocationFilterProvider>
  );
}

export default function AppLayout() {
  return (
    <>
      <AuthLoading>
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="space-y-3 w-64">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="text-center space-y-6 px-6">
            <div className="space-y-2">
              <h1
                className="text-4xl font-bold text-primary"
                style={{ fontFamily: "Rajdhani, sans-serif" }}
              >
                ⚙ MechPro
              </h1>
              <p className="text-muted-foreground text-lg">
                Mobile Mechanic Business Platform
              </p>
            </div>
            <SignInButton />
            <p className="text-xs text-muted-foreground">
              Sign in to access your dashboard, or{" "}
              <a href="/" className="text-primary hover:underline cursor-pointer">
                learn more about MechPro
              </a>
            </p>
          </div>
        </div>
      </Unauthenticated>
      <Authenticated>
        <AccessProvider>
          <AuthenticatedLayout />
        </AccessProvider>
      </Authenticated>
    </>
  );
}
