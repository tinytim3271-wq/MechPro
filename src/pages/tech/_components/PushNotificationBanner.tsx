import { usePushNotifications } from "@/hooks/use-push-notifications.ts";
import { useConvexAuth } from "convex/react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";

export default function PushNotificationBanner() {
  const { isAuthenticated } = useConvexAuth();
  const { status, subscribe, unsubscribe } = usePushNotifications(isAuthenticated);

  // Don't show for unsupported browsers or in iframe
  if (status === "unsupported" || status === "iframe") return null;

  // Already subscribed — show small disable option
  if (status === "subscribed") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3">
        <BellRing size={16} className="text-green-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Push notifications enabled</p>
          <p className="text-xs text-muted-foreground">You&apos;ll get alerts when new jobs are assigned</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer text-xs text-muted-foreground"
          onClick={async () => {
            await unsubscribe();
            toast.success("Notifications disabled");
          }}
        >
          <BellOff size={12} className="mr-1" /> Disable
        </Button>
      </div>
    );
  }

  // Denied — show instructions
  if (status === "denied") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
        <BellOff size={16} className="text-red-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Notifications blocked</p>
          <p className="text-xs text-muted-foreground">
            Go to your browser settings and enable notifications for this site, then refresh
          </p>
        </div>
      </div>
    );
  }

  // Unsubscribed — show opt-in prompt
  return (
    <div className="flex items-center gap-3 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3">
      <Bell size={16} className="text-primary shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">Get job alerts on this device</p>
        <p className="text-xs text-muted-foreground">Get notified instantly when a new job is assigned to you</p>
      </div>
      <Button
        size="sm"
        className="cursor-pointer shrink-0"
        disabled={status === "loading"}
        onClick={async () => {
          const result = await subscribe();
          if ("subscribed" in result && result.subscribed) {
            toast.success("Notifications enabled! You'll get alerts for new jobs.");
          }
        }}
      >
        {status === "loading" ? "..." : "Enable"}
      </Button>
    </div>
  );
}
