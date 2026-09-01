import type {
  AdapterKind,
  LivePidSample,
  ReadinessState,
  SessionMode,
  StoredDtc,
} from "../diagnosticSession.ts";

export type ObdConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type FreezeFrame = Record<string, number | string>;

export type ObdScanResult = {
  vin?: string;
  dtcs: StoredDtc[];
  freezeFrame?: FreezeFrame;
  livePidSamples: LivePidSample[];
  readiness: Record<string, ReadinessState>;
};

export interface ObdAdapter {
  readonly kind: AdapterKind;
  readonly mode: SessionMode;
  readonly label: string;
  status: ObdConnectionStatus;
  statusDetail: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readVin(): Promise<string | undefined>;
  readDtcs(): Promise<StoredDtc[]>;
  readFreezeFrame(): Promise<FreezeFrame | undefined>;
  readLiveData(): Promise<LivePidSample[]>;
  readReadiness(): Promise<Record<string, ReadinessState>>;
  /** Caller must confirm in the UI before invoking. */
  clearCodes(): Promise<void>;
}

export async function fullScan(adapter: ObdAdapter): Promise<ObdScanResult> {
  if (adapter.status !== "connected") {
    await adapter.connect();
  }
  const [vin, dtcs, freezeFrame, livePidSamples, readiness] = await Promise.all([
    adapter.readVin(),
    adapter.readDtcs(),
    adapter.readFreezeFrame(),
    adapter.readLiveData(),
    adapter.readReadiness(),
  ]);
  return { vin, dtcs, freezeFrame, livePidSamples, readiness };
}
