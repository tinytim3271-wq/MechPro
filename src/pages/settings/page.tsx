import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated } from "convex/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Settings, Building2, DollarSign, Percent, Wrench, MessageSquare, Car, HelpCircle, ChevronDown, Package } from "lucide-react";
import ShareLinksCard from "./_components/ShareLinksCard.tsx";
import SubscriptionCard from "./_components/SubscriptionCard.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const shopSchema = z.object({
  name: z.string().min(2, "Shop name is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
});

const ratesSchema = z.object({
  taxRate: z.coerce.number().min(0, "Must be ≥ 0").max(100, "Must be ≤ 100"),
  laborRate: z.coerce.number().min(0, "Must be ≥ 0"),
  bayCount: z.coerce.number().int().min(0).max(50),
});

type ShopValues = z.infer<typeof shopSchema>;
type RatesValues = z.infer<typeof ratesSchema>;

function SettingsInner() {
  const org = useQuery(api.organizations.getCurrentOrg, {});
  const updateOrg = useMutation(api.organizations.updateOrg);
  const [savingShop, setSavingShop] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [savingSms, setSavingSms] = useState(false);

  // SMS state
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsTemplateStart, setSmsTemplateStart] = useState("");
  const [smsTemplateComplete, setSmsTemplateComplete] = useState("");
  const [smsLoaded, setSmsLoaded] = useState(false);

  // Carfax state
  const [carfaxEnabled, setCarfaxEnabled] = useState(false);
  const [carfaxPartnerKey, setCarfaxPartnerKey] = useState("");
  const [carfaxLocationId, setCarfaxLocationId] = useState("");
  const [carfaxLoaded, setCarfaxLoaded] = useState(false);
  const [savingCarfax, setSavingCarfax] = useState(false);

  // Auto fees state
  const [shopSupplyEnabled, setShopSupplyEnabled] = useState(false);
  const [shopSupplyPercent, setShopSupplyPercent] = useState("");
  const [shopSupplyCap, setShopSupplyCap] = useState("");
  const [hazmatEnabled, setHazmatEnabled] = useState(false);
  const [hazmatPercent, setHazmatPercent] = useState("");
  const [hazmatCap, setHazmatCap] = useState("");
  const [feesLoaded, setFeesLoaded] = useState(false);
  const [savingFees, setSavingFees] = useState(false);

  const shopForm = useForm<ShopValues>({
    resolver: zodResolver(shopSchema),
    values: org
      ? {
          name: org.name,
          phone: org.phone ?? "",
          email: org.email ?? "",
          address: org.address ?? "",
          city: org.city ?? "",
          state: org.state ?? "",
          zip: org.zip ?? "",
        }
      : undefined,
  });

  const ratesForm = useForm<RatesValues>({
    resolver: zodResolver(ratesSchema),
    values: org
      ? {
          taxRate: org.taxRate,
          laborRate: org.laborRate,
          bayCount: org.bayCount,
        }
      : undefined,
  });

  if (org === undefined) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6 text-muted-foreground">No shop found. Please complete onboarding to get started.</div>
    );
  }

  // Load SMS settings from org (once)
  if (org && !smsLoaded) {
    setSmsEnabled(org.smsEnabled ?? false);
    setSmsTemplateStart(org.smsTemplateStart ?? "");
    setSmsTemplateComplete(org.smsTemplateComplete ?? "");
    setSmsLoaded(true);
  }

  // Load Carfax settings from org (once)
  if (org && !carfaxLoaded) {
    setCarfaxEnabled(org.carfaxEnabled ?? false);
    setCarfaxPartnerKey(org.carfaxPartnerKey ?? "");
    setCarfaxLocationId(org.carfaxLocationId ?? "");
    setCarfaxLoaded(true);
  }

  // Load auto fee settings from org (once)
  if (org && !feesLoaded) {
    setShopSupplyEnabled(org.shopSupplyFeeEnabled ?? false);
    setShopSupplyPercent(org.shopSupplyFeePercent ? String(org.shopSupplyFeePercent) : "");
    setShopSupplyCap(org.shopSupplyFeeCap ? String(org.shopSupplyFeeCap) : "");
    setHazmatEnabled(org.hazmatFeeEnabled ?? false);
    setHazmatPercent(org.hazmatFeePercent ? String(org.hazmatFeePercent) : "");
    setHazmatCap(org.hazmatFeeCap ? String(org.hazmatFeeCap) : "");
    setFeesLoaded(true);
  }

  const handleSaveShop = async (values: ShopValues) => {
    setSavingShop(true);
    try {
      await updateOrg({
        orgId: org._id as Id<"organizations">,
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        city: values.city || undefined,
        state: values.state || undefined,
        zip: values.zip || undefined,
      });
      toast.success("Shop information saved");
    } catch {
      toast.error("Failed to save shop information");
    } finally {
      setSavingShop(false);
    }
  };

  const handleSaveRates = async (values: RatesValues) => {
    setSavingRates(true);
    try {
      await updateOrg({
        orgId: org._id as Id<"organizations">,
        taxRate: values.taxRate,
        laborRate: values.laborRate,
        bayCount: values.bayCount,
      });
      toast.success("Rates & billing settings saved");
    } catch {
      toast.error("Failed to save rates");
    } finally {
      setSavingRates(false);
    }
  };

  const handleSaveSms = async () => {
    setSavingSms(true);
    try {
      await updateOrg({
        orgId: org._id as Id<"organizations">,
        smsEnabled,
        smsTemplateStart: smsTemplateStart || undefined,
        smsTemplateComplete: smsTemplateComplete || undefined,
      });
      toast.success("Messaging settings saved");
    } catch {
      toast.error("Failed to save messaging settings");
    } finally {
      setSavingSms(false);
    }
  };

  const handleSaveCarfax = async () => {
    setSavingCarfax(true);
    try {
      await updateOrg({
        orgId: org._id as Id<"organizations">,
        carfaxEnabled,
        carfaxPartnerKey: carfaxPartnerKey || undefined,
        carfaxLocationId: carfaxLocationId || undefined,
      });
      toast.success("Carfax settings saved");
    } catch {
      toast.error("Failed to save Carfax settings");
    } finally {
      setSavingCarfax(false);
    }
  };

  const handleSaveFees = async () => {
    setSavingFees(true);
    try {
      await updateOrg({
        orgId: org._id as Id<"organizations">,
        shopSupplyFeeEnabled: shopSupplyEnabled,
        shopSupplyFeePercent: shopSupplyPercent ? parseFloat(shopSupplyPercent) : undefined,
        shopSupplyFeeCap: shopSupplyCap ? parseFloat(shopSupplyCap) : undefined,
        hazmatFeeEnabled: hazmatEnabled,
        hazmatFeePercent: hazmatPercent ? parseFloat(hazmatPercent) : undefined,
        hazmatFeeCap: hazmatCap ? parseFloat(hazmatCap) : undefined,
      });
      toast.success("Auto fee settings saved");
    } catch {
      toast.error("Failed to save fee settings");
    } finally {
      setSavingFees(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="text-primary" size={28} />
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Settings
          </h1>
          <p className="text-muted-foreground text-sm">Manage your shop settings</p>
        </div>
      </div>

      {/* Shop Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 size={18} className="text-primary" />
            Shop Information
          </CardTitle>
          <CardDescription>
            Your shop details appear on invoices and customer communications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...shopForm}>
            <form onSubmit={shopForm.handleSubmit(handleSaveShop)} className="space-y-5">
              <FormField
                control={shopForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shop Name *</FormLabel>
                    <FormControl><Input placeholder="Mike's Auto Repair" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={shopForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl><Input placeholder="(555) 000-0000" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={shopForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input placeholder="shop@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={shopForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl><Input placeholder="123 Main St" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={shopForm.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl><Input placeholder="Houston" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={shopForm.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl><Input placeholder="TX" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={shopForm.control}
                  name="zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP</FormLabel>
                      <FormControl><Input placeholder="77001" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={savingShop} className="cursor-pointer">
                  {savingShop ? "Saving..." : "Save Shop Details"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Rates & Billing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign size={18} className="text-primary" />
            Rates & Billing
          </CardTitle>
          <CardDescription>
            Tax rate and labor rate apply to all new repair orders. Bay count controls your bay board.
          </CardDescription>
        </CardHeader>
        {/* Rates help */}
        <div className="px-6 pb-2">
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <div className="flex items-start gap-2">
              <HelpCircle size={14} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Tip:</strong> Your labor rate is the default hourly rate applied to new repair orders. You can override it per job.
                Set <strong className="text-foreground">Service Bays to 0</strong> if you&apos;re mobile-only — this hides the bay board on your dashboard.
              </p>
            </div>
          </div>
        </div>
        <CardContent>
          <Form {...ratesForm}>
            <form onSubmit={ratesForm.handleSubmit(handleSaveRates)} className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={ratesForm.control}
                  name="taxRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <Percent size={13} /> Tax Rate (%)
                      </FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={100} step={0.01} {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">e.g. 8.25</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={ratesForm.control}
                  name="laborRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <DollarSign size={13} /> Labor Rate ($/hr)
                      </FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step={0.01} {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">Default hourly rate</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={ratesForm.control}
                  name="bayCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <Wrench size={13} /> Service Bays
                      </FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={50} step={1} {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">0 = mobile only</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Preview */}
              <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 text-sm space-y-1">
                <p className="font-medium text-foreground text-xs uppercase tracking-wide mb-2">Preview</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Labor (1 hr)</span>
                  <span>${ratesForm.watch("laborRate") || 0}/hr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax rate</span>
                  <span>{ratesForm.watch("taxRate") || 0}%</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1">
                  <span className="text-muted-foreground">Example invoice ($100 labor)</span>
                  <span className="font-semibold">
                    ${(100 * (1 + (ratesForm.watch("taxRate") || 0) / 100)).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={savingRates} className="cursor-pointer">
                  {savingRates ? "Saving..." : "Save Rates"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Auto Shop Fees */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package size={18} className="text-primary" />
            Auto Shop Fees
          </CardTitle>
          <CardDescription>
            These fees are automatically calculated and added to every repair order based on the labor + parts subtotal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Shop Supplies */}
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Shop Supplies Fee</p>
                <p className="text-xs text-muted-foreground">Covers rags, cleaners, lubricants, and other consumables</p>
              </div>
              <Switch checked={shopSupplyEnabled} onCheckedChange={setShopSupplyEnabled} />
            </div>

            {shopSupplyEnabled && (
              <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Percentage of Subtotal (%)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="5"
                    value={shopSupplyPercent}
                    onChange={(e) => setShopSupplyPercent(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">e.g. 5 = 5% of labor + parts</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Maximum Cap ($)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="50.00"
                    value={shopSupplyCap}
                    onChange={(e) => setShopSupplyCap(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank for no cap</p>
                </div>
              </div>
            )}
          </div>

          {/* Hazmat Disposal */}
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Hazardous Materials Disposal</p>
                <p className="text-xs text-muted-foreground">Covers oil, coolant, brake fluid, and other hazardous waste disposal</p>
              </div>
              <Switch checked={hazmatEnabled} onCheckedChange={setHazmatEnabled} />
            </div>

            {hazmatEnabled && (
              <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Percentage of Subtotal (%)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="3"
                    value={hazmatPercent}
                    onChange={(e) => setHazmatPercent(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">e.g. 3 = 3% of labor + parts</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Maximum Cap ($)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="35.00"
                    value={hazmatCap}
                    onChange={(e) => setHazmatCap(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank for no cap</p>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          {(shopSupplyEnabled || hazmatEnabled) && (
            <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-foreground text-xs uppercase tracking-wide mb-2">Example on a $500 job</p>
              {shopSupplyEnabled && shopSupplyPercent && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shop Supplies ({shopSupplyPercent}%)</span>
                  <span>
                    ${Math.min(500 * (parseFloat(shopSupplyPercent) / 100), shopSupplyCap ? parseFloat(shopSupplyCap) : Infinity).toFixed(2)}
                  </span>
                </div>
              )}
              {hazmatEnabled && hazmatPercent && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hazmat Disposal ({hazmatPercent}%)</span>
                  <span>
                    ${Math.min(500 * (parseFloat(hazmatPercent) / 100), hazmatCap ? parseFloat(hazmatCap) : Infinity).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSaveFees} disabled={savingFees} className="cursor-pointer">
              {savingFees ? "Saving..." : "Save Fee Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Share Your Links (Booking + Portal) */}
      {org && <ShareLinksCard orgId={org._id} orgName={org.name} />}

      {/* Subscription & Device Management */}
      <SubscriptionCard />

      {/* SMS / Messaging */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare size={18} className="text-primary" />
            Messaging
          </CardTitle>
          <CardDescription>
            Customize your text message templates. Messages are sent from your device&apos;s built-in messaging app — no extra service needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Auto-send toggles */}
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Enable messaging templates</p>
              <p className="text-xs text-muted-foreground">Pre-fill messages when texting customers from MechPro</p>
            </div>
            <Switch checked={smsEnabled} onCheckedChange={setSmsEnabled} />
          </div>

          {smsEnabled && (
            <>
              {/* Message templates */}
              <div className="space-y-4 pt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Message Templates
                </p>
                <p className="text-xs text-muted-foreground">
                  Customize the messages pre-filled when you text customers. Use these variables: {"{"}{"{"}<span className="font-mono text-primary">name</span>{"}"}{"}"},
                  {" "}{"{"}{"{"}<span className="font-mono text-primary">vehicle</span>{"}"}{"}"},
                  {" "}{"{"}{"{"}<span className="font-mono text-primary">roNumber</span>{"}"}{"}"},
                  {" "}{"{"}{"{"}<span className="font-mono text-primary">shopName</span>{"}"}{"}"},
                  {" "}{"{"}{"{"}<span className="font-mono text-primary">shopPhone</span>{"}"}{"}"}.
                  Leave blank to use the default message.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">Work Started Message</label>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                      placeholder="Hi {{name}}, work has begun on your {{vehicle}} (RO# {{roNumber}}). We'll text you when it's ready! - {{shopName}}"
                      value={smsTemplateStart}
                      onChange={(e) => setSmsTemplateStart(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">Ready for Pickup Message</label>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                      placeholder="Hi {{name}}, your {{vehicle}} is ready for pickup! (RO# {{roNumber}}). Call us at {{shopPhone}} with any questions. - {{shopName}}"
                      value={smsTemplateComplete}
                      onChange={(e) => setSmsTemplateComplete(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSaveSms} disabled={savingSms} className="cursor-pointer">
              {savingSms ? "Saving..." : "Save Messaging Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Carfax Service Network */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car size={18} className="text-primary" />
            Carfax Service Network
          </CardTitle>
          <CardDescription>
            Automatically report completed service history to Carfax. Requires enrollment in the Carfax Service Network.
          </CardDescription>
        </CardHeader>
        {/* Carfax setup help */}
        <div className="px-6 pb-2">
          <details className="group rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground flex items-center gap-2 select-none">
              <HelpCircle size={14} className="text-blue-500 shrink-0" />
              How to join the Carfax Service Network
              <ChevronDown size={14} className="text-muted-foreground ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <ol className="mt-3 space-y-2 text-xs text-muted-foreground list-decimal list-inside leading-relaxed">
              <li>Visit <a href="https://www.carfaxserviceshops.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">carfaxserviceshops.com</a> and enroll your shop (free)</li>
              <li>Once approved, Carfax sends you a <strong className="text-foreground">Partner Key</strong> and <strong className="text-foreground">Location ID</strong> by email</li>
              <li>Paste both values below and enable reporting</li>
              <li>Completed repair orders will show a &quot;Report to Carfax&quot; button</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              Reporting to Carfax builds your shop&apos;s reputation and helps customers see their full service history.
            </p>
          </details>
        </div>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Enable Carfax Reporting</p>
              <p className="text-xs text-muted-foreground">Show {"\""}Report to Carfax{"\""} button on completed repair orders</p>
            </div>
            <Switch
              checked={carfaxEnabled}
              onCheckedChange={setCarfaxEnabled}
            />
          </div>

          {carfaxEnabled && (
            <>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Partner Key</label>
                  <Input
                    type="password"
                    placeholder="Your Carfax partner API key"
                    value={carfaxPartnerKey}
                    onChange={(e) => setCarfaxPartnerKey(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Location ID</label>
                  <Input
                    placeholder="Your Carfax-assigned shop/location ID"
                    value={carfaxLocationId}
                    onChange={(e) => setCarfaxLocationId(e.target.value)}
                  />
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  To get your credentials, enroll your shop in the{" "}
                  <a href="https://www.carfaxserviceshops.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Carfax Service Network
                  </a>
                  . Contact Carfax at servicenetworksupport@carfax.com for Partner Key and Location ID.
                </p>
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSaveCarfax} disabled={savingCarfax} className="cursor-pointer">
              {savingCarfax ? "Saving..." : "Save Carfax Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center"><SignInButton /></div>
      </Unauthenticated>
      <Authenticated>
        <SettingsInner />
      </Authenticated>
    </>
  );
}
