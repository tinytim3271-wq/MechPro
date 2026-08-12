import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Authenticated, Unauthenticated } from "convex/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import {
  Building2, Plus, Check, MapPin, Phone, Mail,
  Wrench, Settings, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useNavigate } from "react-router-dom";

// ─── Schema ───────────────────────────────────────────────────────────────────

const createLocationSchema = z.object({
  name: z.string().min(2, "Location name is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  laborRate: z.coerce.number().min(0, "Must be ≥ 0"),
  taxRate: z.coerce.number().min(0).max(100),
  bayCount: z.coerce.number().int().min(0).max(50),
});

type CreateLocationValues = z.infer<typeof createLocationSchema>;

// ─── Create Location Dialog ───────────────────────────────────────────────────

function CreateLocationDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createOrg = useMutation(api.organizations.createOrg);
  const switchOrg = useMutation(api.organizations.switchOrg);
  const navigate = useNavigate();

  const form = useForm<CreateLocationValues>({
    resolver: zodResolver(createLocationSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      laborRate: 95,
      taxRate: 8.25,
      bayCount: 2,
    },
  });

  const onSubmit = async (values: CreateLocationValues) => {
    try {
      const orgId = await createOrg({
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        city: values.city || undefined,
        state: values.state || undefined,
        zip: values.zip || undefined,
        laborRate: values.laborRate,
        taxRate: values.taxRate,
        bayCount: values.bayCount,
      });
      await switchOrg({ orgId });
      toast.success(`"${values.name}" created and activated`);
      form.reset();
      onClose();
      navigate("/dashboard");
    } catch {
      toast.error("Failed to create location");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            <Plus size={18} className="text-primary" />
            New Location
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Basic Info */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Downtown Shop, North Location…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input placeholder="(555) 000-0000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input placeholder="shop@example.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl><Input placeholder="123 Main St" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl><Input placeholder="Austin" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl><Input placeholder="TX" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="zip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP</FormLabel>
                    <FormControl><Input placeholder="78701" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Rates */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="laborRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Labor Rate ($/hr)</FormLabel>
                    <FormControl><Input type="number" min={0} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="taxRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Rate (%)</FormLabel>
                    <FormControl><Input type="number" min={0} max={100} step={0.01} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bayCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Bays</FormLabel>
                    <FormControl><Input type="number" min={0} max={50} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} className="cursor-pointer">
                {form.formState.isSubmitting ? "Creating…" : "Create Location"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Location Card ────────────────────────────────────────────────────────────

function LocationCard({
  org,
  isCurrent,
  onSwitch,
  switching,
}: {
  org: { _id: Id<"organizations">; name: string; role: string };
  isCurrent: boolean;
  onSwitch: (id: Id<"organizations">) => void;
  switching: boolean;
}) {
  const navigate = useNavigate();
  const fullOrg = useQuery(api.organizations.getCurrentOrg, isCurrent ? {} : "skip");

  return (
    <Card className={cn(
      "transition-all",
      isCurrent && "border-primary/50 ring-1 ring-primary/20"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0",
              isCurrent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {org.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <CardTitle className="text-base" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                {org.name}
              </CardTitle>
              <CardDescription className="text-xs capitalize mt-0.5">
                {org.role.replace("_", " ")}
              </CardDescription>
            </div>
          </div>
          {isCurrent && (
            <Badge variant="outline" className="text-xs text-primary border-primary/40 bg-primary/10 shrink-0">
              <Check size={10} className="mr-1" /> Active
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Address + contact (only loaded when active) */}
        {isCurrent && fullOrg && (
          <div className="space-y-1.5 text-sm text-muted-foreground">
            {(fullOrg.address || fullOrg.city) && (
              <div className="flex items-center gap-2">
                <MapPin size={13} className="shrink-0" />
                <span className="truncate">
                  {[fullOrg.address, fullOrg.city, fullOrg.state].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
            {fullOrg.phone && (
              <div className="flex items-center gap-2">
                <Phone size={13} className="shrink-0" />
                <span>{fullOrg.phone}</span>
              </div>
            )}
            {fullOrg.email && (
              <div className="flex items-center gap-2">
                <Mail size={13} className="shrink-0" />
                <span className="truncate">{fullOrg.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Wrench size={13} className="shrink-0" />
              <span>{fullOrg.bayCount} bay{fullOrg.bayCount !== 1 ? "s" : ""} · ${fullOrg.laborRate}/hr · {fullOrg.taxRate}% tax</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {!isCurrent && (
            <Button
              size="sm"
              className="cursor-pointer flex-1"
              onClick={() => onSwitch(org._id)}
              disabled={switching}
            >
              {switching ? "Switching…" : "Switch to This Location"}
            </Button>
          )}
          {isCurrent && (
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer flex-1"
              onClick={() => navigate("/settings")}
            >
              <Settings size={13} className="mr-1.5" />
              Edit Settings
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LocationsInner() {
  const myOrgs = useQuery(api.organizations.getMyOrgs, {});
  const currentOrg = useQuery(api.organizations.getCurrentOrg, {});
  const switchOrg = useMutation(api.organizations.switchOrg);
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [switching, setSwitching] = useState<Id<"organizations"> | null>(null);

  const handleSwitch = async (orgId: Id<"organizations">) => {
    setSwitching(orgId);
    try {
      await switchOrg({ orgId });
      toast.success("Location switched");
      navigate("/dashboard");
    } catch {
      toast.error("Failed to switch location");
    } finally {
      setSwitching(null);
    }
  };

  if (myOrgs === undefined || currentOrg === undefined) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
            <Building2 size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>{myOrgs.length}</p>
            <p className="text-xs text-muted-foreground">Total Location{myOrgs.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {/* Location cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {myOrgs.map((org) => (
          <LocationCard
            key={org._id}
            org={org}
            isCurrent={org._id === currentOrg?._id}
            onSwitch={handleSwitch}
            switching={switching === org._id}
          />
        ))}

        {/* Add location card */}
        <button
          className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer min-h-[140px]"
          onClick={() => setCreateOpen(true)}
        >
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Plus size={20} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold">Add Location</p>
            <p className="text-xs mt-0.5">Create a new shop location</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground/50" />
        </button>
      </div>

      {/* Info callout */}
      <div className="bg-muted/30 border border-border rounded-xl p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">How locations work</p>
        <ul className="space-y-1 list-disc list-inside text-xs">
          <li>Each location has its own customers, repair orders, invoices, and employees</li>
          <li>Switch between locations using the dropdown in the sidebar</li>
          <li>Staff members can be invited to one or multiple locations</li>
          <li>Settings (tax rate, labor rate, bays) are configured per location</li>
        </ul>
      </div>

      <CreateLocationDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function LocationsPage() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Building2 size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
              Locations
            </h1>
            <p className="text-sm text-muted-foreground">Manage your shop locations</p>
          </div>
        </div>
      </div>

      <Authenticated>
        <LocationsInner />
      </Authenticated>
      <Unauthenticated>
        <div className="text-center py-16">
          <SignInButton />
        </div>
      </Unauthenticated>
    </div>
  );
}
