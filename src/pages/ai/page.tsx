import { useState, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Sparkles, Stethoscope, BookOpen, Phone, AlertTriangle, CheckCircle, Clock, Wrench, Printer, Lightbulb, ChevronDown, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { printElement } from "./_lib/print.ts";
import { EstimatorTabWithAuth } from "./_components/EstimatorTab.tsx";
import { Calculator } from "lucide-react";
import { Link } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type DiagnoseResult = {
  probableCauses: Array<{ cause: string; likelihood: string; explanation: string }>;
  recommendedTests: string[];
  urgency: string;
  estimatedLaborHours: number;
  additionalNotes: string;
};

type RepairGuideResult = {
  title: string;
  difficulty: string;
  estimatedTime: string;
  toolsRequired: string[];
  partsNeeded: string[];
  steps: Array<{ stepNumber: number; title: string; details: string; warning?: string }>;
  safetyNotes: string[];
  proTips: string[];
};

type PhoneAssistantResult = {
  customerName: string;
  vehicle: string;
  symptoms: string;
  recommendedServices: Array<{ service: string; estimatedCost: string; urgency: string }>;
  suggestedResponse: string;
  followUpQuestions: string[];
  bookingRecommended: boolean;
};

function aiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function likelihoodColor(l: string) {
  if (l === "High") return "bg-destructive/20 text-destructive border-destructive/30";
  if (l === "Medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function urgencyColor(u: string) {
  if (u === "Immediate") return "destructive";
  if (u === "Soon") return "secondary";
  return "outline";
}

function difficultyColor(d: string) {
  if (d === "Expert") return "destructive";
  if (d === "Advanced") return "secondary";
  return "outline";
}

// ─── Diagnostics Tab ─────────────────────────────────────────────────────────

function DiagnosticsTab() {
  const diagnose = useAction(api.ai.diagnose);
  const [vehicle, setVehicle] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [dtcCodes, setDtcCodes] = useState("");
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!vehicle.trim() || !symptoms.trim()) {
      toast.error("Please enter vehicle and symptoms");
      return;
    }
    setLoading(true);
    try {
      const res = await diagnose({ vehicle, symptoms, dtcCodes: dtcCodes || undefined });
      setResult(res);
    } catch (err) {
      toast.error(aiErrorMessage(err, "Diagnostics failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Stethoscope size={18} className="text-primary" /> AI Diagnostics
          </CardTitle>
          <CardDescription>Enter symptoms and DTC codes to get probable causes and repair recommendations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5">
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5 text-yellow-500" />
              <span><strong className="text-foreground">Disclaimer:</strong> AI diagnostics are for informational purposes only and are not a substitute for professional inspection. Always verify results with qualified technician expertise before relying on them.</span>
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Input placeholder="e.g. 2018 Ford F-150 5.0L V8" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>DTC Codes (optional)</Label>
              <Input placeholder="e.g. P0300, P0171" value={dtcCodes} onChange={(e) => setDtcCodes(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Symptoms / Customer Complaint</Label>
            <Textarea
              placeholder="e.g. Engine misfire at idle, rough running, check engine light on, hesitation on acceleration"
              rows={3}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
            />
          </div>
          <Button onClick={handleRun} disabled={loading} className="w-full md:w-auto cursor-pointer">
            {loading ? <><Spinner className="mr-2" />Analyzing...</> : <><Sparkles size={16} className="mr-2" />Run Diagnostics</>}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4">
          {/* Printable hidden version */}
          <div id="diagnostics-print" style={{ display: "none" }}>
            <h1>Diagnostic Report</h1>
            <p><strong>Vehicle:</strong> {vehicle}</p>
            <p><strong>Symptoms:</strong> {symptoms}</p>
            {dtcCodes && <p><strong>DTC Codes:</strong> {dtcCodes}</p>}
            <p><strong>Urgency:</strong> {result.urgency} &nbsp;&nbsp; <strong>Est. Labor:</strong> {result.estimatedLaborHours}h</p>
            <h2>Probable Causes</h2>
            <table>
              <thead><tr><th>Cause</th><th>Likelihood</th><th>Explanation</th></tr></thead>
              <tbody>
                {result.probableCauses.map((c, i) => (
                  <tr key={i}><td>{c.cause}</td><td>{c.likelihood}</td><td>{c.explanation}</td></tr>
                ))}
              </tbody>
            </table>
            <h2>Recommended Tests</h2>
            <ul>{result.recommendedTests.map((t, i) => <li key={i}>{t}</li>)}</ul>
            {result.additionalNotes && <><h2>Additional Notes</h2><p>{result.additionalNotes}</p></>}
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <Badge variant={urgencyColor(result.urgency) as "destructive" | "secondary" | "outline"} className="text-sm px-3 py-1">
                Urgency: {result.urgency}
              </Badge>
              <Badge variant="outline" className="text-sm px-3 py-1">
                <Clock size={14} className="mr-1" />Est. {result.estimatedLaborHours}h labor
              </Badge>
            </div>
            <Button size="sm" variant="secondary" className="cursor-pointer" onClick={() => printElement("diagnostics-print", `Diagnostic — ${vehicle}`)}>
              <Printer size={14} className="mr-1.5" /> Print
            </Button>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Probable Causes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {result.probableCauses.map((c, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{c.cause}</span>
                    <span className={cn("text-xs border rounded px-2 py-0.5", likelihoodColor(c.likelihood))}>
                      {c.likelihood}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.explanation}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Recommended Tests</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {result.recommendedTests.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle size={14} className="text-primary mt-0.5 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {result.additionalNotes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Additional Notes</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{result.additionalNotes}</p></CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Repair Guide Tab ─────────────────────────────────────────────────────────

function RepairGuideTab() {
  const repairGuide = useAction(api.ai.repairGuide);
  const [vehicle, setVehicle] = useState("");
  const [repair, setRepair] = useState("");
  const [result, setResult] = useState<RepairGuideResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!vehicle.trim() || !repair.trim()) {
      toast.error("Please enter vehicle and repair");
      return;
    }
    setLoading(true);
    try {
      const res = await repairGuide({ vehicle, repair });
      setResult(res);
    } catch (err) {
      toast.error(aiErrorMessage(err, "Failed to generate guide. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen size={18} className="text-primary" /> AI Repair Guide
          </CardTitle>
          <CardDescription>Get step-by-step repair instructions for any vehicle and service</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Input placeholder="e.g. 2015 Chevrolet Silverado 5.3L" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Repair / Service</Label>
              <Input placeholder="e.g. Replace front struts" value={repair} onChange={(e) => setRepair(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleRun} disabled={loading} className="w-full md:w-auto cursor-pointer">
            {loading ? <><Spinner className="mr-2" />Generating...</> : <><BookOpen size={16} className="mr-2" />Generate Guide</>}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4">
          {/* Printable version */}
          <div id="guide-print" style={{ display: "none" }}>
            <h1>{result.title}</h1>
            <p><strong>Difficulty:</strong> {result.difficulty} &nbsp;&nbsp; <strong>Est. Time:</strong> {result.estimatedTime}</p>
            <h2>Tools Required</h2>
            <ul>{result.toolsRequired.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <h2>Parts Needed</h2>
            <ul>{result.partsNeeded.map((p, i) => <li key={i}>{p}</li>)}</ul>
            <h2>Repair Steps</h2>
            {result.steps.map((step) => (
              <div key={step.stepNumber} className="step-row">
                <span className="step-num">{step.stepNumber}</span>
                <div className="step-body">
                  <strong>{step.title}</strong>
                  <p>{step.details}</p>
                  {step.warning && <p className="warning">⚠ {step.warning}</p>}
                </div>
              </div>
            ))}
            {result.safetyNotes.length > 0 && (<><h2>Safety Notes</h2><ul>{result.safetyNotes.map((n, i) => <li key={i}>{n}</li>)}</ul></>)}
            {result.proTips.length > 0 && (<><h2>Pro Tips</h2><ul>{result.proTips.map((t, i) => <li key={i}>{t}</li>)}</ul></>)}
          </div>

          {/* Header card */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{result.title}</CardTitle>
                  <div className="flex gap-2 mt-2">
                    <Badge variant={difficultyColor(result.difficulty) as "destructive" | "secondary" | "outline"}>
                      {result.difficulty}
                    </Badge>
                    <Badge variant="outline"><Clock size={12} className="mr-1" />{result.estimatedTime}</Badge>
                  </div>
                </div>
                <Button size="sm" variant="secondary" className="cursor-pointer" onClick={() => printElement("guide-print", result.title)}>
                  <Printer size={14} className="mr-1.5" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Tools Required</p>
                  <ul className="space-y-1">
                    {result.toolsRequired.map((t, i) => (
                      <li key={i} className="text-sm flex items-center gap-2">
                        <Wrench size={12} className="text-primary shrink-0" />{t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Parts Needed</p>
                  <ul className="space-y-1">
                    {result.partsNeeded.map((p, i) => (
                      <li key={i} className="text-sm flex items-center gap-2">
                        <CheckCircle size={12} className="text-primary shrink-0" />{p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Repair Steps</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {result.steps.map((step) => (
                <div key={step.stepNumber} className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-sm">
                    {step.stepNumber}
                  </div>
                  <div className="space-y-1 flex-1">
                    <p className="font-medium text-sm">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.details}</p>
                    {step.warning && (
                      <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded px-2 py-1 mt-1">
                        <AlertTriangle size={13} className="text-destructive mt-0.5 shrink-0" />
                        <span className="text-xs text-destructive">{step.warning}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.safetyNotes.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle size={14} className="text-destructive" />Safety Notes</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {result.safetyNotes.map((n, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-2">
                        <AlertTriangle size={12} className="text-destructive shrink-0 mt-0.5" />{n}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {result.proTips.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles size={14} className="text-primary" />Pro Tips</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {result.proTips.map((t, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-2">
                        <Sparkles size={12} className="text-primary shrink-0 mt-0.5" />{t}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Phone Assistant Tab ──────────────────────────────────────────────────────

function PhoneAssistantTab() {
  const phoneAssistant = useAction(api.ai.phoneAssistant);
  const [transcript, setTranscript] = useState("");
  const [shopName, setShopName] = useState("");
  const [result, setResult] = useState<PhoneAssistantResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!transcript.trim()) {
      toast.error("Please paste a call transcript");
      return;
    }
    setLoading(true);
    try {
      const res = await phoneAssistant({ transcript, shopName: shopName || undefined });
      setResult(res);
    } catch (err) {
      toast.error(aiErrorMessage(err, "Failed to process transcript. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const exampleTranscript = `Staff: Thank you for calling MechPro, how can I help you?
Customer: Hi, my name is John. I have a 2019 Honda Accord and I've been hearing a grinding noise when I brake, especially at higher speeds. The steering wheel also shakes a bit.
Staff: How long has this been going on?
Customer: About a week now. Is this something serious?`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone size={18} className="text-primary" /> AI Phone Assistant
          </CardTitle>
          <CardDescription>
            Paste a customer call transcript to get service recommendations, cost estimates, and a suggested response
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Shop Name (optional)</Label>
            <Input placeholder="e.g. MechPro Auto" value={shopName} onChange={(e) => setShopName(e.target.value)} className="max-w-xs" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Call Transcript</Label>
              <Button variant="ghost" size="sm" className="text-xs h-7 cursor-pointer" onClick={() => setTranscript(exampleTranscript)}>
                Load example
              </Button>
            </div>
            <Textarea
              placeholder="Paste the customer call transcript here..."
              rows={6}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
          </div>
          <Button onClick={handleRun} disabled={loading} className="w-full md:w-auto cursor-pointer">
            {loading ? <><Spinner className="mr-2" />Processing...</> : <><Phone size={16} className="mr-2" />Analyze Call</>}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4">
          {/* Printable version */}
          <div id="phone-print" style={{ display: "none" }}>
            <h1>Call Analysis Report</h1>
            <p><strong>Customer:</strong> {result.customerName}</p>
            <p><strong>Vehicle:</strong> {result.vehicle}</p>
            <p><strong>Symptoms:</strong> {result.symptoms}</p>
            <p><strong>Booking Recommended:</strong> {result.bookingRecommended ? "Yes" : "No"}</p>
            <h2>Recommended Services</h2>
            <table>
              <thead><tr><th>Service</th><th>Estimated Cost</th><th>Urgency</th></tr></thead>
              <tbody>
                {result.recommendedServices.map((s, i) => (
                  <tr key={i}><td>{s.service}</td><td>{s.estimatedCost}</td><td>{s.urgency}</td></tr>
                ))}
              </tbody>
            </table>
            <h2>Suggested Response</h2>
            <p>{result.suggestedResponse}</p>
            {result.followUpQuestions.length > 0 && (
              <><h2>Follow-Up Questions</h2><ol>{result.followUpQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol></>
            )}
          </div>

          {/* Customer Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Call Summary</CardTitle>
                  {result.bookingRecommended && (
                    <Badge className="bg-primary/20 text-primary border border-primary/30 mt-2">Booking Recommended</Badge>
                  )}
                </div>
                <Button size="sm" variant="secondary" className="cursor-pointer" onClick={() => printElement("phone-print", `Call — ${result.customerName}`)}>
                  <Printer size={14} className="mr-1.5" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Customer</p>
                  <p className="text-sm">{result.customerName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Vehicle</p>
                  <p className="text-sm">{result.vehicle}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Symptoms</p>
                <p className="text-sm">{result.symptoms}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Recommended Services</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {result.recommendedServices.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border border-border rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{s.service}</p>
                    <p className="text-xs text-muted-foreground">{s.estimatedCost}</p>
                  </div>
                  <Badge variant={s.urgency === "Immediate" ? "destructive" : s.urgency === "Soon" ? "secondary" : "outline"} className="shrink-0">
                    {s.urgency}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Suggested Response to Customer</CardTitle></CardHeader>
            <CardContent>
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <p className="text-sm italic">{`"${result.suggestedResponse}"`}</p>
              </div>
            </CardContent>
          </Card>

          {result.followUpQuestions.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Follow-Up Questions to Ask</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.followUpQuestions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-primary font-bold shrink-0">{i + 1}.</span>{q}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AIPage() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Sparkles className="text-primary" size={24} />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            AI Tools
          </h1>
          <p className="text-muted-foreground text-sm">Diagnostics, estimating, repair guides & phone assistant</p>
        </div>
      </div>

      {/* AI Disclaimer Banner */}
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">AI Diagnostics Disclaimer</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All diagnostic results, repair guides, cost estimates, and recommendations generated on this page are produced by artificial intelligence and are intended as informational aids only. They do not replace professional mechanical inspection, judgment, or certification. Always verify AI-generated suggestions with hands-on diagnosis before performing repairs. MechPro is not liable for decisions made based on AI output.
            </p>
          </div>
        </div>
      </div>

      {/* AI Estimate Generator CTA */}
      <Link
        to="/ai-estimate"
        className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 transition-all hover:bg-primary/10 hover:border-primary/50 cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Sparkles size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">AI Estimate Generator</p>
            <p className="text-xs text-muted-foreground">Select customer + vehicle, describe the issue, get a full estimate with checklists</p>
          </div>
        </div>
        <ArrowRight size={16} className="text-primary shrink-0 transition-transform group-hover:translate-x-1" />
      </Link>

      {/* Tips for Best Results */}
      <details className="group mb-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground flex items-center gap-2 select-none">
          <Lightbulb size={14} className="text-primary shrink-0" />
          Tips for best results
          <ChevronDown size={14} className="text-muted-foreground ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Diagnostics</p>
            <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              <li className="flex gap-2"><span className="text-primary shrink-0">-</span>Include year, make, model, and engine size</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">-</span>Mention driving conditions when symptoms occur</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">-</span>Enter DTC codes if available — they narrow results significantly</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Repair Guides</p>
            <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              <li className="flex gap-2"><span className="text-primary shrink-0">-</span>Be specific: &quot;replace front brake pads&quot; vs &quot;brakes&quot;</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">-</span>Include engine/trim level for accurate tool lists</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">-</span>Print guides to keep hands-free in the bay</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Estimator</p>
            <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              <li className="flex gap-2"><span className="text-primary shrink-0">-</span>List each service separately for detailed pricing</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">-</span>Mention if parts are OEM or aftermarket preference</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Phone Assistant</p>
            <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              <li className="flex gap-2"><span className="text-primary shrink-0">-</span>Paste the full conversation, not just the complaint</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">-</span>Include your shop name for personalized responses</li>
            </ul>
          </div>
        </div>
      </details>

      <Tabs defaultValue="diagnostics">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full mb-6 h-auto">
          <TabsTrigger value="diagnostics" className="flex items-center gap-1.5 py-2">
            <Stethoscope size={14} />
            <span className="hidden sm:inline">Diagnostics</span>
            <span className="sm:hidden">Diagnose</span>
          </TabsTrigger>
          <TabsTrigger value="estimator" className="flex items-center gap-1.5 py-2">
            <Calculator size={14} />
            <span>Estimator</span>
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex items-center gap-1.5 py-2">
            <BookOpen size={14} />
            <span className="hidden sm:inline">Repair Guide</span>
            <span className="sm:hidden">Guide</span>
          </TabsTrigger>
          <TabsTrigger value="phone" className="flex items-center gap-1.5 py-2">
            <Phone size={14} />
            <span className="hidden sm:inline">Phone AI</span>
            <span className="sm:hidden">Phone</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="diagnostics">
          <DiagnosticsTab />
        </TabsContent>
        <TabsContent value="estimator">
          <EstimatorTabWithAuth />
        </TabsContent>
        <TabsContent value="guide">
          <RepairGuideTab />
        </TabsContent>
        <TabsContent value="phone">
          <PhoneAssistantTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
