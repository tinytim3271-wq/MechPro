import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { cn } from "@/lib/utils.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Megaphone,
  Sparkles,
  Copy,
  Trash2,
  MoreVertical,
  PlusCircle,
  Facebook,
  Instagram,
  Globe,
  Share2,
  Calendar,
  CheckCircle2,
  FileEdit,
  ExternalLink,
  Lightbulb,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

type Post = Doc<"socialPosts">;
type Platform = "facebook" | "instagram" | "google" | "general";
type PostStatus = "draft" | "scheduled" | "published";
type Tone = "professional" | "friendly" | "urgent";

const PLATFORM_META: Record<Platform, { label: string; icon: React.ReactNode; color: string }> = {
  facebook: {
    label: "Facebook",
    icon: <Facebook size={14} />,
    color: "text-blue-400",
  },
  instagram: {
    label: "Instagram",
    icon: <Instagram size={14} />,
    color: "text-pink-400",
  },
  google: {
    label: "Google",
    icon: <Globe size={14} />,
    color: "text-green-400",
  },
  general: {
    label: "General",
    icon: <Share2 size={14} />,
    color: "text-muted-foreground",
  },
};

const PLATFORM_URLS: Record<Platform, { label: string; url: string | null }> = {
  facebook: { label: "Copy & Open Facebook", url: "https://www.facebook.com" },
  instagram: { label: "Copy & Open Instagram", url: "https://www.instagram.com" },
  google: { label: "Copy & Open Google Business", url: "https://business.google.com" },
  general: { label: "Copy Text", url: null },
};

const PLATFORM_CHAR_LIMITS: Record<Platform, { limit: number; label: string }> = {
  facebook: { limit: 63206, label: "63,206 max" },
  instagram: { limit: 2200, label: "2,200 max" },
  google: { limit: 1500, label: "1,500 max" },
  general: { limit: 0, label: "" }, // no limit for general
};

const PLATFORM_TIPS: Record<Platform, string[]> = {
  facebook: [
    "Posts with images get 2.3x more engagement",
    "Keep the first line attention-grabbing — it shows before 'See more'",
    "Add a call-to-action (Book Now, Call Us, Visit Our Site)",
  ],
  instagram: [
    "Put key info in the first 125 characters (before the fold)",
    "Use 3–5 relevant hashtags at the end",
    "Pair with a high-quality photo or Reel for best reach",
  ],
  google: [
    "Include your location and services for local search",
    "Keep it under 1,500 characters or it gets cut off",
    "Add a button type: Book, Order, Learn More, Sign Up",
  ],
  general: [
    "Customize for the platform before posting",
    "Shorter posts (under 280 characters) also work for X/Twitter",
  ],
};

function copyAndOpen(content: string, platform: Platform) {
  void navigator.clipboard.writeText(content);
  const meta = PLATFORM_URLS[platform];
  if (meta.url) {
    toast.success(`Copied! Opening ${PLATFORM_META[platform].label}...`);
    window.open(meta.url, "_blank", "noopener,noreferrer");
  } else {
    toast.success("Copied to clipboard");
  }
}

const STATUS_META: Record<PostStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  scheduled: { label: "Ready to Post", variant: "outline" },
  published: { label: "Posted", variant: "default" },
};

const TEMPLATES = [
  { value: "promotion", label: "Special Promotion" },
  { value: "seasonal", label: "Seasonal Deal" },
  { value: "review_request", label: "Review Request" },
  { value: "service_spotlight", label: "Service Spotlight" },
  { value: "tips", label: "Car Care Tips" },
  { value: "before_after", label: "Before & After" },
];

function CharacterCount({ content, platform }: { content: string; platform: Platform }) {
  const charInfo = PLATFORM_CHAR_LIMITS[platform];
  if (!charInfo.limit) return null;

  const count = content.length;
  const isOver = count > charInfo.limit;
  const percentage = Math.min((count / charInfo.limit) * 100, 100);

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-24">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isOver ? "bg-destructive" : percentage > 80 ? "bg-yellow-500" : "bg-primary"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={cn("tabular-nums", isOver ? "text-destructive font-medium" : "text-muted-foreground")}>
        {count.toLocaleString()} / {charInfo.label}
      </span>
    </div>
  );
}

function PostCard({
  post,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  post: Post;
  onEdit: (post: Post) => void;
  onDelete: (id: Post["_id"]) => void;
  onStatusChange: (id: Post["_id"], status: PostStatus) => void;
}) {
  const platformInfo = PLATFORM_META[post.platform];
  const statusInfo = STATUS_META[post.status];
  const [copied, setCopied] = useState(false);
  const [showTips, setShowTips] = useState(false);

  const copyContent = () => {
    void navigator.clipboard.writeText(post.content);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const tips = PLATFORM_TIPS[post.platform];

  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`flex items-center gap-1 text-xs font-medium ${platformInfo.color}`}>
              {platformInfo.icon}
              {platformInfo.label}
            </span>
            <Badge variant={statusInfo.variant} className="text-xs">
              {statusInfo.label}
            </Badge>
            {post.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs capitalize">
                {tag.replace(/-/g, " ")}
              </Badge>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 cursor-pointer">
                <MoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(post)} className="cursor-pointer">
                <FileEdit size={14} className="mr-2" /> Edit
              </DropdownMenuItem>
              {post.status === "draft" && (
                <DropdownMenuItem
                  onClick={() => onStatusChange(post._id, "published")}
                  className="cursor-pointer"
                >
                  <CheckCircle2 size={14} className="mr-2" /> Mark as Posted
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onDelete(post._id)}
                className="text-destructive cursor-pointer"
              >
                <Trash2 size={14} className="mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed line-clamp-4">
          {post.content}
        </p>

        {/* AI-generated label */}
        <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
          <Sparkles size={10} className="text-amber-500" />
          <span className="text-[10px] font-medium text-amber-500">AI-Generated</span>
        </div>

        {/* AI-generated notice + character count */}
        <div className="mt-2 flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
            <Sparkles size={9} /> AI-generated — review before posting
          </span>
          <CharacterCount content={post.content} platform={post.platform} />
        </div>

        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          {post.scheduledAt && post.status === "scheduled" && (
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              Reminder: {format(new Date(post.scheduledAt), "MMM d, yyyy h:mm a")}
            </span>
          )}
          {post.publishedAt && post.status === "published" && (
            <span className="flex items-center gap-1">
              <CheckCircle2 size={11} className="text-green-400" />
              Marked posted {format(new Date(post.publishedAt), "MMM d, yyyy")}
            </span>
          )}
          <span className="ml-auto">
            Created {format(new Date(post._creationTime), "MMM d")}
          </span>
        </div>

        {/* Prominent copy actions */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="cursor-pointer h-8"
            onClick={copyContent}
          >
            {copied ? (
              <>
                <Check size={14} className="mr-1.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy size={14} className="mr-1.5" />
                Copy to Clipboard
              </>
            )}
          </Button>
          {PLATFORM_URLS[post.platform].url && (
            <Button
              variant="secondary"
              size="sm"
              className="cursor-pointer h-8"
              onClick={() => copyAndOpen(post.content, post.platform)}
            >
              <ExternalLink size={13} className="mr-1.5" />
              {PLATFORM_URLS[post.platform].label}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer h-8 text-xs text-muted-foreground ml-auto"
            onClick={() => setShowTips((v) => !v)}
          >
            <Lightbulb size={13} className="mr-1" />
            {showTips ? "Hide Tips" : "Posting Tips"}
          </Button>
        </div>

        {/* Platform-specific tips */}
        {showTips && (
          <div className="mt-3 rounded-lg bg-muted/40 border border-border px-3 py-2.5 space-y-1">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-1.5">
              <Lightbulb size={12} className="text-primary" />
              {platformInfo.label} Tips
            </p>
            {tips.map((tip, i) => (
              <p key={i} className="text-xs text-muted-foreground pl-4 flex items-start gap-1.5">
                <span className="text-primary mt-0.5 shrink-0">&#8226;</span>
                {tip}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GeneratePostDialog({
  open,
  onClose,
  businessName,
}: {
  open: boolean;
  onClose: () => void;
  businessName: string;
}) {
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [template, setTemplate] = useState("promotion");
  const [tone, setTone] = useState<Tone>("friendly");
  const [serviceOrTopic, setServiceOrTopic] = useState("");
  const [customContext, setCustomContext] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [generatedTags, setGeneratedTags] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const generatePost = useAction(api.marketing.generateSocialPost);
  const createPost = useMutation(api.marketingData.createSocialPost);

  const handleGenerate = async () => {
    if (!serviceOrTopic.trim()) {
      toast.error("Please enter a service or topic");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generatePost({
        platform,
        template,
        businessName,
        serviceOrTopic,
        tone,
        customContext: customContext || undefined,
      });
      setGeneratedContent(result.content);
      setGeneratedTags(result.tags);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!generatedContent) return;
    setIsSaving(true);
    try {
      await createPost({
        platform,
        content: generatedContent,
        status: "draft",
        tags: generatedTags,
      });
      toast.success("Saved as draft");
      handleClose();
    } catch {
      toast.error("Failed to save post");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setGeneratedContent("");
    setGeneratedTags([]);
    setServiceOrTopic("");
    setCustomContext("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            AI Post Generator
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="google">Google Business</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="urgent">Urgent / Limited Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              Service or Topic <span className="text-destructive">*</span>
            </Label>
            <Input
              value={serviceOrTopic}
              onChange={(e) => setServiceOrTopic(e.target.value)}
              placeholder="e.g. oil change special, brake inspection, summer tire swap"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Extra Context (optional)</Label>
            <Input
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder="e.g. 20% off this weekend, serving Phoenix AZ area"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !serviceOrTopic.trim()}
            className="w-full cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Spinner />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={15} className="mr-1.5" />
                Generate Post
              </>
            )}
          </Button>

          {generatedContent && (
            <div className="space-y-2 border border-border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label>Generated Post</Label>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    <Sparkles size={10} className="mr-1" /> AI-generated
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    onClick={() => {
                      void navigator.clipboard.writeText(generatedContent);
                      toast.success("Copied!");
                    }}
                  >
                    <Copy size={12} className="mr-1" /> Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    <Sparkles size={12} className="mr-1" /> Regenerate
                  </Button>
                </div>
              </div>
              <Textarea
                value={generatedContent}
                onChange={(e) => setGeneratedContent(e.target.value)}
                rows={8}
                className="text-sm"
              />
              {/* Character count in dialog */}
              <CharacterCount content={generatedContent} platform={platform} />
              {generatedTags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {generatedTags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs capitalize">
                      {tag.replace(/-/g, " ")}
                    </Badge>
                  ))}
                </div>
              )}
              {/* Quick copy & open in dialog preview */}
              <Button
                size="sm"
                className="cursor-pointer w-fit"
                onClick={() => copyAndOpen(generatedContent, platform)}
              >
                <ExternalLink size={12} className="mr-1" />
                {PLATFORM_URLS[platform].label}
              </Button>
              {/* Platform tips in dialog */}
              <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5 space-y-1">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-1.5">
                  <Lightbulb size={12} className="text-primary" />
                  {PLATFORM_META[platform].label} Tips
                </p>
                {PLATFORM_TIPS[platform].map((tip, i) => (
                  <p key={i} className="text-xs text-muted-foreground pl-4 flex items-start gap-1.5">
                    <span className="text-primary mt-0.5 shrink-0">&#8226;</span>
                    {tip}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button
            onClick={handleSaveDraft}
            disabled={!generatedContent || isSaving}
            className="cursor-pointer"
          >
            {isSaving ? <Spinner /> : null}
            Save as Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPostDialog({
  post,
  onClose,
}: {
  post: Post | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState(post?.content ?? "");
  const [status, setStatus] = useState<PostStatus>(post?.status ?? "draft");
  const [scheduledAt, setScheduledAt] = useState(
    post?.scheduledAt ? post.scheduledAt.slice(0, 16) : ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const updatePost = useMutation(api.marketingData.updateSocialPost);

  const handleSave = async () => {
    if (!post) return;
    setIsSaving(true);
    try {
      await updatePost({
        id: post._id,
        content,
        status,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      toast.success("Post updated");
      onClose();
    } catch {
      toast.error("Failed to update post");
    } finally {
      setIsSaving(false);
    }
  };

  if (!post) return null;

  return (
    <Dialog open={!!post} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PostStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="scheduled">Ready to Post</SelectItem>
                  <SelectItem value="published">Posted (manual)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {status === "scheduled" && (
              <div className="space-y-1.5">
                <Label>Schedule Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="cursor-pointer">
            {isSaving ? <Spinner /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarketingContent() {
  const posts = useQuery(api.marketingData.getSocialPosts, {});
  const deletePost = useMutation(api.marketingData.deleteSocialPost);
  const updatePost = useMutation(api.marketingData.updateSocialPost);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | PostStatus>("all");
  const [filterPlatform, setFilterPlatform] = useState<"all" | Platform>("all");

  // Get org name for AI context
  const orgQuery = useQuery(api.organizations.getCurrentOrg, {});

  const handleDelete = async (id: Post["_id"]) => {
    await deletePost({ id });
    toast.success("Post deleted");
  };

  const handleStatusChange = async (id: Post["_id"], status: PostStatus) => {
    await updatePost({ id, status });
    toast.success(`Post marked as ${status}`);
  };

  const filtered = (posts ?? []).filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterPlatform !== "all" && p.platform !== filterPlatform) return false;
    return true;
  });

  const counts = {
    all: (posts ?? []).length,
    draft: (posts ?? []).filter((p) => p.status === "draft").length,
    scheduled: (posts ?? []).filter((p) => p.status === "scheduled").length,
    published: (posts ?? []).filter((p) => p.status === "published").length,
  };

  if (posts === undefined) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Megaphone className="text-primary" size={28} />
          <div>
            <h1
              className="text-3xl font-bold"
              style={{ fontFamily: "Rajdhani, sans-serif" }}
            >
              Social Marketing
            </h1>
            <p className="text-sm text-muted-foreground">
              AI-powered posts for Facebook, Instagram & Google
            </p>
          </div>
        </div>
        <Button onClick={() => setGenerateOpen(true)} className="cursor-pointer">
          <Sparkles size={15} className="mr-1.5" />
          Generate Post
        </Button>
      </div>

      {/* Honest expectation-setting banner */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Copy size={16} className="shrink-0 mt-0.5 text-primary" />
        <p>
          AI generates your post text — just copy it and paste directly into Facebook, Instagram, or Google Business. There is no automatic publishing.
        </p>
      </div>

      {/* AI-generated content disclosure */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
        <Sparkles size={16} className="shrink-0 mt-0.5 text-amber-500" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">AI-Generated Content:</span> All social media posts created by this tool are generated by artificial intelligence. Review and edit content for accuracy before publishing. You are responsible for verifying claims, pricing, offers, and compliance with each platform's advertising policies.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(["all", "draft", "scheduled", "published"] as const).map((s) => (
          <Card
            key={s}
            className={`cursor-pointer transition-colors ${filterStatus === s ? "border-primary" : "hover:border-primary/40"}`}
            onClick={() => setFilterStatus(s)}
          >
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground capitalize">
                {s === "all" ? "Total Posts" : s === "scheduled" ? "Ready to Post" : s === "published" ? "Posted" : "Draft"}
              </p>
              <p className="text-2xl font-bold">{counts[s]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Platform filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {(["all", "facebook", "instagram", "google", "general"] as const).map((p) => (
          <Button
            key={p}
            variant={filterPlatform === p ? "default" : "secondary"}
            size="sm"
            className="cursor-pointer h-7 text-xs capitalize"
            onClick={() => setFilterPlatform(p)}
          >
            {p === "all" ? "All Platforms" : PLATFORM_META[p].label}
          </Button>
        ))}
      </div>

      {/* Posts list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
          <Megaphone size={48} className="text-muted-foreground" />
          <p className="text-muted-foreground">
            {posts.length === 0
              ? "No posts yet. Generate your first AI social post!"
              : "No posts match your filters."}
          </p>
          {posts.length === 0 && (
            <Button onClick={() => setGenerateOpen(true)} className="cursor-pointer">
              <PlusCircle size={15} className="mr-1.5" /> Create First Post
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <PostCard
              key={post._id}
              post={post}
              onEdit={setEditingPost}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <GeneratePostDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        businessName={orgQuery?.name ?? "My Shop"}
      />
      <EditPostDialog post={editingPost} onClose={() => setEditingPost(null)} />
    </div>
  );
}

export default function MarketingPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full">
          <SignInButton />
        </div>
      </Unauthenticated>
      <Authenticated>
        <MarketingContent />
      </Authenticated>
    </>
  );
}
