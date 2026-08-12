import { useState, useCallback } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated } from "convex/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Calculator, Clock, Pencil, Check, X, Printer, Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { printElement } from "../_lib/print.ts";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type LineItem = {
  service: string;
  laborHours: number;
  laborCost: number;
  partsCost: number;
  total: number;
  notes: string;
  matchedPart?: { name: string; unitPrice: number; stockQty: number };
};

type EstimateResult = {
  lineItems: LineItem[];
  subtotal: number;
  summary: string;
};

// ─── Parts store lookup (matches AI-generated service names to local inventory) ─
function usePartsLookup() {
  const parts = useQuery(api.parts.listParts, {});
  return useCallback(
    (serviceName: string): Doc<"parts"> | undefined => {
      if (!parts) return undefined;
      const needle = serviceName.toLowerCase();
      return parts.find(
        (p) =>
          needle.includes(p.name.toLowerCase()) ||
          p.name.toLowerCase().split(" ").some((word) => word.length > 3 && needle.includes(word))
      );
    },
    [parts]
  );
}

// ─── Editable line item ───────────────────────────────────────────────────────

type LineItemRowProps = {
  item: LineItem;
  index: number;
  onUpdate: (index: number, updated: LineItem) => void;
  onDelete: (index: number) => void;
};

function LineItemRow({ item, index, onUpdate, onDelete }: LineItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LineItem>(item);

  const commit = () => {
    const laborCost = draft.laborHours * 120;
    const total = laborCost + draft.partsCost;
    onUpdate(index, { ...draft, laborCost, total });
    setEditing(false);
  };

  const cancel = () => {
    setDraft(item);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="border border-primary/40 rounded-lg p-3 space-y-3 bg-primary/5">
        <div className="space-y-1">
          <Label className="text-xs">Service Name</Label>
          <Input
            value={draft.service}
            onChange={(e) => setDraft((d) => ({ ...d, service: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Labor Hours</Label>
            <Input
              type="number"
              min="0"
              step="0.25"
              value={draft.laborHours}
              onChange={(e) => setDraft((d) => ({ ...d, laborHours: parseFloat(e.target.value) || 0 }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Parts Cost ($)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.partsCost}
              onChange={(e) => setDraft((d) => ({ ...d, partsCost: parseFloat(e.target.value) || 0 }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              className="h-8 text-sm"
              placeholder="Optional notes"
            />
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Labor cost auto-calculated at $120/hr &bull; New total: ${((draft.laborHours * 120) + draft.partsCost).toFixed(2)}
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="h-7 px-3" onClick={commit}>
            <Check size={13} className="mr-1" /> Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-3" onClick={cancel}>
            <X size={13} className="mr-1" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-3 group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-medium text-sm">{item.service}</span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-primary font-semibold text-sm">${item.total.toFixed(2)}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            onClick={() => { setDraft(item); setEditing(true); }}
          >
            <Pencil size={12} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive cursor-pointer"
            onClick={() => onDelete(index)}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <span><Clock size={11} className="inline mr-1" />{item.laborHours}h labor</span>
        <span>Labor: ${item.laborCost.toFixed(0)}</span>
        <span>Parts: ${item.partsCost.toFixed(0)}</span>
      </div>
      {item.matchedPart && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <Package size={11} className="shrink-0" />
          <span>
            Local stock match: <strong>{item.matchedPart.name}</strong> — ${item.matchedPart.unitPrice.toFixed(2)} ea
            {item.matchedPart.stockQty <= 2 && (
              <span className="text-yellow-500 ml-1">(low stock: {item.matchedPart.stockQty} left)</span>
            )}
          </span>
        </div>
      )}
      {item.notes && <p className="text-xs text-muted-foreground mt-1 italic">{item.notes}</p>}
    </div>
  );
}

// ─── Printable estimate body ──────────────────────────────────────────────────

function PrintableEstimate({ vehicle, services, result }: { vehicle: string; services: string; result: EstimateResult }) {
  return (
    <div id="estimate-print" style={{ display: "none" }}>
      <h1>Repair Estimate</h1>
      <p><strong>Vehicle:</strong> {vehicle}</p>
      <p><strong>Services:</strong> {services}</p>
      <p>{result.summary}</p>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Labor Hrs</th>
            <th>Labor Cost</th>
            <th>Parts Cost</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {result.lineItems.map((item, i) => (
            <tr key={i}>
              <td>
                {item.service}
                {item.matchedPart && (
                  <div className="parts-match">
                    Local stock: {item.matchedPart.name} @ ${item.matchedPart.unitPrice.toFixed(2)}/ea
                  </div>
                )}
                {item.notes && <div style={{ fontSize: "11px", color: "#666", fontStyle: "italic" }}>{item.notes}</div>}
              </td>
              <td>{item.laborHours}h</td>
              <td>${item.laborCost.toFixed(2)}</td>
              <td>${item.partsCost.toFixed(2)}</td>
              <td>${item.total.toFixed(2)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td colSpan={4}><strong>Subtotal</strong></td>
            <td><strong>${result.subtotal.toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: "11px", color: "#888", marginTop: "12px" }}>
        * Estimates are approximate. Final pricing may vary based on actual parts and labor.
      </p>
    </div>
  );
}

// ─── Main Estimator Tab ───────────────────────────────────────────────────────

export default function EstimatorTab() {
  const estimate = useAction(api.ai.estimate);
  const lookupPart = usePartsLookup();

  const [vehicle, setVehicle] = useState("");
  const [services, setServices] = useState("");
  const [region, setRegion] = useState("");
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!vehicle.trim() || !services.trim()) {
      toast.error("Please enter vehicle and services");
      return;
    }
    setLoading(true);
    try {
      const res = await estimate({ vehicle, services, region: region || undefined });
      // Enrich line items with local parts store matches
      const enriched: EstimateResult = {
        ...res,
        lineItems: res.lineItems.map((item) => {
          const match = lookupPart(item.service);
          return match
            ? { ...item, matchedPart: { name: match.name, unitPrice: match.unitPrice, stockQty: match.stockQty } }
            : item;
        }),
      };
      setResult(enriched);
    } catch {
      toast.error("Estimate failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateLine = (index: number, updated: LineItem) => {
    if (!result) return;
    const lineItems = result.lineItems.map((item, i) => (i === index ? updated : item));
    const subtotal = lineItems.reduce((s, item) => s + item.total, 0);
    setResult({ ...result, lineItems, subtotal });
  };

  const deleteLine = (index: number) => {
    if (!result) return;
    const lineItems = result.lineItems.filter((_, i) => i !== index);
    const subtotal = lineItems.reduce((s, item) => s + item.total, 0);
    setResult({ ...result, lineItems, subtotal });
  };

  const addLine = () => {
    if (!result) return;
    const newItem: LineItem = { service: "New Service", laborHours: 1, laborCost: 120, partsCost: 0, total: 120, notes: "" };
    setResult({ ...result, lineItems: [...result.lineItems, newItem] });
  };

  const partsMatchCount = result?.lineItems.filter((i) => i.matchedPart).length ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator size={18} className="text-primary" /> AI Estimator
          </CardTitle>
          <CardDescription>Get a detailed labor and parts cost estimate — edit any line item after generation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Input placeholder="e.g. 2020 Toyota Camry 2.5L" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Region (optional)</Label>
              <Input placeholder="e.g. Texas, California" value={region} onChange={(e) => setRegion(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Services Requested</Label>
            <Textarea
              placeholder="e.g. Replace front and rear brake pads and rotors, flush brake fluid"
              rows={3}
              value={services}
              onChange={(e) => setServices(e.target.value)}
            />
          </div>
          <Button onClick={handleRun} disabled={loading} className="w-full md:w-auto cursor-pointer">
            {loading ? <><Spinner className="mr-2" />Calculating...</> : <><Calculator size={16} className="mr-2" />Generate Estimate</>}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Hidden printable version */}
          <PrintableEstimate vehicle={vehicle} services={services} result={result} />

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-base">Estimate Breakdown</CardTitle>
                  <CardDescription className="mt-1">{result.summary}</CardDescription>
                  {partsMatchCount > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                      <Package size={12} />
                      <span>{partsMatchCount} line item{partsMatchCount > 1 ? "s" : ""} matched to your local parts inventory</span>
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="cursor-pointer shrink-0"
                  onClick={() => printElement("estimate-print", `Estimate — ${vehicle}`)}
                >
                  <Printer size={14} className="mr-1.5" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {result.lineItems.map((item, i) => (
                  <LineItemRow key={i} item={item} index={i} onUpdate={updateLine} onDelete={deleteLine} />
                ))}

                <Button size="sm" variant="ghost" className="w-full border border-dashed border-border cursor-pointer" onClick={addLine}>
                  <Plus size={14} className="mr-1.5" /> Add Line Item
                </Button>

                <Separator />
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Subtotal</span>
                  <span className="font-bold text-primary text-lg">${result.subtotal.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  * Hover any line item to edit or delete it. Labor rate: $120/hr.
                  Parts costs can be updated to match your local inventory pricing.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// Re-export the Authenticated wrapper version for use in the main page
export function EstimatorTabWithAuth() {
  return (
    <Authenticated>
      <EstimatorTab />
    </Authenticated>
  );
}
