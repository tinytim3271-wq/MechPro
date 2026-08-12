import { useState, useEffect, useRef, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  Camera, CameraOff, SwitchCamera, Search, CheckCircle2,
  AlertTriangle, Loader2, QrCode, Keyboard, X, Info, ShieldCheck, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useCamera } from "@/hooks/use-camera.ts";
import { toast } from "sonner";
import VehicleHistoryPanel from "@/components/VehicleHistoryPanel.tsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VehicleInfo = {
  vin?: string;
  year: string;
  make: string;
  model: string;
  trim?: string;
  engine?: string;
  transmission?: string;
  bodyStyle?: string;
  driveType?: string;
  fuelType?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (info: VehicleInfo) => void;
};

// ─── US States for plate lookup ───────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

// ─── BarcodeDetector wrapper ──────────────────────────────────────────────────

type BarcodeFormat = "code_128" | "code_39" | "ean_13" | "qr_code" | "data_matrix" | "pdf417";

interface BarcodeDetectorAPI {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string; format: string }>>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats: BarcodeFormat[] }): BarcodeDetectorAPI;
  getSupportedFormats(): Promise<string[]>;
}

// VIN barcodes on vehicle windows are Code 39 or Code 128 1D barcodes
const BARCODE_FORMATS: BarcodeFormat[] = ["code_128", "code_39", "pdf417", "data_matrix"];

// ─── VIN field detail display ─────────────────────────────────────────────────

function VehicleDetailGrid({ info }: { info: VehicleInfo }) {
  const fields = [
    { label: "Year", value: info.year },
    { label: "Make", value: info.make },
    { label: "Model", value: info.model },
    { label: "Trim", value: info.trim },
    { label: "Engine", value: info.engine },
    { label: "Transmission", value: info.transmission },
    { label: "Body Style", value: info.bodyStyle },
    { label: "Drive Type", value: info.driveType },
    { label: "Fuel Type", value: info.fuelType },
  ].filter((f) => f.value);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {fields.map((f) => (
        <div key={f.label} className="bg-muted/30 rounded-md px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{f.label}</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{f.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Camera Scanner Panel ─────────────────────────────────────────────────────

function CameraScanner({ onDetected }: { onDetected: (vin: string) => void }) {
  const { videoRef, stream, isLoading, error, isDenied, start, stop, switchCamera } = useCamera({
    facingMode: "environment",
    width: 1280,
    height: 720,
  });

  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "found">("idle");
  const detectorRef = useRef<BarcodeDetectorAPI | null>(null);
  const [barcodeSupported, setBarcodeSupported] = useState<boolean | null>(null);

  // Check BarcodeDetector support
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    if ("BarcodeDetector" in win) {
      const BarcodeDetectorClass = win["BarcodeDetector"] as BarcodeDetectorConstructor;
      BarcodeDetectorClass.getSupportedFormats().then((formats: string[]) => {
        const hasAny = BARCODE_FORMATS.some((f) => formats.includes(f));
        setBarcodeSupported(hasAny);
        if (hasAny) {
          detectorRef.current = new BarcodeDetectorClass({ formats: BARCODE_FORMATS });
        }
      }).catch(() => setBarcodeSupported(false));
    } else {
      setBarcodeSupported(false);
    }
  }, []);

  // Start scanning when stream is active
  useEffect(() => {
    if (!stream || !detectorRef.current || !videoRef.current) return;
    setScanStatus("scanning");

    const detector = detectorRef.current;
    const video = videoRef.current;

    scanIntervalRef.current = setInterval(async () => {
      if (!video || video.readyState < 2) return;
      try {
        const barcodes = await detector.detect(video);
        for (const barcode of barcodes) {
          const raw = barcode.rawValue.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
          // VINs are 17 chars (post-1981), Code 39 can have spaces/dashes stripped
          if (raw.length >= 11 && /^[A-Z0-9]+$/.test(raw)) {
            setScanStatus("found");
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            stop();
            onDetected(raw.slice(0, 17));
            return;
          }
        }
      } catch {
        // BarcodeDetector can fail on individual frames — ignore
      }
    }, 300);

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [stream, onDetected, stop, videoRef]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stop();
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (barcodeSupported === false) {
    return (
      <div className="rounded-xl bg-muted/30 border border-border p-5 text-center space-y-2">
        <QrCode size={28} className="mx-auto text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Barcode scanning not supported</p>
        <p className="text-xs text-muted-foreground">
          Your browser doesn't support the Barcode Detection API. Use Chrome on Android or desktop,
          or enter the VIN manually below.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Viewfinder */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-border">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {/* Aim overlay */}
        {stream && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-3/4 h-14 border-2 border-primary/80 rounded-md relative">
              {/* corner accents */}
              {["top-left", "top-right", "bottom-left", "bottom-right"].map((pos) => (
                <div
                  key={pos}
                  className={cn(
                    "absolute w-4 h-4 border-primary border-2",
                    pos === "top-left" && "top-0 left-0 border-r-0 border-b-0 rounded-tl",
                    pos === "top-right" && "top-0 right-0 border-l-0 border-b-0 rounded-tr",
                    pos === "bottom-left" && "bottom-0 left-0 border-r-0 border-t-0 rounded-bl",
                    pos === "bottom-right" && "bottom-0 right-0 border-l-0 border-t-0 rounded-br",
                  )}
                />
              ))}
              {scanStatus === "scanning" && (
                <div className="absolute left-0 right-0 h-0.5 bg-primary/60 animate-[scan_2s_ease-in-out_infinite] top-1/2" />
              )}
            </div>
            <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/80">
              Align VIN barcode within the frame
            </p>
          </div>
        )}
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        )}
        {/* Found flash */}
        {scanStatus === "found" && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
            <CheckCircle2 size={48} className="text-green-400" />
          </div>
        )}
      </div>

      {/* Error / denied */}
      {isDenied && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs">
          <AlertTriangle size={13} className="text-destructive shrink-0 mt-0.5" />
          <span className="text-foreground">Camera permission denied. Please enable camera access in your browser settings, then reload.</span>
        </div>
      )}
      {error && !isDenied && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {!stream ? (
          <Button onClick={start} disabled={isLoading} className="flex-1 cursor-pointer">
            <Camera size={15} className="mr-2" />
            {isLoading ? "Starting camera…" : "Start Camera"}
          </Button>
        ) : (
          <>
            <Button onClick={stop} variant="secondary" className="flex-1 cursor-pointer">
              <CameraOff size={15} className="mr-2" /> Stop
            </Button>
            <Button onClick={switchCamera} variant="secondary" size="icon" className="cursor-pointer shrink-0">
              <SwitchCamera size={15} />
            </Button>
          </>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Camera access only works in the published app, not the builder preview.
      </p>
    </div>
  );
}

// ─── Main VIN Lookup Dialog ───────────────────────────────────────────────────

export default function VinLookupDialog({ open, onClose, onConfirm }: Props) {
  const decodeVin = useAction(api.vin.decodeVin);
  const decodePlate = useAction(api.vin.decodePlate);

  // Input mode
  const [inputMode, setInputMode] = useState<"scan" | "vin" | "plate">("vin");

  // Inputs
  const [vinInput, setVinInput] = useState("");
  const [plateInput, setPlateInput] = useState("");
  const [stateInput, setStateInput] = useState("CA");

  // Lookup state
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [result, setResult] = useState<VehicleInfo | null>(null);
  const [resultNote, setResultNote] = useState<string | null>(null);
  const [rawVin, setRawVin] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const resetResult = useCallback(() => {
    setResult(null);
    setLookupError(null);
    setResultNote(null);
    setShowHistory(false);
  }, []);

  // Called when barcode scanner finds a VIN string
  const handleScanned = useCallback((vin: string) => {
    setVinInput(vin);
    setInputMode("vin");
    toast.success(`Barcode detected: ${vin}`);
  }, []);

  const handleVinLookup = async () => {
    const vin = vinInput.trim().toUpperCase();
    if (vin.length < 11) {
      setLookupError("Enter at least 11 characters for a valid VIN.");
      return;
    }
    setLoading(true);
    setLookupError(null);
    setResult(null);
    setResultNote(null);
    try {
      const data = await decodeVin({ vin });
      if (!data.make && !data.model) {
        setLookupError("No vehicle found for that VIN. Check the number and try again.");
        return;
      }
      setRawVin(vin);
      setResult({
        vin,
        year: data.year,
        make: data.make,
        model: data.model,
        trim: data.trim || undefined,
        engine: data.engine || undefined,
        transmission: data.transmission || undefined,
        bodyStyle: data.bodyStyle || undefined,
        driveType: data.driveType || undefined,
        fuelType: data.fuelType || undefined,
      });
      if (data.errors) setResultNote(data.errors);
    } catch {
      setLookupError("VIN lookup failed. Please check the VIN and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlateLookup = async () => {
    const plate = plateInput.trim();
    if (!plate) { setLookupError("Enter a license plate number."); return; }
    setLoading(true);
    setLookupError(null);
    setResult(null);
    setResultNote(null);
    try {
      const data = await decodePlate({ plate, state: stateInput });
      setResultNote(data.note ?? null);
      if (data.make || data.model) {
        setRawVin(data.vin);
        setResult({
          vin: data.vin || undefined,
          year: data.year, make: data.make, model: data.model,
          trim: data.trim || undefined, engine: data.engine || undefined,
          transmission: data.transmission || undefined,
        });
      } else {
        setLookupError(data.note ?? "No vehicle found for that plate.");
      }
    } catch {
      setLookupError("Plate lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetResult();
    setVinInput("");
    setPlateInput("");
    onClose();
  };

  const handleConfirm = () => {
    if (!result) return;
    onConfirm(result);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2 text-xl"
            style={{ fontFamily: "Rajdhani, sans-serif" }}
          >
            <QrCode size={18} className="text-primary" />
            VIN / Plate Lookup
          </DialogTitle>
          <DialogDescription>
            Scan the VIN barcode, enter a VIN manually, or look up by license plate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-1.5 bg-muted/30 p-1 rounded-lg">
            {(["scan", "vin", "plate"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setInputMode(mode); resetResult(); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                  inputMode === mode
                    ? "bg-card border border-border text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "scan" && <Camera size={12} />}
                {mode === "vin" && <Keyboard size={12} />}
                {mode === "plate" && <Search size={12} />}
                {mode === "scan" && "Scan Barcode"}
                {mode === "vin" && "Enter VIN"}
                {mode === "plate" && "License Plate"}
              </button>
            ))}
          </div>

          {/* ── Scan mode ── */}
          {inputMode === "scan" && (
            <CameraScanner onDetected={handleScanned} />
          )}

          {/* ── VIN mode ── */}
          {inputMode === "vin" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>VIN Number</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. 1FTFW1ET0BFC01234"
                    value={vinInput}
                    onChange={(e) => { setVinInput(e.target.value.toUpperCase()); resetResult(); }}
                    maxLength={17}
                    className="font-mono tracking-wider uppercase"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleVinLookup()}
                  />
                  <Button
                    onClick={handleVinLookup}
                    disabled={loading || vinInput.trim().length < 11}
                    className="cursor-pointer shrink-0"
                  >
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    17-character VIN from dashboard, driver door jamb, or title
                  </p>
                  <span className={cn("text-[11px] tabular-nums", vinInput.length === 17 ? "text-green-400" : "text-muted-foreground")}>
                    {vinInput.length}/17
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Plate mode ── */}
          {inputMode === "plate" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>License Plate</Label>
                  <Input
                    placeholder="ABC-1234"
                    value={plateInput}
                    onChange={(e) => { setPlateInput(e.target.value.toUpperCase()); resetResult(); }}
                    className="uppercase tracking-wider"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handlePlateLookup()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Select value={stateInput} onValueChange={setStateInput}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={handlePlateLookup}
                disabled={loading || !plateInput.trim()}
                className="w-full cursor-pointer"
              >
                {loading ? <><Loader2 size={14} className="mr-2 animate-spin" /> Looking up…</> : <><Search size={14} className="mr-2" /> Look Up Plate</>}
              </Button>
              <div className="flex items-start gap-2 bg-muted/30 rounded-lg px-3 py-2.5 text-xs text-muted-foreground">
                <Info size={13} className="shrink-0 mt-0.5 text-primary" />
                <span>
                  Full plate-to-VIN lookup requires a state DMV connection.
                  If not resolved, enter the VIN manually for complete vehicle details.
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {lookupError && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
              <AlertTriangle size={14} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">{lookupError}</p>
            </div>
          )}

          {/* Note */}
          {resultNote && !lookupError && (
            <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2.5">
              <Info size={13} className="text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{resultNote}</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2.5">
                <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    {result.year} {result.make} {result.model}
                    {result.trim ? ` ${result.trim}` : ""}
                  </p>
                  {rawVin && (
                    <p className="text-[11px] font-mono text-muted-foreground mt-0.5">VIN: {rawVin}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-green-400 border-green-400/40 bg-green-400/10 text-[10px] shrink-0">
                  Verified
                </Badge>
              </div>

              <VehicleDetailGrid info={result} />

              {/* Vehicle Safety & History */}
              <Collapsible open={showHistory} onOpenChange={setShowHistory}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-primary" />
                      Vehicle Safety &amp; History
                    </span>
                    <ChevronDown
                      size={15}
                      className={cn("transition-transform", showHistory && "rotate-180")}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <VehicleHistoryPanel
                    vin={result.vin}
                    make={result.make}
                    model={result.model}
                    year={Number(result.year) || new Date().getFullYear()}
                  />
                </CollapsibleContent>
              </Collapsible>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => { setResult(null); setVinInput(""); setPlateInput(""); }}
                >
                  <X size={13} className="mr-1" /> Clear
                </Button>
                <Button
                  size="sm"
                  className="flex-1 cursor-pointer"
                  onClick={handleConfirm}
                >
                  <CheckCircle2 size={13} className="mr-1.5" />
                  Use This Vehicle
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
