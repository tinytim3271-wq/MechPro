import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AppLayout from "./pages/_layout/AppLayout.tsx";
import AuthCallback from "./pages/auth/Callback.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import PwaInstallBanner from "./components/PwaInstallBanner.tsx";
import { useServiceWorker } from "@/hooks/use-service-worker.ts";

// ─── Eagerly loaded (critical path — needed immediately on login) ─────────────
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Dashboard from "./pages/dashboard/page.tsx";

// ─── Lazily loaded (split into separate chunks, loaded on first visit) ────────
const CustomersPage  = lazy(() => import("./pages/customers/page.tsx"));
const VehiclesPage   = lazy(() => import("./pages/vehicles/page.tsx"));
const JobsPage       = lazy(() => import("./pages/jobs/page.tsx"));
const SchedulePage   = lazy(() => import("./pages/schedule/page.tsx"));
const InvoicesPage   = lazy(() => import("./pages/invoices/page.tsx"));
const EmployeesPage  = lazy(() => import("./pages/employees/page.tsx"));
const PartsPage      = lazy(() => import("./pages/parts/page.tsx"));
const AIPage         = lazy(() => import("./pages/ai/page.tsx"));
const AIEstimatePage = lazy(() => import("./pages/ai-estimate/page.tsx"));
const MarketingPage  = lazy(() => import("./pages/marketing/page.tsx"));
const RevenuePage    = lazy(() => import("./pages/revenue/page.tsx"));
const ImportPage     = lazy(() => import("./pages/import/page.tsx"));
const DuplicatesPage = lazy(() => import("./pages/duplicates/page.tsx"));
const SettingsPage   = lazy(() => import("./pages/settings/page.tsx"));
const AdminPage      = lazy(() => import("./pages/admin/page.tsx"));
const TechPage       = lazy(() => import("./pages/tech/page.tsx"));
const LocationsPage   = lazy(() => import("./pages/locations/page.tsx"));
const PortalPage     = lazy(() => import("./pages/portal/page.tsx"));
const BookPage       = lazy(() => import("./pages/book/page.tsx"));
const PrivacyPage    = lazy(() => import("./pages/privacy/page.tsx"));
const TermsPage      = lazy(() => import("./pages/terms/page.tsx"));
const PayPage        = lazy(() => import("./pages/pay/page.tsx"));
const ApprovePage    = lazy(() => import("./pages/approve/page.tsx"));
const FAQPage        = lazy(() => import("./pages/faq/page.tsx"));
const ContactPage    = lazy(() => import("./pages/contact/page.tsx"));
const TrackingPage   = lazy(() => import("./pages/tracking/page.tsx"));
const DownloadPage   = lazy(() => import("./pages/download/page.tsx"));
const PayrollPage    = lazy(() => import("./pages/payroll/page.tsx"));
const ObdPage        = lazy(() => import("./pages/obd/page.tsx"));
const KeysPage       = lazy(() => import("./pages/keys/page.tsx"));

// ─── Page loading fallback ────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="space-y-3 w-full max-w-sm">
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-4 w-64 mx-auto" />
        <Skeleton className="h-4 w-40 mx-auto" />
      </div>
    </div>
  );
}

export default function App() {
  useServiceWorker();

  return (
    <DefaultProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/portal" element={<Suspense fallback={<PageLoader />}><PortalPage /></Suspense>} />
          <Route path="/book" element={<Suspense fallback={<PageLoader />}><BookPage /></Suspense>} />
          <Route path="/pay" element={<Suspense fallback={<PageLoader />}><PayPage /></Suspense>} />
          <Route path="/approve" element={<Suspense fallback={<PageLoader />}><ApprovePage /></Suspense>} />
          <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><PrivacyPage /></Suspense>} />
          <Route path="/terms" element={<Suspense fallback={<PageLoader />}><TermsPage /></Suspense>} />
          <Route path="/faq" element={<Suspense fallback={<PageLoader />}><FAQPage /></Suspense>} />
          <Route path="/contact" element={<Suspense fallback={<PageLoader />}><ContactPage /></Suspense>} />
          <Route path="/download" element={<Suspense fallback={<PageLoader />}><DownloadPage /></Suspense>} />
          <Route path="/" element={<Index />} />
          <Route element={<AppLayout />}>
            {/* Dashboard loaded eagerly — it's the first page after login */}
            <Route path="/dashboard" element={<Dashboard />} />

            {/* All other pages are code-split and lazy-loaded */}
            <Route path="/customers"  element={<Suspense fallback={<PageLoader />}><CustomersPage /></Suspense>} />
            <Route path="/vehicles"   element={<Suspense fallback={<PageLoader />}><VehiclesPage /></Suspense>} />
            <Route path="/jobs"       element={<Suspense fallback={<PageLoader />}><JobsPage /></Suspense>} />
            <Route path="/schedule"   element={<Suspense fallback={<PageLoader />}><SchedulePage /></Suspense>} />
            <Route path="/invoices"   element={<Suspense fallback={<PageLoader />}><InvoicesPage /></Suspense>} />
            <Route path="/employees"  element={<Suspense fallback={<PageLoader />}><EmployeesPage /></Suspense>} />
            <Route path="/payroll"    element={<Suspense fallback={<PageLoader />}><PayrollPage /></Suspense>} />
            <Route path="/obd"        element={<Suspense fallback={<PageLoader />}><ObdPage /></Suspense>} />
            <Route path="/keys"       element={<Suspense fallback={<PageLoader />}><KeysPage /></Suspense>} />
            <Route path="/parts"      element={<Suspense fallback={<PageLoader />}><PartsPage /></Suspense>} />
            <Route path="/ai"         element={<Suspense fallback={<PageLoader />}><AIPage /></Suspense>} />
            <Route path="/ai-estimate" element={<Suspense fallback={<PageLoader />}><AIEstimatePage /></Suspense>} />
            <Route path="/marketing"  element={<Suspense fallback={<PageLoader />}><MarketingPage /></Suspense>} />
            <Route path="/revenue"    element={<Suspense fallback={<PageLoader />}><RevenuePage /></Suspense>} />
            <Route path="/import"     element={<Suspense fallback={<PageLoader />}><ImportPage /></Suspense>} />
            <Route path="/duplicates" element={<Suspense fallback={<PageLoader />}><DuplicatesPage /></Suspense>} />
            <Route path="/settings"   element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
            <Route path="/admin"      element={<Suspense fallback={<PageLoader />}><AdminPage /></Suspense>} />
            <Route path="/tech"       element={<Suspense fallback={<PageLoader />}><TechPage /></Suspense>} />
            <Route path="/locations"  element={<Suspense fallback={<PageLoader />}><LocationsPage /></Suspense>} />
            <Route path="/tracking"  element={<Suspense fallback={<PageLoader />}><TrackingPage /></Suspense>} />
            <Route path="/messages"  element={<Suspense fallback={<PageLoader />}><MessagesPage /></Suspense>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        <PwaInstallBanner />
      </BrowserRouter>
    </DefaultProviders>
  );
}
