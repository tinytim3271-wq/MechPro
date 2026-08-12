import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Settings, UserPlus, Car, MessageSquare, Share2,
  CheckCircle2, Circle, ChevronRight, Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useState } from "react";

type SetupStep = {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  complete: boolean;
  action: () => void;
};

export default function SetupChecklist({ onStartIntake }: { onStartIntake: () => void }) {
  const checklist = useQuery(api.dashboard.getSetupChecklist, {});
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  // Don't render until we know the status
  if (checklist === undefined || checklist === null) return null;

  const steps: SetupStep[] = [
    {
      id: "shop_info",
      label: "Configure your shop",
      description: "Add phone, address, and set your labor rate",
      icon: Settings,
      complete: checklist.shopInfoComplete,
      action: () => navigate("/settings"),
    },
    {
      id: "invite_team",
      label: "Invite your team",
      description: "Add mechanics and service writers",
      icon: UserPlus,
      complete: checklist.teamInvited,
      action: () => navigate("/employees"),
    },
    {
      id: "first_intake",
      label: "Create your first intake",
      description: "Add a customer, vehicle, and repair order",
      icon: Car,
      complete: checklist.firstIntakeComplete,
      action: onStartIntake,
    },
    {
      id: "sms_setup",
      label: "Send your first message",
      description: "Text a customer from the Messages page",
      icon: MessageSquare,
      complete: checklist.smsSetup,
      action: () => navigate("/messages"),
    },
    {
      id: "booking_link",
      label: "Share your booking link",
      description: "Let customers book appointments online",
      icon: Share2,
      complete: checklist.bookingLinkShared,
      action: () => {
        const url = `${window.location.origin}/book`;
        navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          toast.success("Booking link copied to clipboard!");
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
          toast.error("Could not copy link");
        });
      },
    },
  ];

  const completedCount = steps.filter((s) => s.complete).length;
  const totalSteps = steps.length;
  const allDone = completedCount === totalSteps;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  // Hide once all steps are complete
  if (allDone) return null;

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-transparent overflow-hidden">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
              <Rocket size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-sm" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                Setup Your Shop
              </h2>
              <p className="text-xs text-muted-foreground">
                {completedCount} of {totalSteps} steps complete
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary">{progressPercent}%</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-muted mb-4 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-1.5">
          {steps.map((step) => (
            <button
              key={step.id}
              onClick={step.action}
              disabled={step.complete}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                step.complete
                  ? "opacity-60"
                  : "hover:bg-primary/5 cursor-pointer group"
              )}
            >
              {/* Check icon */}
              {step.complete ? (
                <CheckCircle2 size={18} className="text-green-500 shrink-0" />
              ) : (
                <Circle size={18} className="text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
              )}

              {/* Icon */}
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                step.complete ? "bg-green-500/10" : "bg-muted"
              )}>
                <step.icon size={14} className={step.complete ? "text-green-500" : "text-muted-foreground group-hover:text-primary transition-colors"} />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium",
                  step.complete ? "text-muted-foreground line-through" : "text-foreground"
                )}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">{step.description}</p>
              </div>

              {/* Arrow */}
              {!step.complete && (
                <ChevronRight size={14} className="text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
