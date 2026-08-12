import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useAuth } from "@/hooks/use-auth.ts";

type AccessState = {
  hasAccess: boolean | null; // null = still checking
  accessType: string;
  recheckAccess: () => void;
};

const AccessContext = createContext<AccessState>({
  hasAccess: null,
  accessType: "none",
  recheckAccess: () => {},
});

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const checkAccess = useAction(api.commerce.checkAccess);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [accessType, setAccessType] = useState("none");
  const retryCount = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to org membership reactively — when this changes, access may have changed
  const myOrgs = useQuery(api.organizations.getMyOrgs, user ? {} : "skip");

  const doCheck = useCallback(async () => {
    try {
      const result = await checkAccess({});
      setHasAccess(result.hasAccess);
      setAccessType(result.accessType);

      // If access is denied but user may be a new employee whose invite is still propagating,
      // retry a few times with a short delay
      if (!result.hasAccess && retryCount.current < 3) {
        retryCount.current += 1;
        retryTimerRef.current = setTimeout(() => {
          void doCheck();
        }, 1500);
      }
    } catch {
      setHasAccess(false);
      setAccessType("check_failed");
    }
  }, [checkAccess]);

  // Initial check and re-check when user identity changes
  useEffect(() => {
    if (user) {
      retryCount.current = 0;
      doCheck();
    } else {
      setHasAccess(null);
      setAccessType("none");
    }
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profile.sub]);

  // Re-check access whenever org membership changes (e.g. invite claimed)
  useEffect(() => {
    if (user && myOrgs !== undefined && myOrgs.length > 0 && !hasAccess) {
      retryCount.current = 0;
      doCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myOrgs?.length]);

  return (
    <AccessContext.Provider value={{ hasAccess, accessType, recheckAccess: doCheck }}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  return useContext(AccessContext);
}
