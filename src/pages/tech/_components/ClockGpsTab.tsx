import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Clock, MapPin, LogIn, LogOut, Navigation, Wifi, WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import { format } from "date-fns";
import { ConvexError } from "convex/values";

export default function ClockGpsTab() {
  const clockStatus = useQuery(api.timeclock.getMyClockStatus, {});
  const timeEntries = useQuery(api.timeclock.getMyTimeEntries, {});
  const clockIn = useMutation(api.timeclock.clockIn);
  const clockOut = useMutation(api.timeclock.clockOut);
  const sendPing = useMutation(api.timeclock.sendLocationPing);

  const [gpsActive, setGpsActive] = useState(false);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState("");

  // GPS is mandatory while clocked in — force-enable automatically
  useEffect(() => {
    if (clockStatus?.isClockedIn) {
      setGpsActive(true);
    } else {
      setGpsActive(false);
    }
  }, [clockStatus?.isClockedIn]);

  // Update elapsed time every second when clocked in
  useEffect(() => {
    if (!clockStatus?.isClockedIn || !clockStatus.currentEntry) return;
    const updateElapsed = () => {
      const start = new Date(clockStatus.currentEntry!.clockInAt).getTime();
      const diff = Date.now() - start;
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setElapsedTime(
        `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [clockStatus?.isClockedIn, clockStatus?.currentEntry]);

  // Get current position
  const getPosition = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        toast.error("Geolocation not available on this device");
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrentPos(coords);
          resolve(coords);
        },
        (err) => {
          if (err.code === 1) {
            toast.error("Location permission denied. Enable it in browser settings.");
          } else {
            toast.error("Could not get your location. Try again.");
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, []);

  // GPS tracking interval - send pings every 2 minutes when active
  useEffect(() => {
    if (!gpsActive || !clockStatus?.isClockedIn) return;

    const sendLocation = async () => {
      const pos = await getPosition();
      if (pos) {
        try {
          await sendPing({ lat: pos.lat, lng: pos.lng });
        } catch {
          // Silently fail pings
        }
      }
    };

    // Send immediately
    sendLocation();
    const interval = setInterval(sendLocation, 120000); // every 2 min
    return () => clearInterval(interval);
  }, [gpsActive, clockStatus?.isClockedIn, getPosition, sendPing]);

  const handleClockIn = async () => {
    setLoading(true);
    try {
      const pos = await getPosition();
      await clockIn({ lat: pos?.lat, lng: pos?.lng });
      setGpsActive(true);
      toast.success("Clocked in!");
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { message: string };
        toast.error(message);
      } else {
        toast.error("Failed to clock in");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    setLoading(true);
    try {
      const pos = await getPosition();
      await clockOut({ lat: pos?.lat, lng: pos?.lng });
      setGpsActive(false);
      toast.success("Clocked out!");
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { message: string };
        toast.error(message);
      } else {
        toast.error("Failed to clock out");
      }
    } finally {
      setLoading(false);
    }
  };

  // GPS is mandatory — no toggle allowed. It auto-enables on clock in.

  if (clockStatus === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const isClockedIn = clockStatus?.isClockedIn ?? false;

  // Group entries by day
  const todayEntries = (timeEntries ?? []).filter((e) => {
    const entryDate = e.clockInAt.slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return entryDate === today;
  });

  const todayHours = todayEntries.reduce((s, e) => s + (e.totalHours ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Clock In/Out Card */}
      <Card className={cn(
        "border-2 transition-colors",
        isClockedIn ? "border-green-500/50 bg-green-500/5" : "border-border"
      )}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={20} className={isClockedIn ? "text-green-400" : "text-muted-foreground"} />
              <span className="font-semibold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                {isClockedIn ? "On the Clock" : "Off the Clock"}
              </span>
            </div>
            <Badge
              variant="secondary"
              className={cn(
                "text-xs",
                isClockedIn ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground"
              )}
            >
              {isClockedIn ? "Active" : "Inactive"}
            </Badge>
          </div>

          {/* Timer display */}
          {isClockedIn && (
            <div className="text-center mb-4">
              <div
                className="text-4xl font-bold text-green-400 font-mono tracking-wider"
                style={{ fontFamily: "Rajdhani, sans-serif" }}
              >
                {elapsedTime}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Clocked in at {clockStatus?.currentEntry && format(new Date(clockStatus.currentEntry.clockInAt), "h:mm a")}
              </p>
            </div>
          )}

          {/* Clock button */}
          <Button
            className={cn(
              "w-full h-12 text-base font-semibold cursor-pointer",
              isClockedIn && "bg-red-600 hover:bg-red-700"
            )}
            onClick={isClockedIn ? handleClockOut : handleClockIn}
            disabled={loading}
          >
            {loading ? (
              "Getting location..."
            ) : isClockedIn ? (
              <>
                <LogOut size={18} className="mr-2" /> Clock Out
              </>
            ) : (
              <>
                <LogIn size={18} className="mr-2" /> Clock In
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* GPS Tracking Card — mandatory, no toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Navigation size={16} className={gpsActive ? "text-primary animate-pulse" : "text-muted-foreground"} />
              <div>
                <p className="text-sm font-medium text-foreground">GPS Tracking</p>
                <p className="text-xs text-muted-foreground">
                  {gpsActive ? "Sharing location every 2 min" : isClockedIn ? "Activating..." : "Active while clocked in"}
                </p>
              </div>
            </div>
            <Badge
              variant="secondary"
              className={cn(
                "text-xs",
                gpsActive
                  ? "bg-green-500/20 text-green-400 border-green-500/30"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {gpsActive ? (
                <><Wifi size={12} className="mr-1" /> Active</>
              ) : (
                <><WifiOff size={12} className="mr-1" /> Idle</>
              )}
            </Badge>
          </div>

          {currentPos && (
            <div className="mt-3 bg-muted/30 rounded-md px-3 py-2 flex items-center gap-2">
              <MapPin size={13} className="text-primary shrink-0" />
              <span className="text-xs text-muted-foreground font-mono">
                {currentPos.lat.toFixed(5)}, {currentPos.lng.toFixed(5)}
              </span>
            </div>
          )}

          {isClockedIn && (
            <p className="text-[10px] text-muted-foreground mt-2">
              GPS tracking is required while on the clock.
            </p>
          )}

          {!isClockedIn && (
            <p className="text-xs text-muted-foreground mt-2">
              Clock in to start — GPS activates automatically.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Today's Hours */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
              Today's Hours
            </p>
            <span className="text-lg font-bold text-primary font-mono">
              {(todayHours + (isClockedIn ? parseFloat(elapsedTime.split(":")[0] || "0") + parseFloat(elapsedTime.split(":")[1] || "0") / 60 : 0)).toFixed(1)}h
            </span>
          </div>

          {todayEntries.length === 0 && !isClockedIn ? (
            <p className="text-xs text-muted-foreground">No time entries today. Clock in to start tracking.</p>
          ) : (
            <div className="space-y-2">
              {todayEntries.map((entry) => (
                <div key={entry._id} className="flex items-center justify-between text-xs bg-muted/20 rounded px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      entry.clockOutAt ? "bg-muted-foreground" : "bg-green-500 animate-pulse"
                    )} />
                    <span className="text-foreground font-medium">
                      {format(new Date(entry.clockInAt), "h:mm a")}
                      {entry.clockOutAt ? ` – ${format(new Date(entry.clockOutAt), "h:mm a")}` : " – now"}
                    </span>
                  </div>
                  <span className="text-muted-foreground font-mono">
                    {entry.totalHours ? `${entry.totalHours.toFixed(1)}h` : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent History */}
      {timeEntries && timeEntries.length > todayEntries.length && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "Rajdhani, sans-serif" }}>
              Recent History
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {timeEntries
                .filter((e) => e.clockInAt.slice(0, 10) !== new Date().toISOString().slice(0, 10))
                .slice(0, 20)
                .map((entry) => (
                  <div key={entry._id} className="flex items-center justify-between text-xs bg-muted/20 rounded px-3 py-2">
                    <div>
                      <span className="text-foreground font-medium">
                        {format(new Date(entry.clockInAt), "MMM d")}
                      </span>
                      <span className="text-muted-foreground ml-2">
                        {format(new Date(entry.clockInAt), "h:mm a")}
                        {entry.clockOutAt ? ` – ${format(new Date(entry.clockOutAt), "h:mm a")}` : ""}
                      </span>
                    </div>
                    <span className="text-primary font-mono font-medium">
                      {entry.totalHours ? `${entry.totalHours.toFixed(1)}h` : "—"}
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
