import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Authenticated, Unauthenticated } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Users, Car, Package, Merge, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomerDupeGroup = {
  matchKey: string;
  matchType: string;
  records: Array<{ _id: string; name: string; phone?: string; email?: string; _creationTime: number }>;
};

type VehicleDupeGroup = {
  matchKey: string;
  matchType: string;
  records: Array<{
    _id: string; year: string; make: string; model: string;
    vin?: string; licensePlate?: string; customerName?: string; _creationTime: number;
  }>;
};

type PartDupeGroup = {
  matchKey: string;
  matchType: string;
  records: Array<{
    _id: string; name: string; partNumber?: string; sku?: string;
    stockQty: number; unitCost: number; unitPrice: number; _creationTime: number;
  }>;
};

// ─── Customer Duplicates Tab ──────────────────────────────────────────────────

function CustomerDuplicatesTab() {
  const duplicates = useQuery(api.duplicates.findDuplicateCustomers, {});
  const mergeCustomers = useMutation(api.duplicates.mergeCustomers);
  const [merging, setMerging] = useState(false);
  const [mergingAll, setMergingAll] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState<{
    keepId: Id<"customers">;
    mergeId: Id<"customers">;
    keepName: string;
    mergeName: string;
  } | null>(null);
  const [confirmMergeAll, setConfirmMergeAll] = useState(false);

  const handleMerge = async () => {
    if (!confirmMerge) return;
    setMerging(true);
    try {
      const result = await mergeCustomers({
        keepId: confirmMerge.keepId,
        mergeId: confirmMerge.mergeId,
      });
      toast.success(
        `Merged "${confirmMerge.mergeName}" into "${confirmMerge.keepName}". Reassigned ${result.reassigned.vehicles} vehicle(s), ${result.reassigned.ros} RO(s), ${result.reassigned.invoices} invoice(s).`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to merge");
    } finally {
      setMerging(false);
      setConfirmMerge(null);
    }
  };

  const handleMergeAll = async () => {
    if (!duplicates || duplicates.length === 0) return;
    setMergingAll(true);
    setConfirmMergeAll(false);
    let merged = 0;
    let failed = 0;
    for (const group of duplicates) {
      const keepId = group.records[0]._id as Id<"customers">;
      for (let i = 1; i < group.records.length; i++) {
        try {
          await mergeCustomers({ keepId, mergeId: group.records[i]._id as Id<"customers"> });
          merged++;
        } catch {
          failed++;
        }
      }
    }
    setMergingAll(false);
    if (failed === 0) {
      toast.success(`Successfully merged all duplicates (${merged} record${merged !== 1 ? "s" : ""} merged).`);
    } else {
      toast.warning(`Merged ${merged} record(s), but ${failed} failed. Some may have already been merged.`);
    }
  };

  if (duplicates === undefined) {
    return <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  if (duplicates.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
          <EmptyTitle>No duplicate customers found</EmptyTitle>
          <EmptyDescription>All customer records appear to be unique.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const totalDuplicateRecords = duplicates.reduce((sum, g) => sum + g.records.length - 1, 0);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Found {duplicates.length} group{duplicates.length !== 1 ? "s" : ""} of potential duplicate customers
        </p>
        <Button
          size="sm"
          className="h-8 text-xs cursor-pointer"
          disabled={mergingAll}
          onClick={() => setConfirmMergeAll(true)}
        >
          <Merge size={12} className="mr-1.5" />
          {mergingAll ? "Merging..." : `Merge All (${totalDuplicateRecords})`}
        </Button>
      </div>

      {duplicates.map((group: CustomerDupeGroup) => (
        <Card key={group.matchKey}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-yellow-400" />
              <CardTitle className="text-sm">
                Matched by {group.matchType === "name" ? "name" : group.matchType === "phone" ? "phone number" : "email"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {group.records.map((record, idx) => (
              <div
                key={record._id}
                className={cn(
                  "flex items-center justify-between rounded-lg border border-border px-3 py-2",
                  idx === 0 && "bg-primary/5 border-primary/30"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground text-sm truncate">{record.name}</p>
                    {idx === 0 && <Badge variant="secondary" className="text-[10px] px-1.5">Oldest</Badge>}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    {record.phone && <span>{record.phone}</span>}
                    {record.email && <span>{record.email}</span>}
                    <span>Created {new Date(record._creationTime).toLocaleDateString()}</span>
                  </div>
                </div>
                {idx > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs shrink-0 cursor-pointer"
                    onClick={() => setConfirmMerge({
                      keepId: group.records[0]._id as Id<"customers">,
                      mergeId: record._id as Id<"customers">,
                      keepName: group.records[0].name,
                      mergeName: record.name,
                    })}
                  >
                    <Merge size={12} className="mr-1" /> Merge into first
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <AlertDialog open={!!confirmMerge} onOpenChange={(o) => { if (!o) setConfirmMerge(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Customers</AlertDialogTitle>
            <AlertDialogDescription>
              This will merge <strong>{confirmMerge?.mergeName}</strong> into <strong>{confirmMerge?.keepName}</strong>.
              All vehicles, repair orders, and invoices will be reassigned. The duplicate record will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMerge} disabled={merging}>
              {merging ? "Merging..." : "Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmMergeAll} onOpenChange={setConfirmMergeAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge All Duplicate Customers</AlertDialogTitle>
            <AlertDialogDescription>
              This will merge <strong>{totalDuplicateRecords}</strong> duplicate record{totalDuplicateRecords !== 1 ? "s" : ""} across {duplicates.length} group{duplicates.length !== 1 ? "s" : ""}.
              For each group, the oldest record is kept and all others are merged into it. All linked vehicles, repair orders, and invoices will be reassigned. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMergeAll}>
              Merge All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Vehicle Duplicates Tab ───────────────────────────────────────────────────

function VehicleDuplicatesTab() {
  const duplicates = useQuery(api.duplicates.findDuplicateVehicles, {});
  const mergeVehicles = useMutation(api.duplicates.mergeVehicles);
  const [merging, setMerging] = useState(false);
  const [mergingAll, setMergingAll] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState<{
    keepId: Id<"vehicles">;
    mergeId: Id<"vehicles">;
    keepLabel: string;
    mergeLabel: string;
  } | null>(null);
  const [confirmMergeAll, setConfirmMergeAll] = useState(false);

  const handleMerge = async () => {
    if (!confirmMerge) return;
    setMerging(true);
    try {
      const result = await mergeVehicles({
        keepId: confirmMerge.keepId,
        mergeId: confirmMerge.mergeId,
      });
      toast.success(
        `Merged vehicle into "${confirmMerge.keepLabel}". Reassigned ${result.reassigned.ros} RO(s).`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to merge");
    } finally {
      setMerging(false);
      setConfirmMerge(null);
    }
  };

  const handleMergeAll = async () => {
    if (!duplicates || duplicates.length === 0) return;
    setMergingAll(true);
    setConfirmMergeAll(false);
    let merged = 0;
    let failed = 0;
    for (const group of duplicates) {
      const keepId = group.records[0]._id as Id<"vehicles">;
      for (let i = 1; i < group.records.length; i++) {
        try {
          await mergeVehicles({ keepId, mergeId: group.records[i]._id as Id<"vehicles"> });
          merged++;
        } catch {
          failed++;
        }
      }
    }
    setMergingAll(false);
    if (failed === 0) {
      toast.success(`Successfully merged all duplicates (${merged} record${merged !== 1 ? "s" : ""} merged).`);
    } else {
      toast.warning(`Merged ${merged} record(s), but ${failed} failed. Some may have already been merged.`);
    }
  };

  if (duplicates === undefined) {
    return <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  if (duplicates.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
          <EmptyTitle>No duplicate vehicles found</EmptyTitle>
          <EmptyDescription>All vehicle records appear to be unique.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const totalDuplicateRecords = duplicates.reduce((sum, g) => sum + g.records.length - 1, 0);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Found {duplicates.length} group{duplicates.length !== 1 ? "s" : ""} of potential duplicate vehicles
        </p>
        <Button
          size="sm"
          className="h-8 text-xs cursor-pointer"
          disabled={mergingAll}
          onClick={() => setConfirmMergeAll(true)}
        >
          <Merge size={12} className="mr-1.5" />
          {mergingAll ? "Merging..." : `Merge All (${totalDuplicateRecords})`}
        </Button>
      </div>

      {duplicates.map((group: VehicleDupeGroup) => (
        <Card key={group.matchKey}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-yellow-400" />
              <CardTitle className="text-sm">
                Matched by {group.matchType === "vin" ? "VIN" : "year/make/model"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {group.records.map((record, idx) => {
              const label = `${record.year} ${record.make} ${record.model}`;
              return (
                <div
                  key={record._id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-border px-3 py-2",
                    idx === 0 && "bg-primary/5 border-primary/30"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground text-sm truncate">{label}</p>
                      {idx === 0 && <Badge variant="secondary" className="text-[10px] px-1.5">Oldest</Badge>}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      {record.vin && <span>VIN: {record.vin}</span>}
                      {record.licensePlate && <span>Plate: {record.licensePlate}</span>}
                      {record.customerName && <span>Owner: {record.customerName}</span>}
                    </div>
                  </div>
                  {idx > 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs shrink-0 cursor-pointer"
                      onClick={() => setConfirmMerge({
                        keepId: group.records[0]._id as Id<"vehicles">,
                        mergeId: record._id as Id<"vehicles">,
                        keepLabel: `${group.records[0].year} ${group.records[0].make} ${group.records[0].model}`,
                        mergeLabel: label,
                      })}
                    >
                      <Merge size={12} className="mr-1" /> Merge into first
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <AlertDialog open={!!confirmMerge} onOpenChange={(o) => { if (!o) setConfirmMerge(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Vehicles</AlertDialogTitle>
            <AlertDialogDescription>
              This will merge <strong>{confirmMerge?.mergeLabel}</strong> into <strong>{confirmMerge?.keepLabel}</strong>.
              All repair orders will be reassigned. The duplicate vehicle record will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMerge} disabled={merging}>
              {merging ? "Merging..." : "Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmMergeAll} onOpenChange={setConfirmMergeAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge All Duplicate Vehicles</AlertDialogTitle>
            <AlertDialogDescription>
              This will merge <strong>{totalDuplicateRecords}</strong> duplicate record{totalDuplicateRecords !== 1 ? "s" : ""} across {duplicates.length} group{duplicates.length !== 1 ? "s" : ""}.
              For each group, the oldest record is kept and all others are merged into it. All linked repair orders will be reassigned. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMergeAll}>
              Merge All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Parts Duplicates Tab ─────────────────────────────────────────────────────

function PartDuplicatesTab() {
  const duplicates = useQuery(api.duplicates.findDuplicateParts, {});
  const mergeParts = useMutation(api.duplicates.mergeParts);
  const [merging, setMerging] = useState(false);
  const [mergingAll, setMergingAll] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState<{
    keepId: Id<"parts">;
    mergeId: Id<"parts">;
    keepName: string;
    mergeName: string;
  } | null>(null);
  const [confirmMergeAll, setConfirmMergeAll] = useState(false);

  const handleMerge = async () => {
    if (!confirmMerge) return;
    setMerging(true);
    try {
      const result = await mergeParts({
        keepId: confirmMerge.keepId,
        mergeId: confirmMerge.mergeId,
      });
      toast.success(
        `Merged "${confirmMerge.mergeName}" into "${confirmMerge.keepName}". Combined stock: ${result.combinedStock} units.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to merge");
    } finally {
      setMerging(false);
      setConfirmMerge(null);
    }
  };

  const handleMergeAll = async () => {
    if (!duplicates || duplicates.length === 0) return;
    setMergingAll(true);
    setConfirmMergeAll(false);
    let merged = 0;
    let failed = 0;
    for (const group of duplicates) {
      const keepId = group.records[0]._id as Id<"parts">;
      for (let i = 1; i < group.records.length; i++) {
        try {
          await mergeParts({ keepId, mergeId: group.records[i]._id as Id<"parts"> });
          merged++;
        } catch {
          failed++;
        }
      }
    }
    setMergingAll(false);
    if (failed === 0) {
      toast.success(`Successfully merged all duplicates (${merged} record${merged !== 1 ? "s" : ""} merged).`);
    } else {
      toast.warning(`Merged ${merged} record(s), but ${failed} failed. Some may have already been merged.`);
    }
  };

  if (duplicates === undefined) {
    return <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  if (duplicates.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
          <EmptyTitle>No duplicate parts found</EmptyTitle>
          <EmptyDescription>All parts records appear to be unique.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const totalDuplicateRecords = duplicates.reduce((sum, g) => sum + g.records.length - 1, 0);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Found {duplicates.length} group{duplicates.length !== 1 ? "s" : ""} of potential duplicate parts
        </p>
        <Button
          size="sm"
          className="h-8 text-xs cursor-pointer"
          disabled={mergingAll}
          onClick={() => setConfirmMergeAll(true)}
        >
          <Merge size={12} className="mr-1.5" />
          {mergingAll ? "Merging..." : `Merge All (${totalDuplicateRecords})`}
        </Button>
      </div>

      {duplicates.map((group: PartDupeGroup) => (
        <Card key={group.matchKey}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-yellow-400" />
              <CardTitle className="text-sm">
                Matched by {group.matchType === "partnum" ? "part number" : "name"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {group.records.map((record, idx) => (
              <div
                key={record._id}
                className={cn(
                  "flex items-center justify-between rounded-lg border border-border px-3 py-2",
                  idx === 0 && "bg-primary/5 border-primary/30"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground text-sm truncate">{record.name}</p>
                    {idx === 0 && <Badge variant="secondary" className="text-[10px] px-1.5">Oldest</Badge>}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    {record.partNumber && <span>PN: {record.partNumber}</span>}
                    {record.sku && <span>SKU: {record.sku}</span>}
                    <span>Stock: {record.stockQty}</span>
                    <span>Cost: ${record.unitCost.toFixed(2)}</span>
                    <span>Price: ${record.unitPrice.toFixed(2)}</span>
                  </div>
                </div>
                {idx > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs shrink-0 cursor-pointer"
                    onClick={() => setConfirmMerge({
                      keepId: group.records[0]._id as Id<"parts">,
                      mergeId: record._id as Id<"parts">,
                      keepName: group.records[0].name,
                      mergeName: record.name,
                    })}
                  >
                    <Merge size={12} className="mr-1" /> Merge into first
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <AlertDialog open={!!confirmMerge} onOpenChange={(o) => { if (!o) setConfirmMerge(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Parts</AlertDialogTitle>
            <AlertDialogDescription>
              This will merge <strong>{confirmMerge?.mergeName}</strong> into <strong>{confirmMerge?.keepName}</strong>.
              Stock quantities will be combined. The duplicate part record will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMerge} disabled={merging}>
              {merging ? "Merging..." : "Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmMergeAll} onOpenChange={setConfirmMergeAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge All Duplicate Parts</AlertDialogTitle>
            <AlertDialogDescription>
              This will merge <strong>{totalDuplicateRecords}</strong> duplicate record{totalDuplicateRecords !== 1 ? "s" : ""} across {duplicates.length} group{duplicates.length !== 1 ? "s" : ""}.
              For each group, the oldest record is kept and stock quantities are combined. All duplicate part records will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMergeAll}>
              Merge All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function DuplicatesInner() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
          <Merge size={22} className="text-primary" /> Duplicate Detection
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find and merge duplicate records to keep your data clean. The oldest record is kept by default.
        </p>
      </div>

      <Tabs defaultValue="customers" className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b border-border bg-transparent h-10 px-4">
          <TabsTrigger value="customers" className="flex-1 text-xs cursor-pointer">
            <Users size={14} className="mr-1.5" /> Customers
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="flex-1 text-xs cursor-pointer">
            <Car size={14} className="mr-1.5" /> Vehicles
          </TabsTrigger>
          <TabsTrigger value="parts" className="flex-1 text-xs cursor-pointer">
            <Package size={14} className="mr-1.5" /> Parts
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="customers" className="mt-0">
            <CustomerDuplicatesTab />
          </TabsContent>
          <TabsContent value="vehicles" className="mt-0">
            <VehicleDuplicatesTab />
          </TabsContent>
          <TabsContent value="parts" className="mt-0">
            <PartDuplicatesTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default function DuplicatesPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center"><SignInButton /></div>
      </Unauthenticated>
      <Authenticated>
        <DuplicatesInner />
      </Authenticated>
    </>
  );
}
