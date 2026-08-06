import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useLocationFilter } from "@/hooks/use-location-filter.tsx";
import { MapPin, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";

export default function LocationSwitcher() {
  const locations = useQuery(api.locations.listLocations, {});
  const { selectedLocationId, setSelectedLocationId } = useLocationFilter();

  // Don't show if there are 0 or 1 locations
  if (!locations || locations.length <= 1) return null;

  const selectedLocation = locations.find((l) => l._id === selectedLocationId);
  const label = selectedLocation ? selectedLocation.name : "All Locations";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer",
            "bg-muted/40 hover:bg-muted/70 transition-colors text-left",
            selectedLocationId && "ring-1 ring-primary/30"
          )}
        >
          <MapPin size={14} className="text-primary shrink-0" />
          <span className="flex-1 truncate font-medium text-foreground">{label}</span>
          <ChevronDown size={13} className="text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onClick={() => setSelectedLocationId(null)}
          className="cursor-pointer"
        >
          <MapPin size={13} className="mr-2 text-muted-foreground" />
          <span className="flex-1">All Locations</span>
          {!selectedLocationId && <Check size={13} className="text-primary" />}
        </DropdownMenuItem>
        {locations.map((loc) => (
          <DropdownMenuItem
            key={loc._id}
            onClick={() => setSelectedLocationId(loc._id as Id<"locations">)}
            className="cursor-pointer"
          >
            <MapPin size={13} className="mr-2 text-muted-foreground" />
            <span className="flex-1 truncate">{loc.name}</span>
            {selectedLocationId === loc._id && <Check size={13} className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
