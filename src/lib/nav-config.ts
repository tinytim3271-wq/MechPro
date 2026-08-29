import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Users, Car, Wrench, Calendar, FileText, HardHat, Shield,
  UserCog, Package, Sparkles, Megaphone, Upload, Settings, TrendingUp,
  Building2, Merge, Navigation, MessageSquare,
} from "lucide-react";

export type NavRole =
  | "owner"
  | "admin"
  | "service_writer"
  | "mechanic"
  | "mobile_mechanic";

export type NavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  roles: NavRole[];
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["owner", "admin", "service_writer"] },
  { to: "/tech", icon: HardHat, label: "My Jobs", roles: ["mechanic", "mobile_mechanic"] },
  { to: "/customers", icon: Users, label: "Customers", roles: ["owner", "admin", "service_writer"] },
  { to: "/vehicles", icon: Car, label: "Vehicle Lookup", roles: ["owner", "admin", "service_writer"] },
  { to: "/jobs", icon: Wrench, label: "Repair Orders", roles: ["owner", "admin", "service_writer"] },
  { to: "/schedule", icon: Calendar, label: "Schedule", roles: ["owner", "admin", "service_writer"] },
  { to: "/invoices", icon: FileText, label: "Invoices", roles: ["owner", "admin", "service_writer"] },
  { to: "/messages", icon: MessageSquare, label: "Messages", roles: ["owner", "admin", "service_writer"] },
  { to: "/revenue", icon: TrendingUp, label: "Revenue Report", roles: ["owner", "admin"] },
  { to: "/employees", icon: UserCog, label: "Employees", roles: ["owner", "admin"] },
  { to: "/parts", icon: Package, label: "Parts", roles: ["owner", "admin", "service_writer"] },
  { to: "/ai", icon: Sparkles, label: "AI Tools", roles: ["owner", "admin", "service_writer", "mechanic", "mobile_mechanic"] },
  { to: "/marketing", icon: Megaphone, label: "Marketing", roles: ["owner", "admin"] },
  { to: "/locations", icon: Building2, label: "Locations", roles: ["owner", "admin"] },
  { to: "/tracking", icon: Navigation, label: "GPS Tracking", roles: ["owner", "admin", "service_writer"] },
  { to: "/import", icon: Upload, label: "Import Data", roles: ["owner", "admin"] },
  { to: "/duplicates", icon: Merge, label: "Duplicates", roles: ["owner", "admin"] },
  { to: "/settings", icon: Settings, label: "Settings", roles: ["owner", "admin"] },
  { to: "/admin", icon: Shield, label: "Admin Portal", roles: ["owner", "admin"] },
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
  { to: "/tracking", icon: Navigation, label: "GPS Tracking" },
  { to: "/revenue", icon: TrendingUp, label: "Revenue Report" },
  { to: "/employees", icon: UserCog, label: "Employees" },
  { to: "/parts", icon: Package, label: "Parts" },
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
