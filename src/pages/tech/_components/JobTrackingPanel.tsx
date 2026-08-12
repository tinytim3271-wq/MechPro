import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Navigation, MapPin, Radio, CheckCircle2, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  en_route: "En Route",
  on_site: "On Site",
  left_site: "Left Site",
};

const STATUS_COLORS: Record<string, string> = {
  en_route: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  on_site: "bg-green-500/15 text-green-400 border-green-500/30",
  left_site: "bg-muted text-muted-foreground border-border",
};

type Props = {
  roId: Id<"repairOrders">;
  techLocationStatus?: string | null;
  serviceAddress?: string;
  serviceCity?: string;
  serviceState?: string;
  serviceZip?: string;
};

export default function JobTrackingPanel({
  roId,
  techLocationStatus,
  serviceAddress,
  serviceCity,
  serviceState,
  serviceZip,
}: Props) {
  const startTracking = useMutation(api.jobTracking.startTracking);
  const sendPing = useMutation(api.jobTracking.sendJobPing);
  const setCoords = useMutation(api.jobTracking.setJobSiteCoords);

  const [isTracking, setIsTracking] = useState(
    techLocationStatus === "en_route" || techLocationStatus === "on_site"
  );
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const geocodedRef = useRef(false);

  const fullAddress = [serviceAddress, serviceCity, serviceState, serviceZip]
    .filter(Boolean)
    .join(", ");

  // Geocode service address once on mount (uses browser Geocoding)
  useEffect(() => {
    if (geocodedRef.current || !fullAddress) return;
    geocodedRef.current = true;

    // Use Nominatim (free, no API key) for geocoding
    const geocode = async () => {
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`,
          { headers: { "User-Agent": "MechPro/1.0" } }
        );
        const results = await resp.json() as Array<{ lat: string; lon: string }>;
        if (results.length > 0) {
          const lat = parseFloat(results[0].lat);
          const lng = parseFloat(results[0].lon);
          await setCoords({ roId, lat, lng });
        }
      } catch {
        // Geocoding failed silently — tracking still works without distance
      }
    };
    geocode();
  }, [fullAddress, roId, setCoords]);

  const getPosition = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        toast.error("Location not available on this device");
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          if (err.code === 1) {
            toast.error("Location permission denied. Please enable it in your device settings.");
          } else {
            toast.error("Could not get your location. Try again.");
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }, []);

  const doSendPing = useCallback(async () => {
    const pos = await getPosition();
    if (!pos) return;
    try {
      const result = await sendPing({ roId, lat: pos.lat, lng: pos.lng });
      setDistance(result.distanceMeters);
    } catch {
      // Silent fail for pings
    }
  }, [getPosition, sendPing, roId]);

  // Send pings every 60 seconds while tracking
  useEffect(() => {
    if (!isTracking) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    // Immediate ping
    doSendPing();
    intervalRef.current = setInterval(doSendPing, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTracking, doSendPing]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const pos = await getPosition();
      if (!pos) {
        setLoading(false);
        return;
      }
      await startTracking({ roId });
      setIsTracking(true);
      toast.success("Job tracking started — office will be notified of your arrival");
    } catch {
      toast.error("Failed to start tracking");
    } finally {
      setLoading(false);
    }
  };

  // handleStop removed — tracking is mandatory and stops on job completion

  const currentStatus = techLocationStatus ?? (isTracking ? "en_route" : null);

  return (
    <Card className={cn(
      "border transition-colors",
      isTracking ? "border-blue-500/40 bg-blue-500/5" : "border-border"
    )}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation
              size={16}
              className={cn(
                isTracking ? "text-blue-400 animate-pulse" : "text-muted-foreground"
              )}
            />
            <span className="text-sm font-semibold text-foreground">
              Job Tracking
            </span>
          </div>
          {currentStatus && (
            <Badge variant="secondary" className={cn("text-[10px] border", STATUS_COLORS[currentStatus] ?? "")}>
              {STATUS_LABELS[currentStatus] ?? currentStatus}
            </Badge>
          )}
        </div>

        {/* Address */}
        {fullAddress && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
            <MapPin size={12} className="text-primary shrink-0 mt-0.5" />
            <span>{fullAddress}</span>
          </div>
        )}

        {/* Distance indicator */}
        {isTracking && distance != null && (
          <div className="flex items-center gap-2 text-xs">
            <ArrowRight size={12} className="text-muted-foreground" />
            <span className="text-muted-foreground">
              {distance < 1000
                ? `${distance}m away`
                : `${(distance / 1000).toFixed(1)}km away`}
            </span>
            {distance <= 200 && (
              <span className="flex items-center gap-1 text-green-400 font-medium">
                <CheckCircle2 size={11} /> On site
              </span>
            )}
          </div>
        )}

        {/* Tracking indicator */}
        {isTracking && (
          <div className="flex items-center gap-2 text-xs text-blue-400">
            <Radio size={12} className="animate-pulse" />
            <span>Sending location every 60 seconds</span>
          </div>
        )}

        {/* Action button — tracking is mandatory once started */}
        {!isTracking && (
          <Button
            className="w-full cursor-pointer"
            size="sm"
            onClick={handleStart}
            disabled={loading}
          >
            {loading ? "Getting location..." : "Start Job Tracking"}
          </Button>
        )}

        {isTracking && (
          <p className="text-[10px] text-muted-foreground text-center">
            GPS tracking is required during active jobs. It stops automatically when the job is completed.
          </p>
        )}

        {!isTracking && !fullAddress && (
          <p className="text-[10px] text-muted-foreground text-center">
            No service address on this job — tracking will work but without arrival detection.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
