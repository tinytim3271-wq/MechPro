import type { KeyOperation, KeyType } from "../keyProgramming.ts";
import { assertAllowedOperation } from "../keyProgramming.ts";
import type { KeyProgrammer, KeyProgramResult, ProgrammerStatus } from "./adapter.ts";

/**
 * Bay simulator when no licensed key programmer is attached.
 * Only identify / add / program / test — never bypass or clone.
 */
export class SimulatorKeyProgrammer implements KeyProgrammer {
  readonly mode = "simulator" as const;
  readonly label = "Simulator (no programmer)";
  status: ProgrammerStatus = "disconnected";
  statusDetail = "Not connected";

  async connect(): Promise<void> {
    this.status = "connecting";
    this.statusDetail = "Opening simulated programmer…";
    await new Promise((r) => setTimeout(r, 160));
    this.status = "connected";
    this.statusDetail = "SIMULATOR — not a live programmer";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
    this.statusDetail = "Simulator idle";
  }

  async identifyVehicle(): Promise<string> {
    this.assertConnected();
    return "Simulated ECU: 2016–2020 Honda / Acura (immobilizer present, authorized add-key supported)";
  }

  async run(opts: {
    operation: KeyOperation;
    keyType: KeyType;
    vin?: string;
  }): Promise<KeyProgramResult> {
    this.assertConnected();
    const operation = assertAllowedOperation(opts.operation);
    const vinBit = opts.vin ? ` VIN ${opts.vin}` : "";
    const messages: Record<KeyOperation, string> = {
      identify: `Identified ${opts.keyType} slot.${vinBit} Immobilizer present. Ready for authorized add/program.`,
      add_key: `Simulated add-key for ${opts.keyType}.${vinBit} Customer authorization required (already verified).`,
      program_key: `Simulated program of ${opts.keyType}.${vinBit} New key would be learned on a licensed programmer.`,
      test: `Simulated test: ${opts.keyType} responds to immobilizer challenge (simulator).`,
    };
    return {
      ok: true,
      operation,
      message: messages[operation],
      simulated: true,
    };
  }

  private assertConnected(): void {
    if (this.status !== "connected") {
      throw new Error("Key programmer is not connected");
    }
  }
}

/**
 * Placeholder for a licensed USB programmer. The browser cannot drive
 * proprietary vendor DLLs; techs use simulator or a future native helper.
 */
export class HardwareKeyProgrammer implements KeyProgrammer {
  readonly mode = "hardware" as const;
  readonly label = "Licensed programmer (USB)";
  status: ProgrammerStatus = "disconnected";
  statusDetail =
    "No licensed programmer detected. Connect a shop-licensed device, or use Simulator mode.";

  async connect(): Promise<void> {
    this.status = "error";
    throw new Error(this.statusDetail);
  }
  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }
  async identifyVehicle(): Promise<string> {
    throw new Error(this.statusDetail);
  }
  async run(): Promise<KeyProgramResult> {
    throw new Error(this.statusDetail);
  }
}
