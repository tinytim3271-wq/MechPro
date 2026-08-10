import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Camera, X, AlertTriangle, Clock, CalendarDays, Plus, ImageIcon, Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";

type Urgency = "immediate" | "soon" | "future";

const URGENCY_OPTIONS: Array<{ value: Urgency; label: string; icon: React.ElementType; color: string }> = [
  { value: "immediate", label: "Needs Now", icon: AlertTriangle, color: "bg-red-500/20 text-red-400 border-red-500/40" },
  { value: "soon", label: "Soon", icon: Clock, color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
  { value: "future", label: "Next Visit", icon: CalendarDays, color: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
];

export default function RecommendationDialog({
  open,
  onClose,
  roId,
}: {
  open: boolean;
  onClose: () => void;
  roId: Id<"repairOrders">;
}) {
  const generateUploadUrl = useMutation(api.roPhotos.generateUploadUrl);
  const createRecommendation = useMutation(api.recommendations.createRecommendation);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("soon");
  const [photos, setPhotos] = useState<Array<{ storageId: Id<"_storage">; previewUrl: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newPhotos: Array<{ storageId: Id<"_storage">; previewUrl: string }> = [];
      for (const file of Array.from(files)) {
        const uploadUrl = await generateUploadUrl({
          kind: "recommendation_photo",
          contentType: file.type,
          size: file.size,
        });
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        const previewUrl = URL.createObjectURL(file);
        newPhotos.push({ storageId, previewUrl });
      }
      setPhotos((prev) => [...prev, ...newPhotos]);
    } catch {
      toast.error("Failed to upload photo. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Please add a title for your recommendation");
      return;
    }
    if (!description.trim()) {
      toast.error("Please describe what you found");
      return;
    }
    setSubmitting(true);
    try {
      await createRecommendation({
        roId,
        title: title.trim(),
        description: description.trim(),
        urgency,
        photoIds: photos.map((p) => p.storageId),
      });
      toast.success("Recommendation sent to the office!");
      // Reset form
      setTitle("");
      setDescription("");
      setUrgency("soon");
      setPhotos([]);
      onClose();
    } catch {
      toast.error("Failed to submit recommendation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb size={18} className="text-primary" />
            Recommend Additional Work
          </DialogTitle>
          <DialogDescription className="text-sm">
            Let the office know about something else this vehicle needs. Attach photos to show the issue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Title */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              What needs to be done?
            </Label>
            <Input
              placeholder="e.g. Replace front brake pads"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Details
            </Label>
            <Textarea
              placeholder="Describe what you found, measurements, wear level, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none text-base"
            />
          </div>

          {/* Urgency selector */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              How urgent?
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {URGENCY_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = urgency === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all cursor-pointer",
                      isActive
                        ? cn(opt.color, "border-current")
                        : "border-border bg-muted/20 text-muted-foreground hover:border-muted-foreground/40"
                    )}
                    onClick={() => setUrgency(opt.value)}
                  >
                    <Icon size={18} />
                    <span className="text-xs font-semibold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Photos
            </Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((photo, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                  <img
                    src={photo.previewUrl}
                    alt={`Attachment ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center cursor-pointer"
                    onClick={() => removePhoto(i)}
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}
              {/* Add photo button */}
              <button
                type="button"
                className={cn(
                  "w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 cursor-pointer",
                  "hover:border-primary/50 hover:bg-primary/5 transition-colors",
                  uploading && "pointer-events-none opacity-50"
                )}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Spinner className="w-5 h-5" />
                ) : (
                  <>
                    <Camera size={18} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium">Add</span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => handlePhotoUpload(e.target.files)}
            />
          </div>

          {/* Submit */}
          <Button
            size="lg"
            className="w-full cursor-pointer h-12 text-base font-bold"
            onClick={handleSubmit}
            disabled={submitting || uploading}
          >
            {submitting ? (
              <>
                <Spinner className="w-4 h-4 mr-2" /> Submitting...
              </>
            ) : (
              <>
                <Plus size={18} className="mr-2" /> Send Recommendation
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Recommendation list for viewing existing recommendations on a job ────────

export function RecommendationList({ roId }: { roId: Id<"repairOrders"> }) {
  const recommendations = useQuery(api.recommendations.listByRO, { roId });

  if (!recommendations || recommendations.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Lightbulb size={11} /> Recommendations ({recommendations.length})
      </p>
      <div className="space-y-2">
        {recommendations.map((rec) => (
          <div
            key={rec._id}
            className="bg-muted/20 rounded-xl p-3 border border-border space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm text-foreground">{rec.title}</span>
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    rec.urgency === "immediate" && "bg-red-500/20 text-red-400 border-red-500/30",
                    rec.urgency === "soon" && "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                    rec.urgency === "future" && "bg-blue-500/20 text-blue-400 border-blue-500/30"
                  )}
                >
                  {rec.urgency === "immediate" ? "Needs Now" : rec.urgency === "soon" ? "Soon" : "Next Visit"}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    rec.status === "pending" && "bg-muted text-muted-foreground border-border",
                    rec.status === "approved" && "bg-green-500/20 text-green-400 border-green-500/30",
                    rec.status === "declined" && "bg-red-500/20 text-red-400 border-red-500/30"
                  )}
                >
                  {rec.status}
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{rec.description}</p>
            {rec.photoUrls.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {rec.photoUrls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Photo ${i + 1}`}
                    className="w-14 h-14 rounded-lg object-cover border border-border"
                  />
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              — {rec.techName}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
