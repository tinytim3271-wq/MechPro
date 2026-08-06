import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { Search, Users, Wrench, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils.ts";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const [debouncedQuery] = useDebounce(query, 300);

  const results = useQuery(
    api.dashboard.globalSearch,
    debouncedQuery.length >= 2 ? { q: debouncedQuery } : "skip"
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (path: string) => {
    setIsOpen(false);
    setQuery("");
    navigate(path);
  };

  const hasResults =
    results &&
    (results.customers.length > 0 ||
      results.ros.length > 0 ||
      results.invoices.length > 0);

  const showDropdown = isOpen && debouncedQuery.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Search input */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search customers, ROs, invoices..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full h-9 pl-9 pr-8 rounded-md border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-card shadow-lg overflow-hidden max-h-80 overflow-y-auto">
          {results === undefined ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Searching...
            </div>
          ) : !hasResults ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            <>
              {/* Customers */}
              {results.customers.length > 0 && (
                <SearchSection
                  title="Customers"
                  icon={<Users size={14} />}
                >
                  {results.customers.map((c) => (
                    <SearchItem
                      key={c._id}
                      onClick={() => handleSelect("/customers")}
                      primary={c.name}
                      secondary={c.phone}
                    />
                  ))}
                </SearchSection>
              )}

              {/* Repair Orders */}
              {results.ros.length > 0 && (
                <SearchSection
                  title="Repair Orders"
                  icon={<Wrench size={14} />}
                >
                  {results.ros.map((ro) => (
                    <SearchItem
                      key={ro._id}
                      onClick={() => handleSelect("/jobs")}
                      primary={ro.roNumber}
                      secondary={`${ro.customerName} · ${ro.status.replace("_", " ")}`}
                    />
                  ))}
                </SearchSection>
              )}

              {/* Invoices */}
              {results.invoices.length > 0 && (
                <SearchSection
                  title="Invoices"
                  icon={<FileText size={14} />}
                >
                  {results.invoices.map((inv) => (
                    <SearchItem
                      key={inv._id}
                      onClick={() => handleSelect("/invoices")}
                      primary={inv.invoiceNumber}
                      secondary={`${inv.customerName} · $${inv.total.toFixed(2)} · ${inv.status}`}
                    />
                  ))}
                </SearchSection>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SearchSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function SearchItem({
  onClick,
  primary,
  secondary,
}: {
  onClick: () => void;
  primary: string;
  secondary?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-2 hover:bg-accent/50 transition-colors cursor-pointer",
        "flex items-center justify-between gap-2"
      )}
    >
      <span className="text-sm text-foreground truncate">{primary}</span>
      {secondary && (
        <span className="text-xs text-muted-foreground truncate shrink-0 max-w-[50%] text-right">
          {secondary}
        </span>
      )}
    </button>
  );
}
