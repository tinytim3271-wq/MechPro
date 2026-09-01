/**
 * OBD scan-session model. Hardware talks through the adapter layer;
 * this module is the persisted shape stored on AWS against a vehicle / RO.
 */

export type AdapterKind = "simulator" | "elm327" | "stn" | "j2534";
export type SessionMode = "simulator" | "hardware";
export type DtcStatus = "confirmed" | "pending" | "permanent";
export type ReadinessState = "ready" | "not_ready" | "not_supported";

export const DTC_CODE_RE = /^[PCBU][0-9A-F]{4}$/i;

export type StoredDtc = {
  code: string;
  status: DtcStatus;
  description?: string;
};

export type LivePidSample = {
  pid: string;
  name: string;
  value: number;
  unit: string;
};

export type DiagnosticSessionPayload = {
  mode: SessionMode;
  adapterType: AdapterKind;
  vin?: string;
  mileage?: number;
  dtcs: StoredDtc[];
  freezeFrame?: Record<string, number | string>;
  livePidSamples?: LivePidSample[];
  readiness?: Record<string, ReadinessState>;
  notes?: string;
};

export function normalizeDtc(code: string): string {
  return code.trim().toUpperCase().replace(/[^PCBU0-9A-F]/g, "");
}

export function isValidDtc(code: string): boolean {
  return DTC_CODE_RE.test(normalizeDtc(code));
}

export function parseDtcList(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map(normalizeDtc)
    .filter((c) => DTC_CODE_RE.test(c));
}

export class DiagnosticSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagnosticSessionError";
  }
}

export function validateDiagnosticSession(
  payload: DiagnosticSessionPayload,
): DiagnosticSessionPayload {
  if (payload.mode === "hardware" && payload.adapterType === "simulator") {
    throw new DiagnosticSessionError("Hardware mode cannot use the simulator adapter");
  }
  if (payload.mode === "simulator" && payload.adapterType !== "simulator") {
    throw new DiagnosticSessionError("Simulator mode must use the simulator adapter");
  }
  if (payload.vin && !/^[A-HJ-NPR-Z0-9]{11,17}$/i.test(payload.vin.replace(/\s/g, ""))) {
    throw new DiagnosticSessionError("VIN must be 11–17 characters (excluding I, O, Q)");
  }
  for (const dtc of payload.dtcs) {
    if (!isValidDtc(dtc.code)) {
      throw new DiagnosticSessionError(`Invalid DTC: ${dtc.code}`);
    }
  }
  return {
    ...payload,
    vin: payload.vin?.trim().toUpperCase() || undefined,
    dtcs: payload.dtcs.map((d) => ({
      ...d,
      code: normalizeDtc(d.code),
    })),
  };
}

export function complaintFromDtcs(dtcs: StoredDtc[]): string {
  if (dtcs.length === 0) return "OBD scan — no codes stored";
  const codes = dtcs.map((d) => d.code).join(", ");
  return `OBD scan DTCs: ${codes}`;
}
