import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  complaintFromDtcs,
  isValidDtc,
  normalizeDtc,
  parseDtcList,
  validateDiagnosticSession,
  DiagnosticSessionError,
} from "./diagnosticSession.ts";
import { SimulatorObdAdapter } from "./obd/simulator.ts";
import { parseMode03 } from "./obd/elm327.ts";
import { fullScan } from "./obd/adapter.ts";

describe("diagnostic session model", () => {
  it("normalizes and validates DTC codes", () => {
    assert.equal(normalizeDtc("p0420"), "P0420");
    assert.equal(isValidDtc("P0300"), true);
    assert.equal(isValidDtc("ZZZZ"), false);
    assert.deepEqual(parseDtcList("P0300, p0420; C1234"), ["P0300", "P0420", "C1234"]);
  });

  it("rejects hardware+simulator mix and bad VIN/DTC", () => {
    assert.throws(
      () =>
        validateDiagnosticSession({
          mode: "hardware",
          adapterType: "simulator",
          dtcs: [],
        }),
      DiagnosticSessionError,
    );
    assert.throws(
      () =>
        validateDiagnosticSession({
          mode: "simulator",
          adapterType: "simulator",
          vin: "!!!",
          dtcs: [],
        }),
      DiagnosticSessionError,
    );
    assert.throws(
      () =>
        validateDiagnosticSession({
          mode: "simulator",
          adapterType: "simulator",
          dtcs: [{ code: "NOPE", status: "confirmed" }],
        }),
      DiagnosticSessionError,
    );
  });

  it("accepts a persisted simulator scan", () => {
    const session = validateDiagnosticSession({
      mode: "simulator",
      adapterType: "simulator",
      vin: "1HGBH41JXMN109186",
      dtcs: [{ code: "p0420", status: "confirmed", description: "Catalyst" }],
      readiness: { catalyst: "not_ready" },
    });
    assert.equal(session.dtcs[0].code, "P0420");
    assert.equal(session.vin, "1HGBH41JXMN109186");
  });

  it("builds an RO complaint from DTCs", () => {
    assert.equal(
      complaintFromDtcs([{ code: "P0300", status: "confirmed" }, { code: "P0420", status: "pending" }]),
      "OBD scan DTCs: P0300, P0420",
    );
  });

  it("runs a simulator full scan with VIN, DTCs, freeze frame, live data, readiness", async () => {
    const adapter = new SimulatorObdAdapter("1FTFW1ET8DFC10312");
    const scan = await fullScan(adapter);
    assert.equal(scan.vin, "1FTFW1ET8DFC10312");
    assert.ok(scan.dtcs.length >= 1);
    assert.ok(scan.freezeFrame);
    assert.ok(scan.livePidSamples.length >= 4);
    assert.equal(scan.readiness.misfire, "ready");
    await adapter.clearCodes();
    const after = await adapter.readDtcs();
    assert.equal(after.length, 0);
  });

  it("parses ISO 15031-6 DTC bytes from mode 03", () => {
    const codes = parseMode03("43 01 33 04 20");
    assert.ok(codes.includes("P0133"));
    assert.ok(codes.includes("P0420"));
  });
});
