import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { KeyRound, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { isRoAuthorizedForKeys, type KeyOperation, type KeyType } from "@/lib/keyProgramming.ts";
import { HardwareKeyProgrammer, SimulatorKeyProgrammer } from "@/lib/keys/simulator.ts";
import type { KeyProgrammer } from "@/lib/keys/adapter.ts";

export default function KeysPage() {
  const vehicles = useQuery(api.vehicles.listOrgVehicles, {});
  const createJob = useMutation(api.keyJobs.createJob);

  const [vehicleId, setVehicleId] = useState("");
  const [roId, setRoId] = useState("");
  const [keyType, setKeyType] = useState<KeyType>("transponder");
  const [operation, setOperation] = useState<KeyOperation>("identify");
  const [useSim, setUseSim] = useState(true);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const selected = vehicles?.find((v) => v._id === vehicleId);
  const ros = useQuery(
    api.repairOrders.listForVehicle,
    vehicleId ? { vehicleId: vehicleId as Id<"vehicles"> } : "skip",
  );
  const jobs = useQuery(
    api.keyJobs.listJobs,
    vehicleId ? { vehicleId: vehicleId as Id<"vehicles"> } : {},
  );

  const selectedRo = ros?.find((r) => r._id === roId);
  const authorized = isRoAuthorizedForKeys(selectedRo);

  const runJob = async () => {
    if (!selected || !selectedRo) {
      toast.error("Select a vehicle and authorized repair order");
      return;
    }
    setBusy(true);
    try {
      const programmer: KeyProgrammer = useSim ? new SimulatorKeyProgrammer() : new HardwareKeyProgrammer();
      await programmer.connect();
      const result = await programmer.run({
        operation,
        keyType,
        vin: selected.vin,
      });
      await createJob({
        customerId: selected.customerId,
        vehicleId: selected._id,
        roId: selectedRo._id,
        keyType,
        operation,
        mode: useSim ? "simulator" : "hardware",
        adapterStatus: programmer.statusDetail,
        resultNotes: notes || result.message,
      });
      setLastMessage(result.message);
      toast.success("Key job recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Key job blocked");
    } finally {
      setBusy(false);
    }
  };

  if (vehicles === undefined) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <KeyRound className="text-primary" size={28} />
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>Key programming</h1>
          <p className="text-sm text-muted-foreground">
            Licensed shop programming for a customer who owns and authorized the vehicle on the RO.
            Immobilizer bypass, stolen-vehicle cloning, and rolling-code attacks are not available.
          </p>
        </div>
      </div>

      {useSim && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Simulator mode — this is not a live programmer. Connect a shop-licensed USB programmer for hardware.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Vehicle & authorization</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Vehicle</Label>
              <Select value={vehicleId} onValueChange={(v) => { setVehicleId(v); setRoId(""); }}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v._id} value={v._id}>
                      {v.year} {v.make} {v.model} · {v.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Repair order (authorization source)</Label>
              <Select value={roId} onValueChange={setRoId} disabled={!vehicleId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select RO" /></SelectTrigger>
                <SelectContent>
                  {(ros ?? []).map((r) => (
                    <SelectItem key={r._id} value={r._id}>
                      {r.roNumber} · {r.status} {r.signedAt ? "· signed" : "· unsigned"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedRo && (
              <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                authorized ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-red-500/40 bg-red-500/10 text-red-300"
              }`}>
                {authorized ? <ShieldCheck size={16} className="mt-0.5" /> : <ShieldAlert size={16} className="mt-0.5" />}
                <div>
                  {authorized
                    ? `Authorized by ${selectedRo.authorizationName} on ${new Date(selectedRo.signedAt!).toLocaleString()}`
                    : "Customer must sign this RO (name + signature) before keys can be programmed."}
                </div>
              </div>
            )}
            {vehicles.length === 0 && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><KeyRound /></EmptyMedia>
                  <EmptyTitle>No vehicles yet</EmptyTitle>
                  <EmptyDescription>Create a customer, vehicle, and signed RO first.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Program</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Key type</Label>
                <Select value={keyType} onValueChange={(v) => setKeyType(v as KeyType)}>
                  <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transponder">Transponder</SelectItem>
                    <SelectItem value="proximity">Proximity</SelectItem>
                    <SelectItem value="smart_key">Smart key</SelectItem>
                    <SelectItem value="mechanical">Mechanical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Operation</Label>
                <Select value={operation} onValueChange={(v) => setOperation(v as KeyOperation)}>
                  <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="identify">Identify</SelectItem>
                    <SelectItem value="add_key">Add key</SelectItem>
                    <SelectItem value="program_key">Program key</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Adapter</Label>
              <Select value={useSim ? "simulator" : "hardware"} onValueChange={(v) => setUseSim(v === "simulator")}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simulator">Simulator (no programmer)</SelectItem>
                  <SelectItem value="hardware">Licensed USB programmer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea rows={2} placeholder="Bay notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button className="cursor-pointer w-full" disabled={busy || !authorized} onClick={() => void runJob()}>
              {busy ? "Working…" : authorized ? "Run authorized job" : "Authorization required"}
            </Button>
            {lastMessage && <p className="text-sm text-muted-foreground">{lastMessage}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Job history</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(jobs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No key jobs stored yet.</p>
          ) : (
            (jobs ?? []).map((j) => (
              <div key={j._id} className="flex justify-between border border-border rounded-md p-3 text-sm">
                <div>
                  <div className="font-medium">{j.operation.replace("_", " ")} · {j.keyType.replace("_", " ")}</div>
                  <div className="text-xs text-muted-foreground">
                    {j.mode === "simulator" ? "SIMULATOR" : "hardware"} · auth {j.authorizationName}
                    {j.resultNotes ? ` · ${j.resultNotes}` : ""}
                  </div>
                </div>
                <Badge variant="outline">{j.result}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
