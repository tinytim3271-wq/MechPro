// CSV template headers and example rows for each import type

export type ImportType = "customers" | "vehicles" | "parts";

export const IMPORT_TYPES: { id: ImportType; label: string; description: string }[] = [
  {
    id: "customers",
    label: "Customers",
    description: "Import customer contact info from ARI, Mitchell1, Tekmetric, Shop-Ware, or any shop management system",
  },
  {
    id: "vehicles",
    label: "Vehicles",
    description: "Import vehicle records from ARI, Mitchell1, or other systems. Vehicles are matched to existing customers by name.",
  },
  {
    id: "parts",
    label: "Parts & Inventory",
    description: "Import your parts catalog from ARI Parts & Services export, or any other system",
  },
];

export const TEMPLATES: Record<ImportType, { headers: string[]; example: string[][] }> = {
  customers: {
    headers: ["name", "phone", "email", "address", "city", "state", "zip", "notes", "source"],
    example: [
      ["John Smith", "555-123-4567", "john@example.com", "123 Main St", "Austin", "TX", "78701", "Loyal customer", "referral"],
      ["Sarah Johnson", "555-987-6543", "sarah@example.com", "", "Austin", "TX", "78702", "", "walk-in"],
    ],
  },
  vehicles: {
    headers: ["customer_name", "year", "make", "model", "trim", "vin", "license_plate", "color", "mileage", "engine", "transmission", "notes"],
    example: [
      ["John Smith", "2019", "Toyota", "Camry", "SE", "1HGBH41JXMN109186", "ABC-1234", "Silver", "45000", "2.5L 4-Cyl", "Automatic", ""],
      ["Sarah Johnson", "2021", "Honda", "CR-V", "EX", "", "XYZ-5678", "Blue", "12000", "1.5L Turbo", "CVT", "New tires needed"],
    ],
  },
  parts: {
    headers: ["name", "sku", "part_number", "description", "category", "stock_qty", "low_stock_threshold", "unit_cost", "unit_price", "supplier", "location"],
    example: [
      ["Oil Filter", "OF-001", "15400-PLM-A01", "Standard oil filter", "Filters", "25", "5", "3.50", "8.99", "AutoZone", "A-12"],
      ["Brake Pad Set Front", "BP-F-002", "D1399", "Ceramic front brake pads", "Brakes", "10", "2", "22.00", "55.00", "NAPA", "B-04"],
    ],
  },
};

export function buildCsvTemplate(type: ImportType): string {
  const { headers, example } = TEMPLATES[type];
  const lines = [headers.join(","), ...example.map((row) => row.map((v) => `"${v}"`).join(","))];
  return lines.join("\n");
}

export function downloadTemplate(type: ImportType) {
  const csv = buildCsvTemplate(type);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mechpro_${type}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
