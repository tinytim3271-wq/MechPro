import type { LivePidSample, ReadinessState, StoredDtc } from "../diagnosticSession.ts";
import type { FreezeFrame, ObdAdapter, ObdConnectionStatus } from "./adapter.ts";

const SIM_DTCS: StoredDtc[] = [
  { code: "P0300", status: "confirmed", description: "Random/Multiple Cylinder Misfire Detected" },
  { code: "P0420", status: "confirmed", description: "Catalyst System Efficiency Below Threshold (Bank 1)" },
  { code: "P0171", status: "pending", description: "System Too Lean (Bank 1)" },
];

const SIM_FF: FreezeFrame = {
  dtc: "P0300",
  rpm: 812,
  ectC: 94,
  loadPct: 18.4,
  stft1: -3.1,
  ltft1: 8.6,
  vssMph: 0,
  mapKpa: 38,
};

const SIM_LIVE: LivePidSample[] = [
  { pid: "0C", name: "Engine RPM", value: 780, unit: "rpm" },
  { pid: "05", name: "Coolant temp", value: 91, unit: "°C" },
  { pid: "0D", name: "Vehicle speed", value: 0, unit: "mph" },
  { pid: "11", name: "Throttle position", value: 14, unit: "%" },
  { pid: "04", name: "Calculated load", value: 22, unit: "%" },
  { pid: "0F", name: "Intake air temp", value: 28, unit: "°C" },
  { pid: "10", name: "MAF", value: 4.2, unit: "g/s" },
  { pid: "2F", name: "Fuel level", value: 48, unit: "%" },
];

const SIM_READY: Record<string, ReadinessState> = {
  misfire: "ready",
  fuel: "ready",
  comprehensive: "ready",
  catalyst: "not_ready",
  heatedCatalyst: "not_supported",
  evap: "ready",
  secondaryAir: "not_supported",
  acRefrigerant: "not_supported",
  o2Sensor: "ready",
  o2Heater: "ready",
  egr: "not_ready",
};

/**
 * Bay simulator used when no ELM327 / STN / J2534 adapter is attached.
 * Always labeled as simulated in the UI — never presented as live hardware.
 */
export class SimulatorObdAdapter implements ObdAdapter {
  readonly kind = "simulator" as const;
  readonly mode = "simulator" as const;
  readonly label = "Simulator (no hardware)";
  status: ObdConnectionStatus = "disconnected";
  statusDetail = "Not connected";
  vin: string;
  private codes: StoredDtc[];

  constructor(vin = "1HGBH41JXMN109186") {
    this.vin = vin;
    this.codes = SIM_DTCS.map((c) => ({ ...c }));
  }

  async connect(): Promise<void> {
    this.status = "connecting";
    this.statusDetail = "Opening simulated ECU session…";
    await delay(180);
    this.status = "connected";
    this.statusDetail = "SIMULATOR — not a live vehicle";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
    this.statusDetail = "Simulator idle";
  }

  async readVin(): Promise<string | undefined> {
    this.assertConnected();
    return this.vin;
  }

  async readDtcs(): Promise<StoredDtc[]> {
    this.assertConnected();
    return this.codes.map((c) => ({ ...c }));
  }

  async readFreezeFrame(): Promise<FreezeFrame | undefined> {
    this.assertConnected();
    return this.codes.some((c) => c.status === "confirmed") ? { ...SIM_FF } : undefined;
  }

  async readLiveData(): Promise<LivePidSample[]> {
    this.assertConnected();
    const jitter = (n: number, amt: number) => Math.round((n + (Math.random() - 0.5) * amt) * 10) / 10;
    return SIM_LIVE.map((p) =>
      p.pid === "0C" ? { ...p, value: jitter(p.value, 40) } : { ...p },
    );
  }

  async readReadiness(): Promise<Record<string, ReadinessState>> {
    this.assertConnected();
    return { ...SIM_READY };
  }

  async clearCodes(): Promise<void> {
    this.assertConnected();
    this.codes = [];
  }

  private assertConnected(): void {
    if (this.status !== "connected") {
      throw new Error("OBD adapter is not connected");
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
