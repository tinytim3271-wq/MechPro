import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type {
  NHTSARecall,
  NHTSAComplaint,
  NHTSASafetyRating,
} from "@/convex/nhtsa.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";
import {
  ShieldAlert,
  MessageSquareWarning,
  Star,
  StarHalf,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Car,
  Loader2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

// ─── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  vin?: string;
  make: string;
  model: string;
  year: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(raw: string): string {
  if (!raw) return "";
  // NHTSA recall dates come as ISO-ish strings; complaints as "01/01/2020".
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return raw;
}

// Parse an NHTSA star string ("1".."5" or "Not Rated") into a number or null.
function parseStars(value: string): number | null {
  const n = Number(value);
  if (!Number.isNaN(n) && n >= 1 && n <= 5) return n;
  return null;
}

// ─── Star Rating display ─────────────────────────────────────────────────────────

function StarRating({ value, size = 16 }: { value: string; size?: number }) {
  const stars = parseStars(value);
  if (stars === null) {
    return <span className="text-xs font-medium text-muted-foreground">Not Rated</span>;
  }
  return (
    <div className="flex items-center gap-0.5" aria-label={`${stars} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={cn(
            i < stars ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground/40",
          )}
        />
      ))}
    </div>
  );
}

// ─── Load-on-demand wrapper ──────────────────────────────────────────────────────

type LoadState<T> = {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  data: T;
};

function LoadButton({
  label,
  loading,
  loaded,
  onClick,
}: {
  label: string;
  loading: boolean;
  loaded: boolean;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick} disabled={loading} size="sm" className="cursor-pointer">
      {loading ? (
        <>
          <Loader2 size={14} className="mr-2 animate-spin" /> Loading…
        </>
      ) : loaded ? (
        <>
          <RefreshCw size={14} className="mr-2" /> Refresh
        </>
      ) : (
        label
      )}
    </Button>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
      <AlertTriangle size={14} className="text-destructive shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm text-foreground">{message}</p>
        <Button variant="secondary" size="sm" className="mt-2 cursor-pointer" onClick={onRetry}>
          <RefreshCw size={13} className="mr-1.5" /> Try again
        </Button>
      </div>
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────────

export default function VehicleHistoryPanel({ vin, make, model, year }: Props) {
  const getRecalls = useAction(api.nhtsa.getRecalls);
  const getComplaints = useAction(api.nhtsa.getComplaints);
  const getSafetyRatings = useAction(api.nhtsa.getSafetyRatings);

  const [recalls, setRecalls] = useState<LoadState<NHTSARecall[]>>({
    loading: false,
    loaded: false,
    error: null,
    data: [],
  });
  const [complaints, setComplaints] = useState<LoadState<NHTSAComplaint[]>>({
    loading: false,
    loaded: false,
    error: null,
    data: [],
  });
  const [ratings, setRatings] = useState<LoadState<NHTSASafetyRating | null>>({
    loading: false,
    loaded: false,
    error: null,
    data: null,
  });

  const loadRecalls = async () => {
    setRecalls((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await getRecalls({ make, model, year });
      setRecalls({ loading: false, loaded: true, error: null, data });
    } catch {
      setRecalls((s) => ({ ...s, loading: false, error: "Could not load recalls from NHTSA." }));
    }
  };

  const loadComplaints = async () => {
    setComplaints((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await getComplaints({ make, model, year });
      // Sort most recent first by complaint filed date.
      const sorted = [...data].sort(
        (a, b) =>
          new Date(b.dateComplaintFiled).getTime() - new Date(a.dateComplaintFiled).getTime(),
      );
      setComplaints({ loading: false, loaded: true, error: null, data: sorted });
    } catch {
      setComplaints((s) => ({
        ...s,
        loading: false,
        error: "Could not load complaints from NHTSA.",
      }));
    }
  };

  const loadRatings = async () => {
    setRatings((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await getSafetyRatings({ make, model, year });
      setRatings({ loading: false, loaded: true, error: null, data });
    } catch {
      setRatings((s) => ({
        ...s,
        loading: false,
        error: "Could not load safety ratings from NHTSA.",
      }));
    }
  };

  const carfaxUrl = vin
    ? `https://www.carfax.com/VehicleHistory/page?vin=${encodeURIComponent(vin)}`
    : null;

  return (
    <div className="space-y-3">
      {/* Vehicle header */}
      <div className="flex items-center gap-2 text-sm">
        <Car size={16} className="text-primary shrink-0" />
        <span className="font-semibold text-foreground">
          {year} {make} {model}
        </span>
        {vin && <span className="font-mono text-xs text-muted-foreground">VIN: {vin}</span>}
      </div>

      <Tabs defaultValue="recalls" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="recalls">
            <ShieldAlert size={14} />
            <span className="hidden sm:inline">Recalls</span>
            {recalls.loaded && recalls.data.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 px-1.5 text-[10px]">
                {recalls.data.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="complaints">
            <MessageSquareWarning size={14} />
            <span className="hidden sm:inline">Complaints</span>
            {complaints.loaded && complaints.data.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                {complaints.data.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ratings">
            <Star size={14} />
            <span className="hidden sm:inline">Ratings</span>
          </TabsTrigger>
          <TabsTrigger value="carfax">
            <FileText size={14} />
            <span className="hidden sm:inline">CarFax</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Recalls ── */}
        <TabsContent value="recalls" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Open safety recalls reported to NHTSA.
            </p>
            <LoadButton
              label="Load Recalls"
              loading={recalls.loading}
              loaded={recalls.loaded}
              onClick={loadRecalls}
            />
          </div>

          {recalls.error && <LoadError message={recalls.error} onRetry={loadRecalls} />}

          {recalls.loading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          )}

          {recalls.loaded && !recalls.loading && recalls.data.length === 0 && !recalls.error && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-6 text-center">
              <CheckCircle2 size={32} className="mx-auto text-green-500" />
              <p className="mt-2 font-semibold text-foreground">No open recalls found</p>
              <p className="text-sm text-muted-foreground">
                NHTSA has no active recalls on record for this vehicle.
              </p>
            </div>
          )}

          {!recalls.loading &&
            recalls.data.map((r, i) => (
              <Card key={`${r.NHTSACampaignNumber}-${i}`}>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive" className="font-mono text-[10px]">
                      {r.NHTSACampaignNumber}
                    </Badge>
                    {r.ReportReceivedDate && (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(r.ReportReceivedDate)}
                      </span>
                    )}
                  </div>
                  {r.Component && <p className="font-semibold text-foreground">{r.Component}</p>}
                  {r.Summary && <p className="text-sm text-muted-foreground">{r.Summary}</p>}
                  {r.Consequence && (
                    <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                        Consequence
                      </p>
                      <p className="text-sm text-foreground mt-0.5">{r.Consequence}</p>
                    </div>
                  )}
                  {r.Remedy && (
                    <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-green-500">
                        Remedy
                      </p>
                      <p className="text-sm text-foreground mt-0.5">{r.Remedy}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

          {!recalls.loaded && !recalls.loading && !recalls.error && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Click “Load Recalls” to check NHTSA for this vehicle.
            </p>
          )}
        </TabsContent>

        {/* ── Complaints ── */}
        <TabsContent value="complaints" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Safety complaints filed by owners.</p>
            <LoadButton
              label="Load Complaints"
              loading={complaints.loading}
              loaded={complaints.loaded}
              onClick={loadComplaints}
            />
          </div>

          {complaints.error && <LoadError message={complaints.error} onRetry={loadComplaints} />}

          {complaints.loading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          )}

          {complaints.loaded &&
            !complaints.loading &&
            complaints.data.length === 0 &&
            !complaints.error && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CheckCircle2 />
                  </EmptyMedia>
                  <EmptyTitle>No complaints found</EmptyTitle>
                  <EmptyDescription>
                    NHTSA has no safety complaints on record for this vehicle.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

          {!complaints.loading &&
            complaints.data.map((c) => (
              <Card key={c.odiNumber}>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      ODI #{c.odiNumber}
                    </Badge>
                    {c.dateComplaintFiled && (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(c.dateComplaintFiled)}
                      </span>
                    )}
                    {c.crash && (
                      <Badge variant="destructive" className="gap-1 text-[10px]">
                        <Car size={10} /> Crash
                      </Badge>
                    )}
                    {c.fire && (
                      <Badge variant="destructive" className="gap-1 text-[10px]">
                        <Flame size={10} /> Fire
                      </Badge>
                    )}
                    {c.numberOfInjuries > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {c.numberOfInjuries} injured
                      </Badge>
                    )}
                    {c.numberOfDeaths > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {c.numberOfDeaths} deaths
                      </Badge>
                    )}
                  </div>
                  {c.components && (
                    <p className="font-semibold text-foreground text-sm">{c.components}</p>
                  )}
                  {c.summary && <p className="text-sm text-muted-foreground">{c.summary}</p>}
                </CardContent>
              </Card>
            ))}

          {!complaints.loaded && !complaints.loading && !complaints.error && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Click “Load Complaints” to check NHTSA for this vehicle.
            </p>
          )}
        </TabsContent>

        {/* ── Safety Ratings ── */}
        <TabsContent value="ratings" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">NHTSA 5-star safety ratings.</p>
            <LoadButton
              label="Load Safety Ratings"
              loading={ratings.loading}
              loaded={ratings.loaded}
              onClick={loadRatings}
            />
          </div>

          {ratings.error && <LoadError message={ratings.error} onRetry={loadRatings} />}

          {ratings.loading && <Skeleton className="h-48 w-full" />}

          {ratings.loaded && !ratings.loading && !ratings.data && !ratings.error && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Star />
                </EmptyMedia>
                <EmptyTitle>No ratings available</EmptyTitle>
                <EmptyDescription>
                  NHTSA has not published crash-test ratings for this vehicle.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!ratings.loading && ratings.data && (
            <div className="space-y-4">
              {/* Overall */}
              <Card>
                <CardContent className="text-center space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Overall Rating
                  </p>
                  <div className="flex justify-center">
                    <StarRating value={ratings.data.OverallRating} size={28} />
                  </div>
                  {ratings.data.VehicleDescription && (
                    <p className="text-xs text-muted-foreground">
                      {ratings.data.VehicleDescription}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Sub ratings */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { label: "Front Crash", value: ratings.data.OverallFrontCrashRating },
                  { label: "Side Crash", value: ratings.data.OverallSideCrashRating },
                  { label: "Rollover", value: ratings.data.RolloverRating },
                ].map((sub) => (
                  <div
                    key={sub.label}
                    className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-center space-y-1.5"
                  >
                    <p className="text-[11px] font-medium text-muted-foreground">{sub.label}</p>
                    <div className="flex justify-center">
                      <StarRating value={sub.value} size={14} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Feature flags */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Safety Features
                </p>
                {[
                  {
                    label: "Electronic Stability Control",
                    value: ratings.data.NHTSAElectronicStabilityControl,
                  },
                  {
                    label: "Forward Collision Warning",
                    value: ratings.data.NHTSAForwardCollisionWarning,
                  },
                  {
                    label: "Lane Departure Warning",
                    value: ratings.data.NHTSALaneDepartureWarning,
                  },
                ].map((feat) => {
                  const present = /standard|optional|yes/i.test(feat.value ?? "");
                  return (
                    <div
                      key={feat.label}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                    >
                      <span className="text-sm text-foreground">{feat.label}</span>
                      {present ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-500">
                          <CheckCircle2 size={14} /> {feat.value}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {feat.value || "Not available"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <StarHalf size={12} />
                Data from NHTSA (National Highway Traffic Safety Administration)
              </p>
            </div>
          )}

          {!ratings.loaded && !ratings.loading && !ratings.error && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Click “Load Safety Ratings” to check NHTSA for this vehicle.
            </p>
          )}
        </TabsContent>

        {/* ── CarFax ── */}
        <TabsContent value="carfax" className="mt-4">
          <div className="rounded-xl overflow-hidden border border-[#7a1420]">
            {/* Branded header */}
            <div className="bg-[#4a0e14] px-5 py-4">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-white" />
                <span
                  className="text-lg font-bold text-white tracking-wide"
                  style={{ fontFamily: "Rajdhani, sans-serif" }}
                >
                  CARFAX
                </span>
              </div>
              <p className="text-sm text-white/70 mt-1">Vehicle History Report</p>
            </div>

            <div className="p-5 space-y-4 bg-card">
              {carfaxUrl ? (
                <a href={carfaxUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <Button
                    className="w-full cursor-pointer bg-[#6d121c] hover:bg-[#831620] text-white"
                    size="lg"
                  >
                    <FileText size={16} className="mr-2" />
                    View CarFax Report
                    <ExternalLink size={14} className="ml-2" />
                  </Button>
                </a>
              ) : (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground">
                    Add a VIN for this vehicle to open its CarFax report.
                  </p>
                </div>
              )}

              <a
                href="https://www.carfax.com/Service-Shops-CARFAX_bg.html"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Check for CarFax ADVANTAGE dealers
                <ExternalLink size={13} />
              </a>

              {/* Benefits */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  A CarFax report includes
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { icon: Car, label: "Accident History" },
                    { icon: Wrench, label: "Service Records" },
                    { icon: FileText, label: "Ownership History" },
                    { icon: RefreshCw, label: "Odometer Check" },
                    { icon: ShieldCheck, label: "Title Problems" },
                  ].map((b) => (
                    <div
                      key={b.label}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <b.icon size={14} className="text-primary shrink-0" />
                      <span className="text-sm text-foreground">{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dealer subscription note */}
              <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-3 py-3">
                <ShieldAlert size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  CarFax API integration for automated vehicle history reports within MechPro
                  requires a CarFax dealer subscription. Contact CarFax at{" "}
                  <a
                    href="https://www.carfax.com/dealer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    carfax.com/dealer
                  </a>{" "}
                  to set up an account, then your API key can be added in Settings &gt;
                  Integrations.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
