import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Wrench, Building2, ChevronRight, CheckCircle2, Rocket, ClipboardList, Users, FileText } from "lucide-react";
import { motion } from "motion/react";

const schema = z.object({
  name: z.string().min(2, "Shop name is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  bayCount: z.coerce.number().min(0).max(50),
  laborRate: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100),
});

type FormValues = z.infer<typeof schema>;

// ─── Welcome screen (step 1) ─────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-lg text-center space-y-8"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Wrench className="text-primary" size={36} />
          <h1
            className="text-5xl font-bold text-primary"
            style={{ fontFamily: "Rajdhani, sans-serif" }}
          >
            MechPro
          </h1>
        </div>
        <h2 className="text-2xl font-bold text-foreground">
          Welcome! Let{"'"}s set up your shop.
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          It only takes 60 seconds. After setup, you{"'"}ll be ready to create
          your first repair order and start getting paid faster.
        </p>
      </div>

      {/* What you'll get */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
        {[
          { icon: ClipboardList, label: "Create jobs & estimates" },
          { icon: Users, label: "Manage your team" },
          { icon: FileText, label: "Invoice & get paid" },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <Icon size={18} className="text-primary shrink-0" />
            <span className="text-sm text-foreground">{label}</span>
          </div>
        ))}
      </div>

      <Button size="lg" className="cursor-pointer gap-2" onClick={onNext}>
        <Rocket size={18} /> Get Started
      </Button>
    </motion.div>
  );
}

// ─── Shop setup form (step 2) ────────────────────────────────────────────────

function SetupStep() {
  const createOrg = useMutation(api.organizations.createOrg);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      bayCount: 6,
      laborRate: 120,
      taxRate: 8.25,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      await createOrg({
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        city: values.city || undefined,
        state: values.state || undefined,
        zip: values.zip || undefined,
        bayCount: values.bayCount,
        laborRate: values.laborRate,
        taxRate: values.taxRate,
      });
      toast.success("Shop created! Welcome to MechPro.");
    } catch {
      toast.error("Failed to create shop. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full max-w-2xl space-y-6"
    >
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 size={14} className="text-primary" />
        <span className="text-primary font-medium">Step 2 of 2</span>
        <span>— Tell us about your shop</span>
      </div>

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Wrench className="text-primary" size={32} />
          <h1
            className="text-4xl font-bold text-primary"
            style={{ fontFamily: "Rajdhani, sans-serif" }}
          >
            MechPro
          </h1>
        </div>
        <h2 className="text-2xl font-semibold text-foreground">Set Up Your Shop</h2>
        <p className="text-muted-foreground">
          You can update any of this later in Settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 size={20} className="text-primary" />
            Shop Information
          </CardTitle>
          <CardDescription>Only your shop name is required. Fill in the rest whenever you{"'"}re ready.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Shop name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shop Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Mike's Auto Repair" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 000-0000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="shop@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Address */}
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="Houston" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input placeholder="TX" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP</FormLabel>
                      <FormControl>
                        <Input placeholder="77001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Shop config */}
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="bayCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Bays</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={50} {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">0 = mobile only</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="laborRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Labor Rate ($/hr)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax Rate (%)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={100} step={0.01} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" className="w-full cursor-pointer" disabled={loading}>
                {loading ? "Creating shop..." : (
                  <span className="flex items-center gap-2">
                    Launch My Shop <ChevronRight size={16} />
                  </span>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Onboarding Page ─────────────────────────────────────────────────────

export default function OnboardingFlow() {
  const [step, setStep] = useState<"welcome" | "setup">("welcome");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      {step === "welcome" && <WelcomeStep onNext={() => setStep("setup")} />}
      {step === "setup" && <SetupStep />}
    </div>
  );
}
