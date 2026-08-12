import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import {
  User, Car, MessageSquare, Sparkles, ClipboardList,
  Check, ChevronRight, ChevronLeft, Search, Plus,
  AlertTriangle, Clock, Wrench, RefreshCw, X, QrCode, UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { useNavigate } from "react-router-dom";
import VinLookupDialog from "./VinLookupDialog.tsx";
import type { VehicleInfo } from "./VinLookupDialog.tsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type Customer = {
  _id: Id<"customers">;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type Vehicle = {
  _id: Id<"vehicles">;
  year: string;
  make: string;
  model: string;
  trim?: string;
  vin?: string;
  engine?: string;
  mileageIn?: number;
};

type DiagnosisResult = {
  probableCauses: Array<{ cause: string; likelihood: string; explanation: string }>;
  recommendedTests: string[];
  urgency: string;
  estimatedLaborHours: number;
  additionalNotes: string;
};

type EstimateResult = {
  lineItems: Array<{
    service: string;
    laborHours: number;
    laborCost: number;
    partsCost: number;
    total: number;
    notes: string;
  }>;
  subtotal: number;
  summary: string;
};

// Build a professional, customer-friendly diagnosis summary (no AI mention)
function buildDiagnosisSummary(diagnosis: DiagnosisResult): string {
  const parts: string[] = [];

  // Lead with the most likely causes
  const topCauses = diagnosis.probableCauses.filter(
    (c) => c.likelihood === "High" || c.likelihood === "Medium"
  );
  if (topCauses.length > 0) {
    parts.push(
      "Based on inspection findings, the most likely " +
        (topCauses.length === 1 ? "cause is" : "causes are") +
        ": " +
        topCauses.map((c) => `${c.cause} — ${c.explanation}`).join("; ") +
        "."
    );
  } else if (diagnosis.probableCauses.length > 0) {
    parts.push(
      "Possible " +
        (diagnosis.probableCauses.length === 1 ? "cause" : "causes") +
        ": " +
        diagnosis.probableCauses.map((c) => c.cause).join(", ") +
        "."
    );
  }

  // Recommended tests
  if (diagnosis.recommendedTests.length > 0) {
    parts.push(
      "Recommended diagnostic steps: " +
        diagnosis.recommendedTests.join(", ") +
        "."
    );
  }

  // Additional notes
  if (diagnosis.additionalNotes) {
    parts.push(diagnosis.additionalNotes);
  }

  return parts.join("\n\n");
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: "Customer", icon: User },
  { label: "Vehicle", icon: Car },
  { label: "Concern", icon: MessageSquare },
  { label: "Diagnosis", icon: Sparkles },
  { label: "Estimate", icon: ClipboardList },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center flex-1">
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all shrink-0",
              done ? "text-green-400" : active ? "text-primary font-semibold" : "text-muted-foreground"
            )}>
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border",
                done ? "bg-green-400/20 border-green-400 text-green-400" :
                  active ? "bg-primary/20 border-primary text-primary" :
                    "bg-muted border-border text-muted-foreground"
              )}>
                {done ? <Check size={10} /> : <Icon size={10} />}
              </div>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("flex-1 h-px mx-1", i < current ? "bg-green-400/40" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Customer ─────────────────────────────────────────────────────────

function CustomerStep({
  onSelect,
}: {
  onSelect: (c: Customer) => void;
}) {
  const { results: customersPage } = usePaginatedQuery(api.customers.listCustomers, {}, { initialNumItems: 200 });
  const customers = customersPage as Customer[] | undefined;
  const createCustomer = useMutation(api.customers.createCustomer);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"search" | "new">("search");
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", city: "", state: "", zip: "" });
  const [saving, setSaving] = useState(false);

  const filtered = customers?.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.address ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.city ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const [smsConsent, setSmsConsent] = useState(false);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const id = await createCustomer({
        name: form.name.trim(),
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        zip: form.zip || undefined,
        source: "intake",
        smsOptOut: form.phone ? !smsConsent : undefined,
      });
      onSelect({ _id: id, name: form.name, phone: form.phone || undefined, email: form.email || undefined });
    } catch {
      toast.error("Failed to create customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
          Customer
        </h2>
        <p className="text-sm text-muted-foreground">Search for an existing customer or add a new one.</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setMode("search")}
          className={cn("flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer",
            mode === "search" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
          )}
        >
          <Search size={13} className="inline mr-1.5" /> Search Existing
        </button>
        <button
          onClick={() => setMode("new")}
          className={cn("flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer",
            mode === "new" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
          )}
        >
          <Plus size={13} className="inline mr-1.5" /> New Customer
        </button>
      </div>

      {mode === "search" && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, phone, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          {customers === undefined ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-border">
              {filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">
                  No customers found.{" "}
                  <button className="text-primary underline cursor-pointer" onClick={() => setMode("new")}>Add new</button>
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c._id}
                    onClick={() => onSelect(c)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left cursor-pointer border-b border-border/50 last:border-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact info"}
                      </p>
                      {(c.city || c.address) && (
                        <p className="text-xs text-muted-foreground/70 truncate">
                          {[c.address, c.city, c.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {mode === "new" && (
        <div className="space-y-3">
          <div>
            <Label>Full Name *</Label>
            <Input
              placeholder="John Smith"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input
                placeholder="(555) 000-0000"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                placeholder="john@example.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>Street Address</Label>
            <Input
              placeholder="123 Main St"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>City</Label>
              <Input
                placeholder="Rapid City"
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
              />
            </div>
            <div>
              <Label>State</Label>
              <Input
                placeholder="SD"
                value={form.state}
                onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
              />
            </div>
            <div>
              <Label>ZIP</Label>
              <Input
                placeholder="57701"
                value={form.zip}
                onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))}
              />
            </div>
          </div>
          {/* SMS consent disclosure */}
          {form.phone && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  className="mt-0.5 accent-primary cursor-pointer"
                />
                <span className="text-xs text-foreground leading-relaxed">
                  Customer consents to receive service-related text messages (status updates, appointment reminders) from MechPro at the phone number provided. Message & data rates may apply. Reply STOP to opt out at any time.
                </span>
              </label>
              <p className="text-[10px] text-muted-foreground pl-5 leading-relaxed">
                By checking this box, you confirm the customer has been informed and agreed to receive SMS communications. MechPro, 806 E Blvd N, Rapid City, SD 57701. Msg frequency varies. Reply HELP for help.
              </p>
            </div>
          )}

          <Button onClick={handleCreate} disabled={saving} className="w-full cursor-pointer">
            {saving ? "Creating…" : "Create & Continue"}
            <ChevronRight size={14} className="ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Vehicle ──────────────────────────────────────────────────────────

function VehicleStep({
  customer,
  onSelect,
}: {
  customer: Customer;
  onSelect: (v: Vehicle) => void;
}) {
  const vehicles = useQuery(api.customers.listVehicles, { customerId: customer._id }) as Vehicle[] | undefined;
  const createVehicle = useMutation(api.customers.createVehicle);
  const [mode, setMode] = useState<"list" | "new">("list");
  const [form, setForm] = useState({
    year: "", make: "", model: "", trim: "", vin: "", engine: "", mileageIn: "",
  });
  const [saving, setSaving] = useState(false);
  const [vinLookupOpen, setVinLookupOpen] = useState(false);

  useEffect(() => {
    if (vehicles && vehicles.length === 0) setMode("new");
  }, [vehicles]);

  // Auto-fill form from VIN/plate lookup result
  const handleVinResult = (info: VehicleInfo) => {
    setForm((prev) => ({
      ...prev,
      year: info.year || prev.year,
      make: info.make || prev.make,
      model: info.model || prev.model,
      trim: info.trim ?? prev.trim,
      vin: info.vin ?? prev.vin,
      engine: info.engine ?? prev.engine,
    }));
    setMode("new");
    toast.success("Vehicle details auto-filled from lookup");
  };

  const handleCreate = async () => {
    if (!form.year || !form.make || !form.model) { toast.error("Year, make, and model are required"); return; }
    setSaving(true);
    try {
      const id = await createVehicle({
        customerId: customer._id,
        year: form.year,
        make: form.make,
        model: form.model,
        trim: form.trim || undefined,
        vin: form.vin || undefined,
        engine: form.engine || undefined,
        mileageIn: form.mileageIn ? Number(form.mileageIn) : undefined,
      });
      onSelect({
        _id: id,
        year: form.year, make: form.make, model: form.model,
        trim: form.trim || undefined, vin: form.vin || undefined,
        engine: form.engine || undefined,
        mileageIn: form.mileageIn ? Number(form.mileageIn) : undefined,
      });
    } catch {
      toast.error("Failed to add vehicle");
    } finally {
      setSaving(false);
    }
  };

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Vehicle
          </h2>
          <p className="text-sm text-muted-foreground">
            Select {customer.name}'s vehicle or add a new one.
          </p>
        </div>
        {/* VIN / Plate lookup trigger */}
        <button
          onClick={() => setVinLookupOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors cursor-pointer shrink-0"
        >
          <QrCode size={13} />
          VIN / Plate Lookup
        </button>
      </div>

      {vehicles !== undefined && vehicles.length > 0 && (
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setMode("list")}
            className={cn("flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer",
              mode === "list" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            <Car size={13} className="inline mr-1.5" /> Existing Vehicles
          </button>
          <button
            onClick={() => setMode("new")}
            className={cn("flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer",
              mode === "new" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            <Plus size={13} className="inline mr-1.5" /> Add Vehicle
          </button>
        </div>
      )}

      {mode === "list" && (
        vehicles === undefined ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : (
          <div className="space-y-2">
            {vehicles.map((v) => (
              <button
                key={v._id}
                onClick={() => onSelect(v)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/20 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Car size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">
                    {v.year} {v.make} {v.model}{v.trim ? ` ${v.trim}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[v.vin ? `VIN: ${v.vin}` : null, v.engine, v.mileageIn ? `${v.mileageIn.toLocaleString()} mi` : null]
                      .filter(Boolean).join(" · ") || "No additional info"}
                  </p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )
      )}

      {mode === "new" && (
        <div className="space-y-3">
          {/* VIN lookup inline CTA when form is empty */}
          {!form.make && !form.year && (
            <button
              onClick={() => setVinLookupOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 transition-colors cursor-pointer"
            >
              <QrCode size={16} />
              Scan VIN barcode or enter VIN / plate to auto-fill
            </button>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Year *</Label>
              <Input placeholder="2020" value={form.year} onChange={f("year")} />
            </div>
            <div>
              <Label>Make *</Label>
              <Input placeholder="Ford" value={form.make} onChange={f("make")} />
            </div>
            <div>
              <Label>Model *</Label>
              <Input placeholder="F-150" value={form.model} onChange={f("model")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Trim</Label>
              <Input placeholder="XLT" value={form.trim} onChange={f("trim")} />
            </div>
            <div>
              <Label>Engine</Label>
              <Input placeholder="5.0L V8" value={form.engine} onChange={f("engine")} />
            </div>
            <div>
              <Label>VIN</Label>
              <div className="flex gap-1.5">
                <Input
                  placeholder="1FTFW1ET0..."
                  value={form.vin}
                  onChange={f("vin")}
                  className="font-mono text-xs"
                />
                <button
                  onClick={() => setVinLookupOpen(true)}
                  className="shrink-0 px-2 rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                  title="Scan or look up VIN"
                >
                  <QrCode size={14} />
                </button>
              </div>
            </div>
            <div>
              <Label>Mileage In</Label>
              <Input type="number" placeholder="87000" value={form.mileageIn} onChange={f("mileageIn")} />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={saving} className="w-full cursor-pointer">
            {saving ? "Adding…" : "Add Vehicle & Continue"}
            <ChevronRight size={14} className="ml-1" />
          </Button>
        </div>
      )}

      {/* VIN / Plate Lookup Dialog */}
      <VinLookupDialog
        open={vinLookupOpen}
        onClose={() => setVinLookupOpen(false)}
        onConfirm={handleVinResult}
      />
    </div>
  );
}

// ─── Step 3: Customer Concern ─────────────────────────────────────────────────

function ConcernStep({
  customer,
  vehicle,
  concern, setConcern,
  dtcCodes, setDtcCodes,
  mileage, setMileage,
  priority, setPriority,
  onNext,
}: {
  customer: Customer;
  vehicle: Vehicle;
  concern: string; setConcern: (v: string) => void;
  dtcCodes: string; setDtcCodes: (v: string) => void;
  mileage: string; setMileage: (v: string) => void;
  priority: "low" | "normal" | "high"; setPriority: (v: "low" | "normal" | "high") => void;
  onNext: () => void;
}) {
  const vehicleSummary = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}${vehicle.engine ? ` ${vehicle.engine}` : ""}`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
          Customer Concern
        </h2>
        <p className="text-sm text-muted-foreground">
          {customer.name} · {vehicleSummary}
        </p>
      </div>

      <div className="space-y-1">
        <Label>Customer Complaint *</Label>
        <Textarea
          placeholder="Describe what the customer is experiencing — e.g. 'engine shaking at idle, check engine light on, car feels sluggish under acceleration'"
          value={concern}
          onChange={(e) => setConcern(e.target.value)}
          rows={4}
          autoFocus
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">Be as descriptive as possible for better AI results.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>DTC / Error Codes</Label>
          <Input
            placeholder="P0300, P0171…"
            value={dtcCodes}
            onChange={(e) => setDtcCodes(e.target.value)}
          />
        </div>
        <div>
          <Label>Current Mileage</Label>
          <Input
            type="number"
            placeholder={vehicle.mileageIn ? String(vehicle.mileageIn) : "87000"}
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Priority</Label>
        <div className="flex gap-2">
          {(["low", "normal", "high"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={cn(
                "flex-1 py-1.5 rounded-lg border text-xs font-semibold capitalize transition-colors cursor-pointer",
                priority === p
                  ? p === "high" ? "border-destructive bg-destructive/10 text-destructive"
                    : p === "normal" ? "border-primary bg-primary/10 text-primary"
                      : "border-muted-foreground bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <Button
        className="w-full cursor-pointer"
        onClick={onNext}
        disabled={!concern.trim()}
      >
        <Sparkles size={14} className="mr-2" />
        Run AI Diagnosis
        <ChevronRight size={14} className="ml-1" />
      </Button>
    </div>
  );
}

// ─── Step 4: AI Diagnosis ─────────────────────────────────────────────────────

const URGENCY_COLORS: Record<string, string> = {
  Immediate: "text-destructive bg-destructive/10 border-destructive/30",
  Soon: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  Monitor: "text-blue-400 bg-blue-400/10 border-blue-400/30",
};

const LIKELIHOOD_COLORS: Record<string, string> = {
  High: "text-destructive",
  Medium: "text-yellow-400",
  Low: "text-muted-foreground",
};

function DiagnosisStep({
  vehicle,
  concern,
  dtcCodes,
  diagnosis,
  setDiagnosis,
  onNext,
  onSkip,
}: {
  vehicle: Vehicle;
  concern: string;
  dtcCodes: string;
  diagnosis: DiagnosisResult | null;
  setDiagnosis: (d: DiagnosisResult) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const diagnoseAI = useAction(api.ai.diagnose);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicleSummary = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.engine ? ` ${vehicle.engine}` : ""}`;

  const runDiagnosis = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await diagnoseAI({
        vehicle: vehicleSummary,
        symptoms: concern,
        dtcCodes: dtcCodes || undefined,
      });
      setDiagnosis(result);
    } catch {
      setError("AI diagnosis failed. You can skip this step and continue manually.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-run on mount if not already done
  useEffect(() => {
    if (!diagnosis && !loading) {
      runDiagnosis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            AI Diagnosis
          </h2>
          <p className="text-sm text-muted-foreground">{vehicleSummary}</p>
        </div>
        {!loading && (
          <button onClick={runDiagnosis} className="text-xs text-primary flex items-center gap-1 cursor-pointer hover:underline">
            <RefreshCw size={11} /> Re-run
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <RefreshCw size={16} className="animate-spin text-primary shrink-0" />
            Analyzing symptoms with AI…
          </div>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm">
          <AlertTriangle size={15} className="text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-foreground">{error}</p>
            <button onClick={onSkip} className="text-primary text-xs mt-1 cursor-pointer hover:underline">
              Skip to Estimate →
            </button>
          </div>
        </div>
      )}

      {diagnosis && !loading && (
        <>
          {/* Urgency banner */}
          <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold", URGENCY_COLORS[diagnosis.urgency] ?? "text-muted-foreground bg-muted border-border")}>
            <Clock size={14} />
            {diagnosis.urgency} attention · Est. {diagnosis.estimatedLaborHours}h labor
          </div>

          {/* Probable causes */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Probable Causes</p>
            {diagnosis.probableCauses.map((c, i) => (
              <div key={i} className="border border-border rounded-lg px-3 py-2.5 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-bold", LIKELIHOOD_COLORS[c.likelihood])}>
                    {c.likelihood}
                  </span>
                  <p className="text-sm font-medium text-foreground">{c.cause}</p>
                </div>
                <p className="text-xs text-muted-foreground">{c.explanation}</p>
              </div>
            ))}
          </div>

          {/* Recommended tests */}
          {diagnosis.recommendedTests.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recommended Tests</p>
              <div className="flex flex-wrap gap-1.5">
                {diagnosis.recommendedTests.map((t, i) => (
                  <span key={i} className="text-xs bg-secondary border border-border rounded px-2 py-0.5 text-foreground">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Additional notes */}
          {diagnosis.additionalNotes && (
            <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3 italic">
              {diagnosis.additionalNotes}
            </p>
          )}

          <Button className="w-full cursor-pointer" onClick={onNext}>
            <Sparkles size={14} className="mr-2" />
            Build AI Estimate
            <ChevronRight size={14} className="ml-1" />
          </Button>
        </>
      )}

      {!loading && !diagnosis && !error && (
        <Button className="w-full cursor-pointer" onClick={onSkip}>
          Skip to Estimate <ChevronRight size={14} className="ml-1" />
        </Button>
      )}
    </div>
  );
}

// ─── Step 5: AI Estimate + Create RO ─────────────────────────────────────────

function EstimateStep({
  customer,
  vehicle,
  concern,
  diagnosis,
  onFinish,
}: {
  customer: Customer;
  vehicle: Vehicle;
  concern: string;
  diagnosis: DiagnosisResult | null;
  onFinish: (roId: Id<"repairOrders">) => void;
}) {
  const estimateAI = useAction(api.ai.estimate);
  const createRO = useMutation(api.repairOrders.createRO);
  const updateROLines = useMutation(api.repairOrders.updateROLines);
  const org = useQuery(api.organizations.getCurrentOrg, {});
  const orgId = org?._id as Id<"organizations"> | undefined;
  const employees = useQuery(api.employees.listMembers, orgId ? { orgId } : "skip");

  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string>("");

  // Editable line items
  const [lines, setLines] = useState<Array<{
    service: string; laborHours: number; laborCost: number; partsCost: number; total: number; notes: string;
  }>>([]);

  const vehicleSummary = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.engine ? ` ${vehicle.engine}` : ""}`;

  const runEstimate = async () => {
    setLoading(true);
    setError(null);
    try {
      // Build services string from diagnosis causes or plain concern
      const services = diagnosis
        ? diagnosis.probableCauses.slice(0, 3).map((c) => c.cause).join(", ")
        : concern;
      const result = await estimateAI({ vehicle: vehicleSummary, services });
      setEstimate(result);
      setLines(result.lineItems);
    } catch {
      setError("Failed to generate AI estimate.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!estimate && !loading) runEstimate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = lines.reduce((s, l) => s + l.total, 0);

  const updateLine = (i: number, field: keyof typeof lines[0], value: string | number) =>
    setLines((prev) => prev.map((l, idx) =>
      idx === i ? { ...l, [field]: value, total: idx === i ? (
        field === "laborCost" ? Number(value) + l.partsCost :
          field === "partsCost" ? l.laborCost + Number(value) : l.total
      ) : l.total } : l
    ));

  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const addLine = () => setLines((prev) => [...prev, { service: "Additional Service", laborHours: 1, laborCost: 120, partsCost: 0, total: 120, notes: "" }]);

  const handleCreateRO = async () => {
    setCreating(true);
    try {
      const roId = await createRO({
        customerId: customer._id,
        vehicleId: vehicle._id,
        isMobile: false,
        complaint: concern,
        priority: "normal",
        mileageIn: vehicle.mileageIn,
        assignedTo: assignedTo ? (assignedTo as Id<"orgMembers">) : undefined,
        serviceAddress: customer.address || undefined,
        serviceCity: customer.city || undefined,
        serviceState: customer.state || undefined,
        serviceZip: customer.zip || undefined,
      });

      // Add the line items if we have an estimate
      if (lines.length > 0) {
        await updateROLines({
          roId,
          laborLines: lines.map((l) => ({
            description: l.service,
            laborHours: l.laborHours,
            laborRate: l.laborHours > 0 ? Math.round(l.laborCost / l.laborHours) : 120,
            techNotes: l.notes || undefined,
          })),
          partLines: lines.filter((l) => l.partsCost > 0).map((l) => ({
            description: `Parts — ${l.service}`,
            quantity: 1,
            unitCost: l.partsCost,
            unitPrice: Math.round(l.partsCost * 1.25),
          })),
          shopFees: [],
          cause: diagnosis ? buildDiagnosisSummary(diagnosis) : undefined,
        });
      }

      toast.success("Repair order created!");
      onFinish(roId);
    } catch {
      toast.error("Failed to create repair order");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            AI Estimate
          </h2>
          <p className="text-sm text-muted-foreground">{vehicleSummary}</p>
        </div>
        {!loading && (
          <button onClick={runEstimate} className="text-xs text-primary flex items-center gap-1 cursor-pointer hover:underline">
            <RefreshCw size={11} /> Re-run
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <RefreshCw size={16} className="animate-spin text-primary" />
            Building AI estimate…
          </div>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm">
          <AlertTriangle size={15} className="text-destructive shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {lines.length > 0 && !loading && (
        <>
          {estimate?.summary && (
            <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3 italic">
              {estimate.summary}
            </p>
          )}

          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    className="font-medium text-sm h-8 flex-1"
                    value={line.service}
                    onChange={(e) => updateLine(i, "service", e.target.value)}
                  />
                  <button onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive cursor-pointer shrink-0">
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Labor Hrs</Label>
                    <Input
                      type="number" step="0.5" min="0"
                      className="h-7 text-xs"
                      value={line.laborHours}
                      onChange={(e) => {
                        const hrs = Number(e.target.value);
                        const rate = line.laborHours > 0 ? line.laborCost / line.laborHours : 120;
                        const newLaborCost = Math.round(hrs * rate);
                        setLines((prev) => prev.map((l, idx) =>
                          idx === i ? { ...l, laborHours: hrs, laborCost: newLaborCost, total: newLaborCost + l.partsCost } : l
                        ));
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Labor Cost</Label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">$</span>
                      <Input
                        type="number" min="0"
                        className="h-7 text-xs pl-4"
                        value={line.laborCost}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setLines((prev) => prev.map((l, idx) =>
                            idx === i ? { ...l, laborCost: v, total: v + l.partsCost } : l
                          ));
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Parts Cost</Label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">$</span>
                      <Input
                        type="number" min="0"
                        className="h-7 text-xs pl-4"
                        value={line.partsCost}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setLines((prev) => prev.map((l, idx) =>
                            idx === i ? { ...l, partsCost: v, total: l.laborCost + v } : l
                          ));
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Input
                    className="h-7 text-xs text-muted-foreground flex-1 mr-3"
                    placeholder="Notes…"
                    value={line.notes}
                    onChange={(e) => updateLine(i, "notes", e.target.value)}
                  />
                  <span className="text-sm font-bold text-primary shrink-0">${line.total.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addLine}
            className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
          >
            <Plus size={12} className="inline mr-1" /> Add Line Item
          </button>

          {/* Totals */}
          <div className="flex justify-between items-center font-bold text-base border-t border-border pt-3">
            <span>Estimate Total</span>
            <span className="text-primary text-xl">${subtotal.toFixed(2)}</span>
          </div>

          {/* Assign Mechanic */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <UserCog size={13} className="text-primary" /> Assign Mechanic
            </Label>
            <Select value={assignedTo || "unassigned"} onValueChange={(v) => setAssignedTo(v === "unassigned" ? "" : v)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {employees?.filter((e) => e.isActive).map((e) => (
                  <SelectItem key={e._id} value={e._id}>
                    {e.userName} {e.role ? `(${e.role})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full cursor-pointer"
            onClick={handleCreateRO}
            disabled={creating}
            size="lg"
          >
            {creating ? (
              <><RefreshCw size={15} className="mr-2 animate-spin" /> Creating Repair Order…</>
            ) : (
              <><Wrench size={15} className="mr-2" /> Create Repair Order</>
            )}
          </Button>
        </>
      )}

      {!loading && lines.length === 0 && !error && (
        <div className="text-center py-4">
          <Button onClick={runEstimate} className="cursor-pointer">
            <Sparkles size={14} className="mr-2" /> Generate AI Estimate
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export default function NewIntakeWizard({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Wizard state
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [concern, setConcern] = useState("");
  const [dtcCodes, setDtcCodes] = useState("");
  const [mileage, setMileage] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);

  const reset = () => {
    setStep(0);
    setCustomer(null);
    setVehicle(null);
    setConcern("");
    setDtcCodes("");
    setMileage("");
    setPriority("normal");
    setDiagnosis(null);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleCustomerSelect = (c: Customer) => {
    setCustomer(c);
    setStep(1);
  };

  const handleVehicleSelect = (v: Vehicle) => {
    setVehicle(v);
    setStep(2);
  };

  const handleConcernNext = () => {
    setStep(3);
  };

  const handleFinish = (roId: Id<"repairOrders">) => {
    handleClose();
    navigate("/jobs");
    toast.success("Intake complete — repair order created");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            <Wrench size={20} className="text-primary" />
            New Vehicle Intake
          </DialogTitle>
        </DialogHeader>

        <StepBar current={step} />

        {/* Back button */}
        {step > 0 && step < 4 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer mb-2 transition-colors"
          >
            <ChevronLeft size={13} /> Back
          </button>
        )}

        {step === 0 && (
          <CustomerStep onSelect={handleCustomerSelect} />
        )}

        {step === 1 && customer && (
          <VehicleStep customer={customer} onSelect={handleVehicleSelect} />
        )}

        {step === 2 && customer && vehicle && (
          <ConcernStep
            customer={customer}
            vehicle={vehicle}
            concern={concern} setConcern={setConcern}
            dtcCodes={dtcCodes} setDtcCodes={setDtcCodes}
            mileage={mileage} setMileage={setMileage}
            priority={priority} setPriority={setPriority}
            onNext={handleConcernNext}
          />
        )}

        {step === 3 && vehicle && (
          <DiagnosisStep
            vehicle={vehicle}
            concern={concern}
            dtcCodes={dtcCodes}
            diagnosis={diagnosis}
            setDiagnosis={setDiagnosis}
            onNext={() => setStep(4)}
            onSkip={() => setStep(4)}
          />
        )}

        {step === 4 && customer && vehicle && (
          <EstimateStep
            customer={customer}
            vehicle={vehicle}
            concern={concern}
            diagnosis={diagnosis}
            onFinish={handleFinish}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
