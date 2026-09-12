import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Activity, AlertTriangle, Cable, CheckCircle2, Cpu, Gauge, Link2, Sparkles, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { fullScan, type ObdAdapter } from "@/lib/obd/adapter.ts";
import { SimulatorObdAdapter } from "@/lib/obd/simulator.ts";
import { Elm327ObdAdapter, J2534ObdAdapter } from "@/lib/obd/elm327.ts";
import type { AdapterKind, LivePidSample, ReadinessState, SessionMode, StoredDtc } from "@/lib/diagnosticSession.ts";
import type { FreezeFrame } from "@/lib/obd/adapter.ts";

type ScanState = {
  vin?: string;
  dtcs: StoredDtc[];
  freezeFrame?: FreezeFrame;
  livePidSamples: LivePidSample[];
  readiness: Record<string, ReadinessState>;
};

function makeAdapter(kind: AdapterKind, vin?: string): ObdAdapter {
  if (kind === "simulator") return new SimulatorObdAdapter(vin);
  if (kind === "j2534") return new J2534ObdAdapter();
  return new Elm327ObdAdapter(kind === "stn" ? "stn" : "elm327");
}

export default function ObdPage() {
  const vehicles = useQuery(api.vehicles.listOrgVehicles, {});
  const saveSession = useMutation(api.diagnosticSessions.saveSession);
  const createEstimate = useMutation(api.diagnosticSessions.createEstimateFromSession);
  const confirmClear = useMutation(api.diagnosticSessions.confirmClearCodes);

  const [vehicleId, setVehicleId] = useState<string>("");
  const [adapterKind, setAdapterKind] = useState<AdapterKind>("simulator");
  const [adapter, setAdapter] = useState<ObdAdapter>(() => new SimulatorObdAdapter());
  const [, setStatusTick] = useState(0);
  const [scan, setScan] = useState<ScanState | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<Id<"diagnosticSessions"> | null>(null);
  const [notes, setNotes] = useState("");
  const [clearOpen, setClearOpen] = useState(false);

  const sessions = useQuery(
    api.diagnosticSessions.listSessions,
    vehicleId ? { vehicleId: vehicleId as Id<"vehicles"> } : {},
  );

  const selected = vehicles?.find((v) => v._id === vehicleId);
  const mode: SessionMode = adapterKind === "simulator" ? "simulator" : "hardware";
  const isSimulator = adapterKind === "simulator";

  const statusTone = useMemo(() => {
    if (adapter.status === "connected") return isSimulator ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : "bg-green-500/15 text-green-400 border-green-500/40";
    if (adapter.status === "error") return "bg-red-500/15 text-red-400 border-red-500/30";
    return "bg-muted text-muted-foreground border-border";
  }, [adapter.status, isSimulator]);

  const swapAdapter = (kind: AdapterKind) => {
    setAdapterKind(kind);
    try { adapter.disconnect(); } catch { /* best-effort */ }
    const next = makeAdapter(kind, selected?.vin);
    setAdapter(next);
    setStatusTick((n) => n + 1);
    setScan(null);
    setSessionId(null);
  };

  const handleConnectScan = async () => {
    if (!vehicleId) {
      toast.error("Select a vehicle first");
      return;
    }
    setBusy(true);
    try {
      const next = makeAdapter(adapterKind, selected?.vin);
      setAdapter(next);
      const result = await fullScan(next);
      setScan(result);
      setStatusTick((n) => n + 1);
      toast.success(isSimulator ? "Simulator scan complete" : "Hardware scan complete");
    } catch (err) {
      setStatusTick((n) => n + 1);
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!scan || !vehicleId) return;
    setBusy(true);
    try {
      const id = await saveSession({
        vehicleId: vehicleId as Id<"vehicles">,
        customerId: selected?.customerId,
        mode,
        adapterType: adapterKind,
        adapterStatus: adapter.statusDetail,
        vin: scan.vin,
        dtcs: scan.dtcs,
        freezeFrame: scan.freezeFrame,
        livePidSamples: scan.livePidSamples,
        readiness: scan.readiness,
        notes: notes || undefined,
      });
      setSessionId(id);
      toast.success("Scan saved to this vehicle on AWS");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save session");
    } finally {
      setBusy(false);
    }
  };

  const handleEstimate = async () => {
    if (!sessionId) {
      toast.error("Save the scan first");
      return;
    }
    try {
      const roId = await createEstimate({ sessionId });
      toast.success("Estimate opened from DTCs");
      window.location.assign(`/jobs?ro=${roId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create estimate");
    }
  };

  const handleClear = async () => {
    setBusy(true);
    try {
      await adapter.clearCodes();
      setScan((s) => (s ? { ...s, dtcs: [], freezeFrame: undefined } : s));
      if (sessionId) await confirmClear({ sessionId });
      toast.success("Codes cleared");
      setClearOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  };

  if (vehicles === undefined) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Cpu className="text-primary" size={28} />
          <div>
            <h1 className="text-3xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>OBD Bay</h1>
            <p className="text-sm text-muted-foreground">
              Live scan tool at the bay. AI diagnostics stay on{" "}
              <Link to="/ai" className="text-primary underline">AI Tools</Link>
              {" "}for symptom/DTC interpretation.
            </p>
          </div>
        </div>
        <Badge className={`border ${statusTone}`}>{adapter.statusDetail || adapter.status}</Badge>
      </div>

      {isSimulator && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Simulator mode — this is not a live vehicle. Plug in an ELM327/STN USB adapter (Chrome/Edge) for hardware.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Vehicle</Label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
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
          <Label className="text-xs">Adapter</Label>
          <Select value={adapterKind} onValueChange={(v) => swapAdapter(v as AdapterKind)}>
            <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="simulator">Simulator (no hardware)</SelectItem>
              <SelectItem value="elm327">ELM327 (Web Serial)</SelectItem>
              <SelectItem value="stn">STN11xx (Web Serial)</SelectItem>
              <SelectItem value="j2534">J2534 (Windows native — not in browser)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button className="cursor-pointer w-full gap-2" onClick={() => void handleConnectScan()} disabled={busy}>
            <Cable size={16} /> {busy ? "Scanning…" : "Connect & scan"}
          </Button>
        </div>
      </div>

      {vehicles.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Gauge /></EmptyMedia>
            <EmptyTitle>No vehicles on file</EmptyTitle>
            <EmptyDescription>Add a customer vehicle first, then run a scan against it.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {scan && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity size={16} /> VIN & DTCs</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm">VIN: <span className="font-mono">{scan.vin ?? "—"}</span></div>
              {scan.dtcs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No codes stored.</p>
              ) : (
                scan.dtcs.map((d) => (
                  <div key={d.code + d.status} className="flex items-start justify-between gap-2 border border-border rounded-md p-2">
                    <div>
                      <div className="font-mono font-bold">{d.code}</div>
                      <div className="text-xs text-muted-foreground">{d.description ?? "See AI Tools for interpretation"}</div>
                    </div>
                    <Badge variant="outline">{d.status}</Badge>
                  </div>
                ))
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="cursor-pointer" onClick={() => void handleSave()} disabled={busy}>Save session</Button>
                <Button size="sm" variant="outline" className="cursor-pointer gap-1" onClick={() => void handleEstimate()} disabled={!sessionId}>
                  <Link2 size={14} /> Create estimate
                </Button>
                <Button size="sm" variant="destructive" className="cursor-pointer gap-1" onClick={() => setClearOpen(true)} disabled={scan.dtcs.length === 0}>
                  <Trash2 size={14} /> Clear codes
                </Button>
                <Button size="sm" variant="ghost" className="cursor-pointer gap-1" asChild>
                  <Link to="/ai"><Sparkles size={14} /> AI diagnose</Link>
                </Button>
              </div>
              <Textarea placeholder="Bay notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Freeze frame</CardTitle></CardHeader>
              <CardContent>
                {scan.freezeFrame ? (
                  <pre className="text-xs overflow-auto bg-muted/30 rounded-md p-3">{JSON.stringify(scan.freezeFrame, null, 2)}</pre>
                ) : (
                  <p className="text-sm text-muted-foreground">No freeze frame.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Live data</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {scan.livePidSamples.map((p) => (
                  <div key={p.pid} className="border border-border rounded-md p-2">
                    <div className="text-[10px] text-muted-foreground">{p.name}</div>
                    <div className="font-mono text-sm">{p.value} {p.unit}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 size={16} /> Readiness</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {Object.entries(scan.readiness).map(([k, v]) => (
                  <Badge key={k} variant={v === "ready" ? "default" : "outline"}>{k}: {v.replace("_", " ")}</Badge>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Saved scans</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(sessions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions stored yet. Run a scan and save it to AWS.</p>
          ) : (
            (sessions ?? []).map((s) => (
              <div key={s._id} className="flex justify-between border border-border rounded-md p-3 text-sm">
                <div>
                  <div className="font-medium">{new Date(s.scannedAt).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.mode === "simulator" ? "SIMULATOR" : s.adapterType.toUpperCase()} · {s.dtcs.map((d) => d.code).join(", ") || "no codes"}
                  </div>
                </div>
                {s.roId && <Badge variant="outline">RO linked</Badge>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle size={16} /> Clear stored codes?</AlertDialogTitle>
            <AlertDialogDescription>
              This erases DTCs on the adapter session. Confirm the customer authorized the repair order and you have captured freeze frame if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={() => void handleClear()}>Clear codes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
