import { useEffect, useRef } from "react";
import { useAuth } from "react-oidc-context";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useNavigate } from "react-router-dom";

export default function AuthCallback() {
  const auth = useAuth();
  const updateCurrentUser = useMutation(api.users.updateCurrentUser);
  const navigate = useNavigate();
  const synced = useRef(false);

  useEffect(() => {
    if (auth.isAuthenticated && !synced.current) {
      synced.current = true;
      // Determine where to redirect after sign-in
      const returnPath = sessionStorage.getItem("auth_return_path") || "/dashboard";
      sessionStorage.removeItem("auth_return_path");
      // Public pages (portal, approve, pay, book) skip dashboard
      const destination = returnPath.startsWith("/portal") ||
        returnPath.startsWith("/approve") ||
        returnPath.startsWith("/pay") ||
        returnPath.startsWith("/book")
        ? returnPath
        : "/dashboard";

      updateCurrentUser()
        .then(() => navigate(destination))
        .catch(() => navigate(destination));
    }
  }, [auth.isAuthenticated, updateCurrentUser, navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1
          className="text-3xl font-bold text-primary"
          style={{ fontFamily: "Rajdhani, sans-serif" }}
        >
          ⚙ MechPro
        </h1>
        <p className="text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}
