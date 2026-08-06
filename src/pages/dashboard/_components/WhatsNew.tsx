import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

// ─── Update entries ──────────────────────────────────────────────────────────
// Add new entries at the TOP. Each entry has a unique `id` for dismissal tracking.
const UPDATES = [
  {
    id: "2024-08-payroll-deductions",
    title: "Payroll Deductions & Advances",
    description: "Track advances, uniform costs, and tool expenses. Split deductions across multiple paychecks.",
  },
  {
    id: "2024-08-tech-onboarding",
    title: "Technician Onboarding",
    description: "New techs now see a guided walkthrough on their first login.",
  },
  {
    id: "2024-08-in-app-help",
    title: "In-App Help & Tips",
    description: "Contextual help text on Settings, AI Tools, and sidebar support links.",
  },
  {
    id: "2024-07-gps-tracking",
    title: "Live GPS Tracking",
    description: "Track your mobile techs in real-time on the dispatch map.",
  },
  {
    id: "2024-07-pwa-install",
    title: "Install as App",
    description: "MechPro can now be installed on phones and desktops for quick access.",
  },
] as const;

const STORAGE_KEY = "mechpro_whats_new_dismissed";

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissedIds(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export default function WhatsNew() {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setDismissedIds(getDismissedIds());
  }, []);

  const undismissed = UPDATES.filter((u) => !dismissedIds.has(u.id));

  if (!visible || undismissed.length === 0) return null;

  const dismissAll = () => {
    const allIds = new Set([...dismissedIds, ...UPDATES.map((u) => u.id)]);
    saveDismissedIds(allIds);
    setDismissedIds(allIds);
    setVisible(false);
  };

  const dismissOne = (id: string) => {
    const updated = new Set([...dismissedIds, id]);
    saveDismissedIds(updated);
    setDismissedIds(updated);
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary/15 flex items-center justify-center">
            <Sparkles size={14} className="text-primary" />
          </div>
          <h3
            className="text-sm font-bold text-foreground"
            style={{ fontFamily: "Rajdhani, sans-serif" }}
          >
            What&apos;s New
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={dismissAll}
          title="Dismiss all"
        >
          <X size={14} />
        </Button>
      </div>

      {/* Update items */}
      <ul className="space-y-2">
        {undismissed.map((update) => (
          <li
            key={update.id}
            className="flex items-start gap-3 group"
          >
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{update.title}</p>
              <p className="text-xs text-muted-foreground">{update.description}</p>
            </div>
            <button
              onClick={() => dismissOne(update.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer p-1"
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
