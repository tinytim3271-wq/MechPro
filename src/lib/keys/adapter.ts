import type { KeyJobMode, KeyOperation, KeyType } from "../keyProgramming.ts";

export type ProgrammerStatus = "disconnected" | "connecting" | "connected" | "error";

export type KeyProgramResult = {
  ok: boolean;
  operation: KeyOperation;
  message: string;
  simulated: boolean;
};

export interface KeyProgrammer {
  readonly mode: KeyJobMode;
  readonly label: string;
  status: ProgrammerStatus;
  statusDetail: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  identifyVehicle(): Promise<string>;
  run(opts: {
    operation: KeyOperation;
    keyType: KeyType;
    vin?: string;
  }): Promise<KeyProgramResult>;
}
