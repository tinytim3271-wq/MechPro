import { createContext, useContext, useState, useCallback } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type LocationFilterContextValue = {
  selectedLocationId: Id<"locations"> | null;
  setSelectedLocationId: (id: Id<"locations"> | null) => void;
};

const LocationFilterContext = createContext<LocationFilterContextValue>({
  selectedLocationId: null,
  setSelectedLocationId: () => {},
});

export function LocationFilterProvider({ children }: { children: React.ReactNode }) {
  const [selectedLocationId, setSelectedLocationIdState] = useState<Id<"locations"> | null>(null);

  const setSelectedLocationId = useCallback((id: Id<"locations"> | null) => {
    setSelectedLocationIdState(id);
  }, []);

  return (
    <LocationFilterContext.Provider value={{ selectedLocationId, setSelectedLocationId }}>
      {children}
    </LocationFilterContext.Provider>
  );
}

export function useLocationFilter() {
  return useContext(LocationFilterContext);
}
