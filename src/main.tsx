import { createRoot } from "react-dom/client";

import App from "./App.tsx";

function ensureSecureOrigin() {
  if (typeof window === "undefined") return;

  const { hostname, pathname, search, hash, protocol } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

  if (protocol === "https:" || isLocalHost || window.isSecureContext) {
    return;
  }

  const target = `https://www.yourcarguy806.com${pathname}${search}${hash}`;
  window.location.replace(target);
}

ensureSecureOrigin();
createRoot(document.getElementById("root")!).render(<App />);
