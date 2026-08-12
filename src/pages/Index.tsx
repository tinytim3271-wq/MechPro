import { useNavigate, Link } from "react-router-dom";
import { Authenticated, Unauthenticated } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import {
  Wrench, MapPin, FileText, Sparkles, Users, Calendar,
  CheckCircle, Clock, DollarSign, ShieldCheck, Star, ArrowRight,
  Smartphone, BarChart3, Zap, Play, ClipboardList, Send, CreditCard,
  ChevronDown, HelpCircle,
} from "lucide-react";
import { motion, useInView } from "motion/react";

function RedirectToDashboard() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/dashboard"); }, [navigate]);
  return null;
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Wrench, title: "Job Management", desc: "Create, assign, and track repair orders from intake to completion." },
  { icon: MapPin, title: "GPS Dispatch", desc: "Dispatch the closest available technician and cut drive time." },
  { icon: FileText, title: "Instant Invoicing", desc: "Generate invoices in seconds and collect payments on-site." },
  { icon: Sparkles, title: "AI Diagnostics", desc: "AI-assisted repair estimates and smart scheduling suggestions." },
  { icon: Users, title: "Team & Payroll", desc: "Manage profiles, schedules, certifications, and payroll." },
  { icon: Calendar, title: "Smart Scheduling", desc: "Route-optimized appointments with automatic customer updates." },
];

const STATS = [
  { value: "4.2 hrs", label: "Saved per week on admin" },
  { value: "38%", label: "Faster payment collection" },
  { value: "2.5x", label: "More repeat customers" },
];

const TESTIMONIALS = [
  {
    quote: "MechPro cut my invoicing time from 30 minutes to 30 seconds. I get paid the same day now instead of chasing customers for weeks.",
    name: "Marcus J.",
    role: "Owner, FastFix Mobile Auto",
    stars: 5,
  },
  {
    quote: "The scheduling and GPS dispatch alone saved me two hours a day. My techs finish more jobs because they aren't criss-crossing the city.",
    name: "Derrick W.",
    role: "Fleet Manager, DW Automotive",
    stars: 5,
  },
  {
    quote: "I used to run everything from a notebook and QuickBooks. MechPro replaced all of it. It's built by someone who actually understands mobile repair.",
    name: "Sarah T.",
    role: "Solo Mobile Mechanic",
    stars: 5,
  },
];

const PRICING_FEATURES = [
  "Unlimited repair orders & invoices",
  "Customer portal & online booking",
  "GPS tracking & smart dispatch",
  "AI diagnostics & cost estimates",
  "Team management & payroll",
  "Parts inventory tracking",
  "Marketing tools & campaigns",
  "Revenue analytics & reports",
];

const WORKFLOW_STEPS = [
  {
    step: 1,
    icon: ClipboardList,
    title: "Customer Calls In",
    description: "Create a repair order in seconds. VIN decode fills in vehicle details automatically.",
    detail: "No more paper forms or missed info",
  },
  {
    step: 2,
    icon: Wrench,
    title: "Diagnose & Estimate",
    description: "AI suggests common fixes based on symptoms. Build a detailed estimate with parts and labor.",
    detail: "Send estimate to customer for approval via text",
  },
  {
    step: 3,
    icon: Send,
    title: "Customer Approves",
    description: "Customer gets a text with a link to review and approve. No phone tag needed.",
    detail: "Automatic SMS keeps them in the loop",
  },
  {
    step: 4,
    icon: MapPin,
    title: "Dispatch & Repair",
    description: "Assign the job to a tech. They see it on their phone and start working. Parts auto-deduct from inventory.",
    detail: "GPS tracking shows you where everyone is",
  },
  {
    step: 5,
    icon: CreditCard,
    title: "Invoice & Get Paid",
    description: "Generate a professional invoice in one tap. Send a payment link and get paid the same day.",
    detail: "Average payment time: under 2 hours",
  },
];

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-20px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-24 pb-28 md:pt-28 md:pb-36">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <Zap size={12} /> Built for mobile mechanics
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground leading-[1.1] text-balance mb-6" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Run Your Repair Business<br />
            <span className="text-primary">From Anywhere</span>
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Jobs, invoicing, scheduling, GPS dispatch, and AI diagnostics — everything you need to run a professional mobile repair operation, all in one place.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <SignInButton signInText="Start Free Trial" size="lg" className="cursor-pointer" />
            <Button variant="ghost" size="lg" className="cursor-pointer gap-2 text-muted-foreground hover:text-foreground" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
              See how it works <ArrowRight size={16} />
            </Button>
          </div>
        </motion.div>

        {/* Hero product image */}
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="mt-16 md:mt-20"
        >
          <div className="relative mx-auto max-w-5xl rounded-xl overflow-hidden border border-border/50 shadow-2xl">
            <img
              src="https://hercules-cdn.com/cdn-cgi/image/w=1200,q=80,fit=cover,format=auto/file_p8AvXIR2V60P3bUDEkMZ1R2d"
              alt="MechPro dashboard showing repair orders, revenue metrics, and scheduling"
              className="w-full h-auto"
              width={1200}
              height={675}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent pointer-events-none" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section className="py-12 border-y border-border/50 bg-card/50">
      <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
        {STATS.map((stat, i) => (
          <FadeIn key={stat.label} delay={i * 0.1} className="text-center">
            <p className="text-2xl md:text-4xl font-bold text-primary" style={{ fontFamily: "Rajdhani, sans-serif" }}>{stat.value}</p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">{stat.label}</p>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <FadeIn className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Everything Your Shop Needs
          </h2>
          <p className="text-muted-foreground mt-3 max-w-lg mx-auto">
            Purpose-built tools that replace paper work orders, spreadsheets, and separate invoicing apps.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <FadeIn key={title} delay={i * 0.05}>
              <div className="group bg-card border border-border rounded-xl p-6 hover:border-primary/30 hover:bg-primary/[0.02] transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                  <Icon className="text-primary" size={20} />
                </div>
                <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductTourSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-16 md:py-24 bg-card/30 relative overflow-hidden" ref={ref}>
      {/* Background pattern */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/3 blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6">
        <FadeIn className="text-center mb-6">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
            <Play size={12} /> See It In Action
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            From Phone Call to Payment<br />
            <span className="text-primary">In 5 Simple Steps</span>
          </h2>
          <p className="text-muted-foreground mt-3 max-w-lg mx-auto">
            Here{"'"}s how a typical job flows through MechPro — start to finish, no paper required.
          </p>
        </FadeIn>

        {/* Free trial badge */}
        <FadeIn delay={0.1} className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20">
            <CheckCircle size={14} className="text-green-400" />
            <span className="text-sm text-green-400 font-medium">7-day free trial — no credit card required</span>
          </div>
        </FadeIn>

        {/* Workflow steps */}
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-6 md:left-1/2 md:-translate-x-px top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/40 via-primary/20 to-transparent hidden md:block" />
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/40 via-primary/20 to-transparent md:hidden" />

          <div className="space-y-5 md:space-y-12">
            {WORKFLOW_STEPS.map(({ step, icon: Icon, title, description, detail }, i) => {
              const isLeft = i % 2 === 0;
              return (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: isLeft ? -30 : 30, y: 20 }}
                  animate={isInView ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: isLeft ? -30 : 30, y: 20 }}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.15, ease: "easeOut" }}
                  className={`relative flex items-start gap-4 md:gap-0 ${
                    isLeft ? "md:flex-row" : "md:flex-row-reverse"
                  }`}
                >
                  {/* Mobile step indicator */}
                  <div className="md:hidden w-12 h-12 rounded-full bg-primary flex items-center justify-center shrink-0 z-10 shadow-lg shadow-primary/20">
                    <span className="text-primary-foreground font-bold text-sm">{step}</span>
                  </div>

                  {/* Card */}
                  <div className={`flex-1 md:w-[calc(50%-2rem)] ${isLeft ? "md:pr-12" : "md:pl-12"}`}>
                    <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors group">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                          <Icon size={16} className="text-primary" />
                        </div>
                        <h3 className="font-semibold text-foreground">{title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-2">{description}</p>
                      <p className="text-xs text-primary/80 font-medium">{detail}</p>
                    </div>
                  </div>

                  {/* Desktop center node */}
                  <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 top-4 w-10 h-10 rounded-full bg-primary items-center justify-center z-10 shadow-lg shadow-primary/20">
                    <span className="text-primary-foreground font-bold text-sm">{step}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Bottom CTA */}
        <FadeIn delay={0.8} className="text-center mt-14">
          <p className="text-muted-foreground text-sm mb-4">
            That{"'"}s it. Five steps. One app. Zero paperwork.
          </p>
          <SignInButton signInText="Start Free Trial" className="cursor-pointer" />
        </FadeIn>
      </div>
    </section>
  );
}

function ShowcaseSection() {
  return (
    <section className="py-16 md:py-24 bg-card/30">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Text content */}
          <FadeIn>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                Your Office is Your Van.{" "}
                <span className="text-primary">MechPro Goes With You.</span>
              </h2>
              <div className="space-y-5">
                {[
                  { icon: Smartphone, text: "Fully mobile — manage everything from your phone between jobs" },
                  { icon: Clock, text: "Save 4+ hours per week on paperwork, invoicing, and scheduling" },
                  { icon: DollarSign, text: "Get paid the same day with instant digital invoices and payment links" },
                  { icon: BarChart3, text: "Track revenue, identify top services, and grow smarter" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon size={16} className="text-primary" />
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Phone mockup */}
          <FadeIn delay={0.2}>
            <div className="relative flex justify-center">
              <div className="w-64 md:w-72 rounded-3xl overflow-hidden border-2 border-border shadow-xl">
                <img
                  src="https://hercules-cdn.com/cdn-cgi/image/w=600,q=80,fit=cover,format=auto/file_7B9CYK33J3WMfiB08AOP96Kc"
                  alt="MechPro mobile scheduling interface"
                  className="w-full h-auto"
                  loading="lazy"
                  width={600}
                  height={1067}
                />
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <FadeIn className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Trusted by Mobile Mechanics
          </h2>
          <p className="text-muted-foreground mt-3">
            Here{"'"}s what shop owners and solo techs are saying.
          </p>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <FadeIn key={t.name} delay={i * 0.1}>
              <div className="bg-card border border-border rounded-xl p-6 flex flex-col h-full">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} size={14} className="fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed flex-1 italic">
                  {'"'}{t.quote}{'"'}
                </p>
                <div className="mt-5 pt-4 border-t border-border/50">
                  <p className="font-semibold text-sm text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section className="py-16 md:py-24 bg-card/30">
      <div className="max-w-4xl mx-auto px-6">
        <FadeIn className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Simple, Transparent Pricing
          </h2>
          <p className="text-muted-foreground mt-3">
            7-day free trial. No setup fees. No long-term contracts. Cancel anytime.
          </p>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="bg-card border border-primary/30 rounded-2xl p-8 md:p-10 max-w-lg mx-auto relative overflow-hidden">
            {/* Accent glow */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 blur-3xl rounded-full pointer-events-none" />

            <div className="relative">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl md:text-5xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>$29</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
              <p className="text-muted-foreground text-sm mb-2">
                Full access to all features. No per-user charges.
              </p>
              <p className="text-xs text-primary font-medium mb-8">
                Or $278/year (save 20%)
              </p>

              <ul className="space-y-3 mb-8">
                {PRICING_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-foreground/90">
                    <CheckCircle size={16} className="text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <SignInButton signInText="Start Free Trial" className="cursor-pointer" />
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function WhySection() {
  return (
    <section className="py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Image */}
          <FadeIn>
            <div className="rounded-xl overflow-hidden border border-border/50 shadow-lg">
              <img
                src="https://hercules-cdn.com/cdn-cgi/image/w=800,q=80,fit=cover,format=auto/file_y2f9kV15ZS20DQ7F51PXyK8o"
                alt="Mobile mechanic using MechPro on tablet while working"
                className="w-full h-auto"
                loading="lazy"
                width={800}
                height={533}
              />
            </div>
          </FadeIn>

          {/* Text */}
          <FadeIn delay={0.2}>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                Built by Mechanics,<br />
                <span className="text-primary">For Mechanics</span>
              </h2>
              <div className="space-y-5">
                {[
                  { icon: ShieldCheck, title: "Stay Professional", body: "Complete service histories, digital signatures, and branded invoices give you the credibility of a big shop." },
                  { icon: DollarSign, title: "Get Paid Faster", body: "Send payment links by text the moment a job is done. No more chasing checks or forgotten invoices." },
                  { icon: CheckCircle, title: "Grow Your Business", body: "Built-in marketing, customer portal, and online booking bring new customers to you on autopilot." },
                ].map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex gap-4">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon size={18} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-0.5">{title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-16 md:py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div className="relative max-w-3xl mx-auto px-6 text-center">
        <FadeIn>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Ready to Run a Smarter Shop?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
            Join hundreds of mobile mechanics who manage their entire business from one app. Sign up free — no credit card required.
          </p>
          <SignInButton signInText="Get Started Free" size="lg" className="cursor-pointer" />
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Landing FAQ ────────────────────────────────────────────────────────────

const LANDING_FAQ = [
  { q: "Is there a free trial?", a: "Yes — 7 days, full access, no credit card required." },
  { q: "Can I use it on my phone?", a: "Absolutely. MechPro is fully mobile-friendly and can be installed as an app on your home screen." },
  { q: "Do I need to sign a contract?", a: "No contracts. Pay monthly ($29/mo) or yearly ($278/yr). Cancel anytime — no penalties." },
  { q: "How do my customers pay?", a: "You send a payment link via text or email. They pay instantly with a credit or debit card. Funds go to your bank." },
  { q: "What if I have questions after signing up?", a: "Email us at lee@yourcarguy806.com — we typically respond within 24 hours. You can also browse our full FAQ." },
  { q: "Is my data safe?", a: "Yes. We use encrypted connections, secure cloud hosting, and industry-standard security practices. Card data is handled by Stripe and never touches our servers." },
];

function FAQAccordionItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 py-4 text-left cursor-pointer group"
      >
        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {question}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "text-muted-foreground shrink-0 mt-0.5 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <p className="text-sm text-muted-foreground leading-relaxed pb-4 pr-8">
          {answer}
        </p>
      )}
    </div>
  );
}

function FAQSection() {
  return (
    <section className="py-16 md:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <FadeIn className="text-center mb-10">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
            <HelpCircle size={12} /> Common Questions
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Frequently Asked Questions
          </h2>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="border border-border rounded-xl overflow-hidden bg-card px-5">
            {LANDING_FAQ.map((item) => (
              <FAQAccordionItem key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={0.2} className="text-center mt-6">
          <Link to="/faq" className="text-sm text-primary hover:underline cursor-pointer">
            View all frequently asked questions →
          </Link>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Index() {
  return (
    <>
      <Authenticated>
        <RedirectToDashboard />
      </Authenticated>
      <Unauthenticated>
        <div className="min-h-screen bg-background flex flex-col">
          {/* Sticky header */}
          <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/50">
            <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
              <p className="text-xl font-bold text-primary" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                ⚙ MechPro
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground hidden sm:inline">Already have an account?</span>
                <SignInButton />
              </div>
            </div>
          </header>

          <main className="flex-1">
            <HeroSection />
            <StatsSection />
            <FeaturesSection />
            <ProductTourSection />
            <ShowcaseSection />
            <TestimonialsSection />
            <WhySection />
            <PricingSection />
            <FAQSection />
            <CTASection />
          </main>

          <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} MechPro. All rights reserved.</p>
            <p className="mt-1">The complete mobile mechanic management platform.</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <Link to="/book" className="hover:text-foreground transition-colors cursor-pointer py-1 text-sm sm:text-xs">Book a Service</Link>
              <Link to="/portal" className="hover:text-foreground transition-colors cursor-pointer py-1 text-sm sm:text-xs">Customer Portal</Link>
              <Link to="/download" className="hover:text-foreground transition-colors cursor-pointer py-1 text-sm sm:text-xs">Download App</Link>
              <Link to="/faq" className="hover:text-foreground transition-colors cursor-pointer py-1 text-sm sm:text-xs">FAQ</Link>
              <Link to="/contact" className="hover:text-foreground transition-colors cursor-pointer py-1 text-sm sm:text-xs">Contact</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors cursor-pointer py-1 text-sm sm:text-xs">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors cursor-pointer py-1 text-sm sm:text-xs">Terms of Service</Link>
            </div>
          </footer>
        </div>
      </Unauthenticated>
    </>
  );
}
