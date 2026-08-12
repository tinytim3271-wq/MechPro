import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils.ts";

// ─── FAQ data ────────────────────────────────────────────────────────────────

const FAQ_CATEGORIES = [
  {
    category: "Getting Started",
    items: [
      {
        q: "How do I set up my shop?",
        a: "After signing in for the first time, you'll be guided through a quick 2-step setup where you enter your shop name, contact info, and rates. You can always update these later in Settings.",
      },
      {
        q: "How do I invite my technicians or staff?",
        a: "Go to the Employees page and click \"Invite Employee.\" Enter their name and email address — they'll receive an invite to join your shop. Once they sign in, they'll see the Tech Portal with their assigned jobs.",
      },
      {
        q: "Can I use MechPro on my phone?",
        a: "Yes! MechPro is fully mobile-friendly and works on any phone or tablet. You can even install it as an app on your home screen for quick access — just look for the \"Install\" prompt in your browser.",
      },
      {
        q: "Is there a free trial?",
        a: "Yes — you get a 7-day free trial with full access to all features. No credit card is required to start. After the trial, it's $29/month or $278/year.",
      },
    ],
  },
  {
    category: "Repair Orders & Jobs",
    items: [
      {
        q: "How do I create a repair order?",
        a: "From the Dashboard, click \"New Intake\" (the + button). You'll be guided through adding the customer, vehicle, and service details. You can also create jobs directly from the Jobs page.",
      },
      {
        q: "How does the VIN decoder work?",
        a: "When you type or scan a VIN number while creating a repair order, MechPro automatically looks up the vehicle's year, make, model, engine, and other details — saving you from typing them manually.",
      },
      {
        q: "How do I send an estimate to a customer for approval?",
        a: "On any repair order, click \"Send Estimate.\" The customer will receive a text or email with a link where they can review the work and approve it with one tap. You'll get notified when they respond.",
      },
      {
        q: "What do the different job statuses mean?",
        a: "Estimate = waiting for customer approval. Approved = ready to start. In Progress = actively being worked on. Waiting Parts = paused until parts arrive. Completed = work is done. Invoiced = billed to the customer.",
      },
    ],
  },
  {
    category: "Invoicing & Payments",
    items: [
      {
        q: "How do I create and send an invoice?",
        a: "From a completed repair order, click \"Create Invoice.\" MechPro generates a professional invoice with all the parts, labor, and tax calculated. Send it to the customer via email or text — they can pay online instantly.",
      },
      {
        q: "How do customers pay online?",
        a: "Customers receive a secure payment link in their invoice. They can pay with a credit or debit card. Payments are processed by Stripe and funds go directly to your account.",
      },
      {
        q: "Can I download or print invoices?",
        a: "Yes. Both you and your customers can download invoices as PDF files. Look for the \"Download PDF\" button on any invoice.",
      },
      {
        q: "How do partial payments work?",
        a: "If a customer pays part of an invoice, the remaining balance is tracked automatically. They can make additional payments until the full amount is settled. You'll see the status as \"Partial\" until it's fully paid.",
      },
    ],
  },
  {
    category: "Scheduling & Booking",
    items: [
      {
        q: "How does online booking work?",
        a: "Share your booking link with customers (found on your Dashboard or in Settings). Customers fill out a simple form describing what they need. You'll get notified and can confirm or reschedule the appointment.",
      },
      {
        q: "Can customers book appointments themselves?",
        a: "Yes — the booking link lets them request an appointment, but you always have final approval. They pick a preferred date and time, and you confirm what works for your schedule.",
      },
      {
        q: "How do I share my booking link?",
        a: "Go to your Dashboard and find the \"Share Links\" card, or go to Settings. You can copy the link and post it anywhere — your website, social media, Google Business profile, text messages, etc.",
      },
    ],
  },
  {
    category: "SMS & Notifications",
    items: [
      {
        q: "How do I set up text message notifications?",
        a: "Go to Settings and scroll to the SMS section. You'll need a Twilio account (twilio.com) — it's a service that sends text messages on your behalf. Enter your Account SID, Auth Token, and phone number. Twilio typically costs about $0.01 per text.",
      },
      {
        q: "What texts are sent automatically?",
        a: "You can enable automatic texts for when a job starts and when it's completed. Customers get a friendly update like \"Your vehicle is being worked on\" or \"Your repair is done — here's your invoice.\"",
      },
      {
        q: "Can I customize the text messages?",
        a: "Yes — in Settings under the SMS section, you can edit the templates for both the \"job started\" and \"job completed\" messages to match your tone and brand.",
      },
    ],
  },
  {
    category: "Team & Payroll",
    items: [
      {
        q: "How does the time clock work for technicians?",
        a: "Technicians clock in and out from their Tech Portal. You can see everyone's hours under the Employees section. Hours are automatically tracked for payroll.",
      },
      {
        q: "How do I manage payroll?",
        a: "MechPro tracks hours and calculates pay based on each employee's hourly rate. You can review hours, make adjustments, and export payroll data. Go to Employees and select the Payroll tab.",
      },
      {
        q: "Can I use GPS to see where my techs are?",
        a: "Yes — when technicians have GPS enabled on their device, you can see their live location on a map in the Employees page. This helps with dispatching the nearest available tech to a job.",
      },
    ],
  },
  {
    category: "AI Tools",
    items: [
      {
        q: "What are the AI diagnostics?",
        a: "Enter a vehicle and describe the symptoms, and MechPro's AI will suggest probable causes, recommended tests, and estimated repair costs. It's a starting point to help diagnose — always verify with your own expertise.",
      },
      {
        q: "How accurate are AI estimates?",
        a: "AI estimates are based on typical repair costs and industry data. They're a helpful starting point but should always be adjusted based on your local rates, parts availability, and the specific condition of the vehicle.",
      },
      {
        q: "Is my data shared with AI?",
        a: "Only vehicle symptoms and repair descriptions are sent to generate suggestions. No personal customer identity data (names, phone numbers, emails) is ever shared with the AI system.",
      },
    ],
  },
  {
    category: "Customer Portal",
    items: [
      {
        q: "What can my customers see in the portal?",
        a: "Customers can view their service history, vehicles on file, and invoices. They can also download invoice PDFs and pay outstanding balances directly from the portal.",
      },
      {
        q: "How do customers access the portal?",
        a: "Share the Customer Portal link (found on your Dashboard or Settings). Customers sign in with the same email address you have on file for them. If their email doesn't match your records, they won't be able to access it.",
      },
      {
        q: "Can customers see all my other customers?",
        a: "No — customers only see their own records. Each person's view is completely private and limited to their vehicles, service history, and invoices.",
      },
    ],
  },
  {
    category: "Account & Billing",
    items: [
      {
        q: "How do I cancel my subscription?",
        a: "You can cancel anytime from Settings. Your access continues until the end of your current billing period. After cancellation, your data stays available for 30 days.",
      },
      {
        q: "Can I change my shop information later?",
        a: "Yes — everything you entered during setup can be updated anytime in Settings, including your shop name, address, phone, labor rate, tax rate, and service bays.",
      },
      {
        q: "Is my data secure?",
        a: "Yes. MechPro uses encrypted connections (SSL/TLS), secure cloud hosting, and role-based access controls. Payment card data is processed by Stripe and never stored on our servers. See our Privacy Policy for full details.",
      },
    ],
  },
];

// ─── Accordion item ──────────────────────────────────────────────────────────

function AccordionItem({ question, answer }: { question: string; answer: string }) {
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to home
        </Link>

        <h1
          className="text-3xl font-bold text-foreground mb-2"
          style={{ fontFamily: "Rajdhani, sans-serif" }}
        >
          Frequently Asked Questions
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Find answers to the most common questions about MechPro.
        </p>

        <div className="space-y-10">
          {FAQ_CATEGORIES.map((cat) => (
            <section key={cat.category}>
              <h2 className="text-lg font-semibold text-foreground mb-3">{cat.category}</h2>
              <div className="border border-border rounded-xl overflow-hidden bg-card px-5">
                {cat.items.map((item) => (
                  <AccordionItem key={item.q} question={item.q} answer={item.a} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Still need help? */}
        <div className="mt-12 text-center border border-border rounded-xl bg-card p-8">
          <h3 className="font-semibold text-foreground mb-2">Still have questions?</h3>
          <p className="text-sm text-muted-foreground mb-4">
            We&apos;re here to help. Reach out and we&apos;ll get back to you as soon as possible.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline cursor-pointer"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
