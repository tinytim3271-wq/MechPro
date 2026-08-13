import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useAccess } from "@/hooks/use-access.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { CheckCircle, Zap, Shield, Wrench, Calendar, FileText, Users, Sparkles, MapPin, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";

const FEATURES = [
  "Unlimited repair orders & invoices",
  "Customer portal & online booking",
  "GPS tracking & smart dispatch",
  "AI diagnostics & cost estimates",
  "Team management & payroll",
  "Parts inventory tracking",
  "Marketing tools & campaigns",
  "Revenue analytics & reports",
  "SMS notifications",
  "Single-device security lock",
];

const HIGHLIGHTS = [
  { icon: Wrench, text: "Job management from intake to completion" },
  { icon: Calendar, text: "Route-optimized smart scheduling" },
  { icon: FileText, text: "Instant invoicing with payment links" },
  { icon: MapPin, text: "GPS dispatch for mobile crews" },
  { icon: Sparkles, text: "AI-powered diagnostics & estimates" },
  { icon: Users, text: "Team roles, certifications & payroll" },
];

type PlanOption = "monthly" | "sixMonth" | "annual";

export default function Paywall() {
  const [selectedPlan, setSelectedPlan] = useState<PlanOption>("annual");
  const [loading, setLoading] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const createCheckout = useAction(api.commerce.createCheckout);
  const { recheckAccess } = useAccess();

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const variantId =
        selectedPlan === "monthly"
          ? "var_monthly_29"
          : selectedPlan === "sixMonth"
            ? "var_six_month_149"
            : "var_annual_278";
      const result = await createCheckout({
        variantId,
        successUrl: `${window.location.origin}/dashboard?upgraded=1`,
        cancelUrl: window.location.href,
      });
      if (result.url) {
        window.open(result.url, "_blank");
      } else {
        toast.error("Could not create checkout session. Please try again.");
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <p className="text-xl font-bold text-primary" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            ⚙ MechPro
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield size={14} />
            Secure checkout
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-4xl w-full">
          {/* Headline */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
              <Zap size={12} /> 7-day free trial — no charge today
            </div>
            <h1
              className="text-3xl md:text-4xl font-bold text-foreground mb-3"
              style={{ fontFamily: "Rajdhani, sans-serif" }}
            >
              Choose Your MechPro Plan
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto">
              One subscription gives you full access to every feature. No hidden fees, no per-user charges — just the tools your team needs.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Pricing cards */}
            <div className="space-y-4">
              {/* Monthly */}
              <button
                onClick={() => setSelectedPlan("monthly")}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-5 transition-all cursor-pointer",
                  selectedPlan === "monthly"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-foreground">Monthly</span>
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                    selectedPlan === "monthly" ? "border-primary bg-primary" : "border-muted-foreground/40"
                  )}>
                    {selectedPlan === "monthly" && (
                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>$29</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Cancel anytime. No contracts.</p>
              </button>

              {/* Six Month */}
              <button
                onClick={() => setSelectedPlan("sixMonth")}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-5 transition-all cursor-pointer relative overflow-hidden",
                  selectedPlan === "sixMonth"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <span className="absolute top-2 right-3 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  BEST MID-TERM
                </span>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-foreground">6 Months</span>
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                    selectedPlan === "sixMonth" ? "border-primary bg-primary" : "border-muted-foreground/40"
                  )}>
                    {selectedPlan === "sixMonth" && (
                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>$149</span>
                  <span className="text-sm text-muted-foreground">/6 months</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Saves you $25 compared with paying monthly.
                </p>
              </button>

              {/* Annual */}
              <button
                onClick={() => setSelectedPlan("annual")}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-5 transition-all cursor-pointer relative overflow-hidden",
                  selectedPlan === "annual"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <span className="absolute top-2 right-3 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  SAVE 20%
                </span>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-foreground">Annual</span>
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                    selectedPlan === "annual" ? "border-primary bg-primary" : "border-muted-foreground/40"
                  )}>
                    {selectedPlan === "annual" && (
                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>$278</span>
                  <span className="text-sm text-muted-foreground">/year</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  That{"'"}s just $23/month. Best value.
                </p>
              </button>

              <Button
                size="lg"
                className="w-full cursor-pointer text-base font-semibold h-12"
                onClick={handleSubscribe}
                disabled={loading}
              >
                {loading ? "Opening checkout..." : "Start 7-Day Free Trial"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                No charge for 7 days. Cancel anytime during your trial.
              </p>

              {/* Team member notice */}
              <div className="mt-4 pt-4 border-t border-border/50 text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  Were you invited as a team member? You shouldn{"'"}t need your own plan.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer gap-2 text-xs"
                  disabled={rechecking}
                  onClick={async () => {
                    setRechecking(true);
                    await recheckAccess();
                    // Give a moment for state to update
                    setTimeout(() => setRechecking(false), 2000);
                  }}
                >
                  <RefreshCw size={12} className={rechecking ? "animate-spin" : ""} />
                  {rechecking ? "Checking..." : "Re-check my access"}
                </Button>
              </div>
            </div>

            {/* Features list */}
            <Card className="bg-card/50">
              <CardContent className="p-6">
                <h3 className="font-semibold text-foreground mb-4">Everything included:</h3>
                <ul className="space-y-3">
                  {FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-foreground/90">
                      <CheckCircle size={16} className="text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 pt-5 border-t border-border/50">
                  <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Key capabilities</h4>
                  <div className="grid grid-cols-1 gap-2.5">
                    {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                        <Icon size={14} className="text-primary/70 shrink-0" />
                        {text}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/50 px-6 py-4 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} MechPro. Secure payment processing. Cancel anytime.
      </footer>
    </div>
  );
}
