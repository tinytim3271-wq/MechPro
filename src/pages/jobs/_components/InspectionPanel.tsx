import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  CheckCircle2, AlertTriangle, XCircle, MinusCircle,
  Camera, Trash2, Plus, ClipboardCheck, ChevronDown, ChevronRight, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultType = "ok" | "needs_attention" | "critical" | "na";

type InspectionItem = {
  _id: Id<"inspectionItems">;
  category: string;
  itemName: string;
  result: ResultType;
  notes?: string;
  photoUrl?: string | null;
  photoStorageId?: Id<"_storage">;
};

type Inspection = {
  _id: Id<"inspections">;
  status: "in_progress" | "completed";
  templateName: string;
  completedAt?: string;
  notes?: string;
  items: InspectionItem[];
};

// ─── Result config ────────────────────────────────────────────────────────────

const RESULT_CONFIG: Record<ResultType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  ok: {
    label: "OK",
    icon: <CheckCircle2 size={14} />,
    color: "text-green-400",
    bg: "bg-green-500/15 border-green-500/30 text-green-400",
  },
  needs_attention: {
    label: "Needs Attention",
    icon: <AlertTriangle size={14} />,
    color: "text-yellow-400",
    bg: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400",
  },
  critical: {
    label: "Critical",
    icon: <XCircle size={14} />,
    color: "text-red-400",
    bg: "bg-red-500/15 border-red-500/30 text-red-400",
  },
  na: {
    label: "N/A",
    icon: <MinusCircle size={14} />,
    color: "text-muted-foreground",
    bg: "bg-muted/50 border-border text-muted-foreground",
  },
};

// ─── Result toggle buttons ────────────────────────────────────────────────────

function ResultToggle({ current, onSelect, disabled }: {
  current: ResultType;
  onSelect: (r: ResultType) => void;
  disabled?: boolean;
}) {
  const results: ResultType[] = ["ok", "needs_attention", "critical", "na"];
  return (
    <div className="flex gap-1 flex-wrap">
      {results.map((r) => {
        const cfg = RESULT_CONFIG[r];
        return (
          <button
            key={r}
            disabled={disabled}
            onClick={() => onSelect(r)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium cursor-pointer transition-all",
              current === r ? cfg.bg : "bg-transparent border-border text-muted-foreground hover:border-muted-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {cfg.icon}
            {r === "needs_attention" ? "Attn" : cfg.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Single inspection item row ───────────────────────────────────────────────

function ItemRow({ item, inspectionStatus }: { item: InspectionItem; inspectionStatus: "in_progress" | "completed" }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateItem = useMutation(api.inspections.updateItemResult);
  const attachPhoto = useMutation(api.inspections.attachPhotoToItem);
  const removePhoto = useMutation(api.inspections.removePhotoFromItem);
  const genUploadUrl = useMutation(api.inspections.generateUploadUrl);

  const isCompleted = inspectionStatus === "completed";

  const handleResult = async (r: ResultType) => {
    try {
      await updateItem({ itemId: item._id, result: r, notes: notes || undefined });
    } catch {
      toast.error("Failed to update item");
    }
  };

  const handleNotesBlur = async () => {
    if (notes === (item.notes ?? "")) return;
    try {
      await updateItem({ itemId: item._id, result: item.result, notes: notes || undefined });
    } catch {
      toast.error("Failed to save notes");
    }
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploadUrl = await genUploadUrl({});
      const res = await fetch(uploadUrl, { method: "POST", body: file, headers: { "Content-Type": file.type } });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json() as { storageId: Id<"_storage"> };
      await attachPhoto({ itemId: item._id, storageId });
      toast.success("Photo attached");
    } catch {
      toast.error("Photo upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    try {
      await removePhoto({ itemId: item._id });
      toast.success("Photo removed");
    } catch {
      toast.error("Failed to remove photo");
    }
  };

  const cfg = RESULT_CONFIG[item.result];

  return (
    <div className={cn(
      "border border-border rounded-lg overflow-hidden transition-colors",
      item.result === "critical" && "border-red-500/40",
      item.result === "needs_attention" && "border-yellow-500/40",
    )}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer select-none hover:bg-muted/30"
        onClick={() => !isCompleted && setExpanded(!expanded)}
      >
        <span className={cn("shrink-0", cfg.color)}>{cfg.icon}</span>
        <span className="flex-1 text-sm font-medium min-w-0 truncate">{item.itemName}</span>
        {item.photoUrl && (
          <span className="shrink-0">
            <Camera size={12} className="text-blue-400" />
          </span>
        )}
        {!isCompleted && (
          <ChevronRight size={14} className={cn("shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        )}
      </div>

      {expanded && !isCompleted && (
        <div className="px-3 pb-3 space-y-3 border-t border-border bg-muted/10">
          <div className="pt-3">
            <ResultToggle current={item.result} onSelect={handleResult} />
          </div>

          <Textarea
            placeholder="Notes (optional)…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            rows={2}
            className="text-xs resize-none"
          />

          {/* Photo */}
          {item.photoUrl ? (
            <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border group">
              <img src={item.photoUrl} alt="Inspection photo" className="w-full h-full object-cover" />
              <button
                onClick={handleRemovePhoto}
                className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhoto}
              />
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer text-xs gap-1"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Spinner /> : <Camera size={12} />}
                {uploading ? "Uploading…" : "Add Photo"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Completed view: show notes if any */}
      {isCompleted && (item.notes || item.photoUrl) && (
        <div className="px-3 pb-3 border-t border-border space-y-2 bg-muted/10">
          {item.notes && <p className="text-xs text-muted-foreground pt-2">{item.notes}</p>}
          {item.photoUrl && (
            <img src={item.photoUrl} alt="Inspection photo" className="w-20 h-20 rounded-md object-cover" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({ category, items, inspectionStatus }: {
  category: string;
  items: InspectionItem[];
  inspectionStatus: "in_progress" | "completed";
}) {
  const [open, setOpen] = useState(true);
  const criticalCount = items.filter((i) => i.result === "critical").length;
  const attnCount = items.filter((i) => i.result === "needs_attention").length;
  const okCount = items.filter((i) => i.result === "ok").length;

  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-1.5 text-left cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-semibold text-xs uppercase tracking-wider flex-1">{category}</span>
        <div className="flex gap-1">
          {criticalCount > 0 && <Badge className="text-[10px] px-1.5 bg-red-500/15 text-red-400 border-red-500/30">{criticalCount} critical</Badge>}
          {attnCount > 0 && <Badge className="text-[10px] px-1.5 bg-yellow-500/15 text-yellow-400 border-yellow-500/30">{attnCount} attn</Badge>}
          {okCount > 0 && <Badge className="text-[10px] px-1.5 bg-green-500/15 text-green-400 border-green-500/30">{okCount} ok</Badge>}
        </div>
      </button>
      {open && (
        <div className="space-y-1 ml-4">
          {items.map((item) => (
            <ItemRow key={item._id} item={item} inspectionStatus={inspectionStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add custom item dialog ───────────────────────────────────────────────────

function AddItemDialog({ inspectionId, open, onClose }: {
  inspectionId: Id<"inspections">;
  open: boolean;
  onClose: () => void;
}) {
  const [category, setCategory] = useState("");
  const [itemName, setItemName] = useState("");
  const [saving, setSaving] = useState(false);
  const addItem = useMutation(api.inspections.addCustomItem);

  const handleSave = async () => {
    if (!category.trim() || !itemName.trim()) {
      toast.error("Please fill in both fields");
      return;
    }
    setSaving(true);
    try {
      await addItem({ inspectionId, category: category.trim(), itemName: itemName.trim() });
      toast.success("Item added");
      setCategory("");
      setItemName("");
      onClose();
    } catch {
      toast.error("Failed to add item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</label>
            <Input
              placeholder="e.g. Brakes, Tires, Fluids"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Item Name</label>
            <Input
              placeholder="e.g. Rear brake caliper"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="mt-1"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? <Spinner /> : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ items }: { items: InspectionItem[] }) {
  const counts = {
    ok: items.filter((i) => i.result === "ok").length,
    needs_attention: items.filter((i) => i.result === "needs_attention").length,
    critical: items.filter((i) => i.result === "critical").length,
    na: items.filter((i) => i.result === "na").length,
  };
  const total = items.length;
  const assessed = total - counts.na;

  return (
    <div className="flex flex-wrap gap-2 items-center py-2">
      <span className="text-xs text-muted-foreground">{assessed}/{total} assessed</span>
      {counts.ok > 0 && (
        <span className="flex items-center gap-1 text-xs text-green-400">
          <CheckCircle2 size={12} /> {counts.ok} OK
        </span>
      )}
      {counts.needs_attention > 0 && (
        <span className="flex items-center gap-1 text-xs text-yellow-400">
          <AlertTriangle size={12} /> {counts.needs_attention} Needs Attn
        </span>
      )}
      {counts.critical > 0 && (
        <span className="flex items-center gap-1 text-xs text-red-400">
          <XCircle size={12} /> {counts.critical} Critical
        </span>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function InspectionPanel({ roId }: { roId: Id<"repairOrders"> }) {
  const inspection = useQuery(api.inspections.getInspectionByRO, { roId });
  const templates = useQuery(api.inspections.listTemplates, {});
  const createInspection = useMutation(api.inspections.createInspection);
  const completeInspection = useMutation(api.inspections.completeInspection);
  const deleteInspection = useMutation(api.inspections.deleteInspection);

  const [creating, setCreating] = useState(false);
  const [templateId, setTemplateId] = useState<string>("builtin");
  const [completing, setCompleting] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const templateInitialized = useRef(false);

  useEffect(() => {
    if (!templates || templateInitialized.current) return;
    templateInitialized.current = true;
    const defaultTemplate = templates.find((t) => t.isDefault);
    setTemplateId(defaultTemplate ? defaultTemplate._id : "builtin");
  }, [templates]);

  if (inspection === undefined) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createInspection({
        roId,
        templateId: templateId !== "builtin" ? templateId as Id<"inspectionTemplates"> : undefined,
      });
      toast.success("Inspection created");
    } catch {
      toast.error("Failed to create inspection");
    } finally {
      setCreating(false);
    }
  };

  const handleComplete = async () => {
    if (!inspection) return;
    setCompleting(true);
    try {
      await completeInspection({ inspectionId: inspection._id, notes: completionNotes || undefined });
      toast.success("Inspection marked complete");
      setShowCompleteDialog(false);
    } catch {
      toast.error("Failed to complete inspection");
    } finally {
      setCompleting(false);
    }
  };

  const handleDelete = async () => {
    if (!inspection) return;
    try {
      await deleteInspection({ inspectionId: inspection._id });
      toast.success("Inspection deleted");
    } catch {
      toast.error("Failed to delete inspection");
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  // ─── No inspection yet ───────────────────────────────────────────────────
  if (!inspection) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <ClipboardCheck size={24} className="text-primary" />
        </div>
        <h3 className="font-semibold mb-1">No Inspection Started</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-xs">
          Start a multi-point vehicle inspection for this RO. You can mark items OK, Needs Attention, or Critical, add notes, and attach photos.
        </p>
        {templates && templates.length > 1 && (
          <select
            className="mb-3 h-9 rounded-md border border-border bg-card px-3 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t._id ?? "builtin"} value={t._id ?? "builtin"}>
                {t.name}{t.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        )}
        <Button onClick={handleCreate} disabled={creating} className="cursor-pointer">
          {creating ? <Spinner /> : <><ClipboardCheck size={14} className="mr-1" /> Start Inspection</>}
        </Button>
      </div>
    );
  }

  // ─── Group items by category ─────────────────────────────────────────────
  const categoryMap = new Map<string, InspectionItem[]>();
  for (const item of inspection.items) {
    if (!categoryMap.has(item.category)) categoryMap.set(item.category, []);
    categoryMap.get(item.category)!.push(item);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={16} className="text-primary" />
          <span className="font-semibold text-sm">{inspection.templateName}</span>
          <Badge
            className={cn(
              "text-xs",
              inspection.status === "completed"
                ? "bg-green-500/15 text-green-400 border-green-500/30"
                : "bg-primary/15 text-primary border-primary/30"
            )}
          >
            {inspection.status === "completed" ? "Completed" : "In Progress"}
          </Badge>
        </div>
        <div className="flex gap-1">
          {inspection.status === "in_progress" && (
            <>
              <Button size="sm" variant="ghost" className="cursor-pointer text-xs" onClick={() => setShowAddItem(true)}>
                <Plus size={12} className="mr-1" /> Add Item
              </Button>
              <Button size="sm" className="cursor-pointer text-xs" onClick={() => setShowCompleteDialog(true)}>
                <CheckCircle2 size={12} className="mr-1" /> Complete
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="cursor-pointer text-destructive hover:text-destructive text-xs" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 size={12} />
          </Button>
        </div>
      </div>

      {/* Summary */}
      <SummaryBar items={inspection.items} />

      {/* Categories */}
      <div className="space-y-4">
        {Array.from(categoryMap.entries()).map(([cat, items]) => (
          <CategorySection key={cat} category={cat} items={items} inspectionStatus={inspection.status} />
        ))}
      </div>

      {/* Completion notes */}
      {inspection.status === "completed" && inspection.notes && (
        <div className="p-3 rounded-lg bg-muted/30 border border-border">
          <p className="text-xs font-medium text-muted-foreground mb-1">Technician Notes</p>
          <p className="text-sm">{inspection.notes}</p>
        </div>
      )}

      {inspection.status === "completed" && inspection.completedAt && (
        <p className="text-xs text-muted-foreground text-center">
          Completed {new Date(inspection.completedAt).toLocaleString()}
        </p>
      )}

      {/* Complete dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Inspection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <SummaryBar items={inspection.items} />
            <Textarea
              placeholder="Overall technician notes (optional)…"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCompleteDialog(false)}>Cancel</Button>
            <Button onClick={handleComplete} disabled={completing} className="cursor-pointer">
              {completing ? <Spinner /> : "Mark Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the inspection and all its data including photos. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add custom item dialog */}
      <AddItemDialog
        inspectionId={inspection._id}
        open={showAddItem}
        onClose={() => setShowAddItem(false)}
      />
    </div>
  );
}
