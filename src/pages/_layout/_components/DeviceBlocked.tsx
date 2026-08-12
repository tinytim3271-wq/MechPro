import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useAuth } from "@/hooks/use-auth.ts";
import { Button } from "@/components/ui/button.tsx";
import { Monitor, AlertTriangle, Trash2, Smartphone, Laptop } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function DeviceBlocked() {
  const { removeUser } = useAuth();
  const devices = useQuery(api.deviceSession.listMyDevices, {});
  const removeDevice = useMutation(api.deviceSession.removeDevice);
  const [removingId, setRemovingId] = useState<Id<"deviceSessions"> | null>(null);

  const handleRemoveDevice = async (deviceId: Id<"deviceSessions">) => {
    setRemovingId(deviceId);
    try {
      await removeDevice({ deviceId });
      toast.success("Device removed. Try refreshing to log in.");
    } catch {
      toast.error("Failed to remove device.");
    } finally {
      setRemovingId(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await removeUser();
      window.location.href = "/";
    } catch {
      sessionStorage.clear();
      localStorage.removeItem("mechpro_device_session");
      window.location.href = "/";
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <Monitor size={28} className="text-destructive" />
        </div>

        <div className="space-y-2">
          <h1
            className="text-2xl font-bold text-foreground"
            style={{ fontFamily: "Rajdhani, sans-serif" }}
          >
            Device Limit Reached
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            You already have 3 devices logged in. Remove one below to free up a spot for this device.
          </p>
        </div>

        {/* Device list */}
        {devices && devices.length > 0 && (
          <div className="rounded-lg border border-border bg-card divide-y divide-border text-left">
            {devices.map((device) => (
              <div key={device._id} className="flex items-center justify-between p-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 text-muted-foreground">
                    {device.deviceName.includes("iPhone") || device.deviceName.includes("Android") ? (
                      <Smartphone size={16} />
                    ) : (
                      <Laptop size={16} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {device.deviceName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last active: {format(new Date(device.lastActiveAt), "MMM d, h:mm a")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleRemoveDevice(device._id)}
                  disabled={removingId === device._id}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}

        {devices && devices.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-4 text-left">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                No devices found. Try refreshing the page to register this device.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Button
            className="w-full cursor-pointer"
            onClick={() => {
              localStorage.removeItem("mechpro_device_session");
              window.location.reload();
            }}
          >
            Try Again
          </Button>
          <Button
            variant="ghost"
            className="w-full cursor-pointer text-muted-foreground"
            onClick={handleSignOut}
          >
            Sign Out
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Remove a device you{"'"}re no longer using, then click {"\""}Try Again{"\""}  to log in here.
        </p>
      </div>
    </div>
  );
}
