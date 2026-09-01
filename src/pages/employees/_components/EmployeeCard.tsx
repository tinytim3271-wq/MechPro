import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { MapPin, Clock, MoreVertical, UserMinus, DollarSign, ChevronUp, Pencil, Shield, XCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import EditEmployeeDialog from "./EditEmployeeDialog.tsx";

type EmploymentType = "w2" | "1099";
type EditableRole = "admin" | "service_writer" | "mechanic" | "mobile_mechanic";
type Role = "owner" | EditableRole;

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  service_writer: "Service Writer",
  mechanic: "Mechanic",
  mobile_mechanic: "Mobile Mechanic",
};

const ROLE_COLORS: Record<Role, string> = {
  owner: "bg-primary/20 text-primary border-primary/30",
  admin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  service_writer: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  mechanic: "bg-green-500/20 text-green-400 border-green-500/30",
  mobile_mechanic: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  w2:   "W-2",
  "1099": "1099",
};

const EMPLOYMENT_COLORS: Record<EmploymentType, string> = {
  w2:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "1099": "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

function isAdminRole(role: string): boolean {
  return role === "owner" || role === "admin";
}

type Employee = {
  _id: Id<"orgMembers">;
  role: Role;
  isActive: boolean;
  inviteStatus?: "pending" | "accepted" | "declined";
  inviteEmail?: string;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  avatarUrl?: string;
  employmentType?: EmploymentType;
  locationId?: Id<"locations">;
  hasAdminAccess?: boolean;
  hourlyRate?: number;
  jobTitle?: string;
  ssnLast4?: string;
  payAddress?: string;
  payFrequency?: "weekly" | "biweekly" | "semimonthly" | "monthly";
  latestPing?: {
    lat: number;
    lng: number;
    timestamp: string;
  } | null;
};

export default function EmployeeCard({
  employee,
  canEdit,
}: {
  employee: Employee;
  canEdit: boolean;
}) {
  const [editingRole, setEditingRole] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const updateMember = useMutation(api.employees.updateMember);
  const removeMember = useMutation(api.employees.removeMember);
  const revokeInvite = useMutation(api.employees.revokeInvite);
  const payRecords = useQuery(
    api.payroll.getTechPayRecords,
    showPay ? { memberId: employee._id } : "skip"
  );

  const handleRoleChange = async (newRole: string) => {
    try {
      await updateMember({ memberId: employee._id, role: newRole as EditableRole });
      toast.success("Role updated");
      setEditingRole(false);
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleEmploymentTypeChange = async (type: EmploymentType) => {
    try {
      await updateMember({ memberId: employee._id, employmentType: type });
      toast.success(`Employment type set to ${EMPLOYMENT_LABELS[type]}`);
    } catch {
      toast.error("Failed to update employment type");
    }
  };

  const handleRemove = async () => {
    try {
      await removeMember({ memberId: employee._id });
      toast.success("Employee removed");
      setRemoveConfirmOpen(false);
    } catch {
      toast.error("Failed to remove employee");
    }
  };

  const handleRevokeInvite = async () => {
    try {
      await revokeInvite({ memberId: employee._id });
      toast.success("Invite revoked");
      setRevokeConfirmOpen(false);
    } catch {
      toast.error("Failed to revoke invite");
    }
  };

  const initials = employee.userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const isPending = employee.inviteStatus === "pending";
  const isTech = employee.role === "mechanic" || employee.role === "mobile_mechanic";

  // Compute pay totals from loaded records
  const totalEarned = payRecords?.reduce((s, r) => s + r.totalEarned, 0) ?? 0;
  const totalHours  = payRecords?.reduce((s, r) => s + r.totalHours, 0) ?? 0;

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3">
      {/* Top row: avatar + name + actions */}
      <div className="flex items-start gap-3">
        <Avatar className="w-10 h-10 shrink-0">
          {employee.avatarUrl && <AvatarImage src={employee.avatarUrl} alt={employee.userName} />}
          <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground truncate">{employee.userName}</span>
            {isPending && (
              <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">
                Pending
              </Badge>
            )}
            {!employee.isActive && !isPending && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Inactive
              </Badge>
            )}
          </div>
          {employee.userEmail && (
            <p className="text-xs text-muted-foreground truncate">{employee.userEmail}</p>
          )}

          {/* Role + employment type badges */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {editingRole && canEdit ? (
              <Select defaultValue={employee.role} onValueChange={handleRoleChange}>
                <SelectTrigger className="h-7 text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as Role[])
                    .filter((r) => r !== "owner")
                    .map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <span
                className={`text-xs px-2 py-0.5 rounded border font-medium ${ROLE_COLORS[employee.role]}`}
                onClick={() => canEdit && employee.role !== "owner" && setEditingRole(true)}
                style={{ cursor: canEdit && employee.role !== "owner" ? "pointer" : "default" }}
                title={canEdit && employee.role !== "owner" ? "Click to change role" : undefined}
              >
                {ROLE_LABELS[employee.role]}
              </span>
            )}

            {/* Employment type — clickable for managers */}
            {employee.employmentType ? (
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded border font-medium",
                  EMPLOYMENT_COLORS[employee.employmentType],
                  canEdit && "cursor-pointer hover:opacity-80"
                )}
                title={canEdit ? "Click to change employment type" : undefined}
                onClick={() => {
                  if (!canEdit) return;
                  const next = employee.employmentType === "w2" ? "1099" : "w2";
                  handleEmploymentTypeChange(next as EmploymentType);
                }}
              >
                {EMPLOYMENT_LABELS[employee.employmentType]}
              </span>
            ) : canEdit ? (
              <div className="flex gap-1">
                <button
                  onClick={() => handleEmploymentTypeChange("w2")}
                  className="text-[10px] px-2 py-0.5 rounded border border-dashed border-border text-muted-foreground hover:border-blue-400/50 hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Set W-2
                </button>
                <button
                  onClick={() => handleEmploymentTypeChange("1099")}
                  className="text-[10px] px-2 py-0.5 rounded border border-dashed border-border text-muted-foreground hover:border-orange-400/50 hover:text-orange-400 transition-colors cursor-pointer"
                >
                  Set 1099
                </button>
              </div>
            ) : null}

            {employee.latestPing && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin size={11} className="text-primary" />
                <Clock size={11} />
                {formatDistanceToNow(new Date(employee.latestPing.timestamp), { addSuffix: true })}
              </span>
            )}

            {employee.hasAdminAccess && !isAdminRole(employee.role) && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium bg-primary/15 text-primary border-primary/30">
                <Shield size={10} /> Admin Access
              </span>
            )}
          </div>
        </div>

        {canEdit && employee.role !== "owner" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 cursor-pointer">
                <MoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)} className="cursor-pointer">
                <Pencil size={13} className="mr-1" />
                Edit Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setEditingRole(true)} className="cursor-pointer">Change Role</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEmploymentTypeChange("w2")}>
                Mark as W-2 Employee
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEmploymentTypeChange("1099")}>
                Mark as 1099 Contractor
              </DropdownMenuItem>
              {isTech && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowPay((v) => !v)}>
                    <DollarSign size={13} className="mr-1" />
                    {showPay ? "Hide Pay Records" : "View Pay Records"}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              {isPending ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => setRevokeConfirmOpen(true)}
                >
                  <XCircle size={14} className="mr-1" />
                  Revoke Invite
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => setRemoveConfirmOpen(true)}
                >
                  <UserMinus size={14} className="mr-1" />
                  Remove Employee
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Pay records panel — manager view */}
      {isTech && canEdit && showPay && (
        <div className="border-t border-border pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <DollarSign size={11} /> Pay Records
            </p>
            <button
              onClick={() => setShowPay(false)}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ChevronUp size={14} />
            </button>
          </div>

          {payRecords === undefined ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : payRecords.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pay records yet.</p>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-muted/30 rounded-md p-2 text-center">
                  <p className="text-base font-bold text-primary" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                    ${totalEarned.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Total Earned</p>
                </div>
                <div className="bg-muted/30 rounded-md p-2 text-center">
                  <p className="text-base font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                    {totalHours.toFixed(1)}h
                  </p>
                  <p className="text-[10px] text-muted-foreground">Flat-Rate Hours</p>
                </div>
              </div>

              {/* Last 5 records */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {payRecords.slice(0, 10).map((r) => (
                  <div
                    key={r._id}
                    className="flex items-center justify-between text-xs bg-muted/20 rounded px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{r.roNumber} · {r.vehicleSummary}</p>
                      <p className="text-muted-foreground">{format(new Date(r.paidAt), "MMM d, yyyy")} · {r.totalHours.toFixed(1)}h</p>
                    </div>
                    <span className="font-bold text-primary ml-2 shrink-0">${r.totalEarned.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {payRecords.length > 10 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  +{payRecords.length - 10} more records
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      {editOpen && (
        <EditEmployeeDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          employee={employee}
        />
      )}

      {/* Remove Confirmation */}
      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {employee.userName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate their account. They will no longer be able to access the system or receive job assignments. You can re-invite them later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              onClick={handleRemove}
            >
              Remove Employee
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Invite Confirmation */}
      <AlertDialog open={revokeConfirmOpen} onOpenChange={setRevokeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invite for {employee.userName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the pending invitation. The employee will not be able to join using this invite. You can send a new invite later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              onClick={handleRevokeInvite}
            >
              Revoke Invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
