import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { MapPin, Navigation, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatDistanceToNow } from "date-fns";

// Fix Leaflet default marker icon
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function createMechanicIcon(initials: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:#e55a1c;color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-family:Rajdhani,sans-serif;">${initials}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

export default function GpsDispatchMap({ orgId }: { orgId: Id<"organizations"> }) {
  const locations = useQuery(api.employees.getLatestLocations, { orgId });
  const recordLocation = useMutation(api.employees.recordLocation);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const history = useQuery(
    api.employees.getMemberLocationHistory,
    selectedMember ? { memberId: selectedMember as Id<"orgMembers"> } : "skip"
  );
  const [tracking, setTracking] = useState(false);
  const watchRef = useRef<number | null>(null);

  const startTracking = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setTracking(true);
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await recordLocation({
            orgId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        } catch {
          // silently ignore individual ping failures
        }
      },
      (err) => {
        toast.error(`GPS error: ${err.message}`);
        setTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  };

  const stopTracking = () => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setTracking(false);
    toast.success("GPS tracking stopped");
  };

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, []);

  if (locations === undefined) {
    return <Skeleton className="h-[500px] w-full rounded-lg" />;
  }

  // Default center: USA center if no pings
  const located = locations.filter((l) => l.lastPing);
  const centerLat = located.length > 0 ? located[0].lastPing!.lat : 37.7749;
  const centerLng = located.length > 0 ? located[0].lastPing!.lng : -122.4194;

  const historyPoints: [number, number][] =
    history?.map((p) => [p.lat, p.lng] as [number, number]) ?? [];

  return (
    <div className="space-y-4">
      {/* Tracking Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {tracking ? (
            <Button size="sm" variant="destructive" onClick={stopTracking} className="cursor-pointer">
              <Navigation size={14} className="mr-1.5 animate-pulse" /> Stop Sharing Location
            </Button>
          ) : (
            <Button size="sm" onClick={startTracking} className="cursor-pointer">
              <Navigation size={14} className="mr-1.5" /> Share My Location
            </Button>
          )}
          {tracking && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 animate-pulse">
              Live
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground ml-auto">
          {located.length} mechanic{located.length !== 1 ? "s" : ""} on map
        </p>
      </div>

      {/* Side-by-side layout */}
      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Mechanic List */}
        <div className="lg:w-64 shrink-0 space-y-2">
          {locations.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No mechanics to track
            </div>
          ) : (
            locations.map((m) => (
              <button
                key={m.memberId}
                onClick={() => setSelectedMember(selectedMember === m.memberId ? null : m.memberId)}
                className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  selectedMember === m.memberId
                    ? "bg-primary/10 border-primary/40"
                    : "bg-card border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                    {(m.userName ?? "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{m.userName}</p>
                    <div className="flex items-center gap-1">
                      {m.lastPing ? (
                        <>
                          <MapPin size={10} className="text-green-400 shrink-0" />
                          <span className="text-xs text-muted-foreground truncate">
                            {formatDistanceToNow(new Date(m.lastPing.timestamp), { addSuffix: true })}
                          </span>
                        </>
                      ) : (
                        <>
                          <User size={10} className="text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground">No location</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Map */}
        <div className="flex-1 min-h-0">
          <MapContainer
            center={[centerLat, centerLng]}
            zoom={located.length > 0 ? 12 : 4}
            className="rounded-lg border border-border"
            style={{ height: "420px", width: "100%" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* Mechanic markers */}
            {locations.map((m) =>
              m.lastPing ? (
                <Marker
                  key={m.memberId}
                  position={[m.lastPing.lat, m.lastPing.lng]}
                  icon={createMechanicIcon((m.userName ?? "?").slice(0, 2).toUpperCase())}
                >
                  <Popup>
                    <div className="text-sm font-semibold">{m.userName}</div>
                    <div className="text-xs text-gray-500 capitalize">{m.role.replace("_", " ")}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Last seen: {formatDistanceToNow(new Date(m.lastPing.timestamp), { addSuffix: true })}
                    </div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">
                      {m.lastPing.lat.toFixed(5)}, {m.lastPing.lng.toFixed(5)}
                    </div>
                  </Popup>
                </Marker>
              ) : null
            )}

            {/* Location history trail for selected member */}
            {selectedMember && historyPoints.length > 1 && (
              <Polyline
                positions={historyPoints}
                pathOptions={{ color: "#e55a1c", weight: 2, opacity: 0.6, dashArray: "4 4" }}
              />
            )}
          </MapContainer>
        </div>
      </div>

      {selectedMember && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <RefreshCw size={10} />
          Showing location trail for selected mechanic. Click again to deselect.
        </p>
      )}
    </div>
  );
}
