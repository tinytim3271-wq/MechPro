import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("mechproDesktop", {
  platform: "electron",
});
