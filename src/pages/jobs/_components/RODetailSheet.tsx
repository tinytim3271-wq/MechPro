import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet.tsx";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Plus, Trash2, DollarSign, Clock, Package, Wrench, FileText, AlertTriangle, Camera, Receipt, PenLine, Mail, CheckCircle2, MessageSquare, Phone, Smartphone, Send, Car, Link2, Copy, Check, MapPin, Eye, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import ROPhotoPanel from "./ROPhotoPanel.tsx";
import SignaturePad from "./SignaturePad.tsx";
import InspectionPanel from "./InspectionPanel.tsx";
import { DiagnosticChecklist, RepairProcedureChecklist } from "./AIWorkflowPanel.tsx";
import ROMessagesOffice from "./ROMessagesOffice.tsx";
import EstimatePreviewDialog from "./EstimatePreviewDialog.tsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type LaborLine = {
  description: string;
  laborHours: number;
  laborRate: number;
  techNotes?: string;
};

type PartLine = {
  partId?: string;
  partNumber?: string;
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
};

type ShopFee = {
  description: string;
  amount: number;
};

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "estimate", label: "Estimate" },
  { value: "approved", label: "Approved" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_parts", label: "Waiting Parts" },
  { value: "completed", label: "Completed" },
  { value: "invoiced", label: "Invoiced" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  estimate: "bg-muted text-muted-foreground",
  approved: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-primary/15 text-primary",
  waiting_parts: "bg-yellow-500/15 text-yellow-400",
  completed: "bg-green-500/15 text-green-400",
  invoiced: "bg-purple-500/15 text-purple-400",
  cancelled: "bg-destructive/15 text-destructive",
};

// ─── Labor Lines Editor ────────────────────────────────────────────────────────

function LaborEditor({
  lines,
  onChange,
  defaultRate,
}: {
  lines: LaborLine[];
  onChange: (l: LaborLine[]) => void;
  defaultRate: number;
}) {
  const addLine = () =>
    onChange([...lines, { description: "", laborHours: 1, laborRate: defaultRate }]);

  const update = (i: number, key: keyof LaborLine, value: string | number) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));

  const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1"><Clock size={14} className="text-primary" /> Labor Lines</h4>
        <Button size="sm" variant="ghost" onClick={addLine}>
          <Plus size={13} className="mr-1" /> Add Labor
        </Button>
      </div>
      {lines.length === 0 && (
        <p className="text-xs text-muted-foreground">No labor lines yet.</p>
      )}
      {lines.map((l, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <Input
              className="flex-1 h-8 text-sm"
              placeholder="Service description"
              value={l.description}
              onChange={(e) => update(i, "description", e.target.value)}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" onClick={() => remove(i)}>
              <Trash2 size={13} />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Hours</Label>
              <Input
                type="number"
                step="0.1"
                className="h-8 text-sm"
                value={l.laborHours}
                onChange={(e) => update(i, "laborHours", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="text-xs">Rate ($/hr)</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={l.laborRate}
                onChange={(e) => update(i, "laborRate", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Tech Notes</Label>
            <Input
              className="h-8 text-sm"
              placeholder="Optional tech notes..."
              value={l.techNotes ?? ""}
              onChange={(e) => update(i, "techNotes", e.target.value)}
            />
          </div>
          <p className="text-xs text-right text-muted-foreground">
            ${(l.laborHours * l.laborRate).toFixed(2)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Parts Lines Editor ────────────────────────────────────────────────────────

function PartsEditor({ lines, onChange }: { lines: PartLine[]; onChange: (l: PartLine[]) => void }) {
  const [showInventory, setShowInventory] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const inventoryParts = useQuery(api.parts.listParts, showInventory ? { search: inventorySearch || undefined } : "skip");

  // Check stock for all inventory-linked parts
  const linkedPartIds = lines
    .filter((l) => l.partId)
    .map((l) => l.partId as Id<"parts">);
  const stockCheck = useQuery(
    api.parts.checkStock,
    linkedPartIds.length > 0 ? { partIds: linkedPartIds } : "skip"
  );
  const stockMap = new Map((stockCheck ?? []).map((s) => [s._id, s]));

  const addLine = () =>
    onChange([...lines, { description: "", quantity: 1, unitCost: 0, unitPrice: 0 }]);

  const addFromInventory = (part: { _id: string; name: string; partNumber?: string; unitCost: number; unitPrice: number; stockQty: number }) => {
    // Warn if stock is zero
    if (part.stockQty <= 0) {
      toast.error(`"${part.name}" is out of stock (0 available). Adding it anyway — check with supplier.`);
    } else if (part.stockQty <= 1) {
      toast.warning(`"${part.name}" has ${part.stockQty} in stock — adding will deplete it`);
    }
    onChange([...lines, {
      partId: part._id,
      partNumber: part.partNumber,
      description: part.name,
      quantity: 1,
      unitCost: part.unitCost,
      unitPrice: part.unitPrice,
    }]);
    setShowInventory(false);
    setInventorySearch("");
  };

  const update = (i: number, key: keyof PartLine, value: string | number) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));

  const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1"><Package size={14} className="text-primary" /> Parts</h4>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setShowInventory(true)} className="cursor-pointer">
            <Package size={13} className="mr-1" /> From Inventory
          </Button>
          <Button size="sm" variant="ghost" onClick={addLine} className="cursor-pointer">
            <Plus size={13} className="mr-1" /> Manual
          </Button>
        </div>
      </div>

      {/* Inventory picker dialog */}
      {showInventory && (
        <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              className="h-8 text-sm flex-1"
              placeholder="Search inventory..."
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              autoFocus
            />
            <Button size="sm" variant="ghost" onClick={() => { setShowInventory(false); setInventorySearch(""); }} className="cursor-pointer text-xs">
              Cancel
            </Button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {inventoryParts === undefined ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : inventoryParts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No parts found</p>
            ) : (
              inventoryParts.slice(0, 15).map((part) => (
                <button
                  key={part._id}
                  onClick={() => addFromInventory(part)}
                  className="w-full flex items-center justify-between p-2 rounded hover:bg-primary/10 transition-colors cursor-pointer text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{part.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {part.partNumber ?? "No part #"} — ${part.unitPrice.toFixed(2)}
                    </p>
                  </div>
                  <span className={cn(
                    "text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ml-2",
                    part.stockQty <= part.lowStockThreshold
                      ? "bg-red-500/15 text-red-400"
                      : "bg-green-500/15 text-green-400"
                  )}>
                    {part.stockQty} in stock
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {lines.length === 0 && <p className="text-xs text-muted-foreground">No parts added yet.</p>}
      {lines.map((p, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <Input
              className="flex-1 h-8 text-sm"
              placeholder="Part description"
              value={p.description}
              onChange={(e) => update(i, "description", e.target.value)}
            />
            {p.partId && (
              <span className="inline-flex items-center text-[10px] bg-primary/10 text-primary px-1.5 rounded shrink-0 self-center">
                Inv
              </span>
            )}
            {/* Stock warning badge */}
            {p.partId && stockMap.has(p.partId) && (stockMap.get(p.partId)?.stockQty ?? 0) < p.quantity && (
              <span className="inline-flex items-center text-[10px] bg-red-500/15 text-red-400 px-1.5 rounded shrink-0 self-center gap-0.5">
                <AlertTriangle size={10} />
                {stockMap.get(p.partId)?.stockQty === 0
                  ? "Out of stock"
                  : `Only ${stockMap.get(p.partId)?.stockQty} left`}
              </span>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0 cursor-pointer" onClick={() => remove(i)}>
              <Trash2 size={13} />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Part #</Label>
              <Input
                className="h-8 text-sm font-mono"
                placeholder="OEM123"
                value={p.partNumber ?? ""}
                onChange={(e) => update(i, "partNumber", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Qty</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={p.quantity}
                onChange={(e) => update(i, "quantity", parseFloat(e.target.value) || 1)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Cost (each)</Label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-sm"
                value={p.unitCost}
                onChange={(e) => update(i, "unitCost", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="text-xs">Price (each)</Label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-sm"
                value={p.unitPrice}
                onChange={(e) => update(i, "unitPrice", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <p className="text-xs text-right text-muted-foreground">
            ${(p.quantity * p.unitPrice).toFixed(2)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Shop Fees Editor ─────────────────────────────────────────────────────────

function FeesEditor({ fees, onChange }: { fees: ShopFee[]; onChange: (f: ShopFee[]) => void }) {
  const addFee = () => onChange([...fees, { description: "Shop Supplies", amount: 0 }]);
  const update = (i: number, key: keyof ShopFee, value: string | number) =>
    onChange(fees.map((f, idx) => (idx === i ? { ...f, [key]: value } : f)));
  const remove = (i: number) => onChange(fees.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1"><DollarSign size={14} className="text-primary" /> Shop Fees</h4>
        <Button size="sm" variant="ghost" onClick={addFee}>
          <Plus size={13} className="mr-1" /> Add Fee
        </Button>
      </div>
      {fees.map((f, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            className="flex-1 h-8 text-sm"
            placeholder="Description"
            value={f.description}
            onChange={(e) => update(i, "description", e.target.value)}
          />
          <Input
            type="number"
            step="0.01"
            className="w-24 h-8 text-sm"
            value={f.amount}
            onChange={(e) => update(i, "amount", parseFloat(e.target.value) || 0)}
          />
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" onClick={() => remove(i)}>
            <Trash2 size={13} />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Send Estimate Banner ────────────────────────────────────────────────────

function SendEstimateBanner({
  roId,
  customerPhone,
  customerEmail,
  customerName,
  roNumber,
  vehicleSummary,
  shopName,
}: {
  roId: Id<"repairOrders">;
  customerPhone?: string;
  customerEmail?: string;
  customerName: string;
  roNumber: string;
  vehicleSummary: string;
  shopName: string;
  shopPhone?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const ensureApprovalToken = useMutation(api.estimates.ensureApprovalToken);

  useEffect(() => {
    void ensureApprovalToken({ roId })
      .then(({ token }) => setApprovalToken(token))
      .catch(() => setApprovalToken(null));
  }, [roId, ensureApprovalToken]);

  const approveUrl = useMemo(() => {
    if (!approvalToken) return null;
    return `${window.location.origin}/approve?ro=${roId}&token=${approvalToken}`;
  }, [approvalToken, roId]);

  const handleCopy = () => {
    if (!approveUrl) {
      toast.error("Could not generate estimate link. Try again.");
      return;
    }
    void navigator.clipboard.writeText(approveUrl);
    setCopied(true);
    toast.success("Estimate link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const smsBody = approveUrl
    ? `Hi ${customerName}, your estimate from ${shopName} is ready.\n\nVehicle: ${vehicleSummary}\nRO#: ${roNumber}\n\nView & approve here: ${approveUrl}`
    : "";

  const emailSubject = `Your Estimate from ${shopName} — RO# ${roNumber}`;
  const emailBody = approveUrl
    ? `Hi ${customerName},\n\nYour estimate is ready for review.\n\nVehicle: ${vehicleSummary}\nRO#: ${roNumber}\n\nView & approve here:\n${approveUrl}\n\nThanks,\n${shopName}`
    : "";

  const smsHref = customerPhone && approveUrl
    ? `sms:${customerPhone}?body=${encodeURIComponent(smsBody)}`
    : undefined;

  const mailtoHref = customerEmail && approveUrl
    ? `mailto:${customerEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    : undefined;

  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <Link2 size={14} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">Send Estimate for Approval</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          className="h-7 text-xs cursor-pointer"
          onClick={handleCopy}
          disabled={!approveUrl}
        >
          {copied ? <Check size={11} className="mr-1" /> : <Copy size={11} className="mr-1" />}
          {copied ? "Copied!" : "Copy Link"}
        </Button>
        {customerPhone && smsHref && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs cursor-pointer"
            asChild
          >
            <a href={smsHref}>
              <MessageSquare size={11} className="mr-1" />
              Text Customer
            </a>
          </Button>
        )}
        {customerEmail && mailtoHref && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs cursor-pointer"
            asChild
          >
            <a href={mailtoHref}>
              <Mail size={11} className="mr-1" />
              Email Customer
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

type Props = {
  roId: Id<"repairOrders">;
  onClose: () => void;
};

export default function RODetailSheet({ roId, onClose }: Props) {
  const navigate = useNavigate();
  const ro = useQuery(api.repairOrders.getRO, { roId });
  const updateROLines = useMutation(api.repairOrders.updateROLines);
  const updateROStatus = useMutation(api.repairOrders.updateROStatus);
  const updateRODetails = useMutation(api.repairOrders.updateRODetails);
  const assignRO = useMutation(api.repairOrders.assignRO);
  const deleteRO = useMutation(api.repairOrders.deleteRO);
  const createInvoice = useMutation(api.invoices.createInvoiceFromRO);
  const saveSignature = useMutation(api.repairOrders.saveSignature);
  const clearSignature = useMutation(api.repairOrders.clearSignature);
  const reportToCarfax = useAction(api.carfax.reportToCarfax);
  const laborMatrix = useQuery(api.repairOrders.getLaborMatrix, {});
  const org = useQuery(api.organizations.getCurrentOrg, {});
  const orgId = org?._id as Id<"organizations"> | undefined;
  const employees = useQuery(api.employees.listMembers, orgId ? { orgId } : "skip");

  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);
  const [partLines, setPartLines] = useState<PartLine[]>([]);
  const [shopFees, setShopFees] = useState<ShopFee[]>([]);
  const [cause, setCause] = useState("");
  const [correction, setCorrection] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [mileageOut, setMileageOut] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
  const [serviceCity, setServiceCity] = useState("");
  const [serviceState, setServiceState] = useState("");
  const [serviceZip, setServiceZip] = useState("");
  const [linesLoaded, setLinesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [reportingCarfax, setReportingCarfax] = useState(false);
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
  const [completedROId, setCompletedROId] = useState<Id<"repairOrders"> | null>(null);
  const [showEstimatePreview, setShowEstimatePreview] = useState(false);

  // Initialize local state from loaded RO
  if (ro && !linesLoaded) {
    setLaborLines(ro.laborLines ?? []);
    setPartLines(ro.partLines ?? []);
    setShopFees(ro.shopFees ?? []);
    setCause(ro.cause ?? "");
    setCorrection(ro.correction ?? "");
    setInternalNotes(ro.internalNotes ?? "");
    setMileageOut(ro.mileageOut?.toString() ?? "");
    setServiceAddress(ro.serviceAddress ?? "");
    setServiceCity(ro.serviceCity ?? "");
    setServiceState(ro.serviceState ?? "");
    setServiceZip(ro.serviceZip ?? "");
    setLinesLoaded(true);
  }

  const laborTotal = laborLines.reduce((s, l) => s + l.laborHours * l.laborRate, 0);
  const partsTotal = partLines.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
  const feesTotal = shopFees.reduce((s, f) => s + f.amount, 0);
  const subtotal = laborTotal + partsTotal + feesTotal;
  const taxRate = (ro?.taxRate ?? 0) / 100;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const handleSaveLines = async () => {
    setSaving(true);
    try {
      const result = await updateROLines({
        roId,
        laborLines,
        partLines,
        shopFees,
        cause: cause || undefined,
        correction: correction || undefined,
        internalNotes: internalNotes || undefined,
        mileageOut: mileageOut ? Number(mileageOut) : undefined,
      });
      // Save service address fields
      await updateRODetails({
        roId,
        serviceAddress: serviceAddress || undefined,
        serviceCity: serviceCity || undefined,
        serviceState: serviceState || undefined,
        serviceZip: serviceZip || undefined,
      });
      if (result?.stockWarnings && result.stockWarnings.length > 0) {
        toast.warning(
          `Stock went negative for: ${result.stockWarnings.join(", ")}`,
          { duration: 6000 }
        );
      }
      toast.success("Repair order saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    try {
      await updateROStatus({
        roId,
        status: status as "estimate" | "approved" | "in_progress" | "waiting_parts" | "completed" | "invoiced" | "cancelled",
      });
      toast.success("Status updated");
      if (status === "completed") {
        setCompletedROId(roId);
        setShowInvoicePrompt(true);
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRO({ roId });
      toast.success("Repair order deleted");
      onClose();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleGenerateInvoice = async () => {
    setGeneratingInvoice(true);
    try {
      const invoiceId = await createInvoice({ roId });
      toast.success("Invoice created successfully");
      onClose();
      navigate(`/invoices?open=${invoiceId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create invoice";
      if (msg.includes("already exists")) {
        toast.error("An invoice already exists for this repair order");
      } else {
        toast.error(msg);
      }
    } finally {
      setGeneratingInvoice(false);
    }
  };

  // Build native SMS/Email links using the device's messaging and email apps
  const getStatusMessage = (status: string) => {
    switch (status) {
      case "estimate": return "Your estimate is ready for review";
      case "approved": return "Your repair has been approved and is scheduled";
      case "in_progress": return "Work has begun on your vehicle";
      case "waiting_parts": return "We're waiting on parts for your repair";
      case "completed": return "Your vehicle is ready for pickup!";
      case "invoiced": return "Your invoice is ready";
      default: return `Status update: ${status}`;
    }
  };

  const buildStatusBody = () => {
    if (!ro) return "";
    const vehicleSummary = ro.vehicle
      ? `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model}`
      : "Your vehicle";
    const statusMsg = getStatusMessage(ro.status);
    return `Hi ${ro.customer?.name ?? "there"}, update from ${org?.name ?? "your shop"}:\n\n${statusMsg}\nVehicle: ${vehicleSummary}\nRO#: ${ro.roNumber}${org?.phone ? `\n\nQuestions? Call us: ${org.phone}` : ""}`;
  };

  const statusSmsHref = ro?.customer?.phone
    ? `sms:${ro.customer.phone}?body=${encodeURIComponent(buildStatusBody())}`
    : undefined;

  const statusEmailHref = ro?.customer?.email
    ? `mailto:${ro.customer.email}?subject=${encodeURIComponent(`Update from ${org?.name ?? "your shop"} — RO# ${ro?.roNumber ?? ""}`)}&body=${encodeURIComponent(buildStatusBody())}`
    : undefined;

  const handleReportToCarfax = async () => {
    setReportingCarfax(true);
    try {
      const result = await reportToCarfax({ roId });
      if (result.success) {
        toast.success("Service history reported to Carfax");
      } else {
        toast.error(result.error ?? "Failed to report to Carfax");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to report to Carfax";
      toast.error(msg);
    } finally {
      setReportingCarfax(false);
    }
  };

  const addFromMatrix = (entry: { serviceDescription: string; flatRateHours: number }) => {
    if (!ro) return;
    setLaborLines((prev) => [
      ...prev,
      {
        description: entry.serviceDescription,
        laborHours: entry.flatRateHours,
        laborRate: ro.laborRate ?? 100,
      },
    ]);
  };

  return (
    <>
      <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {ro === undefined ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : ro === null ? (
            <div className="p-6 text-muted-foreground">Repair order not found.</div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-4 border-b border-border">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground">{ro.roNumber}</span>
                      {ro.priority === "high" && <AlertTriangle size={14} className="text-red-400" />}
                    </div>
                    <h2 className="text-lg font-bold text-foreground mt-0.5" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                      {ro.customer?.name ?? "Unknown Customer"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {ro.vehicle ? `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model}` : ""}
                      {ro.vehicle?.licensePlate ? ` · ${ro.vehicle.licensePlate}` : ""}
                    </p>
                    {(ro.customer?.address || ro.customer?.city) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin size={11} className="shrink-0" />
                        {[ro.customer.address, ro.customer.city, ro.customer.state, ro.customer.zip].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Select value={ro.status} onValueChange={handleStatusChange}>
                      <SelectTrigger className={cn("h-8 text-xs w-36", STATUS_COLORS[ro.status])}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={ro.assignedTo ?? "unassigned"}
                      onValueChange={async (v) => {
                        try {
                          await assignRO({ roId, assignedTo: v === "unassigned" ? undefined : v as Id<"orgMembers"> });
                          toast.success("Mechanic updated");
                        } catch {
                          toast.error("Failed to assign mechanic");
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs w-36 cursor-pointer">
                        <SelectValue placeholder="Assign mechanic" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {employees?.filter((e) => e.isActive).map((e) => (
                          <SelectItem key={e._id} value={e._id}>
                            {e.userName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1">
                      {(ro.status === "completed" || ro.status === "invoiced") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs cursor-pointer"
                          onClick={handleGenerateInvoice}
                          disabled={generatingInvoice || ro.status === "invoiced"}
                        >
                          <Receipt size={12} className="mr-1" />
                          {ro.status === "invoiced" ? "Invoiced" : generatingInvoice ? "Creating…" : "Invoice"}
                        </Button>
                      )}
                      {statusEmailHref && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs cursor-pointer"
                          title="Send status update email to customer"
                          asChild
                        >
                          <a href={statusEmailHref}>
                            <Mail size={12} className="mr-1" />
                            Email
                          </a>
                        </Button>
                      )}
                      {statusSmsHref && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs cursor-pointer"
                          title="Send SMS status update to customer"
                          asChild
                        >
                          <a href={statusSmsHref}>
                            <MessageSquare size={12} className="mr-1" />
                            Text
                          </a>
                        </Button>
                      )}
                      {ro.customer?.phone && (
                        <Button asChild size="sm" variant="secondary" className="h-7 text-xs cursor-pointer">
                          <a href={`tel:${ro.customer.phone}`} title="Call customer">
                            <Phone size={12} className="mr-1" />
                            Call
                          </a>
                        </Button>
                      )}
                      {ro.customer?.phone && (
                        <Button asChild size="sm" variant="secondary" className="h-7 text-xs cursor-pointer">
                          <a href={`sms:${ro.customer.phone}`} title="Text customer from device">
                            <Smartphone size={12} className="mr-1" />
                            Text
                          </a>
                        </Button>
                      )}
                      {ro.customer?.email && (
                        <Button asChild size="sm" variant="secondary" className="h-7 text-xs cursor-pointer">
                          <a href={`mailto:${ro.customer.email}`} title="Email customer from device">
                            <Send size={12} className="mr-1" />
                            Device Email
                          </a>
                        </Button>
                      )}
                      {(ro.status === "completed" || ro.status === "invoiced") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs cursor-pointer"
                          onClick={handleReportToCarfax}
                          disabled={reportingCarfax || !!ro.carfaxReportedAt}
                          title={ro.carfaxReportedAt ? `Reported to Carfax on ${new Date(ro.carfaxReportedAt).toLocaleDateString()}` : "Report service history to Carfax"}
                        >
                          <Car size={12} className="mr-1" />
                          {ro.carfaxReportedAt ? "Carfax Sent" : reportingCarfax ? "Reporting…" : "Carfax"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive h-7 text-xs"
                        onClick={() => setShowDelete(true)}
                      >
                        <Trash2 size={12} className="mr-1" /> Delete RO
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Send Estimate Link — only when status is estimate */}
                {ro.status === "estimate" && (
                  <>
                    <div className="mt-3 flex gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs cursor-pointer"
                        onClick={() => setShowEstimatePreview(true)}
                      >
                        <Eye size={12} className="mr-1" />
                        Preview Estimate
                      </Button>
                    </div>
                    <SendEstimateBanner
                      roId={ro._id}
                      customerPhone={ro.customer?.phone}
                      customerEmail={ro.customer?.email}
                      customerName={ro.customer?.name ?? "Customer"}
                      roNumber={ro.roNumber}
                      vehicleSummary={ro.vehicle ? `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model}` : "Vehicle"}
                      shopName={ro.org?.name ?? "Shop"}
                      shopPhone={ro.org?.phone}
                    />
                  </>
                )}

                {/* Quick info */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {ro.bayName && <span>Bay: {ro.bayName}</span>}
                  {ro.isMobile && <span className="text-primary">Mobile Job</span>}
                  {(ro.serviceAddress || ro.serviceCity || ro.mobileAddress) && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} />
                      {ro.serviceAddress
                        ? [ro.serviceAddress, ro.serviceCity, ro.serviceState, ro.serviceZip].filter(Boolean).join(", ")
                        : ro.mobileAddress}
                    </span>
                  )}
                  {ro.mileageIn && <span>Mileage In: {ro.mileageIn.toLocaleString()}</span>}
                  {ro.scheduledAt && <span>Scheduled: {new Date(ro.scheduledAt).toLocaleDateString()}</span>}
                </div>

                {/* Tech Location Status */}
                {ro.techLocationStatus && (
                  <div className="mt-2">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] border",
                        ro.techLocationStatus === "en_route" && "bg-blue-500/15 text-blue-400 border-blue-500/30",
                        ro.techLocationStatus === "on_site" && "bg-green-500/15 text-green-400 border-green-500/30",
                        ro.techLocationStatus === "left_site" && "bg-muted text-muted-foreground border-border",
                      )}
                    >
                      {ro.techLocationStatus === "en_route" && "Tech En Route"}
                      {ro.techLocationStatus === "on_site" && "Tech On Site"}
                      {ro.techLocationStatus === "left_site" && "Tech Left Site"}
                    </Badge>
                    {ro.techLocationUpdatedAt && (
                      <span className="text-[10px] text-muted-foreground ml-2">
                        {new Date(ro.techLocationUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                )}

                {/* Complaint */}
                <div className="mt-3 bg-muted/30 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-muted-foreground">Customer Complaint</p>
                  <p className="text-sm text-foreground mt-0.5">{ro.complaint}</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex-1 overflow-y-auto">
                <Tabs defaultValue="labor" className="h-full">
                  <TabsList className="w-full rounded-none border-b border-border bg-transparent h-10 flex-wrap">
                    <TabsTrigger value="labor" className="flex-1 text-xs">Labor & Parts</TabsTrigger>
                    <TabsTrigger value="diagnosis" className="flex-1 text-xs">Diagnosis</TabsTrigger>
                    <TabsTrigger value="diag-checklist" className="flex-1 text-xs"><ClipboardCheck size={12} className="mr-1" />Diag Check</TabsTrigger>
                    <TabsTrigger value="repair-checklist" className="flex-1 text-xs"><Wrench size={12} className="mr-1" />Repair Steps</TabsTrigger>
                    <TabsTrigger value="messages" className="flex-1 text-xs"><MessageSquare size={12} className="mr-1" />Messages</TabsTrigger>
                    <TabsTrigger value="photos" className="flex-1 text-xs"><Camera size={12} className="mr-1" />Photos</TabsTrigger>
                    <TabsTrigger value="matrix" className="flex-1 text-xs">Matrix</TabsTrigger>
                    <TabsTrigger value="totals" className="flex-1 text-xs">Totals</TabsTrigger>
                    <TabsTrigger value="signature" className="flex-1 text-xs"><PenLine size={12} className="mr-1" />Signature</TabsTrigger>
                    <TabsTrigger value="inspection" className="flex-1 text-xs"><CheckCircle2 size={12} className="mr-1" />Inspection</TabsTrigger>
                  </TabsList>

                  {/* Labor & Parts Tab */}
                  <TabsContent value="labor" className="p-4 space-y-6">
                    <LaborEditor lines={laborLines} onChange={setLaborLines} defaultRate={ro.laborRate ?? 100} />
                    <PartsEditor lines={partLines} onChange={setPartLines} />
                    <FeesEditor fees={shopFees} onChange={setShopFees} />

                    <div className="flex justify-end">
                      <Button onClick={handleSaveLines} disabled={saving}>
                        {saving ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Diagnosis Tab */}
                  <TabsContent value="diagnosis" className="p-4 space-y-4">
                    <div className="space-y-1">
                      <Label>Cause (Tech Diagnosis)</Label>
                      <Textarea
                        placeholder="What was found / root cause..."
                        value={cause}
                        onChange={(e) => setCause(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Correction (Work Performed)</Label>
                      <Textarea
                        placeholder="Describe the repair work done..."
                        value={correction}
                        onChange={(e) => setCorrection(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Internal Notes</Label>
                      <Textarea
                        placeholder="Notes visible to staff only..."
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Mileage Out</Label>
                      <Input
                        type="number"
                        placeholder="Final mileage"
                        value={mileageOut}
                        onChange={(e) => setMileageOut(e.target.value)}
                        className="w-40"
                      />
                    </div>

                    {/* Service Address */}
                    <div className="space-y-2 border-t border-border pt-4">
                      <Label className="flex items-center gap-1.5 text-sm font-semibold">
                        <MapPin size={13} className="text-primary" /> Service Address
                      </Label>
                      <Input
                        placeholder="123 Main St"
                        value={serviceAddress}
                        onChange={(e) => setServiceAddress(e.target.value)}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          placeholder="City"
                          value={serviceCity}
                          onChange={(e) => setServiceCity(e.target.value)}
                        />
                        <Input
                          placeholder="State"
                          value={serviceState}
                          onChange={(e) => setServiceState(e.target.value)}
                        />
                        <Input
                          placeholder="ZIP"
                          value={serviceZip}
                          onChange={(e) => setServiceZip(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={handleSaveLines} disabled={saving}>
                        {saving ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Messages Tab */}
                  <TabsContent value="messages" className="p-4">
                    <ROMessagesOffice roId={roId} />
                  </TabsContent>

                  {/* Photos Tab */}
                  <TabsContent value="photos" className="p-4">
                    <ROPhotoPanel roId={roId} />
                  </TabsContent>

                  {/* AI Diagnostic Checklist Tab */}
                  <TabsContent value="diag-checklist" className="p-4">
                    <DiagnosticChecklist
                      roId={roId}
                      items={ro.diagnosticChecklist}
                      status={ro.aiWorkflowStatus}
                      probableCauses={ro.probableCauses}
                      recommendedServices={ro.recommendedServices}
                      ambiguityFlag={ro.aiAmbiguityFlag}
                    />
                  </TabsContent>

                  {/* AI Repair Procedure Tab */}
                  <TabsContent value="repair-checklist" className="p-4">
                    <RepairProcedureChecklist
                      roId={roId}
                      steps={ro.repairChecklist}
                      status={ro.aiWorkflowStatus}
                    />
                  </TabsContent>

                  {/* Inspection Tab */}
                  <TabsContent value="inspection" className="p-4">
                    <InspectionPanel roId={roId} />
                  </TabsContent>

                  {/* Labor Matrix Tab */}
                  <TabsContent value="matrix" className="p-4">
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Click a service to add it as a labor line.
                      </p>
                      {(laborMatrix ?? []).length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No labor matrix entries. Add them in Settings.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(laborMatrix ?? []).map((entry) => (
                            <button
                              key={entry._id}
                              onClick={() => addFromMatrix(entry)}
                              className="w-full text-left border border-border rounded-lg p-3 hover:border-primary/50 hover:bg-accent/20 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-foreground">{entry.serviceDescription}</p>
                                  <p className="text-xs text-muted-foreground">{entry.serviceCategory}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-primary">{entry.flatRateHours}h</p>
                                  <p className="text-xs text-muted-foreground">
                                    ${(entry.flatRateHours * (ro.laborRate ?? 100)).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* Totals Tab */}
                  <TabsContent value="totals" className="p-4">
                    <div className="space-y-3">
                      <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Labor</span>
                          <span>${laborTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Parts</span>
                          <span>${partsTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Shop Fees</span>
                          <span>${feesTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-border pt-2">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span>${subtotal.toFixed(2)}</span>
                        </div>
                        {ro.taxRate > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tax ({ro.taxRate}%)</span>
                            <span>${taxAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
                          <span>Total</span>
                          <span className="text-primary">${total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Signature Tab */}
                  <TabsContent value="signature" className="p-4">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground mb-1">Customer Authorization</h3>
                        <p className="text-xs text-muted-foreground">
                          Have the customer sign to authorize the work described in this repair order.
                        </p>
                      </div>
                      {ro.authorizationName && (
                        <div className="text-sm text-muted-foreground">
                          Authorized by: <span className="text-foreground font-medium">{ro.authorizationName}</span>
                          {ro.authorizationMethod && <span> ({ro.authorizationMethod})</span>}
                        </div>
                      )}
                      <SignaturePad
                        existingSignature={ro.customerSignature}
                        signedAt={ro.signedAt}
                        onSave={async (dataUrl) => {
                          await saveSignature({ roId, signature: dataUrl });
                          toast.success("Signature saved");
                        }}
                        onClear={async () => {
                          await clearSignature({ roId });
                          toast.success("Signature cleared");
                        }}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Repair Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this repair order and all its lines.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showInvoicePrompt} onOpenChange={setShowInvoicePrompt}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-green-500" />
              <DialogTitle>Job Marked Complete</DialogTitle>
            </div>
            <DialogDescription>
              Ready to create an invoice for this job? You can do it now in one click.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              className="cursor-pointer"
              onClick={() => setShowInvoicePrompt(false)}
            >
              Not Yet
            </Button>
            <Button
              className="cursor-pointer"
              onClick={async () => {
                if (!completedROId) return;
                try {
                  await createInvoice({ roId: completedROId });
                  toast.success("Invoice created!");
                  setShowInvoicePrompt(false);
                  onClose();
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Failed to create invoice";
                  toast.error(msg);
                }
              }}
            >
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estimate Preview Dialog */}
      {ro && showEstimatePreview && (
        <EstimatePreviewDialog
          open={showEstimatePreview}
          onClose={() => setShowEstimatePreview(false)}
          data={{
            roId: ro._id,
            roNumber: ro.roNumber,
            complaint: ro.complaint,
            cause: ro.cause,
            vehicleSummary: ro.vehicle
              ? `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model}`
              : "Unknown Vehicle",
            customerName: ro.customer?.name ?? "Customer",
            laborLines,
            partLines,
            shopFees,
            subtotal,
            taxRate: ro.taxRate ?? 0,
            taxAmount,
            totalAmount: total,
            orgName: ro.org?.name ?? "Shop",
            orgPhone: ro.org?.phone,
            orgLogoUrl: ro.org?.logoUrl,
          }}
          onSaved={() => {
            // Refresh state from the query (it will re-load reactively)
            setLinesLoaded(false);
          }}
        />
      )}
    </>
  );
}
