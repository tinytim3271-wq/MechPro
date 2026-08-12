import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, MessageSquare, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { toast } from "sonner";
import { motion } from "motion/react";

// ─── Contact page ────────────────────────────────────────────────────────────

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const message = formData.get("message") as string;

    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill out all fields.");
      return;
    }

    setSending(true);

    // Construct mailto link as a simple contact mechanism
    const subject = encodeURIComponent(`MechPro Support: from ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
    window.open(`mailto:lee@yourcarguy806.com?subject=${subject}&body=${body}`, "_self");

    // Show success after a brief delay
    setTimeout(() => {
      setSending(false);
      setSubmitted(true);
    }, 500);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4 max-w-sm"
        >
          <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-green-400" />
          </div>
          <h2 className="text-xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Message Ready to Send
          </h2>
          <p className="text-sm text-muted-foreground">
            Your email client should have opened with a pre-filled message. If it didn&apos;t, you can email us directly at{" "}
            <a href="mailto:lee@yourcarguy806.com" className="text-primary hover:underline">
              lee@yourcarguy806.com
            </a>
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer"
          >
            <ArrowLeft size={14} /> Back to home
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12">
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
          Contact & Support
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Have a question, need help, or want to report an issue? We&apos;re here for you.
        </p>

        {/* Quick info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Mail size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Email</p>
                <a
                  href="mailto:lee@yourcarguy806.com"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  lee@yourcarguy806.com
                </a>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Clock size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Response Time</p>
                <p className="text-xs text-muted-foreground">Within 24 hours</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <MessageSquare size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">FAQ</p>
                <Link to="/faq" className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                  Browse common questions
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Contact form */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-1">Send a Message</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Describe your question or issue and we&apos;ll get back to you.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Your Name</Label>
                  <Input id="name" name="name" placeholder="John Smith" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Your Email</Label>
                  <Input id="email" name="email" type="email" placeholder="john@example.com" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" name="subject" placeholder="e.g. Question about invoicing" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  name="message"
                  rows={5}
                  placeholder="Tell us how we can help..."
                  required
                />
              </div>
              <Button type="submit" className="w-full cursor-pointer" disabled={sending}>
                {sending ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
