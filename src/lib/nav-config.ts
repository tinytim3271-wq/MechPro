import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Users, Car, Wrench, Calendar, FileText, HardHat, Shield,
  UserCog, Package, Sparkles, Megaphone, Upload, Settings, TrendingUp,
  Building2, Merge, Navigation, MessageSquare, Banknote, Cpu, KeyRound,
} from "lucide-react";

export type NavRole =
  | "owner"
  | "admin"
  | "service_writer"
  | "mechanic"
  | "mobile_mechanic";

export type NavSection = "Shop" | "Team" | "Payroll" | "Bay" | "Admin";

export type NavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  roles: NavRole[];
  section: NavSection;
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["owner", "admin", "service_writer"], section: "Shop" },
  { to: "/tech", icon: HardHat, label: "My Jobs", roles: ["mechanic", "mobile_mechanic"], section: "Shop" },
  { to: "/customers", icon: Users, label: "Customers", roles: ["owner", "admin", "service_writer"], section: "Shop" },
  { to: "/vehicles", icon: Car, label: "Vehicle Lookup", roles: ["owner", "admin", "service_writer"], section: "Shop" },
  { to: "/jobs", icon: Wrench, label: "Repair Orders", roles: ["owner", "admin", "service_writer"], section: "Shop" },
  { to: "/schedule", icon: Calendar, label: "Schedule", roles: ["owner", "admin", "service_writer"], section: "Shop" },
  { to: "/invoices", icon: FileText, label: "Invoices", roles: ["owner", "admin", "service_writer"], section: "Shop" },
  { to: "/messages", icon: MessageSquare, label: "Messages", roles: ["owner", "admin", "service_writer"], section: "Shop" },
  { to: "/parts", icon: Package, label: "Parts & POs", roles: ["owner", "admin", "service_writer"], section: "Shop" },
  { to: "/employees", icon: UserCog, label: "Employees", roles: ["owner", "admin"], section: "Team" },
  { to: "/tracking", icon: Navigation, label: "GPS Tracking", roles: ["owner", "admin", "service_writer"], section: "Team" },
  { to: "/payroll", icon: Banknote, label: "Payroll", roles: ["owner", "admin"], section: "Payroll" },
  { to: "/obd", icon: Cpu, label: "OBD Bay", roles: ["owner", "admin", "service_writer", "mechanic", "mobile_mechanic"], section: "Bay" },
  { to: "/keys", icon: KeyRound, label: "Key Programming", roles: ["owner", "admin", "service_writer", "mechanic", "mobile_mechanic"], section: "Bay" },
  { to: "/ai", icon: Sparkles, label: "AI Tools", roles: ["owner", "admin", "service_writer", "mechanic", "mobile_mechanic"], section: "Bay" },
  { to: "/revenue", icon: TrendingUp, label: "Revenue Report", roles: ["owner", "admin"], section: "Admin" },
  { to: "/marketing", icon: Megaphone, label: "Marketing", roles: ["owner", "admin"], section: "Admin" },
  { to: "/locations", icon: Building2, label: "Locations", roles: ["owner", "admin"], section: "Admin" },
  { to: "/import", icon: Upload, label: "Import Data", roles: ["owner", "admin"], section: "Admin" },
  { to: "/duplicates", icon: Merge, label: "Duplicates", roles: ["owner", "admin"], section: "Admin" },
  { to: "/settings", icon: Settings, label: "Settings", roles: ["owner", "admin"], section: "Admin" },
  { to: "/admin", icon: Shield, label: "Admin Portal", roles: ["owner", "admin"], section: "Admin" },
];

export const ADMIN_PRIMARY_NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/jobs", icon: Wrench, label: "Jobs" },
  { to: "/customers", icon: Users, label: "Customers" },
  { to: "/invoices", icon: FileText, label: "Invoices" },
] as const;

export const ADMIN_MORE_NAV = [
  { to: "/vehicles", icon: Car, label: "Lookup" },
  { to: "/schedule", icon: Calendar, label: "Schedule" },
  { to: "/messages", icon: MessageSquare, label: "Messages" },
  { to: "/parts", icon: Package, label: "Parts & POs" },
  { to: "/employees", icon: UserCog, label: "Employees" },
  { to: "/payroll", icon: Banknote, label: "Payroll" },
  { to: "/obd", icon: Cpu, label: "OBD Bay" },
  { to: "/keys", icon: KeyRound, label: "Key Programming" },
  { to: "/tracking", icon: Navigation, label: "GPS Tracking" },
  { to: "/revenue", icon: TrendingUp, label: "Revenue Report" },
  { to: "/ai", icon: Sparkles, label: "AI Tools" },
  { to: "/marketing", icon: Megaphone, label: "Marketing" },
  { to: "/locations", icon: Building2, label: "Locations" },
  { to: "/import", icon: Upload, label: "Import Data" },
  { to: "/duplicates", icon: Merge, label: "Duplicates" },
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/admin", icon: Shield, label: "Admin Portal" },
] as const;

export function navItemsForRole(role: NavRole | null): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
