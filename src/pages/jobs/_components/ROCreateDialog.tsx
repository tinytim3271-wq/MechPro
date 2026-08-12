import { useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
import { Truck, Wrench } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ROCreateDialog({ open, onClose }: Props) {
  const { results: customersPage } = usePaginatedQuery(api.customers.listCustomers, {}, { initialNumItems: 200 });
  const customers = customersPage;
  const org = useQuery(api.organizations.getCurrentOrg, {});
  const employees = useQuery(api.employees.listMembers, org ? { orgId: org._id } : "skip");
  const createRO = useMutation(api.repairOrders.createRO);

  const [customerId, setCustomerId] = useState<Id<"customers"> | "">("");
  const [vehicleId, setVehicleId] = useState<Id<"vehicles"> | "">("");
  const [complaint, setComplaint] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [isMobile, setIsMobile] = useState(false);
  const [bayName, setBayName] = useState("");
  const [mobileAddress, setMobileAddress] = useState("");
  const [mileageIn, setMileageIn] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [assignedTo, setAssignedTo] = useState<Id<"orgMembers"> | "">("");
  const [saving, setSaving] = useState(false);

  // Filter to only active mechanics / mobile mechanics
  const mechanics = (employees ?? []).filter(
    (e) => e.isActive && (e.role === "mechanic" || e.role === "mobile_mechanic")
  );

  const vehicles = useQuery(
    api.customers.listVehicles,
    customerId ? { customerId: customerId as Id<"customers"> } : "skip"
  );

  const handleClose = () => {
    setCustomerId("");
    setVehicleId("");
    setComplaint("");
    setPriority("normal");
    setIsMobile(false);
    setBayName("");
    setMobileAddress("");
    setMileageIn("");
    setScheduledAt("");
    setAssignedTo("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!customerId) { toast.error("Select a customer"); return; }
    if (!vehicleId) { toast.error("Select a vehicle"); return; }
    if (!complaint.trim()) { toast.error("Enter a complaint/concern"); return; }
    setSaving(true);
    try {
      await createRO({
        customerId: customerId as Id<"customers">,
        vehicleId: vehicleId as Id<"vehicles">,
        complaint,
        priority,
        isMobile,
        bayName: !isMobile && bayName ? bayName : undefined,
        mobileAddress: isMobile && mobileAddress ? mobileAddress : undefined,
        mileageIn: mileageIn ? Number(mileageIn) : undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        assignedTo: assignedTo ? (assignedTo as Id<"orgMembers">) : undefined,
      });
      toast.success("Repair order created");
      handleClose();
    } catch {
      toast.error("Failed to create repair order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Repair Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer */}
          <div className="space-y-1">
            <Label>Customer *</Label>
            <Select
              value={customerId || "none"}
              onValueChange={(v) => { setCustomerId(v === "none" ? "" : v as Id<"customers">); setVehicleId(""); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select customer...</SelectItem>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vehicle */}
          <div className="space-y-1">
            <Label>Vehicle *</Label>
            <Select
              value={vehicleId || "none"}
              onValueChange={(v) => setVehicleId(v === "none" ? "" : v as Id<"vehicles">)}
              disabled={!customerId}
            >
              <SelectTrigger>
                <SelectValue placeholder={customerId ? "Select vehicle..." : "Select customer first"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select vehicle...</SelectItem>
                {(vehicles ?? []).map((v) => (
                  <SelectItem key={v._id} value={v._id}>
                    {v.year} {v.make} {v.model} {v.licensePlate ? `· ${v.licensePlate}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Complaint */}
          <div className="space-y-1">
            <Label>Customer Complaint / Concern *</Label>
            <Textarea
              placeholder="Describe what the customer is experiencing..."
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              rows={3}
            />
          </div>

          {/* Priority */}
          <div className="space-y-1">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "normal" | "high")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Assign Mechanic */}
          <div className="space-y-1">
            <Label>Assign Mechanic</Label>
            <Select
              value={assignedTo || "unassigned"}
              onValueChange={(v) => setAssignedTo(v === "unassigned" ? "" : v as Id<"orgMembers">)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Assign to mechanic (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {mechanics.map((m) => (
                  <SelectItem key={m._id} value={m._id}>
                    <span className="flex items-center gap-2">
                      {m.userName}
                      {m.role === "mobile_mechanic" && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          <Truck size={10} className="mr-0.5" />Mobile
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mechanics.length === 0 && (
              <p className="text-xs text-muted-foreground">No mechanics found. Add team members with "Mechanic" role in Settings.</p>
            )}
          </div>

          {/* Mobile toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Truck size={16} className="text-muted-foreground" />
              <div>
                <Label className="text-sm">Mobile Job</Label>
                <p className="text-xs text-muted-foreground">Dispatched to customer location</p>
              </div>
            </div>
            <Switch checked={isMobile} onCheckedChange={setIsMobile} />
          </div>

          {/* Bay or mobile address */}
          {!isMobile ? (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <Wrench size={14} className="text-muted-foreground" />
                Bay Assignment
              </Label>
              <Select value={bayName || "none"} onValueChange={(v) => setBayName(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Assign to bay (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No bay yet</SelectItem>
                  {(org?.bayNames ?? []).map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Service Address</Label>
              <Input
                placeholder="123 Main St, Dallas TX"
                value={mobileAddress}
                onChange={(e) => setMobileAddress(e.target.value)}
              />
            </div>
          )}

          {/* Mileage + Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Mileage In</Label>
              <Input type="number" placeholder="45000" value={mileageIn} onChange={(e) => setMileageIn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Scheduled Date</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating..." : "Create RO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
