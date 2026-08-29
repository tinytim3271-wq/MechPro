import { useState, useEffect } from "react";
import { Download, Smartphone, CheckCircle2, Chrome, Share, MoreVertical, ArrowDown, Wifi, Bell, MapPin, Zap } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import { motion } from "motion/react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && (navigator as Record<string, unknown>).standalone === true);
}

export default function DownloadPage() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      const result = await installEvent.userChoice;
      if (result.outcome === "accepted") {
        setInstalled(true);
      }
    } finally {
      setInstalling(false);
    }
  };

  const android = isAndroid();
  const ios = isIOS();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="max-w-lg mx-auto px-6 pt-12 pb-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center space-y-4"
          >
            {/* App Icon */}
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-primary/70 shadow-xl mx-auto flex items-center justify-center">
              <img src="/icon/icon-192.png" alt="MechPro" className="w-16 h-16 rounded-2xl" />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                Get MechPro
              </h1>
              <p className="text-muted-foreground text-sm">
                Install on your phone, desktop, or add to your home screen. Also available on the App Store and Google Play.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">Free</Badge>
              <Badge variant="secondary" className="text-xs">No download limit</Badge>
              <Badge variant="secondary" className="text-xs">Always up to date</Badge>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Install section */}
      <div className="max-w-lg mx-auto px-6 space-y-6 pb-12">
        {/* Already installed */}
        {installed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="border-green-500/50 bg-green-500/5">
              <CardContent className="p-5 text-center space-y-3">
                <CheckCircle2 size={40} className="text-green-500 mx-auto" />
                <h2 className="text-lg font-bold text-foreground">Already Installed</h2>
                <p className="text-sm text-muted-foreground">
                  MechPro is installed on this device. Look for it on your home screen.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* One-tap install (Chrome on Android) */}
        {!installed && installEvent && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-primary/50">
              <CardContent className="p-5 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto">
                  <Download size={24} className="text-primary" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-foreground">Ready to Install</h2>
                  <p className="text-sm text-muted-foreground">
                    Tap below to add MechPro to your home screen
                  </p>
                </div>
                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-bold cursor-pointer"
                  onClick={handleInstall}
                  disabled={installing}
                >
                  {installing ? (
                    "Installing..."
                  ) : (
                    <>
                      <Download size={20} className="mr-2" />
                      Install MechPro
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Opens instantly, works offline, no storage fees
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Manual instructions (no install event available) */}
        {!installed && !installEvent && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            {/* Android Chrome instructions */}
            {(android || (!android && !ios)) && (
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                      <Chrome size={20} className="text-green-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">Install on Android</h3>
                      <p className="text-xs text-muted-foreground">Using Chrome browser</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Step number={1}>
                      <span>Tap the <strong>menu icon</strong></span>
                      <MoreVertical size={14} className="inline ml-1 text-muted-foreground" />
                      <span className="text-muted-foreground"> (three dots, top-right)</span>
                    </Step>
                    <Step number={2}>
                      <span>Tap <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong></span>
                    </Step>
                    <Step number={3}>
                      <span>Tap <strong>&quot;Install&quot;</strong> in the popup</span>
                    </Step>
                    <Step number={4}>
                      <span>MechPro will appear on your home screen</span>
                      <CheckCircle2 size={14} className="inline ml-1 text-green-500" />
                    </Step>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* iOS instructions */}
            {(ios || (!android && !ios)) && (
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                      <Smartphone size={20} className="text-blue-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">Install on iPhone / iPad</h3>
                      <p className="text-xs text-muted-foreground">Using Safari browser</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Step number={1}>
                      <span>Open this page in <strong>Safari</strong></span>
                    </Step>
                    <Step number={2}>
                      <span>Tap the <strong>Share</strong> button</span>
                      <Share size={14} className="inline ml-1 text-muted-foreground" />
                      <span className="text-muted-foreground"> (bottom of screen)</span>
                    </Step>
                    <Step number={3}>
                      <span>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></span>
                    </Step>
                    <Step number={4}>
                      <span>Tap <strong>&quot;Add&quot;</strong> in the top-right corner</span>
                      <CheckCircle2 size={14} className="inline ml-1 text-green-500" />
                    </Step>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">
            What you get
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <FeatureCard icon={Zap} label="Instant launch" description="Opens like a native app" />
            <FeatureCard icon={Wifi} label="Works offline" description="Core features stay available" />
            <FeatureCard icon={Bell} label="Push alerts" description="Job updates in real time" />
            <FeatureCard icon={MapPin} label="GPS tracking" description="Location while on the clock" />
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-3"
        >
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Common questions
          </h3>
          <div className="space-y-2 text-sm">
            <FaqItem q="Is this a real app?" a="Yes. It installs on your phone and works just like apps from the Play Store. It gets its own icon, opens full-screen, and can send push notifications." />
            <FaqItem q="Does it take up storage?" a="Very little. It's under 5 MB, much smaller than a typical app." />
            <FaqItem q="Will it stay updated?" a="Always. Every time you open the app, it automatically gets the latest version." />
            <FaqItem q="Do I need an account?" a="Your mechanic will set up your account. Technicians can sign in after being invited." />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-primary">{number}</span>
      </div>
      <p className="text-sm text-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, label, description }: { icon: React.ElementType; label: string; description: string }) {
  return (
    <div className="bg-muted/30 rounded-xl p-3.5 space-y-1.5">
      <Icon size={18} className="text-primary" />
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="bg-muted/20 rounded-xl px-4 py-3">
      <p className="font-medium text-foreground">{q}</p>
      <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{a}</p>
    </div>
  );
}
