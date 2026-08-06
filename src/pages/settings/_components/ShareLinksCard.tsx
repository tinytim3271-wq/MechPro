import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Copy, Check, ExternalLink, Share2, Calendar, Users, QrCode, Download } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

type ShareLinksCardProps = {
  orgId: string;
  orgName: string;
};

export default function ShareLinksCard({ orgId, orgName }: ShareLinksCardProps) {
  const baseUrl = window.location.origin;
  const bookingUrl = `${baseUrl}/book?org=${orgId}`;
  const portalUrl = `${baseUrl}/portal?org=${orgId}`;

  const [copiedBooking, setCopiedBooking] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const [bookingQr, setBookingQr] = useState<string>("");
  const [portalQr, setPortalQr] = useState<string>("");
  const [showQr, setShowQr] = useState<"booking" | "portal" | null>(null);

  // Generate QR codes
  const generateQR = useCallback(async (url: string): Promise<string> => {
    return QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: { dark: "#1a1a1a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  }, []);

  useEffect(() => {
    if (orgId) {
      generateQR(bookingUrl).then(setBookingQr);
      generateQR(portalUrl).then(setPortalQr);
    }
  }, [orgId, bookingUrl, portalUrl, generateQR]);

  const handleCopy = (url: string, type: "booking" | "portal") => {
    navigator.clipboard.writeText(url);
    if (type === "booking") {
      setCopiedBooking(true);
      setTimeout(() => setCopiedBooking(false), 2000);
    } else {
      setCopiedPortal(true);
      setTimeout(() => setCopiedPortal(false), 2000);
    }
    toast.success("Link copied to clipboard!");
  };

  const handleDownloadQR = (dataUrl: string, label: string) => {
    const link = document.createElement("a");
    link.download = `${orgName.replace(/\s+/g, "-").toLowerCase()}-${label}-qr.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleShare = async (url: string, title: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled share or share not supported
      }
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 size={16} className="text-primary" /> Share Your Links
        </CardTitle>
        <CardDescription>
          Give customers easy access to book appointments and view their service history. Copy these links to share via text, email, social media, or print the QR codes for your shop.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="booking" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="booking" className="cursor-pointer gap-1.5">
              <Calendar size={14} /> Booking
            </TabsTrigger>
            <TabsTrigger value="portal" className="cursor-pointer gap-1.5">
              <Users size={14} /> Customer Portal
            </TabsTrigger>
          </TabsList>

          <TabsContent value="booking" className="space-y-4 mt-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Online Booking Page</p>
              <p className="text-xs text-muted-foreground mb-3">
                Customers can schedule appointments, select services, and pick a time that works for them.
              </p>
            </div>

            {/* URL display */}
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30 font-mono text-xs text-muted-foreground break-all">
              {bookingUrl}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={() => handleCopy(bookingUrl, "booking")}
              >
                {copiedBooking
                  ? <><Check size={13} className="mr-1 text-green-400" /> Copied!</>
                  : <><Copy size={13} className="mr-1" /> Copy Link</>}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={() => handleShare(bookingUrl, `Book with ${orgName}`)}
              >
                <ExternalLink size={13} className="mr-1" /> Share
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={() => setShowQr(showQr === "booking" ? null : "booking")}
              >
                <QrCode size={13} className="mr-1" /> QR Code
              </Button>
            </div>

            {/* QR Code */}
            {showQr === "booking" && bookingQr && (
              <div className="flex flex-col items-center gap-3 p-4 rounded-lg border border-border bg-white">
                <img src={bookingQr} alt="Booking QR Code" className="w-48 h-48" />
                <p className="text-xs text-gray-600 font-medium">Scan to book an appointment</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => handleDownloadQR(bookingQr, "booking")}
                >
                  <Download size={13} className="mr-1" /> Download QR
                </Button>
              </div>
            )}

            {/* Suggestions */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
              <p className="text-xs font-medium text-foreground mb-1.5">Tips for sharing:</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li>Add the link to your Google Business Profile</li>
                <li>Include it in your email signature</li>
                <li>Print the QR code on business cards or flyers</li>
                <li>Post on social media with a &ldquo;Book Now&rdquo; call to action</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="portal" className="space-y-4 mt-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Customer Portal</p>
              <p className="text-xs text-muted-foreground mb-3">
                Customers can view their service history, invoices, vehicles, and pay outstanding balances.
              </p>
            </div>

            {/* URL display */}
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30 font-mono text-xs text-muted-foreground break-all">
              {portalUrl}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={() => handleCopy(portalUrl, "portal")}
              >
                {copiedPortal
                  ? <><Check size={13} className="mr-1 text-green-400" /> Copied!</>
                  : <><Copy size={13} className="mr-1" /> Copy Link</>}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={() => handleShare(portalUrl, `${orgName} - Customer Portal`)}
              >
                <ExternalLink size={13} className="mr-1" /> Share
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={() => setShowQr(showQr === "portal" ? null : "portal")}
              >
                <QrCode size={13} className="mr-1" /> QR Code
              </Button>
            </div>

            {/* QR Code */}
            {showQr === "portal" && portalQr && (
              <div className="flex flex-col items-center gap-3 p-4 rounded-lg border border-border bg-white">
                <img src={portalQr} alt="Portal QR Code" className="w-48 h-48" />
                <p className="text-xs text-gray-600 font-medium">Scan to view your service history</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => handleDownloadQR(portalQr, "portal")}
                >
                  <Download size={13} className="mr-1" /> Download QR
                </Button>
              </div>
            )}

            {/* Info */}
            <p className="text-xs text-muted-foreground">
              Customers use the email address on file to sign in. They get read-only access to their ROs, invoices, and vehicles.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
