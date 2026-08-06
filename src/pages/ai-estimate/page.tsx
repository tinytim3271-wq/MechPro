import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { ConvexError } from "convex/values";

import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";

import {
  Sparkles,
  Plus,
  Printer,
  Save,
  Receipt,
  Target,
  Lightbulb,
  AlertTriangle,
  Wrench,
  ClipboardCheck,
  Search,
  Car,
  User,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AIEstimateResult = {
  probableCauses: Array<{ cause: string; likelihood: "high" | "medium" | "low"; explanation: string }>;
  laborLines: Array<{ description: string; laborHours: number; laborRate: number; techNotes?: string }>;
  partLines: Array<{ description: string; partNumber?: string; quantity: number; unitCost: number; unitPrice: number }>;
  shopFees: Array<{ description: string; amount: number }>;
  diagnosticChecklist: Array<{
    item: string;
    category?: "visual" | "electrical" | "mechanical" | "scan_tool" | "measurement";
    toolsRequired?: string[];
    verificationCriteria?: string;
  }>;
  repairChecklist: Array<{
    step: number;
    title: string;
    details: string;
    toolsRequired?: string[];
    torqueSpecs?: string;
    warning?: string;
  }>;
  recommendedServices: Array<{ service: string; reason: string; estimatedCost?: number }>;
  cause: string;
  ambiguityFlag?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AIEstimatePage() {
  return (
    <div className="min-h-screen bg-background">
      <AuthLoading>
        <div className="flex items-center justify-center min-h-screen">
          <Spinner className="h-8 w-8" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="text-center space-y-4">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground" />
              <h2 className="text-xl font-semibold">Sign in Required</h2>
              <p className="text-muted-foreground">
                Please sign in to access the AI Estimate Generator.
              </p>
            </CardContent>
          </Card>
        </div>
      </Unauthenticated>
      <Authenticated>
        <AIEstimateContent />
      </Authenticated>
    </div>
  );
}

// ─── Content (Authenticated) ──────────────────────────────────────────────────

function AIEstimateContent() {
  const navigate = useNavigate();
  const org = useQuery(api.organizations.getCurrentOrg, {});
  const customers = useQuery(api.customers.listAllCustomers, {});
  const generateEstimate = useAction(api.ai.generateStandaloneEstimate);
  const createRO = useMutation(api.repairOrders.createRO);

  // State
  const [selectedCustomerId, setSelectedCustomerId] = useState<Id<"customers"> | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<Id<"vehicles"> | null>(null);
  const [complaint, setComplaint] = useState("");
  const [notes, setNotes] = useState("");
  const [aiResult, setAiResult] = useState<AIEstimateResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  // Checklist local state
  const [diagnosticChecks, setDiagnosticChecks] = useState<Record<number, boolean>>({});
  const [repairChecks, setRepairChecks] = useState<Record<number, boolean>>({});

  // Ref for print
  const outputRef = useRef<HTMLDivElement>(null);

  // Vehicle query (skip if no customer selected)
  const vehicles = useQuery(
    api.customers.listVehicles,
    selectedCustomerId ? { customerId: selectedCustomerId } : "skip"
  );

  // Filter customers client-side
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!customerSearch.trim()) return customers;
    const term = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term)
    );
  }, [customers, customerSearch]);

  // Selected customer/vehicle data
  const selectedCustomer = useMemo(
    () => customers?.find((c) => c._id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );
  const selectedVehicle = useMemo(
    () => vehicles?.find((v) => v._id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId]
  );

  // Generate AI estimate handler
  const handleGenerate = async () => {
    if (!selectedCustomerId) {
      toast.error("Please select a customer");
      return;
    }
    if (!selectedVehicle) {
      toast.error("Please select a vehicle");
      return;
    }
    if (!complaint.trim()) {
      toast.error("Please enter a complaint or concern");
      return;
    }
    if (!org) {
      toast.error("Organization data not loaded yet");
      return;
    }

    const vehicleStr = `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}${selectedVehicle.engine ? ` ${selectedVehicle.engine}` : ""}`;

    setIsGenerating(true);
    setAiResult(null);
    setDiagnosticChecks({});
    setRepairChecks({});

    try {
      const result = await generateEstimate({
        vehicle: vehicleStr,
        complaint: complaint.trim(),
        additionalNotes: notes.trim() || undefined,
        laborRate: org.laborRate,
        taxRate: org.taxRate,
      });
      setAiResult(result);
    } catch (error) {
      if (error instanceof ConvexError) {
        const { message } = error.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error("Failed to generate estimate. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Save to work order
  const handleSaveToRO = async () => {
    if (!selectedCustomerId || !selectedVehicleId || !complaint.trim()) {
      toast.error("Please select a customer, vehicle, and enter a complaint");
      return;
    }
    try {
      await createRO({
        customerId: selectedCustomerId,
        vehicleId: selectedVehicleId,
        complaint: complaint.trim(),
        priority: "normal",
        isMobile: false,
      });
      toast.success("Work order created successfully!");
      navigate("/jobs");
    } catch (error) {
      if (error instanceof ConvexError) {
        const { message } = error.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error("Failed to create work order");
      }
    }
  };

  // Print current tab content
  const handlePrint = () => {
    if (outputRef.current) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head><title>AI Estimate</title>
              <style>
                body { font-family: system-ui, sans-serif; padding: 2rem; }
                table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background: #f5f5f5; font-weight: 600; }
                .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
                .badge-high { background: #fee2e2; color: #dc2626; }
                .badge-medium { background: #fef3c7; color: #d97706; }
                .badge-low { background: #dbeafe; color: #2563eb; }
                h2 { margin-top: 1.5rem; }
              </style>
            </head>
            <body>${outputRef.current.innerHTML}</body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  // Convert to invoice handler
  const handleConvertToInvoice = () => {
    toast.info("Create a Work Order first, then convert to invoice");
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AI Estimate Generator</h1>
          <p className="text-sm text-muted-foreground">
            Generate detailed repair estimates powered by AI
          </p>
        </div>
      </div>

      {/* Intake Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5" />
            Intake Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Customer & Vehicle Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Customer
              </Label>
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search customers..."
                    value={selectedCustomer ? selectedCustomer.name : customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setSelectedCustomerId(null);
                      setSelectedVehicleId(null);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    className="pl-9"
                  />
                </div>
                {showCustomerDropdown && !selectedCustomer && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredCustomers.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        No customers found
                      </div>
                    ) : (
                      filteredCustomers.map((customer) => (
                        <button
                          key={customer._id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent cursor-pointer transition-colors"
                          onClick={() => {
                            setSelectedCustomerId(customer._id);
                            setCustomerSearch("");
                            setSelectedVehicleId(null);
                            setShowCustomerDropdown(false);
                          }}
                        >
                          <span className="font-medium">{customer.name}</span>
                          {customer.phone && (
                            <span className="text-muted-foreground ml-2">
                              {customer.phone}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {selectedCustomer && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs cursor-pointer"
                    onClick={() => {
                      setSelectedCustomerId(null);
                      setSelectedVehicleId(null);
                      setCustomerSearch("");
                    }}
                  >
                    Clear
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => setShowAddCustomer(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Customer
                </Button>
              </div>
            </div>

            {/* Vehicle Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                Vehicle
              </Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedVehicleId ?? ""}
                onChange={(e) =>
                  setSelectedVehicleId(
                    e.target.value ? (e.target.value as Id<"vehicles">) : null
                  )
                }
                disabled={!selectedCustomerId}
              >
                <option value="">
                  {!selectedCustomerId
                    ? "Select a customer first"
                    : "Select a vehicle..."}
                </option>
                {vehicles?.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.year} {v.make} {v.model}
                    {v.engine ? ` - ${v.engine}` : ""}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                className="cursor-pointer"
                disabled={!selectedCustomerId}
                onClick={() => setShowAddVehicle(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Vehicle
              </Button>
            </div>
          </div>

          {/* Complaint & Notes */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Customer Complaint
              </Label>
              <Textarea
                placeholder="Describe the issue the customer is experiencing... (e.g., 'Engine makes knocking noise when accelerating above 3000 RPM')"
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                className="min-h-[120px] resize-y"
              />
            </div>
            <div className="space-y-2">
              <Label>Additional Notes (Optional)</Label>
              <Textarea
                placeholder="Any extra context, previous repairs, or special requests..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[60px] resize-y"
              />
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex justify-center pt-2">
            <Button
              size="lg"
              className="cursor-pointer gap-2 px-8"
              onClick={handleGenerate}
              disabled={isGenerating || !selectedVehicle || !complaint.trim()}
            >
              {isGenerating ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Generating Estimate...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Generate AI Estimate
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Output Panel */}
      {(isGenerating || aiResult) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="h-5 w-5" />
              AI Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <Spinner className="h-10 w-10" />
                <p className="text-muted-foreground font-medium">
                  Analyzing vehicle data and generating estimate...
                </p>
                <p className="text-xs text-muted-foreground">
                  This may take 15-30 seconds
                </p>
              </div>
            ) : aiResult ? (
              <div ref={outputRef}>
                <Tabs defaultValue="estimate">
                  <TabsList className="w-full md:w-auto">
                    <TabsTrigger value="estimate" className="gap-1.5">
                      <Receipt className="h-4 w-4" />
                      Estimate
                    </TabsTrigger>
                    <TabsTrigger value="diagnostic" className="gap-1.5">
                      <ClipboardCheck className="h-4 w-4" />
                      Diagnostic Checklist
                    </TabsTrigger>
                    <TabsTrigger value="repair" className="gap-1.5">
                      <Wrench className="h-4 w-4" />
                      Repair Procedure
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab 1: Estimate */}
                  <TabsContent value="estimate" className="mt-4 space-y-6">
                    <EstimateTab result={aiResult} />
                  </TabsContent>

                  {/* Tab 2: Diagnostic Checklist */}
                  <TabsContent value="diagnostic" className="mt-4">
                    <DiagnosticTab
                      checklist={aiResult.diagnosticChecklist}
                      checks={diagnosticChecks}
                      onToggle={(idx) =>
                        setDiagnosticChecks((prev) => ({
                          ...prev,
                          [idx]: !prev[idx],
                        }))
                      }
                    />
                  </TabsContent>

                  {/* Tab 3: Repair Procedure */}
                  <TabsContent value="repair" className="mt-4">
                    <RepairTab
                      steps={aiResult.repairChecklist}
                      checks={repairChecks}
                      onToggle={(idx) =>
                        setRepairChecks((prev) => ({
                          ...prev,
                          [idx]: !prev[idx],
                        }))
                      }
                    />
                  </TabsContent>
                </Tabs>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Footer Actions */}
      {aiResult && (
        <div className="flex flex-wrap items-center justify-center gap-3 pb-6">
          <Button
            className="cursor-pointer gap-2"
            onClick={handleSaveToRO}
          >
            <Save className="h-4 w-4" />
            Save to Work Order
          </Button>
          <Button
            variant="secondary"
            className="cursor-pointer gap-2"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button
            variant="secondary"
            className="cursor-pointer gap-2"
            onClick={handleConvertToInvoice}
          >
            <Receipt className="h-4 w-4" />
            Convert to Invoice
          </Button>
        </div>
      )}

      {/* Add Customer Dialog */}
      <AddCustomerDialog
        open={showAddCustomer}
        onOpenChange={setShowAddCustomer}
        onCreated={(id) => {
          setSelectedCustomerId(id);
          setSelectedVehicleId(null);
          setCustomerSearch("");
        }}
      />

      {/* Add Vehicle Dialog */}
      <AddVehicleDialog
        open={showAddVehicle}
        onOpenChange={setShowAddVehicle}
        customerId={selectedCustomerId}
        onCreated={(id) => setSelectedVehicleId(id)}
      />
    </div>
  );
}

// ─── Estimate Tab ─────────────────────────────────────────────────────────────

function EstimateTab({ result }: { result: AIEstimateResult }) {
  const likelihoodColors: Record<string, string> = {
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };

  return (
    <div className="space-y-6">
      {/* Ambiguity Warning */}
      {result.ambiguityFlag && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-300">
              Ambiguity Warning
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              {result.ambiguityFlag}
            </p>
          </div>
        </div>
      )}

      {/* Probable Causes */}
      <div>
        <h3 className="font-semibold text-base mb-3">Probable Causes</h3>
        <div className="space-y-2">
          {result.probableCauses.map((cause, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card"
            >
              <Badge
                className={cn(
                  "shrink-0 mt-0.5 border-0",
                  likelihoodColors[cause.likelihood]
                )}
              >
                {cause.likelihood}
              </Badge>
              <div>
                <p className="font-medium text-sm">{cause.cause}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cause.explanation}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Labor Table */}
      <div>
        <h3 className="font-semibold text-base mb-3">Labor</h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-right p-3 font-medium">Hours</th>
                <th className="text-right p-3 font-medium">Rate</th>
                <th className="text-right p-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.laborLines.map((line, i) => (
                <tr key={i} className="border-t">
                  <td className="p-3">{line.description}</td>
                  <td className="p-3 text-right">{line.laborHours}</td>
                  <td className="p-3 text-right">${line.laborRate.toFixed(2)}</td>
                  <td className="p-3 text-right font-medium">
                    ${(line.laborHours * line.laborRate).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parts Table */}
      <div>
        <h3 className="font-semibold text-base mb-3">Parts</h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-left p-3 font-medium">Part #</th>
                <th className="text-right p-3 font-medium">Qty</th>
                <th className="text-right p-3 font-medium">Unit Cost</th>
                <th className="text-right p-3 font-medium">Unit Price</th>
                <th className="text-right p-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.partLines.map((line, i) => (
                <tr key={i} className="border-t">
                  <td className="p-3">{line.description}</td>
                  <td className="p-3 text-muted-foreground">
                    {line.partNumber ?? "—"}
                  </td>
                  <td className="p-3 text-right">{line.quantity}</td>
                  <td className="p-3 text-right">${line.unitCost.toFixed(2)}</td>
                  <td className="p-3 text-right">${line.unitPrice.toFixed(2)}</td>
                  <td className="p-3 text-right font-medium">
                    ${(line.quantity * line.unitPrice).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shop Fees */}
      {result.shopFees.length > 0 && (
        <div>
          <h3 className="font-semibold text-base mb-3">Shop Fees</h3>
          <div className="space-y-1.5">
            {result.shopFees.map((fee, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 rounded bg-muted/30"
              >
                <span className="text-sm">{fee.description}</span>
                <span className="text-sm font-medium">
                  ${fee.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals Summary */}
      <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span className="font-medium">${result.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Tax</span>
          <span className="font-medium">${result.taxAmount.toFixed(2)}</span>
        </div>
        <div className="border-t pt-2 flex justify-between text-base font-bold">
          <span>Grand Total</span>
          <span>${result.totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* Recommended Additional Services */}
      {result.recommendedServices.length > 0 && (
        <div>
          <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            Recommended Additional Services
          </h3>
          <div className="space-y-2">
            {result.recommendedServices.map((svc, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-4 p-3 rounded-lg border"
              >
                <div>
                  <p className="font-medium text-sm">{svc.service}</p>
                  <p className="text-xs text-muted-foreground">{svc.reason}</p>
                </div>
                {svc.estimatedCost !== undefined && (
                  <span className="text-sm font-medium text-muted-foreground shrink-0">
                    ~${svc.estimatedCost.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Diagnostic Tab ───────────────────────────────────────────────────────────

function DiagnosticTab({
  checklist,
  checks,
  onToggle,
}: {
  checklist: AIEstimateResult["diagnosticChecklist"];
  checks: Record<number, boolean>;
  onToggle: (idx: number) => void;
}) {
  const categoryColors: Record<string, string> = {
    visual: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    electrical: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    mechanical: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    scan_tool: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    measurement: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {Object.values(checks).filter(Boolean).length} of {checklist.length} completed
        </p>
      </div>
      {checklist.map((item, i) => (
        <div
          key={i}
          className={cn(
            "flex items-start gap-3 p-4 rounded-lg border transition-colors",
            checks[i] && "bg-muted/30 border-primary/20"
          )}
        >
          <input
            type="checkbox"
            checked={checks[i] ?? false}
            onChange={() => onToggle(i)}
            className="mt-1 h-4 w-4 rounded border-input cursor-pointer accent-primary"
          />
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <p
                className={cn(
                  "font-medium text-sm",
                  checks[i] && "line-through text-muted-foreground"
                )}
              >
                {item.item}
              </p>
              {item.category && (
                <Badge
                  className={cn(
                    "text-[10px] border-0",
                    categoryColors[item.category] ?? "bg-muted text-foreground"
                  )}
                >
                  {item.category.replace("_", " ")}
                </Badge>
              )}
            </div>
            {item.toolsRequired && item.toolsRequired.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Tools:</span>{" "}
                {item.toolsRequired.join(", ")}
              </p>
            )}
            {item.verificationCriteria && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Verify:</span>{" "}
                {item.verificationCriteria}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Repair Tab ───────────────────────────────────────────────────────────────

function RepairTab({
  steps,
  checks,
  onToggle,
}: {
  steps: AIEstimateResult["repairChecklist"];
  checks: Record<number, boolean>;
  onToggle: (idx: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {Object.values(checks).filter(Boolean).length} of {steps.length} steps
          completed
        </p>
      </div>
      {steps.map((step, i) => (
        <div
          key={i}
          className={cn(
            "flex items-start gap-3 p-4 rounded-lg border transition-colors",
            checks[i] && "bg-muted/30 border-primary/20"
          )}
        >
          <input
            type="checkbox"
            checked={checks[i] ?? false}
            onChange={() => onToggle(i)}
            className="mt-1 h-4 w-4 rounded border-input cursor-pointer accent-primary"
          />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                {step.step}
              </span>
              <p
                className={cn(
                  "font-medium text-sm",
                  checks[i] && "line-through text-muted-foreground"
                )}
              >
                {step.title}
              </p>
            </div>
            <p className="text-sm text-muted-foreground pl-8">{step.details}</p>
            {step.toolsRequired && step.toolsRequired.length > 0 && (
              <p className="text-xs text-muted-foreground pl-8">
                <Wrench className="inline h-3 w-3 mr-1" />
                <span className="font-medium">Tools:</span>{" "}
                {step.toolsRequired.join(", ")}
              </p>
            )}
            {step.torqueSpecs && (
              <p className="text-xs text-muted-foreground pl-8">
                <span className="font-medium">Torque:</span> {step.torqueSpecs}
              </p>
            )}
            {step.warning && (
              <div className="flex items-center gap-1.5 text-xs text-yellow-700 dark:text-yellow-400 pl-8">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{step.warning}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Add Customer Dialog ──────────────────────────────────────────────────────

function AddCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: Id<"customers">) => void;
}) {
  const createCustomer = useMutation(api.customers.createCustomer);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const id = await createCustomer({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      });
      toast.success("Customer created successfully");
      onCreated(id);
      onOpenChange(false);
      setName("");
      setPhone("");
      setEmail("");
    } catch (error) {
      if (error instanceof ConvexError) {
        const { message } = error.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error("Failed to create customer");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Add New Customer
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              placeholder="John Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              placeholder="example@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="cursor-pointer"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner className="h-4 w-4 mr-2" /> : null}
            Create Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Vehicle Dialog ───────────────────────────────────────────────────────

function AddVehicleDialog({
  open,
  onOpenChange,
  customerId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: Id<"customers"> | null;
  onCreated: (id: Id<"vehicles">) => void;
}) {
  const createVehicle = useMutation(api.customers.createVehicle);
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [mileage, setMileage] = useState("");
  const [vin, setVin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!customerId) {
      toast.error("No customer selected");
      return;
    }
    if (!year.trim() || !make.trim() || !model.trim()) {
      toast.error("Year, make, and model are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const id = await createVehicle({
        customerId,
        year: year.trim(),
        make: make.trim(),
        model: model.trim(),
        engine: engine.trim() || undefined,
        mileageIn: mileage ? Number(mileage) : undefined,
        vin: vin.trim() || undefined,
      });
      toast.success("Vehicle added successfully");
      onCreated(id);
      onOpenChange(false);
      setYear("");
      setMake("");
      setModel("");
      setEngine("");
      setMileage("");
      setVin("");
    } catch (error) {
      if (error instanceof ConvexError) {
        const { message } = error.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error("Failed to add vehicle");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Add New Vehicle
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Year *</Label>
              <Input
                placeholder="2021"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Make *</Label>
              <Input
                placeholder="Ford"
                value={make}
                onChange={(e) => setMake(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Model *</Label>
              <Input
                placeholder="F-150"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Engine</Label>
              <Input
                placeholder="5.0L V8"
                value={engine}
                onChange={(e) => setEngine(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Mileage</Label>
              <Input
                type="number"
                placeholder="45000"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>VIN</Label>
            <Input
              placeholder="1FTFW1E50MFA12345"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="cursor-pointer"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner className="h-4 w-4 mr-2" /> : null}
            Add Vehicle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
