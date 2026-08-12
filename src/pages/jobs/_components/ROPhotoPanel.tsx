import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Camera, Upload, Trash2, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { Spinner } from "@/components/ui/spinner.tsx";

// ─── Photo type config ────────────────────────────────────────────────────────

type PhotoType = "intake" | "damage" | "during" | "complete";

const PHOTO_TYPE_CONFIG: Record<PhotoType, { label: string; color: string }> = {
  intake: { label: "Intake", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  damage: { label: "Damage", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  during: { label: "During Repair", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  complete: { label: "Complete", color: "bg-green-500/15 text-green-400 border-green-500/30" },
};

// ─── Upload dialog ────────────────────────────────────────────────────────────

function UploadDialog({
  open,
  onClose,
  roId,
}: {
  open: boolean;
  onClose: () => void;
  roId: Id<"repairOrders">;
}) {
  const generateUploadUrl = useMutation(api.roPhotos.generateUploadUrl);
  const savePhoto = useMutation(api.roPhotos.savePhoto);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [photoType, setPhotoType] = useState<PhotoType | "none">("none");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      });

      if (!result.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = (await result.json()) as { storageId: Id<"_storage"> };

      await savePhoto({
        roId,
        storageId,
        caption: caption || undefined,
        photoType: photoType === "none" ? undefined : photoType,
      });

      toast.success("Photo uploaded");
      resetForm();
      onClose();
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCaption("");
    setPhotoType("none");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera size={18} className="text-primary" />
            Add Photo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File selection buttons */}
          {!selectedFile && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                className="h-24 flex-col gap-2 cursor-pointer"
                variant="secondary"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera size={24} />
                <span className="text-xs">Take Photo</span>
              </Button>
              <Button
                className="h-24 flex-col gap-2 cursor-pointer"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={24} />
                <span className="text-xs">Upload</span>
              </Button>
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />

          {/* Preview */}
          {preview && (
            <div className="relative">
              <img
                src={preview}
                alt="Preview"
                className="w-full max-h-48 object-cover rounded-lg border border-border"
              />
              <Button
                size="icon"
                variant="secondary"
                className="absolute top-2 right-2 h-7 w-7 cursor-pointer"
                onClick={resetForm}
              >
                <X size={14} />
              </Button>
            </div>
          )}

          {/* Photo type selector */}
          {selectedFile && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Photo Type</label>
                <Select
                  value={photoType}
                  onValueChange={(v) => setPhotoType(v as PhotoType | "none")}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No type</SelectItem>
                    <SelectItem value="intake">Intake</SelectItem>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="during">During Repair</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Caption */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Caption (optional)</label>
                <Input
                  placeholder="Describe what's shown..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="h-9"
                />
              </div>

              {/* Upload button */}
              <Button
                className="w-full cursor-pointer"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <Spinner className="h-4 w-4" /> Uploading...
                  </span>
                ) : (
                  "Upload Photo"
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lightbox dialog ──────────────────────────────────────────────────────────

function LightboxDialog({
  url,
  caption,
  open,
  onClose,
}: {
  url: string;
  caption?: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl p-2">
        <img
          src={url}
          alt={caption || "Photo"}
          className="w-full max-h-[80vh] object-contain rounded-lg"
        />
        {caption && (
          <p className="text-sm text-muted-foreground text-center mt-2 px-2">{caption}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

type Props = {
  roId: Id<"repairOrders">;
};

export default function ROPhotoPanel({ roId }: Props) {
  const photos = useQuery(api.roPhotos.listPhotos, { roId });
  const deletePhoto = useMutation(api.roPhotos.deletePhoto);

  const [showUpload, setShowUpload] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxCaption, setLightboxCaption] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Id<"roPhotos"> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePhoto({ photoId: deleteTarget });
      toast.success("Photo deleted");
    } catch {
      toast.error("Failed to delete photo");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Loading state
  if (photos === undefined) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Camera size={14} className="text-primary" /> Photos
          </h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Camera size={14} className="text-primary" /> Photos
          {photos.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">({photos.length})</span>
          )}
        </h4>
        <Button
          size="sm"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => setShowUpload(true)}
        >
          <Camera size={13} className="mr-1" /> Add Photo
        </Button>
      </div>

      {/* Empty state */}
      {photos.length === 0 && (
        <button
          onClick={() => setShowUpload(true)}
          className="w-full border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <ImageIcon size={24} />
          <span className="text-xs">Tap to add photos for documentation</span>
        </button>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div
              key={photo._id}
              className="relative group rounded-lg overflow-hidden border border-border"
            >
              <button
                className="w-full cursor-pointer"
                onClick={() => {
                  setLightboxUrl(photo.url);
                  setLightboxCaption(photo.caption);
                }}
              >
                <img
                  src={photo.url}
                  alt={photo.caption || "RO Photo"}
                  className="w-full aspect-square object-cover"
                />
              </button>

              {/* Overlay info */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pointer-events-none">
                {photo.photoType && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] mb-1",
                      PHOTO_TYPE_CONFIG[photo.photoType].color
                    )}
                  >
                    {PHOTO_TYPE_CONFIG[photo.photoType].label}
                  </Badge>
                )}
                {photo.caption && (
                  <p className="text-[10px] text-white/90 truncate">{photo.caption}</p>
                )}
                <p className="text-[9px] text-white/60">
                  {new Date(photo.uploadedAt).toLocaleDateString()}
                </p>
              </div>

              {/* Delete button */}
              <Button
                size="icon"
                variant="secondary"
                className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(photo._id);
                }}
              >
                <Trash2 size={11} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <UploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        roId={roId}
      />

      {/* Lightbox */}
      {lightboxUrl && (
        <LightboxDialog
          url={lightboxUrl}
          caption={lightboxCaption}
          open={!!lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this photo from the repair order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
