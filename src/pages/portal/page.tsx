import { useQuery } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  Car, FileText, Wrench, Clock, CheckCircle2, AlertCircle,
  Phone, Mail, MapPin, LogOut, ChevronRight, Download, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { generateInvoicePDF } from "../invoices/_components/invoicePDF.ts";
import { useState } from "react";

// ─── Status helpers ────────────────────────────────────────────────────────────

const RO_STATUS_LABELS: Record<string, string> = {
  estimate: "Estimate",
  approved: "Approved",
  in_progress: "In Progress",
  waiting_parts: "Waiting Parts",
  completed: "Ready for Pickup",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const RO_STATUS_COLORS: Record<string, string> = {
  estimate: "bg-muted text-muted-foreground",
  approved: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-primary/15 text-primary",
  waiting_parts: "bg-yellow-500/15 text-yellow-400",
  completed: "bg-green-500/15 text-green-400",
  invoiced: "bg-purple-500/15 text-purple-400",
  cancelled: "bg-destructive/15 text-destructive",
};

const INV_STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-400",
  partial: "bg-yellow-500/15 text-yellow-400",
  paid: "bg-green-500/15 text-green-400",
  void: "bg-destructive/15 text-destructive",
};

// ─── Org ID from URL ──────────────────────────────────────────────────────────

function useOrgIdFromUrl(): Id<"organizations"> | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("org");
  return raw ? (raw as Id<"organizations">) : null;
}

// ─── Org picker (when no ?org= param) ─────────────────────────────────────────

function OrgPicker({ onSelect }: { onSelect: (id: Id<"organizations">) => void }) {
  const auth = useAuth();
  const orgs = useQuery(api.portal.findMyPortalOrgs, {});

  if (orgs === undefined) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 space-y-3">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6 max-w-md mx-auto">
        <AlertCircle className="text-yellow-400 mb-3" size={40} />
        <h2 className="text-xl font-bold">No account found</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          We couldn't find a customer account linked to your email. Please contact your mechanic to make sure your email address is on file.
        </p>
        <Button variant="ghost" size="sm" className="mt-6 cursor-pointer" onClick={() => void auth.removeUser()}>
          <LogOut size={14} className="mr-1" /> Sign out
        </Button>
      </div>
    );
  }

  // Auto-select if only one match
  if (orgs.length === 1) {
    onSelect(orgs[0].orgId);
    return null;
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12 space-y-4">
      <div className="text-center mb-6 space-y-1">
        <h2 className="text-xl font-bold">Select a shop</h2>
        <p className="text-muted-foreground text-sm">Your email is linked to multiple accounts</p>
      </div>
      {orgs.map(({ orgId, orgName, customerName }) => (
        <Card
          key={orgId}
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => onSelect(orgId)}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2 shrink-0">
              <Wrench size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold">{orgName}</p>
              <p className="text-sm text-muted-foreground">{customerName}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Portal inner (authenticated, org known) ──────────────────────────────────

function PortalInner({ orgId }: { orgId: Id<"organizations"> }) {
  const auth = useAuth();
  const data = useQuery(api.portal.getPortalData, { orgId });

  if (data === undefined) {
    return (
      <div className="p-6 space-y-3 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    );
  }

  const { customer, org, vehicles, repairOrders, invoices } = data;

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <AlertCircle className="text-destructive mb-3" size={40} />
        <h2 className="text-xl font-bold">Shop not found</h2>
        <p className="text-muted-foreground mt-1">This portal link may be invalid.</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 max-w-md mx-auto">
        <AlertCircle className="text-yellow-400 mb-3" size={40} />
        <h2 className="text-xl font-bold">Account not found</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          We couldn't find a customer account linked to your email at <strong>{org.name}</strong>.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          Please contact the shop to link your email to your account.
        </p>
        <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          {org.phone && <span className="flex items-center gap-1"><Phone size={13} />{org.phone}</span>}
          {org.email && <span className="flex items-center gap-1"><Mail size={13} />{org.email}</span>}
        </div>
        <Button variant="ghost" size="sm" className="mt-6 cursor-pointer" onClick={() => void auth.removeUser()}>
          <LogOut size={14} className="mr-1" /> Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            {org.logoUrl ? (
              <img src={org.logoUrl} alt={org.name} className="h-8 object-contain" />
            ) : (
              <span className="font-bold text-lg" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                {org.name}
              </span>
            )}
            <p className="text-xs text-muted-foreground">Customer Portal</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{customer.name}</span>
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => void auth.removeUser()}>
              <LogOut size={14} className="mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome */}
        <Card>
          <CardContent className="flex items-center gap-4 pt-5 pb-5">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-xl shrink-0">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-foreground">Welcome back, {customer.name.split(" ")[0]}!</p>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                {customer.phone && <span className="flex items-center gap-1"><Phone size={11} />{customer.phone}</span>}
                {customer.email && <span className="flex items-center gap-1"><Mail size={11} />{customer.email}</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Balance due banner */}
        {data.totalOwed > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-destructive">Balance Due</p>
              <p className="text-xl font-bold text-destructive">
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.totalOwed)}
              </p>
            </div>
            <Button
              size="sm"
              className="cursor-pointer font-semibold"
              onClick={() => {
                // Find the first unpaid invoice
                const unpaid = invoices.find((i) => i.balance > 0 && i.status !== "void" && i.status !== "paid");
                if (unpaid) {
                  window.open(`${window.location.origin}/pay?invoice=${unpaid._id}`, "_blank");
                }
              }}
            >
              <CreditCard size={14} className="mr-1.5" />
              Pay Now
            </Button>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="ros">
          <TabsList className="w-full">
            <TabsTrigger value="ros" className="flex-1 cursor-pointer">
              <Wrench size={14} className="mr-1" /> Service ({repairOrders.length})
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex-1 cursor-pointer">
              <FileText size={14} className="mr-1" /> Invoices ({invoices.length})
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="flex-1 cursor-pointer">
              <Car size={14} className="mr-1" /> Vehicles ({vehicles.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ros" className="mt-4">
            <ROList repairOrders={repairOrders} />
          </TabsContent>
          <TabsContent value="invoices" className="mt-4">
            <InvoiceList invoices={invoices} org={org} customer={customer} orgId={orgId} />
          </TabsContent>
          <TabsContent value="vehicles" className="mt-4">
            <VehicleList vehicles={vehicles} />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground border-t border-border pt-4 pb-8 space-y-1">
          <p className="font-medium text-foreground">{org.name}</p>
          {org.address && (
            <p className="flex items-center justify-center gap-1">
              <MapPin size={11} />
              {org.address}{org.city ? `, ${org.city}` : ""}{org.state ? `, ${org.state}` : ""}
            </p>
          )}
          <div className="flex justify-center gap-4">
            {org.phone && <a href={`tel:${org.phone}`} className="flex items-center gap-1 hover:text-primary"><Phone size={11} />{org.phone}</a>}
            {org.email && <a href={`mailto:${org.email}`} className="flex items-center gap-1 hover:text-primary"><Mail size={11} />{org.email}</a>}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type ROItem = {
  _id: Id<"repairOrders">;
  roNumber: string;
  status: string;
  complaint: string;
  correction?: string;
  scheduledAt?: string;
  completedAt?: string;
  totalAmount: number;
  vehicleSummary: string;
};

function ROList({ repairOrders }: { repairOrders: ROItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? repairOrders : repairOrders.slice(0, 5);

  if (repairOrders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Wrench size={32} className="mx-auto mb-3 opacity-30" />
        <p>No service history yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visible.map((ro) => (
        <Card key={ro._id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">{ro.roNumber}</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", RO_STATUS_COLORS[ro.status])}>
                    {RO_STATUS_LABELS[ro.status] ?? ro.status}
                  </span>
                </div>
                <p className="text-sm font-medium mt-1 truncate">{ro.complaint}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ro.vehicleSummary}</p>
              </div>
              <div className="text-right shrink-0">
                {(ro.completedAt ?? ro.scheduledAt) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                    <Clock size={10} /> {new Date(ro.completedAt ?? ro.scheduledAt!).toLocaleDateString()}
                  </p>
                )}
                <p className="text-sm font-semibold text-primary mt-1">${ro.totalAmount.toFixed(2)}</p>
              </div>
            </div>
            {ro.correction && (
              <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2 line-clamp-2">
                {ro.correction}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
      {!showAll && repairOrders.length > 5 && (
        <Button variant="ghost" className="w-full cursor-pointer" onClick={() => setShowAll(true)}>
          Show all {repairOrders.length} records <ChevronRight size={14} className="ml-1" />
        </Button>
      )}
    </div>
  );
}

type InvItem = {
  _id: Id<"invoices">;
  invoiceNumber: string;
  status: string;
  issuedAt: string;
  dueAt?: string;
  total: number;
  amountPaid: number;
  balance: number;
  vehicleSummary: string;
  roNumber: string;
  subtotal: number;
  taxAmount: number;
  payments: { method: string; amount: number; paidAt: string; reference?: string }[];
  notes?: string;
};

type OrgSnap = { name: string; phone?: string; email?: string; address?: string; city?: string; state?: string; zip?: string; logoUrl?: string };
type CustSnap = { name: string; phone?: string; email?: string; address?: string; city?: string; state?: string; zip?: string };

function InvoiceList({ invoices, org, customer }: { invoices: InvItem[]; org: OrgSnap; customer: CustSnap; orgId: Id<"organizations"> }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? invoices : invoices.slice(0, 5);

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText size={32} className="mx-auto mb-3 opacity-30" />
        <p>No invoices yet.</p>
      </div>
    );
  }

  const handleDownload = (inv: InvItem) => {
    setDownloadingId(inv._id);
    try {
      generateInvoicePDF({
        invoiceNumber: inv.invoiceNumber,
        issuedAt: inv.issuedAt,
        dueAt: inv.dueAt,
        status: inv.status,
        notes: inv.notes,
        customer: { name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, city: customer.city, state: customer.state, zip: customer.zip },
        vehicle: null,
        ro: null,
        org: { name: org.name, phone: org.phone, email: org.email, address: org.address, city: org.city, state: org.state, zip: org.zip },
        subtotal: inv.subtotal,
        taxAmount: inv.taxAmount,
        total: inv.total,
        amountPaid: inv.amountPaid,
        payments: inv.payments,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePayNow = (inv: InvItem) => {
    const payUrl = `${window.location.origin}/pay?invoice=${inv._id}`;
    window.open(payUrl, "_blank");
  };

  return (
    <div className="space-y-3">
      {visible.map((inv) => (
        <Card key={inv._id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">{inv.invoiceNumber}</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", INV_STATUS_COLORS[inv.status])}>
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{inv.vehicleSummary}</p>
                <p className="text-xs text-muted-foreground">{new Date(inv.issuedAt).toLocaleDateString()}</p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="text-sm font-bold text-primary">${inv.total.toFixed(2)}</p>
                {inv.balance > 0 && inv.status !== "void" && (
                  <p className="text-xs text-red-400 font-medium">Balance: ${inv.balance.toFixed(2)}</p>
                )}
                {inv.status === "paid" && (
                  <p className="text-xs text-green-400 flex items-center gap-1 justify-end">
                    <CheckCircle2 size={10} /> Paid
                  </p>
                )}
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              {inv.balance > 0 && inv.status !== "void" && inv.status !== "paid" && (
                <Button
                  size="sm" className="cursor-pointer text-xs"
                  onClick={() => handlePayNow(inv)}
                >
                  <CreditCard size={12} className="mr-1" />
                  Pay Now
                </Button>
              )}
              <Button
                size="sm" variant="ghost" className="cursor-pointer text-xs"
                disabled={downloadingId === inv._id}
                onClick={() => handleDownload(inv)}
              >
                <Download size={12} className="mr-1" />
                {downloadingId === inv._id ? "Generating..." : "Download PDF"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {!showAll && invoices.length > 5 && (
        <Button variant="ghost" className="w-full cursor-pointer" onClick={() => setShowAll(true)}>
          Show all {invoices.length} invoices <ChevronRight size={14} className="ml-1" />
        </Button>
      )}
    </div>
  );
}

type VehicleItem = { _id: Id<"vehicles">; year: string; make: string; model: string; licensePlate?: string; vin?: string; color?: string };

function VehicleList({ vehicles }: { vehicles: VehicleItem[] }) {
  if (vehicles.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Car size={32} className="mx-auto mb-3 opacity-30" />
        <p>No vehicles on file.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {vehicles.map((veh) => (
        <Card key={veh._id}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <Car size={18} className="text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">{veh.year} {veh.make} {veh.model}</p>
              <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                {veh.licensePlate && <span>Plate: {veh.licensePlate}</span>}
                {veh.vin && <span className="font-mono truncate">VIN: {veh.vin}</span>}
                {veh.color && <span>{veh.color}</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function PortalLogin() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-6 text-center">
        <div className="space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto">
            <Wrench className="text-primary" size={28} />
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Customer Portal
          </h1>
          <p className="text-muted-foreground text-sm">
            Sign in to view your service history, invoices, and vehicles.
          </p>
        </div>
        <SignInButton className="w-full" />
        <p className="text-xs text-muted-foreground">
          Use the same email address you provided when you visited the shop.
        </p>

        {/* Help section */}
        <div className="border-t border-border pt-5 mt-5 text-left space-y-3">
          <p className="text-xs font-medium text-foreground text-center">Need help signing in?</p>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <CheckCircle2 size={12} className="text-primary shrink-0 mt-0.5" />
              <span>Use the email your mechanic has on file for you</span>
            </div>
            <div className="flex gap-2">
              <CheckCircle2 size={12} className="text-primary shrink-0 mt-0.5" />
              <span>If you can&apos;t sign in, contact the shop to confirm your email</span>
            </div>
            <div className="flex gap-2">
              <CheckCircle2 size={12} className="text-primary shrink-0 mt-0.5" />
              <span>Once signed in, you can view past services, download invoices, and pay bills</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Authenticated shell — handles org selection ───────────────────────────────

function AuthenticatedShell({ urlOrgId }: { urlOrgId: Id<"organizations"> | null }) {
  const [selectedOrgId, setSelectedOrgId] = useState<Id<"organizations"> | null>(urlOrgId);

  if (selectedOrgId) {
    return <PortalInner orgId={selectedOrgId} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold text-primary tracking-wide" style={{ fontFamily: "Rajdhani, sans-serif" }}>
          ⚙ MechPro
        </span>
        <span className="text-xs text-muted-foreground">Customer Portal</span>
      </header>
      <OrgPicker onSelect={setSelectedOrgId} />
    </div>
  );
}

// ─── Page root ─────────────────────────────────────────────────────────────────

export default function PortalPage() {
  const orgId = useOrgIdFromUrl();

  return (
    <>
      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center">
          <Skeleton className="h-10 w-48" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <PortalLogin />
      </Unauthenticated>
      <Authenticated>
        <AuthenticatedShell urlOrgId={orgId} />
      </Authenticated>
    </>
  );
}
