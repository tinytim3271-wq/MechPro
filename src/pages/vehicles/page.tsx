import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Authenticated, Unauthenticated } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";
import VehicleHistoryPanel from "@/components/VehicleHistoryPanel.tsx";
import { Car, Search, Loader2, Keyboard, AlertTriangle, Info, User } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type VehicleSelection = {
  vin?: string;
  make: string;
  model: string;
  year: number;
};

function VehiclesInner() {
  const decodeVin = useAction(api.vin.decodeVin);
  const navigate = useNavigate();

  const [vinInput, setVinInput] = useState("");
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualYear, setManualYear] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<VehicleSelection | null>(null);

  // Search existing vehicles in the database by VIN
  const existingVehicle = useQuery(
    api.vehicles.findByVin,
    selection?.vin ? { vin: selection.vin } : "skip"
  );

  const handleVinLookup = async () => {
    const vin = vinInput.trim().toUpperCase();
    if (vin.length < 11) {
      setError("Enter at least 11 characters for a valid VIN.");
      return;
    }
    setLoading(true);
    setError(null);
    setSelection(null);
    try {
      const data = await decodeVin({ vin });
      if (!data.make || !data.model || !data.year) {
        setError("Could not decode a make, model, and year from that VIN.");
        return;
      }
      const yearNum = Number(data.year);
      setSelection({
        vin,
        make: data.make,
        model: data.model,
        year: Number.isNaN(yearNum) ? new Date().getFullYear() : yearNum,
      });
      toast.success(`Decoded ${data.year} ${data.make} ${data.model}`);
    } catch {
      setError("VIN lookup failed. Please check the VIN and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualLookup = () => {
    const yearNum = Number(manualYear.trim());
    if (!manualMake.trim() || !manualModel.trim() || !manualYear.trim()) {
      setError("Enter make, model, and year.");
      return;
    }
    if (Number.isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
      setError("Enter a valid year.");
      return;
    }
    setError(null);
    setSelection({
      make: manualMake.trim(),
      model: manualModel.trim(),
      year: yearNum,
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div>
          <h1
            className="text-2xl font-bold text-foreground flex items-center gap-2"
            style={{ fontFamily: "Rajdhani, sans-serif" }}
          >
            <Car size={24} className="text-primary" /> Vehicle Lookup
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Look up any vehicle by VIN or make/model/year to check recalls, safety ratings, and service history.
          </p>
        </div>

        {/* Use case hint */}
        <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <Info size={15} className="text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Use this when you have a VIN or vehicle info but don&apos;t know if the customer is already in your system.
            After looking up the vehicle, you can check if it&apos;s linked to an existing customer.
          </p>
        </div>

        {/* Input card */}
        <Card>
          <CardContent>
            <Tabs defaultValue="vin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="vin" className="cursor-pointer">
                  <Keyboard size={14} className="mr-1.5" /> VIN Lookup
                </TabsTrigger>
                <TabsTrigger value="manual" className="cursor-pointer">
                  <Search size={14} className="mr-1.5" /> Year / Make / Model
                </TabsTrigger>
              </TabsList>

              {/* VIN mode */}
              <TabsContent value="vin" className="mt-4 space-y-3">
                <div>
                  <Label>VIN</Label>
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    17-character Vehicle Identification Number (found on driver-side dashboard, driver door jamb, or vehicle registration)
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 1FTFW1ET0BFC01234"
                      value={vinInput}
                      onChange={(e) => setVinInput(e.target.value.toUpperCase())}
                      maxLength={17}
                      className="font-mono tracking-wider uppercase flex-1"
                      onKeyDown={(e) => e.key === "Enter" && handleVinLookup()}
                    />
                    <Button
                      onClick={handleVinLookup}
                      disabled={loading || vinInput.trim().length < 11}
                      className="cursor-pointer shrink-0 gap-1.5"
                    >
                      {loading ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Search size={15} />
                      )}
                      {loading ? "Decoding..." : "Look Up"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Manual mode */}
              <TabsContent value="manual" className="mt-4 space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Don&apos;t have the VIN? Enter the vehicle details to check recalls and safety ratings.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Year</Label>
                    <Input
                      placeholder="2020"
                      value={manualYear}
                      onChange={(e) => setManualYear(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Make</Label>
                    <Input
                      placeholder="Toyota"
                      value={manualMake}
                      onChange={(e) => setManualMake(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Model</Label>
                    <Input
                      placeholder="Camry"
                      value={manualModel}
                      onChange={(e) => setManualModel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
                    />
                  </div>
                </div>
                <Button onClick={handleManualLookup} className="w-full cursor-pointer gap-2">
                  <Search size={14} /> Check Vehicle
                </Button>
              </TabsContent>
            </Tabs>

            {error && (
              <div className="mt-3 flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                <AlertTriangle size={14} className="text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Existing customer link */}
        {selection && existingVehicle && (
          <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
            <User size={16} className="text-green-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                This vehicle is linked to <span className="text-green-400">{existingVehicle.customerName}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {existingVehicle.year} {existingVehicle.make} {existingVehicle.model} — {existingVehicle.roCount} repair order{existingVehicle.roCount !== 1 ? "s" : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer shrink-0"
              onClick={() => navigate(`/customers?id=${existingVehicle.customerId}`)}
            >
              View Customer
            </Button>
          </div>
        )}

        {selection && existingVehicle === null && (
          <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
            <Info size={16} className="text-yellow-400 shrink-0" />
            <p className="text-sm text-muted-foreground">
              This vehicle is not in your system yet. It will be added when you create a repair order for it.
            </p>
          </div>
        )}

        {/* Results */}
        {selection ? (
          <VehicleHistoryPanel
            vin={selection.vin}
            make={selection.make}
            model={selection.model}
            year={selection.year}
          />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Car />
              </EmptyMedia>
              <EmptyTitle>Look up a vehicle</EmptyTitle>
              <EmptyDescription>
                Enter a VIN or vehicle details above to check recalls, complaints, safety ratings, and whether it&apos;s already linked to a customer.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}

export default function VehiclesPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <SignInButton />
        </div>
      </Unauthenticated>
      <Authenticated>
        <VehiclesInner />
      </Authenticated>
    </>
  );
}
