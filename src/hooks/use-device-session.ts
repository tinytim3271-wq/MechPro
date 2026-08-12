import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useAuth } from "@/hooks/use-auth.ts";

// Generate a unique session token per browser tab/session
function getOrCreateSessionToken(): string {
  const key = "mechpro_device_session";
  let token = localStorage.getItem(key);
  if (!token) {
    token = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(key, token);
  }
  return token;
}

// Detect a user-friendly device name from the browser
function detectDeviceName(): string {
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg")) browser = "Edge";

  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "Mac";
  else if (ua.includes("iPhone")) os = "iPhone";
  else if (ua.includes("iPad")) os = "iPad";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Linux")) os = "Linux";

  return `${browser} on ${os}`;
}

type DeviceSessionState = {
  isActiveDevice: boolean | null; // null = loading
  sessionToken: string;
  reason: string;
};

export function useDeviceSession(): DeviceSessionState {
  const { user } = useAuth();
  const [sessionToken] = useState(() => getOrCreateSessionToken());
  const [registered, setRegistered] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [registrationFailed, setRegistrationFailed] = useState(false);

  const registerDevice = useMutation(api.deviceSession.registerDevice);
  const sessionCheck = useQuery(
    api.deviceSession.checkDeviceSession,
    user && registered ? { sessionToken } : "skip",
  );

  const doRegister = useCallback(async () => {
    if (!user) return;
    try {
      const deviceName = detectDeviceName();
      const result = await registerDevice({ sessionToken, deviceName });
      setRegistered(true);
      if (result.blocked) {
        setBlocked(true);
      }
    } catch {
      setRegistered(true);
      setRegistrationFailed(true);
    }
  }, [user, sessionToken, registerDevice]);

  useEffect(() => {
    if (user && !registered) {
      void doRegister();
    }
  }, [user, registered, doRegister]);

  if (!user || !registered) {
    return { isActiveDevice: null, sessionToken, reason: "loading" };
  }

  if (registrationFailed) {
    return { isActiveDevice: false, sessionToken, reason: "registration_failed" };
  }

  if (blocked) {
    return { isActiveDevice: false, sessionToken, reason: "max_devices_reached" };
  }

  if (sessionCheck === undefined) {
    return { isActiveDevice: null, sessionToken, reason: "checking" };
  }

  return {
    isActiveDevice: sessionCheck.isActive,
    sessionToken,
    reason: sessionCheck.reason,
  };
}
