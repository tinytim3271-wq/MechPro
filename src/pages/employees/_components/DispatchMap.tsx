import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type MechanicLocation = {
  memberId: string;
  memberName: string;
  role: string;
  latestPing: {
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp: string;
  } | null;
};

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DispatchMap({ mechanics }: { mechanics: MechanicLocation[] }) {
  const withLocation = mechanics.filter((m) => m.latestPing !== null);

  // Default center: US center if no mechanics have location
  const center: [number, number] =
    withLocation.length > 0
      ? [withLocation[0].latestPing!.lat, withLocation[0].latestPing!.lng]
      : [39.5, -98.35];

  const zoom = withLocation.length > 0 ? 12 : 4;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="w-full rounded-lg"
      style={{ height: "420px" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {withLocation.map((m) => (
        <div key={m.memberId}>
          <Marker position={[m.latestPing!.lat, m.latestPing!.lng]}>
            <Popup>
              <div className="text-sm font-semibold">{m.memberName}</div>
              <div className="text-xs text-gray-500 capitalize">{m.role.replace("_", " ")}</div>
              <div className="text-xs text-gray-400 mt-1">
                {formatTimeAgo(m.latestPing!.timestamp)}
              </div>
              {m.latestPing!.accuracy && (
                <div className="text-xs text-gray-400">
                  ±{Math.round(m.latestPing!.accuracy)}m accuracy
                </div>
              )}
            </Popup>
          </Marker>
          {m.latestPing!.accuracy && (
            <Circle
              center={[m.latestPing!.lat, m.latestPing!.lng]}
              radius={m.latestPing!.accuracy}
              pathOptions={{ color: "#f97316", fillOpacity: 0.1, weight: 1 }}
            />
          )}
        </div>
      ))}
    </MapContainer>
  );
}
