import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  Bell, MapPin, Navigation, LogOut as LogOutIcon, CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatDistanceToNow } from "date-fns";

const ICON_MAP: Record<string, React.ElementType> = {
  tech_arrived: MapPin,
  tech_left: LogOutIcon,
  tech_en_route: Navigation,
};

const COLOR_MAP: Record<string, string> = {
  tech_arrived: "text-green-400",
  tech_left: "text-muted-foreground",
  tech_en_route: "text-blue-400",
};

export default function NotificationBell() {
  const notifications = useQuery(api.jobTracking.getUnreadNotifications, {});
  const markRead = useMutation(api.jobTracking.markNotificationRead);
  const markAllRead = useMutation(api.jobTracking.markAllNotificationsRead);
  const [open, setOpen] = useState(false);

  const count = notifications?.length ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative cursor-pointer">
          <Bell size={18} />
          {count > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] bg-destructive text-destructive-foreground border-0 flex items-center justify-center"
            >
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {count > 0 && (
            <button
              className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1"
              onClick={() => void markAllRead({})}
            >
              <CheckCheck size={12} /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto">
          {count === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No new notifications
            </div>
          ) : (
            notifications?.map((n) => {
              const Icon = ICON_MAP[n.type] ?? Bell;
              const color = COLOR_MAP[n.type] ?? "text-muted-foreground";
              return (
                <button
                  key={n._id}
                  className="w-full text-left px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer flex items-start gap-3"
                  onClick={() => void markRead({ notificationId: n._id })}
                >
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted/50", color)}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
