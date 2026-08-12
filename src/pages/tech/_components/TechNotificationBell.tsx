import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet.tsx";
import {
  Bell, Wrench, CheckCheck, MapPin, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatDistanceToNow } from "date-fns";

export default function TechNotificationBell() {
  const notifications = useQuery(api.techNotifications.getUnread, {});
  const allNotifications = useQuery(api.techNotifications.getAll, {});
  const markRead = useMutation(api.techNotifications.markRead);
  const markAllRead = useMutation(api.techNotifications.markAllRead);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications?.length ?? 0;
  const displayList = open ? (allNotifications ?? []) : [];

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <Badge
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] bg-destructive text-destructive-foreground border-0 flex items-center justify-center"
          >
            {unreadCount}
          </Badge>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[75dvh] overflow-y-auto rounded-t-2xl">
          {/* Drag handle */}
          <div className="flex justify-center pt-1 pb-2">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <SheetHeader className="pb-3 border-b border-border">
            <SheetTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-lg" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                <Bell size={18} className="text-primary" />
                Notifications
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-xs">{unreadCount} new</Badge>
                )}
              </span>
              {unreadCount > 0 && (
                <button
                  className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1"
                  onClick={() => void markAllRead({})}
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="py-3 space-y-2">
            {displayList.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Bell size={24} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No notifications</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You&apos;ll be notified here when jobs are assigned to you
                </p>
              </div>
            ) : (
              displayList.map((n) => (
                <button
                  key={n._id}
                  className={cn(
                    "w-full text-left rounded-xl p-4 transition-colors cursor-pointer",
                    !n.isRead
                      ? "bg-primary/5 border border-primary/20 hover:bg-primary/10"
                      : "bg-muted/20 border border-border hover:bg-muted/40"
                  )}
                  onClick={() => {
                    if (!n.isRead) void markRead({ notificationId: n._id });
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                      n.type === "job_assigned" ? "bg-orange-500/15 text-orange-400" : "bg-muted text-muted-foreground"
                    )}>
                      <Wrench size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          "text-sm font-semibold truncate",
                          !n.isRead ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      {/* Body with formatted lines */}
                      <div className="mt-1.5 space-y-1">
                        {n.body.split("\n").map((line, i) => {
                          if (line.startsWith("Address:")) {
                            const addr = line.replace("Address: ", "");
                            return (
                              <a
                                key={i}
                                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 flex items-center gap-1 hover:underline cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MapPin size={10} /> {addr}
                              </a>
                            );
                          }
                          if (line.startsWith("Scheduled:")) {
                            return (
                              <p key={i} className="text-xs text-primary flex items-center gap-1">
                                <CalendarDays size={10} /> {line.replace("Scheduled: ", "")}
                              </p>
                            );
                          }
                          if (line.startsWith("Priority: HIGH")) {
                            return (
                              <p key={i} className="text-xs text-red-400 font-semibold">
                                {line}
                              </p>
                            );
                          }
                          return (
                            <p key={i} className="text-xs text-muted-foreground leading-relaxed">
                              {line}
                            </p>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 mt-2">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
