import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { toast } from "sonner";
import {
  CalendarDays, CheckCircle2, Wrench, Phone, Mail, MapPin, AlertCircle, Clock,
} from "lucide-react";
import { motion } from "motion/react";

// ─── Schema ───────────────────────────────────────────────────────────────────

const bookingSchema = z.object({
  customerName: z.string().min(2, "Name is required"),
  customerPhone: z.string().min(7, "Phone number is required"),
  customerEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  vehicleYear: z.string().optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleVin: z.string().optional(),
  serviceDescription: z.string().min(5, "Please describe the service needed"),
  preferredDate: z.string().min(1, "Please select a preferred date"),
  preferredTime: z.string().optional(),
  notes: z.string().optional(),
});

type BookingForm = z.infer<typeof bookingSchema>;

// ─── Time slots ───────────────────────────────────────────────────────────────

const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00",
];

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ─── Confirmation screen ──────────────────────────────────────────────────────

function ConfirmationScreen({ orgName, date, time }: { orgName: string; date: string; time?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-6 max-w-sm mx-auto"
    >
      <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
        <CheckCircle2 size={40} className="text-green-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
          Request Sent!
        </h2>
        <p className="text-muted-foreground">
          Your appointment request has been submitted to <strong>{orgName}</strong>.
        </p>
      </div>
      <div className="w-full rounded-lg border border-border bg-card p-4 text-sm space-y-2 text-left">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays size={14} />
          <span>
            {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "long", year: "numeric", month: "long", day: "numeric"
            })}
          </span>
        </div>
        {time && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock size={14} />
            <span>Preferred time: {formatTime(time)}</span>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        The shop will reach out to confirm your appointment. Check your phone or email for a follow-up.
      </p>
    </motion.div>
  );
}

// ─── No-org fallback ──────────────────────────────────────────────────────────

function NoOrgScreen() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center space-y-4">
      <AlertCircle size={48} className="text-muted-foreground" />
      <h2 className="text-xl font-semibold">Invalid booking link</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        This booking link doesn't include a shop identifier. Please contact the shop for the correct link.
      </p>
    </div>
  );
}

// ─── Booking form ─────────────────────────────────────────────────────────────

function BookingForm({ orgId }: { orgId: Id<"organizations"> }) {
  const org = useQuery(api.bookings.getOrgForBooking, { orgId });
  const submitBooking = useMutation(api.bookings.submitBooking);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BookingForm>({ resolver: zodResolver(bookingSchema) });

  const selectedTime = watch("preferredTime");
  const submittedDate = watch("preferredDate");

  const onSubmit = async (data: BookingForm) => {
    try {
      await submitBooking({
        orgId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail || undefined,
        vehicleYear: data.vehicleYear || undefined,
        vehicleMake: data.vehicleMake || undefined,
        vehicleModel: data.vehicleModel || undefined,
        vehicleVin: data.vehicleVin || undefined,
        serviceDescription: data.serviceDescription,
        preferredDate: data.preferredDate,
        preferredTime: data.preferredTime || undefined,
        notes: data.notes || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit request";
      toast.error(msg);
    }
  };

  if (org === undefined) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 space-y-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    );
  }

  if (!org) return <NoOrgScreen />;

  if (submitted) {
    return <ConfirmationScreen orgName={org.name} date={submittedDate} time={selectedTime} />;
  }

  // Min date = today
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Shop info */}
      <div className="space-y-1">
        {org.logoUrl ? (
          <img src={org.logoUrl} alt={org.name} className="h-10 object-contain mb-2" />
        ) : (
          <h2 className="text-2xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            {org.name}
          </h2>
        )}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {org.phone && <span className="flex items-center gap-1"><Phone size={11} />{org.phone}</span>}
          {org.email && <span className="flex items-center gap-1"><Mail size={11} />{org.email}</span>}
          {org.address && (
            <span className="flex items-center gap-1">
              <MapPin size={11} />{org.address}{org.city ? `, ${org.city}` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Request an Appointment</h1>
        <p className="text-sm text-muted-foreground">
          Fill out the form below and the shop will reach out to confirm your appointment.
        </p>
      </div>

      {/* Quick tips */}
      <div className="rounded-lg border border-border bg-card/50 p-4 space-y-2">
        <p className="text-xs font-medium text-foreground">How booking works:</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">1.</span>
            <span>Fill out this form with your info and what service you need</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">2.</span>
            <span>The shop reviews your request and checks availability</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">3.</span>
            <span>They&apos;ll call or text you to confirm the appointment</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* ── Contact Info ─────────────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Phone size={14} className="text-primary" /> Your Contact Info
          </legend>
          <div className="space-y-1.5">
            <Label htmlFor="customerName">Full Name *</Label>
            <Input id="customerName" placeholder="Jane Smith" {...register("customerName")} />
            {errors.customerName && <p className="text-xs text-destructive">{errors.customerName.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customerPhone">Phone *</Label>
              <Input id="customerPhone" type="tel" placeholder="(555) 555-5555" {...register("customerPhone")} />
              {errors.customerPhone && <p className="text-xs text-destructive">{errors.customerPhone.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customerEmail">Email</Label>
              <Input id="customerEmail" type="email" placeholder="jane@example.com" {...register("customerEmail")} />
              {errors.customerEmail && <p className="text-xs text-destructive">{errors.customerEmail.message}</p>}
            </div>
          </div>
        </fieldset>

        {/* ── Vehicle Info ─────────────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Wrench size={14} className="text-primary" /> Vehicle Info
          </legend>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vehicleYear">Year</Label>
              <Input id="vehicleYear" placeholder="2019" maxLength={4} {...register("vehicleYear")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicleMake">Make</Label>
              <Input id="vehicleMake" placeholder="Toyota" {...register("vehicleMake")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicleModel">Model</Label>
              <Input id="vehicleModel" placeholder="Camry" {...register("vehicleModel")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vehicleVin">VIN <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input id="vehicleVin" placeholder="1HGBH41JXMN109186" className="font-mono" {...register("vehicleVin")} />
          </div>
        </fieldset>

        {/* ── Service ───────────────────────────────────────────────── */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CalendarDays size={14} className="text-primary" /> Service & Scheduling
          </legend>
          <div className="space-y-1.5">
            <Label htmlFor="serviceDescription">Service Needed *</Label>
            <Textarea
              id="serviceDescription"
              placeholder="e.g. Oil change and tire rotation, brake inspection, check engine light..."
              rows={3}
              {...register("serviceDescription")}
            />
            {errors.serviceDescription && <p className="text-xs text-destructive">{errors.serviceDescription.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preferredDate">Preferred Date *</Label>
            <Input
              id="preferredDate"
              type="date"
              min={today}
              {...register("preferredDate")}
              className="cursor-pointer"
            />
            {errors.preferredDate && <p className="text-xs text-destructive">{errors.preferredDate.message}</p>}
          </div>

          {/* Time slots */}
          <div className="space-y-2">
            <Label>Preferred Time <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setValue("preferredTime", selectedTime === slot ? "" : slot)}
                  className={`text-xs py-1.5 px-1 rounded-md border transition-colors cursor-pointer ${
                    selectedTime === slot
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {formatTime(slot)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Additional Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="notes"
              placeholder="Any other details the shop should know..."
              rows={2}
              {...register("notes")}
            />
          </div>
        </fieldset>

        <Button
          type="submit"
          className="w-full cursor-pointer"
          disabled={isSubmitting}
          size="lg"
        >
          {isSubmitting ? <><Spinner className="mr-2 h-4 w-4" /> Submitting...</> : "Request Appointment"}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          This is a request only. The shop will contact you to confirm the time.
        </p>
      </form>
    </div>
  );
}

// ─── Auto-resolve org when no ?org= param ────────────────────────────────────

function AutoResolveOrg() {
  const defaultOrg = useQuery(api.bookings.getDefaultOrgForBooking, {});

  if (defaultOrg === undefined) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 space-y-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    );
  }

  if (!defaultOrg) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center space-y-4">
        <AlertCircle size={48} className="text-muted-foreground" />
        <h2 className="text-xl font-semibold">No shops available</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          There are no shops currently accepting online bookings. Please try again later.
        </p>
      </div>
    );
  }

  return <BookingForm orgId={defaultOrg._id} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookPage() {
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get("org") as Id<"organizations"> | null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <span
          className="text-xl font-bold text-primary tracking-wide"
          style={{ fontFamily: "Rajdhani, sans-serif" }}
        >
          ⚙ MechPro
        </span>
        <span className="text-xs text-muted-foreground">Online Booking</span>
      </header>

      {orgId ? <BookingForm orgId={orgId} /> : <AutoResolveOrg />}
    </div>
  );
}
