import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { toast } from "sonner";
import { Shield } from "lucide-react";

type EmploymentType = "w2" | "1099";
type EditableRole = "admin" | "service_writer" | "mechanic" | "mobile_mechanic";

type EmployeeData = {
  _id: Id<"orgMembers">;
  role: string;
  employmentType?: EmploymentType;
  locationId?: Id<"locations">;
  hasAdminAccess?: boolean;
  userName: string;
  userEmail?: string;
  userPhone?: string;
};

export default function EditEmployeeDialog({
  open,
  onClose,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  employee: EmployeeData;
}) {
  const [name, setName] = useState(employee.userName);
  const [email, setEmail] = useState(employee.userEmail ?? "");
  const [phone, setPhone] = useState(employee.userPhone ?? "");
  const [role, setRole] = useState(employee.role);
  const [employmentType, setEmploymentType] = useState<EmploymentType>(employee.employmentType ?? "w2");
  const [locationId, setLocationId] = useState<string>(employee.locationId ?? "none");
  const [hasAdminAccess, setHasAdminAccess] = useState(employee.hasAdminAccess ?? false);
  const [saving, setSaving] = useState(false);

  const updateMember = useMutation(api.employees.updateMember);
  const updateProfile = useMutation(api.employees.updateMemberProfile);
  const locations = useQuery(api.locations.listLocations, {});

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      // Update profile (name, email, phone)
      await updateProfile({
        memberId: employee._id,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });

      // Update member fields (role, employment type, location, admin access)
      const memberUpdates: {
        memberId: Id<"orgMembers">;
        role?: EditableRole;
        employmentType?: EmploymentType;
        locationId?: Id<"locations"> | null;
        hasAdminAccess?: boolean;
      } = { memberId: employee._id };

      if (role !== employee.role && role !== "owner") {
        memberUpdates.role = role as EditableRole;
      }
      if (employmentType !== employee.employmentType) {
        memberUpdates.employmentType = employmentType;
      }
      const newLocId = locationId === "none" ? null : locationId as Id<"locations">;
      const oldLocId = employee.locationId ?? null;
      if (newLocId !== oldLocId) {
        memberUpdates.locationId = newLocId;
      }
      if (hasAdminAccess !== (employee.hasAdminAccess ?? false)) {
        memberUpdates.hasAdminAccess = hasAdminAccess;
      }

      // Only call updateMember if there are membership-level changes
      if (memberUpdates.role || memberUpdates.employmentType || memberUpdates.locationId !== undefined || memberUpdates.hasAdminAccess !== undefined) {
        await updateMember(memberUpdates);
      }

      toast.success("Employee updated");
      onClose();
    } catch {
      toast.error("Failed to update employee");
    } finally {
      setSaving(false);
    }
  };

  const isOwner = employee.role === "owner";
  // Show admin access toggle only for non-admin/owner roles
  const showAdminToggle = !isOwner && role !== "admin" && role !== "owner";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Rajdhani, sans-serif" }}>Edit Employee</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="emp-name" className="text-xs">Full Name</Label>
            <Input
              id="emp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="emp-email" className="text-xs">Email</Label>
            <Input
              id="emp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="emp-phone" className="text-xs">Phone</Label>
            <Input
              id="emp-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            {isOwner ? (
              <p className="text-sm text-muted-foreground">Owner (cannot be changed)</p>
            ) : (
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin" className="cursor-pointer">Admin</SelectItem>
                  <SelectItem value="service_writer" className="cursor-pointer">Service Writer</SelectItem>
                  <SelectItem value="mechanic" className="cursor-pointer">Mechanic</SelectItem>
                  <SelectItem value="mobile_mechanic" className="cursor-pointer">Mobile Mechanic</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Admin Access Toggle */}
          {showAdminToggle && (
            <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Admin Privileges</p>
                  <p className="text-xs text-muted-foreground">
                    Access reports, employees, and settings
                  </p>
                </div>
              </div>
              <Switch
                checked={hasAdminAccess}
                onCheckedChange={setHasAdminAccess}
                className="cursor-pointer"
              />
            </div>
          )}

          {/* Employment Type */}
          <div className="space-y-1.5">
            <Label className="text-xs">Employment Type</Label>
            <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="w2" className="cursor-pointer">W-2 Employee</SelectItem>
                <SelectItem value="1099" className="cursor-pointer">1099 Contractor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-xs">Primary Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="No location assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="cursor-pointer">No location assigned</SelectItem>
                {locations?.map((loc) => (
                  <SelectItem key={loc._id} value={loc._id} className="cursor-pointer">
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
