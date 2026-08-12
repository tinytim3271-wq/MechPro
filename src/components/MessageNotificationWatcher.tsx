import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth.ts";

/**
 * Watches for:
 * 1. New unread messages from techs — fires toast + chime
 * 2. Newly signed estimates — fires toast + distinct chime
 *
 * Place inside the authenticated app layout so it runs on every page.
 */
export default function MessageNotificationWatcher() {
  const { user } = useAuth();
  const data = useQuery(api.messages.getOfficeUnreadTotal, user ? {} : "skip");
  const signedEstimate = useQuery(api.estimates.getRecentlySignedEstimate, user ? {} : "skip");

  const prevCountRef = useRef<number | null>(null);
  const prevSignedAtRef = useRef<string | null>(null);

  // ─── Tech message notifications ──────────────────────────────────────────────
  useEffect(() => {
    if (data === undefined) return;
    const currentCount = data.count;

    // On first load, just record the count without notifying
    if (prevCountRef.current === null) {
      prevCountRef.current = currentCount;
      return;
    }

    // If count increased, we have a new message
    if (currentCount > prevCountRef.current && data.latest) {
      const truncatedBody = data.latest.body.length > 80
        ? data.latest.body.slice(0, 80) + "..."
        : data.latest.body;

      toast.info(`${data.latest.senderName}: ${truncatedBody}`, {
        description: "New tech message",
        duration: 8000,
      });

      playNotificationSound("message");
    }

    prevCountRef.current = currentCount;
  }, [data]);

  // ─── Estimate signed notifications ───────────────────────────────────────────
  useEffect(() => {
    if (signedEstimate === undefined || signedEstimate === null) return;

    const currentSignedAt = signedEstimate.signedAt;

    // On first load, just record the timestamp without notifying
    if (prevSignedAtRef.current === null) {
      prevSignedAtRef.current = currentSignedAt;
      return;
    }

    // If signedAt changed, a new estimate was just approved
    if (currentSignedAt !== prevSignedAtRef.current) {
      const amount = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(signedEstimate.totalAmount);

      toast.success(
        `${signedEstimate.customerName} approved ${signedEstimate.roNumber} (${amount})`,
        {
          description: "Estimate signed!",
          duration: 10000,
        }
      );

      playNotificationSound("approval");
    }

    prevSignedAtRef.current = currentSignedAt;
  }, [signedEstimate]);

  return null;
}

function playNotificationSound(type: "message" | "approval") {
  try {
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = "sine";

    if (type === "message") {
      // Quick two-tone chime for messages
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      oscillator.frequency.setValueAtTime(1108.73, audioCtx.currentTime + 0.1); // C#6
      oscillator.frequency.setValueAtTime(1318.51, audioCtx.currentTime + 0.2); // E6
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.4);
    } else {
      // Celebratory ascending chime for estimate approvals
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime);      // C5
      oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12); // E5
      oscillator.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.24); // G5
      oscillator.frequency.setValueAtTime(1046.5, audioCtx.currentTime + 0.36); // C6
      gainNode.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.55);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.55);
    }
  } catch {
    // Audio not available (e.g. user hasn't interacted yet) — silently skip
  }
}
