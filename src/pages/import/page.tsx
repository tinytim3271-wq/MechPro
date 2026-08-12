import { useState, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import {
  Upload,
  FileSpreadsheet,
  Users,
  Package,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Download,
  ArrowLeft,
  Info,
  Wrench,
  FileText,
  Receipt,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import Papa from "papaparse";

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportType = "customers" | "parts" | "work_orders" | "estimates" | "invoices" | "purchase_orders";
type Step = "select" | "upload" | "preview" | "done";

type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

// ─── Import type metadata ─────────────────────────────────────────────────────

const IMPORT_TYPES: Array<{
  id: ImportType;
  label: string;
  description: string;
  icon: typeof Users;
  requiredColumns: string;
  viewPath: string;
}> = [
  {
    id: "customers",
    label: "Customers",
    description: "Names, phones, emails, addresses",
    icon: Users,
    requiredColumns: "name (required), phone, email, address, city, state, zip",
    viewPath: "/customers",
  },
  {
    id: "parts",
    label: "Parts & Inventory",
    description: "Part numbers, prices, stock levels",
    icon: Package,
    requiredColumns: "name (required), part_number, unit_price, unit_cost, stock_qty",
    viewPath: "/parts",
  },
  {
    id: "work_orders",
    label: "Work Orders",
    description: "Repair orders with customer & vehicle info",
    icon: Wrench,
    requiredColumns: "customer (required), year/make/model (required), complaint (required)",
    viewPath: "/jobs",
  },
  {
    id: "estimates",
    label: "Estimates",
    description: "Pending estimates not yet approved",
    icon: FileText,
    requiredColumns: "customer (required), year/make/model (required), description (required)",
    viewPath: "/jobs",
  },
  {
    id: "invoices",
    label: "Invoices",
    description: "Completed invoices with payment info",
    icon: Receipt,
    requiredColumns: "customer (required), year/make/model (required), total (required)",
    viewPath: "/invoices",
  },
  {
    id: "purchase_orders",
    label: "Purchase Orders",
    description: "Parts orders from suppliers",
    icon: ShoppingCart,
    requiredColumns: "supplier (required), part description (required), qty (required), cost",
    viewPath: "/parts",
  },
];

// ─── CSV Templates ────────────────────────────────────────────────────────────

const TEMPLATES: Record<ImportType, { headers: string[]; example: Record<string, string> }> = {
  customers: {
    headers: ["name", "phone", "email", "address", "city", "state", "zip", "notes"],
    example: {
      name: "John Smith",
      phone: "(555) 123-4567",
      email: "john@example.com",
      address: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      notes: "Prefers morning appointments",
    },
  },
  parts: {
    headers: ["name", "part_number", "sku", "category", "stock_qty", "low_stock_threshold", "unit_cost", "unit_price", "supplier", "location"],
    example: {
      name: "Brake Pad Set Front",
      part_number: "BP-12345",
      sku: "SKU-001",
      category: "Brakes",
      stock_qty: "10",
      low_stock_threshold: "2",
      unit_cost: "25.00",
      unit_price: "49.99",
      supplier: "AutoZone Pro",
      location: "A3-B2",
    },
  },
  work_orders: {
    headers: ["customer", "phone", "email", "year", "make", "model", "vin", "mileage", "complaint", "cause", "correction", "status", "priority", "labor_description", "labor_hours", "labor_rate", "part_description", "part_number", "part_qty", "part_cost", "part_price", "total", "notes"],
    example: {
      customer: "John Smith",
      phone: "(555) 123-4567",
      email: "john@example.com",
      year: "2020",
      make: "Toyota",
      model: "Camry",
      vin: "1HGCM82633A123456",
      mileage: "45000",
      complaint: "Brakes squealing",
      cause: "Worn brake pads",
      correction: "Replaced front brake pads",
      status: "completed",
      priority: "normal",
      labor_description: "Brake pad replacement",
      labor_hours: "1.5",
      labor_rate: "95.00",
      part_description: "Front Brake Pad Set",
      part_number: "BP-12345",
      part_qty: "1",
      part_cost: "25.00",
      part_price: "49.99",
      total: "192.49",
      notes: "Customer requests ceramic pads next time",
    },
  },
  estimates: {
    headers: ["customer", "phone", "email", "year", "make", "model", "vin", "mileage", "complaint", "labor_description", "labor_hours", "labor_rate", "part_description", "part_number", "part_qty", "part_cost", "part_price", "total", "notes"],
    example: {
      customer: "Jane Doe",
      phone: "(555) 987-6543",
      email: "jane@example.com",
      year: "2019",
      make: "Honda",
      model: "Civic",
      vin: "2HGES16575H123456",
      mileage: "62000",
      complaint: "AC not blowing cold",
      labor_description: "AC system diagnosis and recharge",
      labor_hours: "2",
      labor_rate: "95.00",
      part_description: "R-134a Refrigerant",
      part_number: "AC-REFR-134",
      part_qty: "2",
      part_cost: "12.00",
      part_price: "24.99",
      total: "239.98",
      notes: "May need compressor if recharge doesn't hold",
    },
  },
  invoices: {
    headers: ["customer", "phone", "email", "year", "make", "model", "vin", "complaint", "invoice_number", "status", "subtotal", "tax", "total", "amount_paid", "invoice_date", "due_date", "notes"],
    example: {
      customer: "John Smith",
      phone: "(555) 123-4567",
      email: "john@example.com",
      year: "2020",
      make: "Toyota",
      model: "Camry",
      vin: "1HGCM82633A123456",
      complaint: "Oil change and tire rotation",
      invoice_number: "INV-0042",
      status: "paid",
      subtotal: "189.99",
      tax: "15.67",
      total: "205.66",
      amount_paid: "205.66",
      invoice_date: "2024-06-15",
      due_date: "2024-07-15",
      notes: "Paid by card",
    },
  },
  purchase_orders: {
    headers: ["supplier", "part_name", "part_number", "qty_ordered", "qty_received", "unit_cost", "status", "order_date", "expected_date", "received_date", "notes"],
    example: {
      supplier: "AutoZone Pro",
      part_name: "Brake Pad Set Front",
      part_number: "BP-12345",
      qty_ordered: "10",
      qty_received: "10",
      unit_cost: "25.00",
      status: "received",
      order_date: "2024-06-01",
      expected_date: "2024-06-05",
      received_date: "2024-06-04",
      notes: "Regular reorder",
    },
  },
};

// Supported software column names for user education
const SOFTWARE_COLUMNS: Record<ImportType, Array<{ software: string; columns: string }>> = {
  customers: [
    { software: "Mitchell1 / Manager SE", columns: "CustomerName, Phone, Email, Address, City, State, Zip" },
    { software: "Tekmetric", columns: "Customer Name, Mobile, Email, Street, City, State, Zip Code" },
    { software: "Shop-Ware", columns: "name, phone_number, email_address, street_address, city, state, postal_code" },
    { software: "AllData / ShopKey", columns: "Last Name, First Name, Home Phone, Email, Address, City, State, ZIP" },
    { software: "Generic / Excel", columns: "name, phone, email, address, city, state, zip" },
  ],
  parts: [
    { software: "Mitchell1 / Manager SE", columns: "PartNumber, Description, Retail, Cost, QtyOnHand, Vendor" },
    { software: "Tekmetric", columns: "Part Number, Part Name, Retail Price, Cost, Stock Qty, Supplier" },
    { software: "Shop-Ware", columns: "item_number, item_description, list_price, dealer_cost, quantity_on_hand, source" },
    { software: "AllData / ShopKey", columns: "PartNo, PartName, Price, Cost, Qty, Brand" },
    { software: "Generic / Excel", columns: "name, part_number, unit_price, unit_cost, stock_qty, supplier" },
  ],
  work_orders: [
    { software: "Mitchell1 / Manager SE", columns: "Customer Name, Year, Make, Model, VIN, Complaint, Diagnosis, Repair, Status" },
    { software: "Tekmetric", columns: "Customer, Vehicle Year, Vehicle Make, Vehicle Model, Concern, Cause, Correction" },
    { software: "Shop-Ware", columns: "customer_name, veh_year, veh_make, veh_model, description, work_performed, status" },
    { software: "Generic / Excel", columns: "customer, year, make, model, complaint, status, total" },
  ],
  estimates: [
    { software: "Mitchell1 / Manager SE", columns: "Customer Name, Year, Make, Model, Complaint, Labor Hours, Labor Rate, Total" },
    { software: "Tekmetric", columns: "Customer, Vehicle Year, Vehicle Make, Vehicle Model, Service, Estimate Total" },
    { software: "Generic / Excel", columns: "customer, year, make, model, description, total" },
  ],
  invoices: [
    { software: "Mitchell1 / Manager SE", columns: "Customer, Year, Make, Model, Invoice#, Subtotal, Tax, Total, Paid, Status" },
    { software: "Tekmetric", columns: "Customer Name, Vehicle, Invoice Number, Total, Amount Paid, Status, Date" },
    { software: "Shop-Ware", columns: "customer_name, vehicle, invoice_number, grand_total, payment, status, date" },
    { software: "Generic / Excel", columns: "customer, year, make, model, total, amount_paid, status, invoice_date" },
  ],
  purchase_orders: [
    { software: "Mitchell1 / Manager SE", columns: "Vendor, PartNumber, Description, QtyOrdered, QtyReceived, Cost, Status" },
    { software: "Tekmetric", columns: "Supplier, Part Name, Part No, Qty, Received, Unit Cost, Order Date" },
    { software: "Generic / Excel", columns: "supplier, part_name, part_number, qty_ordered, unit_cost, status" },
  ],
};

// ─── Download Template ────────────────────────────────────────────────────────

function downloadTemplate(type: ImportType) {
  const { headers, example } = TEMPLATES[type];
  const csv = Papa.unparse([example], { columns: headers });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mechpro_${type}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "select", label: "Choose Type" },
    { id: "upload", label: "Upload" },
    { id: "preview", label: "Preview" },
    { id: "done", label: "Complete" },
  ];
  const idx = steps.findIndex((s) => s.id === current);

  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2">
          <div className={cn(
            "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors",
            i < idx ? "bg-primary text-primary-foreground" :
            i === idx ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
            "bg-muted text-muted-foreground"
          )}>
            {i < idx ? <CheckCircle size={14} /> : i + 1}
          </div>
          <span className={cn("text-sm hidden sm:block", i === idx ? "text-foreground font-medium" : "text-muted-foreground")}>
            {step.label}
          </span>
          {i < steps.length - 1 && <ChevronRight size={14} className="text-muted-foreground ml-1" />}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Select Type ──────────────────────────────────────────────────────

function SelectTypeStep({ onSelect }: { onSelect: (type: ImportType) => void }) {
  return (
    <div>
      <h2 className="text-xl font-bold mb-1" style={{ fontFamily: "Rajdhani, sans-serif" }}>
        What would you like to import?
      </h2>
      <p className="text-muted-foreground text-sm mb-6">
        Choose the type of data to import from your existing shop management software.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {IMPORT_TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.id}
              onClick={() => onSelect(type.id)}
              className="cursor-pointer text-left border border-border rounded-xl p-5 hover:border-primary hover:bg-primary/5 transition-all group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{type.label}</h3>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Columns: {type.requiredColumns}
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-primary font-medium group-hover:gap-2 transition-all">
                Select <ChevronRight size={12} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 bg-muted/30 border border-border rounded-lg p-4">
        <div className="flex items-start gap-2">
          <Info size={14} className="text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            MechPro automatically maps columns from common shop management software exports (Mitchell1, Tekmetric, Shop-Ware, AllData).
            You don{"'"}t need to rename your columns — just export your CSV and upload it.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Upload ───────────────────────────────────────────────────────────

type ParsedPreview = {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
};

function UploadStep({
  importType,
  onBack,
  onParsed,
}: {
  importType: ImportType;
  onBack: () => void;
  onParsed: (csv: string, preview: ParsedPreview) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const typeConfig = IMPORT_TYPES.find((t) => t.id === importType);
  const typeLabel = typeConfig?.label ?? importType;

  const processFile = (file: File) => {
    setError("");
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setError("Please upload a .csv file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB");
      return;
    }

    file.text().then((csvContent) => {
      const result = Papa.parse<Record<string, string>>(csvContent, {
        header: true,
        skipEmptyLines: true,
        preview: 5,
      });

      if (result.errors.length > 0 && result.data.length === 0) {
        setError("Could not parse this file. Make sure it's a valid CSV.");
        return;
      }

      if (result.data.length === 0) {
        setError("The file appears to be empty.");
        return;
      }

      const fullResult = Papa.parse<Record<string, string>>(csvContent, {
        header: true,
        skipEmptyLines: true,
      });

      onParsed(csvContent, {
        headers: result.meta.fields ?? [],
        rows: result.data,
        totalRows: fullResult.data.length,
      });
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 cursor-pointer transition-colors">
        <ArrowLeft size={14} /> Back
      </button>
      <h2 className="text-xl font-bold mb-1" style={{ fontFamily: "Rajdhani, sans-serif" }}>
        Upload {typeLabel} CSV
      </h2>
      <p className="text-muted-foreground text-sm mb-6">
        Export a CSV from your current software and upload it here.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all",
          dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted/20"
        )}
      >
        <Upload size={32} className={cn("mx-auto mb-3", dragging ? "text-primary" : "text-muted-foreground")} />
        <p className="font-medium text-foreground text-sm">Drag & drop your CSV here</p>
        <p className="text-xs text-muted-foreground mt-1">or click to browse · max 10MB</p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-destructive text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Template download */}
      <div className="mt-6 border border-border rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Need a template?</p>
            <p className="text-xs text-muted-foreground">Download our example CSV with the right column names</p>
          </div>
          <Button
            size="sm" variant="ghost"
            className="cursor-pointer shrink-0"
            onClick={() => downloadTemplate(importType)}
          >
            <Download size={14} className="mr-1.5" /> Template
          </Button>
        </div>
      </div>

      {/* Supported software */}
      <div className="mt-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          Supported software exports
        </p>
        <div className="space-y-2">
          {SOFTWARE_COLUMNS[importType].map((sw) => (
            <div key={sw.software} className="flex items-start gap-3 text-xs">
              <span className="text-foreground font-medium w-40 shrink-0">{sw.software}</span>
              <span className="text-muted-foreground">{sw.columns}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Preview & Confirm ────────────────────────────────────────────────

function PreviewStep({
  importType,
  csvContent,
  preview,
  onBack,
  onImportDone,
}: {
  importType: ImportType;
  csvContent: string;
  preview: ParsedPreview;
  onBack: () => void;
  onImportDone: (result: ImportResult) => void;
}) {
  const importCustomers = useAction(api.import.importCustomers);
  const importParts = useAction(api.import.importParts);
  const importWorkOrders = useAction(api.import.importWorkOrders);
  const importEstimates = useAction(api.import.importEstimates);
  const importInvoices = useAction(api.import.importInvoices);
  const importPurchaseOrders = useAction(api.import.importPurchaseOrders);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const typeConfig = IMPORT_TYPES.find((t) => t.id === importType);
  const typeLabel = typeConfig?.label ?? importType;

  const handleImport = async () => {
    setImporting(true);
    setProgress(10);
    try {
      const interval = setInterval(() => setProgress((p) => Math.min(p + 10, 85)), 500);
      let result: ImportResult;
      switch (importType) {
        case "customers":
          result = await importCustomers({ csvContent });
          break;
        case "parts":
          result = await importParts({ csvContent });
          break;
        case "work_orders":
          result = await importWorkOrders({ csvContent });
          break;
        case "estimates":
          result = await importEstimates({ csvContent });
          break;
        case "invoices":
          result = await importInvoices({ csvContent });
          break;
        case "purchase_orders":
          result = await importPurchaseOrders({ csvContent });
          break;
      }
      clearInterval(interval);
      setProgress(100);
      onImportDone(result);
    } catch (e) {
      toast.error("Import failed: " + (e instanceof Error ? e.message : "Unknown error"));
      setImporting(false);
      setProgress(0);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 cursor-pointer transition-colors">
        <ArrowLeft size={14} /> Back
      </button>
      <h2 className="text-xl font-bold mb-1" style={{ fontFamily: "Rajdhani, sans-serif" }}>
        Preview Import
      </h2>
      <p className="text-muted-foreground text-sm mb-4">
        Showing first {preview.rows.length} of <strong>{preview.totalRows}</strong> {typeLabel.toLowerCase()} rows. Review before importing.
      </p>

      {/* Column headers detected */}
      <div className="mb-4 bg-muted/30 border border-border rounded-lg p-3">
        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Detected columns ({preview.headers.length})</p>
        <div className="flex flex-wrap gap-1.5">
          {preview.headers.map((h) => (
            <span key={h} className="px-2 py-0.5 bg-secondary rounded text-xs text-secondary-foreground font-mono">{h}</span>
          ))}
        </div>
      </div>

      {/* Data preview table */}
      <div className="rounded-lg border border-border overflow-auto mb-6 max-h-60">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              {preview.headers.slice(0, 6).map((h) => (
                <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
              {preview.headers.length > 6 && (
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  +{preview.headers.length - 6} more
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {preview.headers.slice(0, 6).map((h) => (
                  <td key={h} className="px-3 py-1.5 text-foreground max-w-[140px] truncate">
                    {row[h] ?? "—"}
                  </td>
                ))}
                {preview.headers.length > 6 && <td className="px-3 py-1.5 text-muted-foreground">…</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {importing && (
        <div className="mb-4 space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Importing {typeLabel}…</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack} disabled={importing} className="cursor-pointer">
          Cancel
        </Button>
        <Button onClick={handleImport} disabled={importing} className="cursor-pointer flex-1 sm:flex-none">
          {importing ? "Importing…" : `Import ${preview.totalRows} ${typeLabel}`}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

function DoneStep({
  importType,
  result,
  onStartOver,
}: {
  importType: ImportType;
  result: ImportResult;
  onStartOver: () => void;
}) {
  const typeConfig = IMPORT_TYPES.find((t) => t.id === importType);
  const typeLabel = typeConfig?.label ?? importType;
  const viewPath = typeConfig?.viewPath ?? "/";
  const hasErrors = result.errors.length > 0;

  return (
    <div>
      <div className={cn(
        "flex items-center gap-3 p-4 rounded-xl mb-6",
        result.imported > 0 ? "bg-green-500/10 border border-green-500/20" : "bg-destructive/10 border border-destructive/20"
      )}>
        {result.imported > 0 ? (
          <CheckCircle size={24} className="text-green-400 shrink-0" />
        ) : (
          <AlertCircle size={24} className="text-destructive shrink-0" />
        )}
        <div>
          <p className="font-semibold text-foreground">
            {result.imported > 0
              ? `Successfully imported ${result.imported} ${typeLabel.toLowerCase()}`
              : "Import completed with issues"}
          </p>
          <p className="text-sm text-muted-foreground">
            {result.imported} imported · {result.skipped} skipped
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{result.imported}</div>
          <div className="text-xs text-muted-foreground mt-1">Imported</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{result.skipped}</div>
          <div className="text-xs text-muted-foreground mt-1">Skipped</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-muted-foreground">{result.errors.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Errors</div>
        </div>
      </div>

      {hasErrors && (
        <div className="mb-6 border border-destructive/20 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10">
            <AlertCircle size={14} className="text-destructive" />
            <span className="text-sm font-medium text-foreground">{result.errors.length} row errors</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {result.errors.map((err, i) => (
              <div key={i} className="px-4 py-1.5 text-xs text-muted-foreground border-t border-border/50 font-mono">
                {err}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button onClick={onStartOver} variant="ghost" className="cursor-pointer">
          Import More Data
        </Button>
        <Button
          onClick={() => {
            window.location.href = viewPath;
          }}
          className="cursor-pointer"
        >
          View {typeLabel}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [step, setStep] = useState<Step>("select");
  const [importType, setImportType] = useState<ImportType>("customers");
  const [csvContent, setCsvContent] = useState("");
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setStep("select");
    setCsvContent("");
    setPreview(null);
    setResult(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <FileSpreadsheet className="text-primary" size={28} />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Import Data
          </h1>
          <p className="text-sm text-muted-foreground">
            Migrate from Mitchell1, Tekmetric, Shop-Ware, AllData, or any CSV
          </p>
        </div>
      </div>

      <StepIndicator current={step} />

      <Card>
        <CardContent className="p-6">
          {step === "select" && (
            <SelectTypeStep
              onSelect={(type) => {
                setImportType(type);
                setStep("upload");
              }}
            />
          )}

          {step === "upload" && (
            <UploadStep
              importType={importType}
              onBack={() => setStep("select")}
              onParsed={(csv, prev) => {
                setCsvContent(csv);
                setPreview(prev);
                setStep("preview");
              }}
            />
          )}

          {step === "preview" && preview && (
            <PreviewStep
              importType={importType}
              csvContent={csvContent}
              preview={preview}
              onBack={() => setStep("upload")}
              onImportDone={(res) => {
                setResult(res);
                setStep("done");
                if (res.imported > 0) {
                  const label = IMPORT_TYPES.find((t) => t.id === importType)?.label ?? importType;
                  toast.success(`Imported ${res.imported} ${label.toLowerCase()}`);
                }
              }}
            />
          )}

          {step === "done" && result && (
            <DoneStep
              importType={importType}
              result={result}
              onStartOver={reset}
            />
          )}
        </CardContent>
      </Card>

      {/* Tips card */}
      {step === "select" && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Info size={14} className="text-primary" /> Tips for a successful import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Export CSV directly from your shop management software — no reformatting needed</p>
            <p>• Column names are matched automatically, even with different naming conventions</p>
            <p>• Customers and vehicles are auto-created if they don{"'"}t already exist</p>
            <p>• Duplicate entries are not automatically detected — review after import</p>
            <p>• Large files are supported up to 10MB (roughly 50,000+ rows)</p>
            <p>• Download a template CSV to see the exact column format we accept</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
