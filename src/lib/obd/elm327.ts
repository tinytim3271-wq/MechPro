/**
 * ELM327 / STN11xx adapter over Web Serial.
 *
 * J2534 pass-thru devices are Windows native DLLs and cannot run in the
 * browser; `J2534ObdAdapter` reports disconnected and points the tech at
 * a USB ELM327/STN cable (or simulator).
 *
 * AT command protocol only — no manufacturer immobilizer / security access.
 */

import type { LivePidSample, ReadinessState, StoredDtc } from "../diagnosticSession.ts";
import { normalizeDtc } from "../diagnosticSession.ts";
import type { FreezeFrame, ObdAdapter, ObdConnectionStatus } from "./adapter.ts";

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (opts: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};

const PID_NAMES: Record<string, { name: string; unit: string; decode: (a: number, b: number) => number }> = {
  "0C": { name: "Engine RPM", unit: "rpm", decode: (a, b) => (256 * a + b) / 4 },
  "05": { name: "Coolant temp", unit: "°C", decode: (a) => a - 40 },
  "0D": { name: "Vehicle speed", unit: "mph", decode: (a) => Math.round(a * 0.621371) },
  "11": { name: "Throttle position", unit: "%", decode: (a) => (a * 100) / 255 },
};

export class Elm327ObdAdapter implements ObdAdapter {
  readonly kind: "elm327" | "stn";
  readonly mode = "hardware" as const;
  readonly label: string;
  status: ObdConnectionStatus = "disconnected";
  statusDetail = "No adapter attached";
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor(kind: "elm327" | "stn" = "elm327") {
    this.kind = kind;
    this.label = kind === "stn" ? "STN11xx (Web Serial)" : "ELM327 (Web Serial)";
  }

  async connect(): Promise<void> {
    const nav = globalThis.navigator as Navigator & {
      serial?: { requestPort: () => Promise<SerialPortLike> };
    };
    if (!nav.serial) {
      this.status = "error";
      this.statusDetail = "Web Serial is not available in this browser. Use Chrome/Edge on desktop, or Simulator mode.";
      throw new Error(this.statusDetail);
    }
    this.status = "connecting";
    this.statusDetail = "Select the USB serial adapter…";
    this.port = await nav.serial.requestPort();
    await this.port.open({ baudRate: 38400 });
    if (!this.port.readable || !this.port.writable) {
      this.status = "error";
      this.statusDetail = "Serial port has no read/write streams";
      throw new Error(this.statusDetail);
    }
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    await this.send("ATZ");
    await this.send("ATE0");
    await this.send("ATL0");
    await this.send("ATS0");
    await this.send("ATH0");
    await this.send("ATSP0");
    this.status = "connected";
    this.statusDetail = `${this.label} connected`;
  }

  async disconnect(): Promise<void> {
    try {
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      await this.port?.close();
    } catch {
      /* ignore */
    }
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.status = "disconnected";
    this.statusDetail = "Disconnected";
  }

  async readVin(): Promise<string | undefined> {
    const raw = await this.send("0902");
    const hex = raw.replace(/[^0-9A-F]/gi, "");
    const bytes = hex.match(/.{2}/g) ?? [];
    const ascii = bytes
      .map((b) => String.fromCharCode(parseInt(b, 16)))
      .join("")
      .replace(/[^A-HJ-NPR-Z0-9]/gi, "");
    return ascii.length >= 11 ? ascii.slice(-17) : undefined;
  }

  async readDtcs(): Promise<StoredDtc[]> {
    const raw = await this.send("03");
    return parseMode03(raw).map((code) => ({ code, status: "confirmed" as const }));
  }

  async readFreezeFrame(): Promise<FreezeFrame | undefined> {
    const raw = await this.send("0202");
    if (!raw || /NO DATA/i.test(raw)) return undefined;
    return { raw: raw.trim() };
  }

  async readLiveData(): Promise<LivePidSample[]> {
    const samples: LivePidSample[] = [];
    for (const [pid, meta] of Object.entries(PID_NAMES)) {
      const raw = await this.send(`01${pid}`);
      const bytes = (raw.match(/[0-9A-F]{2}/gi) ?? []).map((b) => parseInt(b, 16));
      if (bytes.length < 3) continue;
      const a = bytes[bytes.length - 2] ?? 0;
      const b = bytes[bytes.length - 1] ?? 0;
      samples.push({
        pid,
        name: meta.name,
        value: Math.round(meta.decode(a, b) * 10) / 10,
        unit: meta.unit,
      });
    }
    return samples;
  }

  async readReadiness(): Promise<Record<string, ReadinessState>> {
    const raw = await this.send("0101");
    return { comprehensive: /41 01/i.test(raw) ? "ready" : "not_ready" };
  }

  async clearCodes(): Promise<void> {
    await this.send("04");
  }

  private async send(cmd: string): Promise<string> {
    if (!this.writer || !this.reader) throw new Error("ELM327 is not connected");
    const enc = new TextEncoder();
    await this.writer.write(enc.encode(`${cmd}\r`));
    const dec = new TextDecoder();
    let buf = "";
    const start = Date.now();
    while (Date.now() - start < 2500) {
      const { value, done } = await this.reader.read();
      if (done) break;
      if (value) buf += dec.decode(value);
      if (buf.includes(">")) break;
    }
    return buf;
  }
}

export class J2534ObdAdapter implements ObdAdapter {
  readonly kind = "j2534" as const;
  readonly mode = "hardware" as const;
  readonly label = "J2534 pass-thru";
  status: ObdConnectionStatus = "disconnected";
  statusDetail =
    "J2534 is a Windows native API and is not available in the browser. Plug in an ELM327/STN USB adapter or use Simulator mode.";

  async connect(): Promise<void> {
    this.status = "error";
    throw new Error(this.statusDetail);
  }
  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }
  async readVin(): Promise<string | undefined> {
    throw new Error(this.statusDetail);
  }
  async readDtcs(): Promise<StoredDtc[]> {
    throw new Error(this.statusDetail);
  }
  async readFreezeFrame(): Promise<FreezeFrame | undefined> {
    throw new Error(this.statusDetail);
  }
  async readLiveData(): Promise<LivePidSample[]> {
    throw new Error(this.statusDetail);
  }
  async readReadiness(): Promise<Record<string, ReadinessState>> {
    throw new Error(this.statusDetail);
  }
  async clearCodes(): Promise<void> {
    throw new Error(this.statusDetail);
  }
}

export function parseMode03(raw: string): string[] {
  const hex = raw.toUpperCase().replace(/[^0-9A-F]/g, "");
  const codes: string[] = [];
  // Skip 43 / 4300 headers; remaining bytes are DTC pairs.
  const body = hex.replace(/^43/, "");
  for (let i = 0; i + 3 < body.length; i += 4) {
    const a = parseInt(body.slice(i, i + 2), 16);
    const b = parseInt(body.slice(i + 2, i + 4), 16);
    if (a === 0 && b === 0) continue;
    const type = ["P", "C", "B", "U"][(a >> 6) & 0x3];
    const d1 = ((a >> 4) & 0x3).toString(16).toUpperCase();
    const d2 = (a & 0xf).toString(16).toUpperCase();
    const d3 = ((b >> 4) & 0xf).toString(16).toUpperCase();
    const d4 = (b & 0xf).toString(16).toUpperCase();
    const code = normalizeDtc(`${type}${d1}${d2}${d3}${d4}`);
    if (code.length === 5) codes.push(code);
  }
  return codes;
}
