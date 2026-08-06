import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Gift, UserCheck, UserX, Clock, Plus, Mail, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type UserRow = {
  _id: Id<"users">;
  name: string;
  email: string;
  freeAccessUntil: string | null;
  commerceCustomerId: string | null;
  role: string;
};

export default function FreeAccessTab() {
  const users = useQuery(api.admin.listAllUsers, {});
  const grantAccess = useMutation(api.admin.grantFreeAccess);
  const grantByEmail = useMutation(api.admin.grantFreeAccessByEmail);
  const revokeAccess = useMutation(api.admin.revokeFreeAccess);
  const updateAccess = useMutation(api.admin.updateFreeAccess);
  const [grantingId, setGrantingId] = useState<Id<"users"> | null>(null);
  const [selectedDuration, setSelectedDuration] = useState("30");

  // Grant by email dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEmail, setDialogEmail] = useState("");
  const [dialogDuration, setDialogDuration] = useState("30");
  const [dialogSubmitting, setDialogSubmitting] = useState(false);

  // Edit dialog state
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  if (users === undefined) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const handleGrant = async (userId: Id<"users">) => {
    try {
      await grantAccess({ userId, durationDays: Number(selectedDuration) });
      toast.success(`Granted ${selectedDuration} days of free access.`);
      setGrantingId(null);
    } catch {
      toast.error("Failed to grant free access.");
    }
  };

  const handleRevoke = async (userId: Id<"users">) => {
    try {
      await revokeAccess({ userId });
      toast.success("Free access revoked.");
    } catch {
      toast.error("Failed to revoke access.");
    }
  };

  const handleGrantByEmail = async () => {
    if (!dialogEmail.trim() || !dialogEmail.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setDialogSubmitting(true);
    try {
      const result = await grantByEmail({
        email: dialogEmail.trim(),
        durationDays: Number(dialogDuration),
      });
      if (result.isNew) {
        toast.success(`Free access pre-granted for ${dialogEmail.trim()}. They'll have access when they sign up.`);
      } else {
        toast.success(`Free access granted to ${result.userName}.`);
      }
      setDialogOpen(false);
      setDialogEmail("");
    } catch {
      toast.error("Failed to grant free access.");
    } finally {
      setDialogSubmitting(false);
    }
  };

  const openEditDialog = (user: UserRow) => {
    setEditUser(user);
    // Pre-fill with existing expiry date in YYYY-MM-DD format
    if (user.freeAccessUntil) {
      setEditDate(format(new Date(user.freeAccessUntil), "yyyy-MM-dd"));
    } else {
      setEditDate(format(new Date(), "yyyy-MM-dd"));
    }
  };

  const handleEditSave = async () => {
    if (!editUser || !editDate) return;

    const expiresAt = new Date(editDate + "T23:59:59.999Z").toISOString();
    if (new Date(expiresAt).getTime() < Date.now()) {
      toast.error("Expiry date must be in the future.");
      return;
    }

    setEditSubmitting(true);
    try {
      await updateAccess({ userId: editUser._id, expiresAt });
      toast.success(`Free access updated — expires ${format(new Date(expiresAt), "MMM d, yyyy")}.`);
      setEditUser(null);
    } catch {
      toast.error("Failed to update free access.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const hasFreeAccess = (u: { freeAccessUntil: string | null }) => {
    if (!u.freeAccessUntil) return false;
    return new Date(u.freeAccessUntil).getTime() > Date.now();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gift size={16} className="text-primary" /> Free Access Management
              </CardTitle>
              <CardDescription>
                Grant free MechPro access to team members or testers. They can use the app without a subscription for the duration you set.
              </CardDescription>
            </div>
            <Button
              size="sm"
              className="cursor-pointer gap-2 shrink-0"
              onClick={() => setDialogOpen(true)}
            >
              <Plus size={14} />
              Grant by Email
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Duration selector */}
          <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-muted/30 border border-border">
            <span className="text-sm text-muted-foreground">Grant duration:</span>
            <Select value={selectedDuration} onValueChange={setSelectedDuration}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
                <SelectItem value="36500">Lifetime</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Users list */}
          <div className="space-y-3">
            {users.map((u) => {
              const isFree = hasFreeAccess(u);
              const hasSub = !!u.commerceCustomerId;

              return (
                <div
                  key={u._id}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email || "No email"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px]">{u.role}</Badge>
                      {isFree && (
                        <Badge className="text-[10px] bg-green-500/20 text-green-600 border-green-500/30">
                          <Clock size={10} className="mr-1" />
                          Free until {format(new Date(u.freeAccessUntil!), "MMM d, yyyy")}
                        </Badge>
                      )}
                      {hasSub && !isFree && (
                        <Badge className="text-[10px] bg-blue-500/20 text-blue-600 border-blue-500/30">
                          <UserCheck size={10} className="mr-1" />
                          Subscriber
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isFree ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="cursor-pointer text-xs"
                          onClick={() => openEditDialog(u)}
                        >
                          <Pencil size={12} className="mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="cursor-pointer text-xs"
                          onClick={() => handleRevoke(u._id)}
                        >
                          <UserX size={12} className="mr-1" />
                          Revoke
                        </Button>
                      </>
                    ) : grantingId === u._id ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="cursor-pointer text-xs"
                          onClick={() => handleGrant(u._id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="cursor-pointer text-xs"
                          onClick={() => setGrantingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="cursor-pointer text-xs"
                        onClick={() => setGrantingId(u._id)}
                      >
                        <Gift size={12} className="mr-1" />
                        Grant Free
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Grant by Email Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail size={18} className="text-primary" />
              Grant Free Access by Email
            </DialogTitle>
            <DialogDescription>
              Enter an email address to grant free access. If they haven{"'"}t signed up yet, access will be waiting for them when they do.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="grant-email">Email Address</Label>
              <Input
                id="grant-email"
                type="email"
                placeholder="mechanic@example.com"
                value={dialogEmail}
                onChange={(e) => setDialogEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleGrantByEmail();
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={dialogDuration} onValueChange={setDialogDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="36500">Lifetime</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              className="cursor-pointer"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer gap-2"
              onClick={handleGrantByEmail}
              disabled={dialogSubmitting || !dialogEmail.trim()}
            >
              <Gift size={14} />
              {dialogSubmitting ? "Granting..." : "Grant Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Free Access Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={18} className="text-primary" />
              Edit Free Access
            </DialogTitle>
            <DialogDescription>
              Change the expiry date for {editUser?.name || "this user"}{editUser?.email ? ` (${editUser.email})` : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-expiry">Expires On</Label>
              <Input
                id="edit-expiry"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
              {editUser?.freeAccessUntil && (
                <p className="text-xs text-muted-foreground">
                  Currently expires: {format(new Date(editUser.freeAccessUntil), "MMM d, yyyy")}
                </p>
              )}
            </div>

            {/* Quick duration buttons */}
            <div className="space-y-2">
              <Label>Or extend from today</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "+7 days", days: 7 },
                  { label: "+30 days", days: 30 },
                  { label: "+90 days", days: 90 },
                  { label: "+1 year", days: 365 },
                  { label: "Lifetime", days: 36500 },
                ].map((opt) => (
                  <Button
                    key={opt.days}
                    variant="secondary"
                    size="sm"
                    className="cursor-pointer text-xs"
                    onClick={() => {
                      const d = new Date(Date.now() + opt.days * 24 * 60 * 60 * 1000);
                      setEditDate(format(d, "yyyy-MM-dd"));
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              className="cursor-pointer"
              onClick={() => setEditUser(null)}
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer gap-2"
              onClick={handleEditSave}
              disabled={editSubmitting || !editDate}
            >
              <Pencil size={14} />
              {editSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
