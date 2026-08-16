import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../../../lib/escapeHtml.ts";
import {
  buildDiagnosticPrintHtml,
  buildRepairPrintHtml,
} from "./printChecklists.ts";

const XSS_NOTE = `<img src=x onerror="alert('xss-notes')">`;
const XSS_ITEM = `<script>alert('xss-item')</script>`;
const XSS_DETAILS = `Tighten bolts</div><img src=x onerror="alert('xss-details')">`;
const XSS_TOOL = `torque wrench"><img src=x onerror="alert('xss-tool')">`;
const XSS_CRITERIA = `Pass if <img src=x onerror=alert(1)>`;
const XSS_WARNING = `<img src=x onerror="alert('xss-warning')">`;

const RAW_PAYLOADS = [
  XSS_NOTE,
  XSS_ITEM,
  XSS_DETAILS,
  XSS_TOOL,
  XSS_CRITERIA,
  XSS_WARNING,
];

describe("escapeHtml", () => {
  it("encodes markup characters that would break out of text nodes or attributes", () => {
    assert.equal(
      escapeHtml(`<img src="x" onerror='alert(1)'>`),
      "&lt;img src=&quot;x&quot; onerror=&#039;alert(1)&#039;&gt;",
    );
  });

  it("returns an empty string for nullish values", () => {
    assert.equal(escapeHtml(undefined), "");
    assert.equal(escapeHtml(null), "");
  });
});

describe("buildDiagnosticPrintHtml", () => {
  const html = buildDiagnosticPrintHtml(
    [
      {
        item: XSS_ITEM,
        category: "visual",
        toolsRequired: [XSS_TOOL],
        verificationCriteria: XSS_CRITERIA,
        completed: false,
        notes: XSS_NOTE,
      },
    ],
    0,
  );

  it("does not emit raw stored XSS payloads in the print document", () => {
    for (const payload of RAW_PAYLOADS.filter((p) =>
      [XSS_NOTE, XSS_ITEM, XSS_TOOL, XSS_CRITERIA].includes(p),
    )) {
      assert.equal(html.includes(payload), false, `raw payload survived: ${payload}`);
    }
  });

  it("renders the technician note as escaped text", () => {
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(&#039;xss-notes&#039;\)&quot;&gt;/);
    assert.match(html, /1\. &lt;script&gt;alert\(&#039;xss-item&#039;\)&lt;\/script&gt;/);
  });

  it("still includes the checklist progress and item count", () => {
    assert.match(html, /0\/1 completed/);
    assert.match(html, /Diagnostic Verification Checklist/);
  });
});

describe("buildRepairPrintHtml", () => {
  const html = buildRepairPrintHtml(
    [
      {
        step: 1,
        title: XSS_ITEM,
        details: XSS_DETAILS,
        toolsRequired: [XSS_TOOL],
        torqueSpecs: "10 Nm",
        warning: XSS_WARNING,
        completed: false,
        notes: XSS_NOTE,
      },
    ],
    0,
  );

  it("does not emit raw stored XSS payloads in the print document", () => {
    for (const payload of RAW_PAYLOADS) {
      assert.equal(html.includes(payload), false, `raw payload survived: ${payload}`);
    }
  });

  it("renders step details and warnings as escaped text", () => {
    assert.match(
      html,
      /Tighten bolts&lt;\/div&gt;&lt;img src=x onerror=&quot;alert\(&#039;xss-details&#039;\)&quot;&gt;/,
    );
    assert.match(html, /⚠ &lt;img src=x onerror=&quot;alert\(&#039;xss-warning&#039;\)&quot;&gt;/);
  });
});
