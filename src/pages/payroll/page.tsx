import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Banknote, FileText, Plus, Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { downloadPayStubPdf } from "@/lib/payStubPdf.ts";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function PayrollPage() {
  const org = useQuery(api.organizations.getCurrentOrg, {});
  const runs = useQuery(api.payroll.listPayrollRuns, {});
  const generate = useMutation(api.payroll.generatePayroll);
  const createExpense = useMutation(api.expenses.createExpense);
  const expenses = useQuery(api.expenses.listExpenses, {});
  const employees = useQuery(api.employees.listMembers, org?._id ? { orgId: org._id } : "skip");

  const today = isoDate(new Date());
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return isoDate(d);
  });
  const [end, setEnd] = useState(today);
  const [checkDate, setCheckDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<Id<"payrollRuns"> | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [w2Member, setW2Member] = useState<string>("");
  const [form1099Member, setForm1099Member] = useState<string>("");

  const [expDate, setExpDate] = useState(today);
  const [expCat, setExpCat] = useState("parts");
  const [expVendor, setExpVendor] = useState("");
  const [expAmount, setExpAmount] = useState("");

  const runDetail = useQuery(api.payroll.getPayrollRun, runId ? { runId } : "skip");
  const yearEnd = useQuery(api.payroll.getYearEndReport, { year });
  const w2 = useQuery(
    api.payroll.getW2,
    w2Member ? { memberId: w2Member as Id<"orgMembers">, year } : "skip",
  );
  const nec = useQuery(
    api.payroll.get1099,
    form1099Member ? { memberId: form1099Member as Id<"orgMembers">, year } : "skip",
  );

  const activeEmployees = employees?.filter((e) => e.isActive) ?? [];
  const expenseTotal = useMemo(
    () => (expenses ?? []).reduce((s, e) => s + e.amount, 0),
    [expenses],
  );

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const result = await generate({ payPeriodStart: start, payPeriodEnd: end, checkDate });
      setRunId(result.runId);
      toast.success(`Payroll generated for ${result.employeesProcessed} employees`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate payroll");
    } finally {
      setBusy(false);
    }
  };

  const handleExpense = async () => {
    const amount = Number(expAmount);
    if (!expVendor.trim() || !Number.isFinite(amount)) {
      toast.error("Vendor and amount are required");
      return;
    }
    try {
      await createExpense({ date: expDate, category: expCat, vendorName: expVendor.trim(), amount });
      setExpVendor("");
      setExpAmount("");
      toast.success("Expense recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save expense");
    }
  };

  if (runs === undefined || !org) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Banknote className="text-primary" size={28} />
        <div>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Payroll
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate pay stubs, W-2 / 1099 year-end forms, and shop expenses. Estimates only — not a full payroll processor.
          </p>
        </div>
      </div>

      <Tabs defaultValue="run">
        <TabsList>
          <TabsTrigger value="run" className="cursor-pointer">Pay run</TabsTrigger>
          <TabsTrigger value="year" className="cursor-pointer">Year-end</TabsTrigger>
          <TabsTrigger value="expenses" className="cursor-pointer">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generate payroll</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Period start</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Period end</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Check date</Label>
                <Input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button className="cursor-pointer w-full" onClick={() => void handleGenerate()} disabled={busy}>
                  {busy ? "Generating…" : "Generate payroll"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Recent runs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {runs.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                      <EmptyTitle>No payroll runs yet</EmptyTitle>
                      <EmptyDescription>Clock hours (or set a salary) on Employees, then generate a run.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  runs.map((r) => (
                    <button
                      key={r._id}
                      onClick={() => setRunId(r._id)}
                      className={`w-full text-left rounded-md border p-3 cursor-pointer transition-colors ${
                        runId === r._id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex justify-between text-sm font-medium">
                        <span>{r.checkDate}</span>
                        <span>{money(r.totalNetPay)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.payPeriodStart} – {r.payPeriodEnd} · {r.employeesProcessed} employees
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Pay stubs</CardTitle>
              </CardHeader>
              <CardContent>
                {!runDetail ? (
                  <p className="text-sm text-muted-foreground">Select a run to review stubs.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Stat label="Gross" value={money(runDetail.run.totalGrossPay)} />
                      <Stat label="Deductions" value={money(runDetail.run.totalDeductions)} />
                      <Stat label="Net" value={money(runDetail.run.totalNetPay)} />
                    </div>
                    {runDetail.stubs.map((s) => (
                      <div key={s._id} className="border border-border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-medium">{s.employeeName}</div>
                            <div className="text-xs text-muted-foreground">
                              {s.regularHours} hrs · {s.employmentType.toUpperCase()} · YTD {money(s.ytdGross)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{money(s.netPay)}</div>
                            <Badge variant="outline" className="text-[10px]">{s.employmentType.toUpperCase()}</Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="cursor-pointer gap-1"
                          onClick={() =>
                            downloadPayStubPdf({
                              stubId: s._id,
                              employeeName: s.employeeName,
                              employmentType: s.employmentType,
                              orgName: org.name,
                              orgAddress: [org.address, org.city, org.state, org.zip].filter(Boolean).join(", "),
                              checkDate: s.checkDate,
                              payPeriodStart: s.payPeriodStart,
                              payPeriodEnd: s.payPeriodEnd,
                              regularHours: s.regularHours,
                              overtimeHours: s.overtimeHours,
                              regularRate: s.regularRate,
                              overtimeRate: s.overtimeRate,
                              regularPay: s.regularPay,
                              overtimePay: s.overtimePay,
                              bonusOrOther: s.bonusOrOther,
                              grossPay: s.grossPay,
                              federalIncomeTax: s.federalIncomeTax,
                              socialSecurityTax: s.socialSecurityTax,
                              medicareTax: s.medicareTax,
                              stateIncomeTax: s.stateIncomeTax,
                              otherDeductions: s.otherDeductions,
                              advancesDeducted: s.advancesDeducted,
                              totalDeductions: s.totalDeductions,
                              netPay: s.netPay,
                              ytdGross: s.ytdGross,
                              ytdDeductions: s.ytdDeductions,
                              ytdNet: s.ytdNet,
                            })
                          }
                        >
                          <Printer size={14} /> Download PDF
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="year" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <Label>Year</Label>
            <Input
              type="number"
              className="w-28"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          {yearEnd && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Employees" value={String(yearEnd.summary.totalEmployees)} />
              <Stat label="W-2" value={String(yearEnd.summary.w2Employees)} />
              <Stat label="1099" value={String(yearEnd.summary.contractorEmployees)} />
              <Stat label="Payroll" value={money(yearEnd.summary.totalPayroll)} />
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">W-2</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Select value={w2Member} onValueChange={setW2Member}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select W-2 employee" /></SelectTrigger>
                  <SelectContent>
                    {activeEmployees.filter((e) => (e.employmentType ?? "w2") === "w2").map((e) => (
                      <SelectItem key={e._id} value={e._id}>{e.userName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {w2 && (
                  <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-auto">
{JSON.stringify(w2.boxes, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">1099-NEC</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Select value={form1099Member} onValueChange={setForm1099Member}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select contractor" /></SelectTrigger>
                  <SelectContent>
                    {activeEmployees.filter((e) => e.employmentType === "1099").map((e) => (
                      <SelectItem key={e._id} value={e._id}>{e.userName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {nec && (
                  <p className="text-sm">
                    Nonemployee compensation: <strong>{money(nec.income.nonemployeeCompensation)}</strong>
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Receipt size={16} /> Record expense</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-5">
              <Input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
              <Select value={expCat} onValueChange={setExpCat}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["parts","sublet","rent","utilities","insurance","tools","fuel","marketing","other"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Vendor" value={expVendor} onChange={(e) => setExpVendor(e.target.value)} />
              <Input placeholder="Amount" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
              <Button className="cursor-pointer gap-1" onClick={() => void handleExpense()}>
                <Plus size={14} /> Add
              </Button>
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">Total recorded: {money(expenseTotal)}</p>
          {(expenses ?? []).length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
                <EmptyTitle>No expenses yet</EmptyTitle>
                <EmptyDescription>Track vendor bills, rent, and shop overhead here. Purchase orders stay on Parts.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-2">
              {(expenses ?? []).map((e) => (
                <div key={e._id} className="flex justify-between border border-border rounded-md p-3 text-sm">
                  <div>
                    <div className="font-medium">{e.vendorName}</div>
                    <div className="text-xs text-muted-foreground">{e.date} · {e.category}</div>
                  </div>
                  <div className="font-medium">{money(e.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-center">
      <div className="text-lg font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
