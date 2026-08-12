import { useState, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  MapPin, Navigation, Clock, User, RefreshCw,
  Signal, SignalZero, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatDistanceToNow } from "date-fns";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)["_getIconUrl"];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom colored marker for active techs
function createTechIcon(isRecent: boolean) {
  return L.divIcon({
    className: "tech-marker",
    html: `<div style="
      width: 32px; height: 32px; border-radius: 50%;
      background: ${isRecent ? "#22c55e" : "#f59e0b"};
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

// Helper to check if a ping is recent (within last 10 min)
function isRecentPing(timestamp: string): boolean {
  const pingTime = new Date(timestamp).getTime();
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  return pingTime > tenMinAgo;
}

// Map auto-fit component
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [positions, map]);
  return null;
}

// Type for tech location data
type TechLocation = {
  memberId: Id<"orgMembers">;
  userId: Id<"users">;
  role: string;
  userName: string;
  avatarUrl?: string;
  lastPing: {
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp: string;
    roId?: Id<"repairOrders">;
  } | null;
};

export default function TrackingPage() {
  const myRole = useQuery(api.admin.getMyRole, {});
  const orgId = myRole?.orgId;
  const locations = useQuery(
    api.employees.getLatestLocations,
    orgId ? { orgId } : "skip"
  ) as TechLocation[] | undefined;

  const [selectedTech, setSelectedTech] = useState<Id<"orgMembers"> | null>(null);

  // Get history for selected tech
  const history = useQuery(
    api.employees.getMemberLocationHistory,
    selectedTech ? { memberId: selectedTech } : "skip"
  );

  // Memoize positions for map bounds
  const techPositions = useMemo(() => {
    if (!locations) return [];
    return locations
      .filter((t) => t.lastPing)
      .map((t) => [t.lastPing!.lat, t.lastPing!.lng] as [number, number]);
  }, [locations]);

  // Default center (Lubbock, TX area based on user location)
  const defaultCenter: [number, number] = [33.5, -101.8];
  const mapCenter = techPositions.length > 0
    ? techPositions[0]
    : defaultCenter;

  if (myRole === undefined || locations === undefined) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full rounded-xl" />
      </div>
    );
  }

  if (!myRole || !["owner", "admin", "service_writer"].includes(myRole.role)) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-2">
          <AlertCircle size={32} className="text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">You don't have access to this page.</p>
        </div>
      </div>
    );
  }

  const techsWithPing = locations.filter((t) => t.lastPing);
  const techsNoPing = locations.filter((t) => !t.lastPing);
  const activeTechs = techsWithPing.filter((t) => isRecentPing(t.lastPing!.timestamp));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            <Navigation size={22} className="inline-block mr-2 text-primary" />
            GPS Tracking
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time location of your mechanics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-green-500/15 text-green-400 border-green-500/30">
            <Signal size={11} className="mr-1" /> {activeTechs.length} active
          </Badge>
          <Badge variant="secondary">
            {locations.length} techs total
          </Badge>
        </div>
      </div>

      {/* Map */}
      <Card className="overflow-hidden">
        <div className="h-[500px] w-full">
          <MapContainer
            center={mapCenter}
            zoom={11}
            className="h-full w-full"
            style={{ zIndex: 1 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {techPositions.length > 0 && <FitBounds positions={techPositions} />}

            {techsWithPing.map((tech) => {
              const ping = tech.lastPing!;
              const recent = isRecentPing(ping.timestamp);
              return (
                <Marker
                  key={tech.memberId}
                  position={[ping.lat, ping.lng]}
                  icon={createTechIcon(recent)}
                  eventHandlers={{
                    click: () => setSelectedTech(tech.memberId),
                  }}
                >
                  <Popup>
                    <div className="text-sm space-y-1 min-w-[150px]">
                      <p className="font-bold text-foreground">{tech.userName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{tech.role.replace("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        Last seen: {formatDistanceToNow(new Date(ping.timestamp), { addSuffix: true })}
                      </p>
                      {ping.accuracy && (
                        <p className="text-xs text-muted-foreground">
                          Accuracy: ±{Math.round(ping.accuracy)}m
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </Card>

      {/* Tech List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {techsWithPing.map((tech) => {
          const ping = tech.lastPing!;
          const recent = isRecentPing(ping.timestamp);
          const isSelected = selectedTech === tech.memberId;

          return (
            <Card
              key={tech.memberId}
              className={cn(
                "cursor-pointer transition-all hover:border-primary/40",
                isSelected && "ring-2 ring-primary border-primary",
                recent && "border-green-500/30"
              )}
              onClick={() => setSelectedTech(isSelected ? null : tech.memberId)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold",
                    recent ? "bg-green-500" : "bg-amber-500"
                  )}>
                    {tech.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{tech.userName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{tech.role.replace("_", " ")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {recent ? (
                      <Badge variant="secondary" className="bg-green-500/15 text-green-400 text-[10px]">
                        <Signal size={9} className="mr-0.5" /> Live
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        <SignalZero size={9} className="mr-0.5" /> Offline
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock size={10} />
                  <span>{formatDistanceToNow(new Date(ping.timestamp), { addSuffix: true })}</span>
                </div>
                {ping.accuracy && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin size={10} />
                    <span className="font-mono">{ping.lat.toFixed(4)}, {ping.lng.toFixed(4)}</span>
                    <span>(±{Math.round(ping.accuracy)}m)</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Techs with no pings */}
        {techsNoPing.map((tech) => (
          <Card key={tech.memberId} className="opacity-60">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-bold">
                  {tech.userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">{tech.userName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{tech.role.replace("_", " ")}</p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  No data
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                This tech hasn't shared their location yet.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Location History Panel */}
      {selectedTech && history && history.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                <RefreshCw size={13} className="inline-block mr-1.5 text-primary" />
                Location History (Last 50 pings)
              </h3>
              <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => setSelectedTech(null)}>
                Close
              </Button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {history.map((ping) => (
                <div key={ping._id} className="flex items-center justify-between text-xs bg-muted/20 rounded px-3 py-2">
                  <div className="flex items-center gap-2">
                    <MapPin size={11} className="text-primary shrink-0" />
                    <span className="font-mono text-muted-foreground">
                      {ping.lat.toFixed(5)}, {ping.lng.toFixed(5)}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(ping.timestamp), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
