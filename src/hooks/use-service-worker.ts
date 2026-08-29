import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function useServiceWorker() {
  const toastShown = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        registerSW({
          immediate: true,
          onNeedRefresh() {
            if (toastShown.current) return;
            toastShown.current = true;
            toast("A new version is available!", {
              duration: Infinity,
              action: { label: "Refresh", onClick: () => location.reload() },
            });
          },
        });
      })
      .catch(() => {
        // PWA not available in this build
      });
  }, []);
}
