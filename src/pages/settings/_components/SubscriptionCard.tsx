import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { CreditCard, Monitor, ExternalLink, Trash2, Smartphone, Laptop } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function SubscriptionCard() {
  const [openingPortal, setOpeningPortal] = useState(false);
  const [removingId, setRemovingId] = useState<Id<"deviceSessions"> | null>(null);
  const getBillingPortal = useAction(api.commerce.getBillingPortal);
  const removeDevice = useMutation(api.deviceSession.removeDevice);
  const releaseAll = useMutation(api.deviceSession.releaseDeviceLock);
  const devices = useQuery(api.deviceSession.listMyDevices, {});

  const handleManageSubscription = async () => {
    setOpeningPortal(true);
    try {
      const result = await getBillingPortal({ returnUrl: window.location.href });
      if (result.url) {
        window.open(result.url, "_blank");
      } else {
        toast.error("Could not open billing portal.");
      }
    } catch {
      toast.error("No active subscription found.");
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleRemoveDevice = async (deviceId: Id<"deviceSessions">) => {
    setRemovingId(deviceId);
    try {
      await removeDevice({ deviceId });
      toast.success("Device removed successfully.");
    } catch {
      toast.error("Failed to remove device.");
    } finally {
      setRemovingId(null);
    }
  };

  const handleReleaseAll = async () => {
    try {
      await releaseAll({});
      toast.success("All devices released. They will need to log in again.");
    } catch {
      toast.error("Failed to release devices.");
    }
  };

  // Get current session token to identify this device
  const currentToken = localStorage.getItem("mechpro_device_session") ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard size={16} className="text-primary" /> Subscription & Devices
        </CardTitle>
        <CardDescription>
          Manage your subscription and logged-in devices (max 3).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Manage subscription */}
        <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border bg-muted/20">
          <div>
            <p className="text-sm font-medium text-foreground">Subscription</p>
            <p className="text-xs text-muted-foreground">Update payment method, view invoices, or cancel</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="cursor-pointer shrink-0"
            onClick={handleManageSubscription}
            disabled={openingPortal}
          >
            <ExternalLink size={13} className="mr-1" />
            {openingPortal ? "Opening..." : "Manage"}
          </Button>
        </div>

        {/* Device list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Monitor size={14} className="text-primary" /> Logged-In Devices
            </p>
            {devices && devices.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer text-xs text-muted-foreground h-7"
                onClick={handleReleaseAll}
              >
                Remove All
              </Button>
            )}
          </div>

          {devices && devices.length > 0 ? (
            <div className="rounded-lg border border-border divide-y divide-border">
              {devices.map((device) => (
                <div key={device._id} className="flex items-center justify-between p-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 text-muted-foreground">
                      {device.deviceName.includes("iPhone") || device.deviceName.includes("Android") ? (
                        <Smartphone size={14} />
                      ) : (
                        <Laptop size={14} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {device.deviceName}
                        {device.sessionToken === currentToken && (
                          <span className="ml-2 text-primary font-normal">(this device)</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Last active: {format(new Date(device.lastActiveAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                    onClick={() => handleRemoveDevice(device._id)}
                    disabled={removingId === device._id}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground p-3 rounded-lg border border-border bg-muted/20">
              No devices registered yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
