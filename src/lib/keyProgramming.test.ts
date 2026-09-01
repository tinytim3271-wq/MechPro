import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertAllowedOperation,
  assertKeyJobAuthorized,
  isForbiddenOperation,
  isRoAuthorizedForKeys,
  KeyAuthorizationError,
} from "./keyProgramming.ts";
import { SimulatorKeyProgrammer } from "./keys/simulator.ts";

const authorizedRo = {
  _id: "ro1",
  customerId: "cust1",
  vehicleId: "veh1",
  authorizationName: "Jane Owner",
  authorizationMethod: "signature",
  signedAt: "2026-04-01T12:00:00.000Z",
  customerSignature: "data:image/png;base64,aaa",
  status: "approved",
};

describe("key programming authorization", () => {
  it("allows identify / add / program / test only", () => {
    assert.equal(assertAllowedOperation("add_key"), "add_key");
    assert.equal(isForbiddenOperation("immobilizer_bypass"), true);
    assert.equal(isForbiddenOperation("clone stolen"), true);
    assert.throws(() => assertAllowedOperation("bypass"), KeyAuthorizationError);
    assert.throws(() => assertAllowedOperation("rolling_code"), KeyAuthorizationError);
  });

  it("requires a signed, named authorization on the matching RO", () => {
    const ok = assertKeyJobAuthorized({
      customerId: "cust1",
      vehicleId: "veh1",
      ro: authorizedRo,
      operation: "program_key",
    });
    assert.equal(ok.authorizationName, "Jane Owner");
  });

  it("rejects missing RO, cancelled RO, unsigned RO, and mismatched customer/vehicle", () => {
    assert.equal(isRoAuthorizedForKeys(null), false);

    assert.throws(
      () =>
        assertKeyJobAuthorized({
          customerId: "cust1",
          vehicleId: "veh1",
          ro: null,
          operation: "add_key",
        }),
      /repair order/,
    );

    assert.throws(
      () =>
        assertKeyJobAuthorized({
          customerId: "cust1",
          vehicleId: "veh1",
          ro: { ...authorizedRo, signedAt: null, customerSignature: null },
          operation: "add_key",
        }),
      /authorize/,
    );

    assert.throws(
      () =>
        assertKeyJobAuthorized({
          customerId: "other",
          vehicleId: "veh1",
          ro: authorizedRo,
          operation: "add_key",
        }),
      /customer does not match/,
    );

    assert.throws(
      () =>
        assertKeyJobAuthorized({
          customerId: "cust1",
          vehicleId: "other",
          ro: authorizedRo,
          operation: "add_key",
        }),
      /vehicle does not match/,
    );

    assert.throws(
      () =>
        assertKeyJobAuthorized({
          customerId: "cust1",
          vehicleId: "veh1",
          ro: { ...authorizedRo, status: "cancelled" },
          operation: "add_key",
        }),
      /authorize/,
    );
  });

  it("runs simulator add-key after authorization", async () => {
    const programmer = new SimulatorKeyProgrammer();
    await programmer.connect();
    const result = await programmer.run({ operation: "add_key", keyType: "transponder", vin: "1HGBH41JXMN109186" });
    assert.equal(result.ok, true);
    assert.equal(result.simulated, true);
    assert.match(result.message, /authorization/i);
  });
});
