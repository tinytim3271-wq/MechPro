import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { RotateCcw, Check, PenLine } from "lucide-react";

type Props = {
  /** Existing signature data URL (from DB) */
  existingSignature?: string;
  signedAt?: string;
  onSave: (dataUrl: string) => Promise<void>;
  onClear: () => Promise<void>;
};

export default function SignaturePad({ existingSignature, signedAt, onSave, onClear }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Set up canvas dimensions and DPI scaling
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    initCanvas();
    window.addEventListener("resize", initCanvas);
    return () => window.removeEventListener("resize", initCanvas);
  }, [initCanvas]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (existingSignature) return; // read-only when signed
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || !lastPos.current) return;

    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasStrokes(true);
  };

  const endDraw = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    setSaving(true);
    try {
      // Composite onto white bg so it looks good when saved/printed
      const offscreen = document.createElement("canvas");
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      const octx = offscreen.getContext("2d");
      if (octx) {
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, offscreen.width, offscreen.height);
        octx.drawImage(canvas, 0, 0);
      }
      const dataUrl = offscreen.toDataURL("image/png");
      await onSave(dataUrl);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      clearCanvas();
      await onClear();
    } finally {
      setClearing(false);
    }
  };

  // If already signed, just show the saved image
  if (existingSignature) {
    return (
      <div className="space-y-3">
        <div className="border border-green-500/40 rounded-xl bg-green-500/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Check size={14} className="text-green-400" />
              <span className="text-xs font-semibold text-green-400">Signed</span>
              {signedAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(signedAt).toLocaleString()}
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-destructive"
              onClick={handleClear}
              disabled={clearing}
            >
              <RotateCcw size={11} className="mr-1" />
              {clearing ? "Clearing…" : "Clear"}
            </Button>
          </div>
          <img
            src={existingSignature}
            alt="Customer signature"
            className="w-full h-28 object-contain rounded-lg bg-white"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <PenLine size={14} />
          <span>Draw signature below</span>
        </div>
        {hasStrokes && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={clearCanvas}>
            <RotateCcw size={11} className="mr-1" /> Redo
          </Button>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className={cn(
          "w-full h-32 rounded-xl border border-dashed border-border bg-card",
          "touch-none cursor-crosshair",
          isDrawing && "border-primary"
        )}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />

      <p className="text-[10px] text-muted-foreground text-center">
        By signing above, the customer authorizes the work described in this repair order.
      </p>

      <Button
        className="w-full"
        disabled={!hasStrokes || saving}
        onClick={handleSave}
      >
        <Check size={14} className="mr-2" />
        {saving ? "Saving…" : "Save Signature"}
      </Button>
    </div>
  );
}
