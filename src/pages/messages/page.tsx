import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated } from "convex/react";
import { MessageSquare, Send, Phone, User, Car, Copy, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";

function buildSmsLink(phone: string, body: string): string {
  // Normalize phone number
  const digits = phone.replace(/\D/g, "");
  const normalizedPhone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : `+${digits}`;

  // Use sms: protocol — works on iOS, Android, macOS, Windows
  // iOS uses &body=, Android uses ?body=, but sms:number?&body= works on both
  const encodedBody = encodeURIComponent(body);
  return `sms:${normalizedPhone}?&body=${encodedBody}`;
}

function MessagesInner() {
  const customers = useQuery(api.messaging.getRecentCustomersForMessaging, {});
  const [search, setSearch] = useState("");
  const [selectedPhone, setSelectedPhone] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [copied, setCopied] = useState(false);

  if (customers === undefined) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.vehicle?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSendViaDevice = () => {
    if (!selectedPhone) {
      toast.error("No phone number selected");
      return;
    }
    const link = buildSmsLink(selectedPhone, messageBody);
    window.open(link, "_self");
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(messageBody).then(() => {
      setCopied(true);
      toast.success("Message copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => toast.error("Could not copy"));
  };

  const handleSelectCustomer = (phone: string, name: string) => {
    setSelectedPhone(phone);
    setSelectedName(name);
  };

  const statusColors: Record<string, string> = {
    estimate: "bg-blue-500/20 text-blue-400",
    approved: "bg-purple-500/20 text-purple-400",
    in_progress: "bg-orange-500/20 text-orange-400",
    waiting_parts: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-green-500/20 text-green-400",
    invoiced: "bg-teal-500/20 text-teal-400",
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MessageSquare className="text-primary" size={28} />
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Messages
          </h1>
          <p className="text-muted-foreground text-sm">
            Send texts to customers using your device&apos;s messaging app
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">How it works:</strong> Select a customer, type or edit your message,
          then tap &quot;Send via Messages&quot; — this opens your phone&apos;s or computer&apos;s built-in messaging app
          with the number and message pre-filled. Just hit send!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Customers</CardTitle>
            <CardDescription className="text-xs">
              Select a customer to message
            </CardDescription>
            <div className="relative mt-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or vehicle..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto space-y-1.5">
            {filteredCustomers.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><User /></EmptyMedia>
                  <EmptyTitle>No customers found</EmptyTitle>
                  <EmptyDescription>
                    {customers.length === 0
                      ? "Create a repair order first to message customers"
                      : "Try a different search term"
                    }
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              filteredCustomers.map((c) => (
                <button
                  key={c.customerId}
                  onClick={() => handleSelectCustomer(c.phone, c.name)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors cursor-pointer",
                    selectedPhone === c.phone
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-secondary/50 hover:bg-secondary border border-transparent"
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User size={14} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{c.phone}</span>
                      {c.status && (
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColors[c.status])}>
                          {c.roNumber}
                        </Badge>
                      )}
                    </div>
                    {c.vehicle && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Car size={10} /> {c.vehicle}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Compose panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Compose Message</CardTitle>
            {selectedName && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs gap-1">
                  <Phone size={10} /> {selectedName}
                </Badge>
                <span className="text-xs text-muted-foreground">{selectedPhone}</span>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Phone input (manual entry) */}
            {!selectedPhone && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Phone Number</label>
                <Input
                  placeholder="(555) 123-4567"
                  value={selectedPhone}
                  onChange={(e) => setSelectedPhone(e.target.value)}
                />
              </div>
            )}

            {/* Message body */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Message</label>
              <textarea
                className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                placeholder="Type your message here..."
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={6}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {messageBody.length} characters
              </p>
            </div>

            {/* Quick templates */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Templates</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer text-xs"
                  onClick={() => setMessageBody(`Hi${selectedName ? ` ${selectedName.split(" ")[0]}` : ""}, your vehicle is ready for pickup! Give us a call if you have any questions.`)}
                >
                  Ready for Pickup
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer text-xs"
                  onClick={() => setMessageBody(`Hi${selectedName ? ` ${selectedName.split(" ")[0]}` : ""}, we've started work on your vehicle. We'll keep you updated on the progress!`)}
                >
                  Work Started
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer text-xs"
                  onClick={() => setMessageBody(`Hi${selectedName ? ` ${selectedName.split(" ")[0]}` : ""}, your estimate is ready. Please let us know if you'd like to approve and schedule the repair.`)}
                >
                  Estimate Ready
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer text-xs"
                  onClick={() => setMessageBody(`Hi${selectedName ? ` ${selectedName.split(" ")[0]}` : ""}, we're waiting on a part for your repair. We'll reach out as soon as it arrives.`)}
                >
                  Waiting on Parts
                </Button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <Button
                size="lg"
                className="cursor-pointer w-full gap-2 font-semibold"
                onClick={handleSendViaDevice}
                disabled={!selectedPhone || !messageBody}
              >
                <Send size={16} />
                Send via Messages
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer w-full gap-2"
                onClick={handleCopyMessage}
                disabled={!messageBody}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy Message Text"}
              </Button>
              {selectedPhone && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer text-xs text-muted-foreground"
                  onClick={() => { setSelectedPhone(""); setSelectedName(""); }}
                >
                  Clear selection
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center"><SignInButton /></div>
      </Unauthenticated>
      <Authenticated>
        <MessagesInner />
      </Authenticated>
    </>
  );
}
