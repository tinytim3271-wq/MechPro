import { useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { Authenticated, Unauthenticated } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Users,
  Plus,
  Search,
  Car,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  Pencil,
  Trash2,
  X,
  History,
  Wrench,
  ShieldCheck,
  FileText,
  DollarSign,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import VehicleHistoryPanel from "@/components/VehicleHistoryPanel.tsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type Customer = Doc<"customers">;
type Vehicle = Doc<"vehicles">;

// ─── Customer Form ─────────────────────────────────────────────────────────────

type CustomerFormData = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  source: string;
  smsOptOut: boolean;
};

const emptyCustomerForm: CustomerFormData = {
  name: "", phone: "", email: "", address: "", city: "", state: "", zip: "", notes: "", source: "", smsOptOut: false,
};

function CustomerForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: CustomerFormData;
  onSubmit: (data: CustomerFormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<CustomerFormData>(initial ?? emptyCustomerForm);
  const set = (key: keyof CustomerFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Full Name *</Label>
        <Input placeholder="John Smith" value={form.name} onChange={set("name")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input placeholder="(555) 000-0000" value={form.phone} onChange={set("phone")} />
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input placeholder="john@example.com" value={form.email} onChange={set("email")} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Address</Label>
        <Input placeholder="123 Main St" value={form.address} onChange={set("address")} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1 col-span-1">
          <Label>City</Label>
          <Input placeholder="Dallas" value={form.city} onChange={set("city")} />
        </div>
        <div className="space-y-1">
          <Label>State</Label>
          <Input placeholder="TX" value={form.state} onChange={set("state")} />
        </div>
        <div className="space-y-1">
          <Label>ZIP</Label>
          <Input placeholder="75201" value={form.zip} onChange={set("zip")} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Source</Label>
        <Select value={form.source || "none"} onValueChange={(v) => setForm((f) => ({ ...f, source: v === "none" ? "" : v }))}>
          <SelectTrigger><SelectValue placeholder="How did they find you?" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unknown</SelectItem>
            <SelectItem value="walk-in">Walk-in</SelectItem>
            <SelectItem value="phone">Phone</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="referral">Referral</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea placeholder="Any special notes about this customer..." value={form.notes} onChange={set("notes")} rows={3} />
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-border p-3">
        <Checkbox
          id="sms-opt-out"
          checked={form.smsOptOut}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, smsOptOut: checked === true }))}
        />
        <label htmlFor="sms-opt-out" className="text-sm text-foreground cursor-pointer">
          Opt out of SMS notifications
          <span className="block text-xs text-muted-foreground">This customer will not receive automated text messages</span>
        </label>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">SMS Disclosure:</strong> By adding this customer without opting out above, you confirm you have obtained their consent to receive automated service-related text messages (status updates, appointment reminders, and estimate approvals). Message frequency varies. Msg &amp; data rates may apply. Customer can opt out at any time.
        </p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={() => { if (!form.name.trim()) { toast.error("Name is required"); return; } onSubmit(form); }} disabled={loading}>
          {loading ? "Saving..." : "Save Customer"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Vehicle Form ──────────────────────────────────────────────────────────────

type VehicleFormData = {
  year: string;
  make: string;
  model: string;
  trim: string;
  vin: string;
  licensePlate: string;
  color: string;
  mileageIn: string;
  engine: string;
  transmission: string;
  notes: string;
};

const emptyVehicleForm: VehicleFormData = {
  year: "", make: "", model: "", trim: "", vin: "", licensePlate: "", color: "", mileageIn: "", engine: "", transmission: "", notes: "",
};

function VehicleForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: VehicleFormData;
  onSubmit: (data: VehicleFormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<VehicleFormData>(initial ?? emptyVehicleForm);
  const set = (key: keyof VehicleFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Year *</Label>
          <Input placeholder="2020" value={form.year} onChange={set("year")} />
        </div>
        <div className="space-y-1">
          <Label>Make *</Label>
          <Input placeholder="Toyota" value={form.make} onChange={set("make")} />
        </div>
        <div className="space-y-1">
          <Label>Model *</Label>
          <Input placeholder="Camry" value={form.model} onChange={set("model")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Trim</Label>
          <Input placeholder="LE, XLE..." value={form.trim} onChange={set("trim")} />
        </div>
        <div className="space-y-1">
          <Label>Color</Label>
          <Input placeholder="White" value={form.color} onChange={set("color")} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>VIN</Label>
        <Input placeholder="1HGBH41JXMN109186" value={form.vin} onChange={set("vin")} className="font-mono text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>License Plate</Label>
          <Input placeholder="ABC-1234" value={form.licensePlate} onChange={set("licensePlate")} />
        </div>
        <div className="space-y-1">
          <Label>Mileage In</Label>
          <Input placeholder="45000" type="number" value={form.mileageIn} onChange={set("mileageIn")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Engine</Label>
          <Input placeholder="2.5L 4-Cyl" value={form.engine} onChange={set("engine")} />
        </div>
        <div className="space-y-1">
          <Label>Transmission</Label>
          <Input placeholder="Automatic" value={form.transmission} onChange={set("transmission")} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea placeholder="Notes about this vehicle..." value={form.notes} onChange={set("notes")} rows={2} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={() => {
          if (!form.year.trim() || !form.make.trim() || !form.model.trim()) {
            toast.error("Year, make, and model are required");
            return;
          }
          onSubmit(form);
        }} disabled={loading}>
          {loading ? "Saving..." : "Save Vehicle"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Customer History Panel ───────────────────────────────────────────────────

const STATUS_COLORS_RO: Record<string, string> = {
  estimate: "bg-muted text-muted-foreground",
  approved: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-primary/15 text-primary",
  waiting_parts: "bg-yellow-500/15 text-yellow-400",
  completed: "bg-green-500/15 text-green-400",
  invoiced: "bg-purple-500/15 text-purple-400",
  cancelled: "bg-destructive/15 text-destructive",
};

function CustomerHistoryPanel({ customerId }: { customerId: Id<"customers"> }) {
  const history = useQuery(api.customers.getCustomerHistory, { customerId });

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <History size={16} className="text-primary" /> Jobs & Invoices
      </h3>

      {history === undefined ? (
        <Skeleton className="h-20 w-full" />
      ) : history.ros.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No service history yet.</p>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>{history.ros.length}</p>
              <p className="text-xs text-muted-foreground">Jobs</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>{history.invoices.length}</p>
              <p className="text-xs text-muted-foreground">Invoices</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-primary" style={{ fontFamily: "Rajdhani, sans-serif" }}>${history.totalSpend.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Total Spend</p>
            </div>
          </div>

          {/* RO list */}
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {history.ros.map((ro) => {
              const inv = history.invoices.find((i) => i.roId === ro._id);
              return (
                <div key={ro._id} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{ro.roNumber}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", STATUS_COLORS_RO[ro.status])}>
                        {ro.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{ro.complaint}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {inv ? (
                      <>
                        <p className="font-semibold text-foreground">${inv.total.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">{inv.status}</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No invoice</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Vehicle Panel ─────────────────────────────────────────────────────────────

function VehiclePanel({ customer }: { customer: Customer }) {
  const vehicles = useQuery(api.customers.listVehicles, { customerId: customer._id });
  const serviceHistory = useQuery(api.customers.getVehicleServiceHistory, 
    vehicles && vehicles.length > 0 ? { vehicleId: vehicles[0]._id } : "skip"
  );
  const createVehicle = useMutation(api.customers.createVehicle);
  const updateVehicle = useMutation(api.customers.updateVehicle);
  const deleteVehicle = useMutation(api.customers.deleteVehicle);

  const [showAdd, setShowAdd] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [deleteVehicleId, setDeleteVehicleId] = useState<Id<"vehicles"> | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<Id<"vehicles"> | null>(null);
  const [historyVehicle, setHistoryVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedVehicle = vehicles?.find((v) => v._id === selectedVehicleId) ?? vehicles?.[0] ?? null;
  const history = useQuery(api.customers.getVehicleServiceHistory,
    selectedVehicle ? { vehicleId: selectedVehicle._id } : "skip"
  );

  const handleCreate = async (data: VehicleFormData) => {
    setSaving(true);
    try {
      await createVehicle({
        customerId: customer._id,
        year: data.year,
        make: data.make,
        model: data.model,
        trim: data.trim || undefined,
        vin: data.vin || undefined,
        licensePlate: data.licensePlate || undefined,
        color: data.color || undefined,
        mileageIn: data.mileageIn ? Number(data.mileageIn) : undefined,
        engine: data.engine || undefined,
        transmission: data.transmission || undefined,
        notes: data.notes || undefined,
      });
      toast.success("Vehicle added");
      setShowAdd(false);
    } catch {
      toast.error("Failed to add vehicle");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: VehicleFormData) => {
    if (!editVehicle) return;
    setSaving(true);
    try {
      await updateVehicle({
        vehicleId: editVehicle._id,
        year: data.year,
        make: data.make,
        model: data.model,
        trim: data.trim || undefined,
        vin: data.vin || undefined,
        licensePlate: data.licensePlate || undefined,
        color: data.color || undefined,
        mileageIn: data.mileageIn ? Number(data.mileageIn) : undefined,
        engine: data.engine || undefined,
        transmission: data.transmission || undefined,
        notes: data.notes || undefined,
      });
      toast.success("Vehicle updated");
      setEditVehicle(null);
    } catch {
      toast.error("Failed to update vehicle");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteVehicleId) return;
    try {
      await deleteVehicle({ vehicleId: deleteVehicleId });
      toast.success("Vehicle removed");
      setDeleteVehicleId(null);
      if (selectedVehicleId === deleteVehicleId) setSelectedVehicleId(null);
    } catch {
      toast.error("Failed to delete vehicle");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Car size={16} className="text-primary" /> Vehicles
        </h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} className="mr-1" /> Add Vehicle
        </Button>
      </div>

      {vehicles === undefined ? (
        <Skeleton className="h-20 w-full" />
      ) : vehicles.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No vehicles on file yet.
        </div>
      ) : (
        <div className="space-y-2">
          {vehicles.map((v) => (
            <div
              key={v._id}
              onClick={() => setSelectedVehicleId(v._id === selectedVehicleId ? null : v._id)}
              className={cn(
                "border rounded-lg p-3 cursor-pointer transition-colors",
                selectedVehicle?._id === v._id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    {v.year} {v.make} {v.model} {v.trim && <span className="text-muted-foreground text-sm">{v.trim}</span>}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                    {v.licensePlate && <span>Plate: {v.licensePlate}</span>}
                    {v.vin && <span className="font-mono">VIN: {v.vin}</span>}
                    {v.color && <span>{v.color}</span>}
                    {v.mileageIn && <span>{v.mileageIn.toLocaleString()} mi</span>}
                  </div>
                </div>
                <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditVehicle(v)}>
                    <Pencil size={12} />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteVehicleId(v._id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>

              {/* Service history for selected vehicle */}
              {selectedVehicle?._id === v._id && (
                <div className="mt-3 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <History size={12} /> Service History
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 cursor-pointer"
                      onClick={() => setHistoryVehicle(v)}
                    >
                      <ShieldCheck size={12} className="mr-1" /> Safety &amp; History
                    </Button>
                  </div>
                  {history === undefined ? (
                    <Skeleton className="h-10 w-full" />
                  ) : history.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No service records yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {history.map((ro) => (
                        <div key={ro._id} className="flex items-center justify-between text-xs">
                          <span className="text-foreground font-medium">{ro.roNumber}</span>
                          <span className="text-muted-foreground truncate max-w-[180px] mx-2">{ro.complaint}</span>
                          <Badge variant="secondary" className="text-xs">{ro.status.replace("_", " ")}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Vehicle Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Vehicle</DialogTitle>
          </DialogHeader>
          <VehicleForm onSubmit={handleCreate} onCancel={() => setShowAdd(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      {/* Edit Vehicle Dialog */}
      <Dialog open={!!editVehicle} onOpenChange={(o) => { if (!o) setEditVehicle(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Vehicle</DialogTitle>
          </DialogHeader>
          {editVehicle && (
            <VehicleForm
              initial={{
                year: editVehicle.year,
                make: editVehicle.make,
                model: editVehicle.model,
                trim: editVehicle.trim ?? "",
                vin: editVehicle.vin ?? "",
                licensePlate: editVehicle.licensePlate ?? "",
                color: editVehicle.color ?? "",
                mileageIn: editVehicle.mileageIn?.toString() ?? "",
                engine: editVehicle.engine ?? "",
                transmission: editVehicle.transmission ?? "",
                notes: editVehicle.notes ?? "",
              }}
              onSubmit={handleUpdate}
              onCancel={() => setEditVehicle(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Safety & History Dialog */}
      <Dialog open={!!historyVehicle} onOpenChange={(o) => { if (!o) setHistoryVehicle(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2"
              style={{ fontFamily: "Rajdhani, sans-serif" }}
            >
              <ShieldCheck size={18} className="text-primary" /> Safety &amp; History
            </DialogTitle>
          </DialogHeader>
          {historyVehicle && (
            <VehicleHistoryPanel
              vin={historyVehicle.vin || undefined}
              make={historyVehicle.make}
              model={historyVehicle.model}
              year={Number(historyVehicle.year) || new Date().getFullYear()}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteVehicleId} onOpenChange={(o) => { if (!o) setDeleteVehicleId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Vehicle?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this vehicle record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Customer Detail Panel ─────────────────────────────────────────────────────

function CustomerDetail({
  customer,
  onEdit,
  onDelete,
  onClose,
}: {
  customer: Customer;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            {customer.name}
          </h2>
          {customer.source && (
            <Badge variant="secondary" className="mt-1 text-xs capitalize">{customer.source}</Badge>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onEdit}><Pencil size={15} /></Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 size={15} /></Button>
          <Button size="icon" variant="ghost" onClick={onClose}><X size={15} /></Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Quick action buttons — uses device native apps */}
        <div className="flex gap-2">
          {customer.phone && (
            <Button asChild size="sm" className="flex-1 cursor-pointer">
              <a href={`tel:${customer.phone}`}>
                <Phone size={14} className="mr-1.5" />
                Call
              </a>
            </Button>
          )}
          {customer.phone && (
            <Button asChild size="sm" variant="secondary" className="flex-1 cursor-pointer">
              <a href={`sms:${customer.phone}`}>
                <MessageSquare size={14} className="mr-1.5" />
                Text
              </a>
            </Button>
          )}
          {customer.email && (
            <Button asChild size="sm" variant="secondary" className="flex-1 cursor-pointer">
              <a href={`mailto:${customer.email}`}>
                <Mail size={14} className="mr-1.5" />
                Email
              </a>
            </Button>
          )}
        </div>

        {/* Contact info */}
        <div className="space-y-2">
          {customer.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone size={14} className="text-primary shrink-0" />
              <a href={`tel:${customer.phone}`} className="text-foreground hover:text-primary">{customer.phone}</a>
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail size={14} className="text-primary shrink-0" />
              <a href={`mailto:${customer.email}`} className="text-foreground hover:text-primary">{customer.email}</a>
            </div>
          )}
          {(customer.address || customer.city) && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin size={14} className="text-primary mt-0.5 shrink-0" />
              <span className="text-muted-foreground">
                {[customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ")}
              </span>
            </div>
          )}
        </div>

        {customer.notes && (
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground">{customer.notes}</p>
          </div>
        )}

        {/* Job & Invoice history */}
        <CustomerHistoryPanel customerId={customer._id} />

        {/* Vehicles */}
        <VehiclePanel customer={customer} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function CustomersInner() {
  const { results: customers, status, loadMore } = usePaginatedQuery(
    api.customers.listCustomers,
    {},
    { initialNumItems: 100 }
  );
  const createCustomer = useMutation(api.customers.createCustomer);
  const updateCustomer = useMutation(api.customers.updateCustomer);
  const deleteCustomer = useMutation(api.customers.deleteCustomer);

  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteCustomerId, setDeleteCustomerId] = useState<Id<"customers"> | null>(null);
  const [saving, setSaving] = useState(false);

  const isLoading = status === "LoadingFirstPage";

  const filtered = (customers ?? []).filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? "").includes(search) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (data: CustomerFormData) => {
    setSaving(true);
    try {
      const id = await createCustomer({
        name: data.name,
        phone: data.phone || undefined,
        email: data.email || undefined,
        address: data.address || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        zip: data.zip || undefined,
        notes: data.notes || undefined,
        source: data.source || undefined,
        smsOptOut: data.smsOptOut || undefined,
      });
      toast.success("Customer added");
      setShowAdd(false);
    } catch {
      toast.error("Failed to add customer");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: CustomerFormData) => {
    if (!editCustomer) return;
    setSaving(true);
    try {
      await updateCustomer({
        customerId: editCustomer._id,
        name: data.name,
        phone: data.phone || undefined,
        email: data.email || undefined,
        address: data.address || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        zip: data.zip || undefined,
        notes: data.notes || undefined,
        source: data.source || undefined,
        smsOptOut: data.smsOptOut,
      });
      toast.success("Customer updated");
      if (selectedCustomer?._id === editCustomer._id) {
        // re-select to refresh
      }
      setEditCustomer(null);
    } catch {
      toast.error("Failed to update customer");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCustomerId) return;
    try {
      await deleteCustomer({ customerId: deleteCustomerId });
      toast.success("Customer deleted");
      if (selectedCustomer?._id === deleteCustomerId) setSelectedCustomer(null);
      setDeleteCustomerId(null);
    } catch {
      toast.error("Failed to delete customer");
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left list */}
      <div className={cn(
        "flex flex-col border-r border-border transition-all",
        selectedCustomer ? "hidden md:flex md:w-80 lg:w-96" : "flex flex-1 md:w-80 lg:w-96"
      )}>
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
              <Users size={22} className="text-primary" /> Customers
            </h1>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} className="mr-1" /> New
            </Button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search by name, phone, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Users /></EmptyMedia>
                <EmptyTitle>{search ? "No results" : "No customers yet"}</EmptyTitle>
                <EmptyDescription>
                  {search ? "Try a different search." : "Add your first customer to get started."}
                </EmptyDescription>
              </EmptyHeader>
              {!search && (
                <EmptyContent>
                  <Button size="sm" onClick={() => setShowAdd(true)}>
                    <Plus size={14} className="mr-1" /> Add Customer
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            filtered.map((c) => (
              <button
                key={c._id}
                onClick={() => setSelectedCustomer(c)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border hover:bg-accent/30 transition-colors",
                  selectedCustomer?._id === c._id && "bg-accent/30 border-l-2 border-l-primary"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{c.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      {c.phone && <span className="flex items-center gap-1"><Phone size={10} />{c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1 truncate"><Mail size={10} />{c.email}</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0 ml-2" />
                </div>
              </button>
            ))
          )}
        </div>

        {customers !== undefined && filtered.length > 0 && (
          <div className="p-3 border-t border-border text-xs text-muted-foreground text-center space-y-2">
            <p>{filtered.length} customer{filtered.length !== 1 ? "s" : ""} loaded</p>
            {status === "CanLoadMore" && (
              <Button variant="secondary" size="sm" onClick={() => loadMore(100)} className="cursor-pointer">
                Load more
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Right detail panel */}
      {selectedCustomer ? (
        <div className="flex-1 overflow-hidden">
          <CustomerDetail
            customer={selectedCustomer}
            onEdit={() => setEditCustomer(selectedCustomer)}
            onDelete={() => setDeleteCustomerId(selectedCustomer._id)}
            onClose={() => setSelectedCustomer(null)}
          />
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground flex-col gap-3">
          <Users size={40} className="opacity-30" />
          <p className="text-sm">Select a customer to view details</p>
        </div>
      )}

      {/* Add Customer Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <CustomerForm onSubmit={handleCreate} onCancel={() => setShowAdd(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={!!editCustomer} onOpenChange={(o) => { if (!o) setEditCustomer(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          {editCustomer && (
            <CustomerForm
              initial={{
                name: editCustomer.name,
                phone: editCustomer.phone ?? "",
                email: editCustomer.email ?? "",
                address: editCustomer.address ?? "",
                city: editCustomer.city ?? "",
                state: editCustomer.state ?? "",
                zip: editCustomer.zip ?? "",
                notes: editCustomer.notes ?? "",
                source: editCustomer.source ?? "",
                smsOptOut: editCustomer.smsOptOut ?? false,
              }}
              onSubmit={handleUpdate}
              onCancel={() => setEditCustomer(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteCustomerId} onOpenChange={(o) => { if (!o) setDeleteCustomerId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this customer and all their vehicles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <SignInButton />
        </div>
      </Unauthenticated>
      <Authenticated>
        <CustomersInner />
      </Authenticated>
    </>
  );
}
