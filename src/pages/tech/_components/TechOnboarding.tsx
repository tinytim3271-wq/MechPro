import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Clock, Wrench, RefreshCw, DollarSign, ChevronRight, HardHat, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

const STORAGE_KEY = "mechpro_tech_onboarding_seen";

const STEPS = [
  {
    icon: Clock,
    title: "Clock In & Out",
    description: "Tap the Clock / GPS tab to start and end your shift. GPS tracking activates automatically when you clock in so your manager can see your location.",
    color: "text-blue-500 bg-blue-500/15",
  },
  {
    icon: Wrench,
    title: "View Your Jobs",
    description: "The My Jobs tab shows all repair orders assigned to you. Tap any job to see full details including vehicle info, parts, and customer notes.",
    color: "text-orange-500 bg-orange-500/15",
  },
  {
    icon: RefreshCw,
    title: "Update Job Status",
    description: "Inside a job, tap the status button to move it to In Progress or Completed. Add tech notes and capture the customer signature when done.",
    color: "text-green-500 bg-green-500/15",
  },
  {
    icon: DollarSign,
    title: "View Your Pay",
    description: "The My Pay tab shows your hours worked, jobs completed, and estimated earnings for the current pay period based on your rate.",
    color: "text-primary bg-primary/15",
  },
] as const;

export default function TechOnboarding() {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setOpen(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleDismiss();
    }
  };

  const isLast = currentStep === STEPS.length - 1;
  const step = STEPS[currentStep];

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <HardHat size={20} className="text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                  Welcome to Tech Portal
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Here&apos;s a quick overview to get you started
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Step content */}
        <div className="px-6 pb-2">
          <div className="flex items-start gap-4 py-4">
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", step.color)}>
              <step.icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-foreground text-sm mb-1">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          </div>
        </div>

        {/* Progress dots + actions */}
        <div className="px-6 pb-5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  i === currentStep ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Skip
            </Button>
            <Button size="sm" onClick={handleNext} className="cursor-pointer gap-1">
              {isLast ? (
                <>
                  <Sparkles size={14} />
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <ChevronRight size={14} />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
