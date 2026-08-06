import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  UserPlus, MoreHorizontal, ShieldCheck, Wrench, MapPin, Pen, Trash2, Mail
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  service_writer: "Service Writer",
  mechanic: "Mechanic",
  mobile_mechanic: "Mobile Mechanic",
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <ShieldCheck size={12} />,
  admin: <ShieldCheck size={12} />,
  service_writer: <Pen size={12} />,
  mechanic: <Wrench size={12} />,
  mobile_mechanic: <MapPin size={12} />,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-primary/20 text-primary border-primary/30",
  admin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  service_writer: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  mechanic: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  mobile_mechanic: "bg-green-500/20 text-green-400 border-green-500/30",
};

type InviteRole = "admin" | "service_writer" | "mechanic" | "mobile_mechanic";

export default function EmployeeRoster({ orgId }: { orgId: Id<"organizations"> }) {
  const members = useQuery(api.employees.listMembers, { orgId });
  const inviteMember = useMutation(api.organizations.inviteMember);
  const updateMember = useMutation(api.employees.updateMember);
  const removeMember = useMutation(api.employees.removeMember);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("mechanic");
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await inviteMember({ orgId, email: inviteEmail.trim(), role: inviteRole });
      toast.success("Invite sent!");
      setInviteOpen(false);
      setInviteEmail("");
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { message: string };
        toast.error(message);
      } else {
        toast.error("Failed to invite");
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: Id<"orgMembers">, role: InviteRole) => {
    try {
      await updateMember({ memberId, role });
      toast.success("Role updated");
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleDeactivate = async (memberId: Id<"orgMembers">) => {
    try {
      await removeMember({ memberId });
      toast.success("Employee deactivated");
    } catch {
      toast.error("Failed to deactivate");
    }
  };

  if (members === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const active = members.filter((m) => m.isActive);
  const inactive = members.filter((m) => !m.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{active.length} active employee{active.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => setInviteOpen(true)} className="cursor-pointer">
          <UserPlus size={14} className="mr-1" /> Invite Employee
        </Button>
      </div>

      {active.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><UserPlus /></EmptyMedia>
            <EmptyTitle>No employees yet</EmptyTitle>
            <EmptyDescription>Invite your first team member to get started</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setInviteOpen(true)}>Invite Employee</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {active.map((m) => (
            <div
              key={m._id}
              className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors"
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                  {(m.userName ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{m.userName}</p>
                <p className="text-xs text-muted-foreground truncate">{m.userEmail ?? "—"}</p>
              </div>
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[m.role] ?? ""}`}
              >
                {ROLE_ICONS[m.role]}
                {ROLE_LABELS[m.role]}
              </span>
              {m.inviteStatus === "pending" && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  <Mail size={10} className="mr-1" /> Pending
                </Badge>
              )}
              {m.role !== "owner" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer">
                      <MoreHorizontal size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleRoleChange(m._id, "mechanic")}
                      className="cursor-pointer"
                    >
                      Set as Mechanic
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleRoleChange(m._id, "mobile_mechanic")}
                      className="cursor-pointer"
                    >
                      Set as Mobile Mechanic
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleRoleChange(m._id, "service_writer")}
                      className="cursor-pointer"
                    >
                      Set as Service Writer
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleRoleChange(m._id, "admin")}
                      className="cursor-pointer"
                    >
                      Set as Admin
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive cursor-pointer"
                      onClick={() => handleDeactivate(m._id)}
                    >
                      <Trash2 size={13} className="mr-2" /> Deactivate
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
            {inactive.length} deactivated employee{inactive.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-2 space-y-2 opacity-50">
            {inactive.map((m) => (
              <div key={m._id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                    {(m.userName ?? "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{m.userName}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.userEmail ?? "—"}</p>
                </div>
                <Badge variant="outline" className="text-xs">Inactive</Badge>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Email address</Label>
              <Input
                placeholder="employee@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as InviteRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mechanic">Mechanic</SelectItem>
                  <SelectItem value="mobile_mechanic">Mobile Mechanic</SelectItem>
                  <SelectItem value="service_writer">Service Writer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="cursor-pointer">
              {inviting ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
