"use node";

import { Hercules } from "@usehercules/sdk";
import escapeHtml from "escape-html";
import { action, internalAction } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAuthenticatedAction } from "./actionAuth";

const hercules = new Hercules({
  apiKey: process.env.HERCULES_API_KEY,
  apiVersion: "2025-12-09",
});

export const sendStatusUpdateEmail = internalAction({
  args: {
    to: v.string(),
    customerName: v.string(),
    roNumber: v.string(),
    vehicleSummary: v.string(),
    status: v.string(),
    shopName: v.string(),
    shopPhone: v.optional(v.string()),
    shopEmail: v.optional(v.string()),
    customMessage: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const statusLabels: Record<string, string> = {
      estimate: "Estimate Ready",
      approved: "Approved — Work Scheduled",
      in_progress: "Work In Progress",
      waiting_parts: "Waiting on Parts",
      completed: "Your Vehicle Is Ready for Pickup",
      invoiced: "Invoice Ready",
    };
    const statusLabel = statusLabels[args.status] ?? args.status;

    const contactParts: string[] = [];
    if (args.shopPhone) contactParts.push(escapeHtml(args.shopPhone));
    if (args.shopEmail) contactParts.push(escapeHtml(args.shopEmail));
    const contactLine = contactParts.join(" | ");

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#111;padding:24px 32px;border-bottom:1px solid #2a2a2a;">
            <table width="100%"><tr>
              <td style="font-size:24px;font-weight:bold;color:#f97316;letter-spacing:-0.5px;">MechPro</td>
              <td style="text-align:right;color:#888;font-size:13px;">${escapeHtml(args.shopName)}</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#aaa;font-size:13px;">Hi ${escapeHtml(args.customerName)},</p>
            <h1 style="margin:0 0 8px;font-size:24px;color:#ffffff;">${escapeHtml(statusLabel)}</h1>
            <p style="margin:0 0 20px;color:#888;font-size:14px;">${escapeHtml(args.vehicleSummary)} &bull; ${escapeHtml(args.roNumber)}</p>
            ${args.customMessage ? `<p style="color:#e0e0e0;font-size:15px;line-height:1.6;">${escapeHtml(args.customMessage)}</p>` : ""}
            ${args.status === "completed" ? `<p style="color:#e0e0e0;font-size:15px;">Your vehicle is ready! Please come in at your earliest convenience to pick it up.</p>` : ""}
            ${contactLine ? `<p style="margin-top:24px;color:#888;font-size:13px;">Questions? Reach us at ${contactLine}</p>` : ""}
          </td>
        </tr>
        <tr>
          <td style="background:#111;padding:16px 32px;border-top:1px solid #2a2a2a;">
            <p style="margin:0;color:#555;font-size:11px;text-align:center;">Thank you for choosing ${escapeHtml(args.shopName)}!</p>
            <p style="margin:8px 0 0;color:#444;font-size:10px;text-align:center;">
              ${escapeHtml(args.shopName)} &bull; 806 E Blvd N, Rapid City, SD 57701
            </p>
            <p style="margin:4px 0 0;color:#444;font-size:10px;text-align:center;">
              You are receiving this email because you have a vehicle service relationship with us.
              To unsubscribe from future emails, reply with "UNSUBSCRIBE" or contact us at lee@yourcarguy806.com.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
      `Hi ${args.customerName},`,
      ``,
      `Update on your vehicle: ${statusLabel}`,
      `${args.vehicleSummary} | ${args.roNumber}`,
      args.customMessage ? `\n${args.customMessage}` : "",
      args.status === "completed" ? "\nYour vehicle is ready for pickup!" : "",
      contactLine ? `\nContact us: ${contactLine}` : "",
      `\nThank you for choosing ${args.shopName}!`,
      `\n---`,
      `${args.shopName} | 806 E Blvd N, Rapid City, SD 57701`,
      `To unsubscribe, reply UNSUBSCRIBE or email lee@yourcarguy806.com`,
    ].filter(Boolean).join("\n");

    try {
      await hercules.email.send({
        from: "MechPro <lee@yourcarguy806.com>",
        to: args.to,
        subject: `${escapeHtml(statusLabel)} — ${escapeHtml(args.roNumber)}`,
        html,
        text,
      });
    } catch (error) {
      console.error("Failed to send status update email:", error);
    }
  },
});

export const sendInvoiceEmail = internalAction({
  args: {
    to: v.string(),
    customerName: v.string(),
    invoiceNumber: v.string(),
    roNumber: v.string(),
    vehicleSummary: v.string(),
    subtotal: v.number(),
    taxAmount: v.number(),
    total: v.number(),
    amountPaid: v.number(),
    shopName: v.string(),
    shopPhone: v.optional(v.string()),
    shopEmail: v.optional(v.string()),
    laborLines: v.array(
      v.object({
        description: v.string(),
        laborHours: v.number(),
        laborRate: v.number(),
      })
    ),
    partLines: v.array(
      v.object({
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      })
    ),
  },
  handler: async (_ctx, args) => {
    const balanceDue = args.total - args.amountPaid;

    // Build labor rows HTML
    const laborRowsHtml = args.laborLines
      .map((l) => {
        const amount = (l.laborHours * l.laborRate).toFixed(2);
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#e0e0e0;">${escapeHtml(l.description)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#e0e0e0;text-align:center;">${l.laborHours}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#e0e0e0;text-align:right;">$${l.laborRate.toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#e0e0e0;text-align:right;">$${amount}</td>
        </tr>`;
      })
      .join("");

    // Build parts rows HTML
    const partRowsHtml = args.partLines
      .map((p) => {
        const amount = (p.quantity * p.unitPrice).toFixed(2);
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#e0e0e0;">${escapeHtml(p.description)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#e0e0e0;text-align:center;">${p.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#e0e0e0;text-align:right;">$${p.unitPrice.toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#e0e0e0;text-align:right;">$${amount}</td>
        </tr>`;
      })
      .join("");

    // Footer contact info
    const contactParts: string[] = [];
    if (args.shopPhone) contactParts.push(escapeHtml(args.shopPhone));
    if (args.shopEmail) contactParts.push(escapeHtml(args.shopEmail));
    const contactLine = contactParts.length > 0 ? contactParts.join(" | ") : "";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#111;padding:24px 32px;border-bottom:1px solid #2a2a2a;">
            <table width="100%"><tr>
              <td style="font-size:24px;font-weight:bold;color:#f97316;letter-spacing:-0.5px;">MechPro</td>
              <td style="text-align:right;color:#888;font-size:13px;">${escapeHtml(args.shopName)}</td>
            </tr></table>
          </td>
        </tr>

        <!-- Invoice title -->
        <tr>
          <td style="padding:32px 32px 16px;">
            <h1 style="margin:0;font-size:28px;color:#ffffff;">Invoice ${escapeHtml(args.invoiceNumber)}</h1>
            <p style="margin:8px 0 0;color:#888;font-size:14px;">
              ${escapeHtml(args.vehicleSummary)} &bull; RO ${escapeHtml(args.roNumber)}
            </p>
            <p style="margin:4px 0 0;color:#aaa;font-size:14px;">
              Customer: <strong style="color:#e0e0e0;">${escapeHtml(args.customerName)}</strong>
            </p>
          </td>
        </tr>

        ${args.laborLines.length > 0 ? `
        <!-- Labor table -->
        <tr>
          <td style="padding:16px 32px 0;">
            <h3 style="margin:0 0 8px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Labor</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr style="background:#222;">
                <th style="padding:8px 12px;text-align:left;color:#888;font-size:12px;font-weight:600;">Description</th>
                <th style="padding:8px 12px;text-align:center;color:#888;font-size:12px;font-weight:600;">Hours</th>
                <th style="padding:8px 12px;text-align:right;color:#888;font-size:12px;font-weight:600;">Rate</th>
                <th style="padding:8px 12px;text-align:right;color:#888;font-size:12px;font-weight:600;">Amount</th>
              </tr>
              ${laborRowsHtml}
            </table>
          </td>
        </tr>
        ` : ""}

        ${args.partLines.length > 0 ? `
        <!-- Parts table -->
        <tr>
          <td style="padding:16px 32px 0;">
            <h3 style="margin:0 0 8px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Parts</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr style="background:#222;">
                <th style="padding:8px 12px;text-align:left;color:#888;font-size:12px;font-weight:600;">Description</th>
                <th style="padding:8px 12px;text-align:center;color:#888;font-size:12px;font-weight:600;">Qty</th>
                <th style="padding:8px 12px;text-align:right;color:#888;font-size:12px;font-weight:600;">Unit Price</th>
                <th style="padding:8px 12px;text-align:right;color:#888;font-size:12px;font-weight:600;">Amount</th>
              </tr>
              ${partRowsHtml}
            </table>
          </td>
        </tr>
        ` : ""}

        <!-- Totals -->
        <tr>
          <td style="padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a2a;padding-top:16px;">
              <tr>
                <td style="padding:4px 0;color:#888;font-size:14px;">Subtotal</td>
                <td style="padding:4px 0;color:#e0e0e0;font-size:14px;text-align:right;">$${args.subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#888;font-size:14px;">Tax</td>
                <td style="padding:4px 0;color:#e0e0e0;font-size:14px;text-align:right;">$${args.taxAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:8px 0 4px;color:#ffffff;font-size:18px;font-weight:bold;">Total</td>
                <td style="padding:8px 0 4px;color:#f97316;font-size:18px;font-weight:bold;text-align:right;">$${args.total.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#888;font-size:14px;">Amount Paid</td>
                <td style="padding:4px 0;color:#4ade80;font-size:14px;text-align:right;">$${args.amountPaid.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#ffffff;font-size:16px;font-weight:600;">Balance Due</td>
                <td style="padding:4px 0;color:${balanceDue <= 0 ? "#4ade80" : "#f87171"};font-size:16px;font-weight:600;text-align:right;">$${balanceDue.toFixed(2)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#111;padding:20px 32px;border-top:1px solid #2a2a2a;">
            <p style="margin:0;color:#666;font-size:12px;text-align:center;">
              ${escapeHtml(args.shopName)}${contactLine ? ` &bull; ${contactLine}` : ""}
            </p>
            <p style="margin:4px 0 0;color:#555;font-size:11px;text-align:center;">
              Thank you for your business!
            </p>
            <p style="margin:8px 0 0;color:#444;font-size:10px;text-align:center;">
              ${escapeHtml(args.shopName)} &bull; 806 E Blvd N, Rapid City, SD 57701
            </p>
            <p style="margin:4px 0 0;color:#444;font-size:10px;text-align:center;">
              You are receiving this email because you have a vehicle service relationship with us.
              To unsubscribe from future emails, reply with "UNSUBSCRIBE" or contact us at lee@yourcarguy806.com.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Plain text fallback
    const laborText = args.laborLines
      .map((l) => `  - ${l.description}: ${l.laborHours}h x $${l.laborRate.toFixed(2)} = $${(l.laborHours * l.laborRate).toFixed(2)}`)
      .join("\n");
    const partsText = args.partLines
      .map((p) => `  - ${p.description}: ${p.quantity} x $${p.unitPrice.toFixed(2)} = $${(p.quantity * p.unitPrice).toFixed(2)}`)
      .join("\n");

    const text = [
      `Invoice ${args.invoiceNumber} from ${args.shopName}`,
      `Customer: ${args.customerName}`,
      `Vehicle: ${args.vehicleSummary}`,
      `RO: ${args.roNumber}`,
      "",
      args.laborLines.length > 0 ? `Labor:\n${laborText}` : "",
      args.partLines.length > 0 ? `Parts:\n${partsText}` : "",
      "",
      `Subtotal: $${args.subtotal.toFixed(2)}`,
      `Tax: $${args.taxAmount.toFixed(2)}`,
      `Total: $${args.total.toFixed(2)}`,
      `Amount Paid: $${args.amountPaid.toFixed(2)}`,
      `Balance Due: $${balanceDue.toFixed(2)}`,
      "",
      "Thank you for your business!",
      contactLine ? `Contact: ${contactLine}` : "",
      `\n---`,
      `${args.shopName} | 806 E Blvd N, Rapid City, SD 57701`,
      `To unsubscribe, reply UNSUBSCRIBE or email lee@yourcarguy806.com`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await hercules.email.send({
        from: "MechPro <lee@yourcarguy806.com>",
        to: args.to,
        subject: `Invoice ${args.invoiceNumber} — ${args.shopName}`,
        html,
        text,
      });
      console.log(`Invoice email sent to ${args.to} for ${args.invoiceNumber}`);
    } catch (error) {
      // Don't throw — log and continue so it doesn't break payment flow
      console.error("Failed to send invoice email:", error);
    }
  },
});

// ─── Invoice payment reminder email ──────────────────────────────────────────

export const sendInvoiceReminderEmail = internalAction({
  args: {
    to: v.string(),
    customerName: v.string(),
    invoiceNumber: v.string(),
    roNumber: v.string(),
    vehicleSummary: v.string(),
    total: v.number(),
    balance: v.number(),
    dueAt: v.string(),
    daysOverdue: v.number(),
    shopName: v.string(),
    shopPhone: v.optional(v.string()),
    shopEmail: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const contactParts: string[] = [];
    if (args.shopPhone) contactParts.push(escapeHtml(args.shopPhone));
    if (args.shopEmail) contactParts.push(escapeHtml(args.shopEmail));
    const contactLine = contactParts.join(" | ");

    const overdueText = args.daysOverdue > 0
      ? `This invoice is <strong style="color:#ef4444;">${args.daysOverdue} day${args.daysOverdue === 1 ? "" : "s"} past due</strong>.`
      : "This invoice is due soon.";

    const dueLabel = args.dueAt
      ? `Due date: ${new Date(args.dueAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
      : "";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#111;padding:24px 32px;border-bottom:1px solid #2a2a2a;">
            <table width="100%"><tr>
              <td style="font-size:24px;font-weight:bold;color:#f97316;letter-spacing:-0.5px;">MechPro</td>
              <td style="text-align:right;color:#888;font-size:13px;">${escapeHtml(args.shopName)}</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#aaa;font-size:13px;">Hi ${escapeHtml(args.customerName)},</p>
            <h1 style="margin:0 0 8px;font-size:24px;color:#ffffff;">Payment Reminder</h1>
            <p style="margin:0 0 20px;color:#888;font-size:14px;">${escapeHtml(args.vehicleSummary)} &bull; ${escapeHtml(args.invoiceNumber)}</p>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6;">${overdueText}</p>
            <table width="100%" style="margin:20px 0;background:#111;border-radius:8px;border:1px solid #2a2a2a;">
              <tr><td style="padding:16px 20px;">
                <div style="color:#888;font-size:12px;margin-bottom:4px;">Invoice Total</div>
                <div style="color:#fff;font-size:22px;font-weight:bold;">$${args.total.toFixed(2)}</div>
                <div style="color:#aaa;font-size:13px;margin-top:8px;">Balance Due: <strong style="color:#f97316;">$${args.balance.toFixed(2)}</strong></div>
                ${dueLabel ? `<div style="color:#888;font-size:12px;margin-top:4px;">${escapeHtml(dueLabel)}</div>` : ""}
              </td></tr>
            </table>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6;">Please contact us to arrange payment at your earliest convenience.</p>
            ${contactLine ? `<p style="margin-top:24px;color:#888;font-size:13px;">Reach us at ${contactLine}</p>` : ""}
          </td>
        </tr>
        <tr>
          <td style="background:#111;padding:16px 32px;border-top:1px solid #2a2a2a;">
            <p style="margin:0;color:#555;font-size:11px;text-align:center;">Thank you for your business — ${escapeHtml(args.shopName)}</p>
            <p style="margin:8px 0 0;color:#444;font-size:10px;text-align:center;">
              ${escapeHtml(args.shopName)} &bull; 806 E Blvd N, Rapid City, SD 57701
            </p>
            <p style="margin:4px 0 0;color:#444;font-size:10px;text-align:center;">
              You are receiving this email because you have a vehicle service relationship with us.
              To unsubscribe from future emails, reply with "UNSUBSCRIBE" or contact us at lee@yourcarguy806.com.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
      `Hi ${args.customerName},`,
      ``,
      `Payment Reminder — ${args.invoiceNumber}`,
      args.vehicleSummary,
      ``,
      args.daysOverdue > 0 ? `This invoice is ${args.daysOverdue} day(s) past due.` : "This invoice is due soon.",
      `Balance Due: $${args.balance.toFixed(2)} of $${args.total.toFixed(2)}`,
      dueLabel,
      ``,
      `Please contact us to arrange payment.`,
      contactLine ? `Contact: ${contactLine}` : "",
      `\n---`,
      `${args.shopName} | 806 E Blvd N, Rapid City, SD 57701`,
      `To unsubscribe, reply UNSUBSCRIBE or email lee@yourcarguy806.com`,
    ].filter(Boolean).join("\n");

    try {
      await hercules.email.send({
        from: "MechPro <lee@yourcarguy806.com>",
        to: args.to,
        subject: `Payment Reminder — ${args.invoiceNumber}`,
        html,
        text,
      });
    } catch (error) {
      console.error("Failed to send reminder email:", error);
    }
  },
});

// ─── Invite email ─────────────────────────────────────────────────────────────

export const sendInviteEmail = internalAction({
  args: {
    to: v.string(),
    inviteeName: v.optional(v.string()),
    shopName: v.string(),
    role: v.string(),
    signInUrl: v.string(),
  },
  handler: async (_ctx, args) => {
    const roleLabels: Record<string, string> = {
      admin: "Admin",
      service_writer: "Service Writer",
      mechanic: "Mechanic",
      mobile_mechanic: "Mobile Mechanic",
    };
    const roleLabel = roleLabels[args.role] ?? args.role;
    const greeting = args.inviteeName ? `Hi ${escapeHtml(args.inviteeName)},` : "Hi,";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#111;padding:24px 32px;border-bottom:1px solid #2a2a2a;">
            <table width="100%"><tr>
              <td style="font-size:24px;font-weight:bold;color:#f97316;letter-spacing:-0.5px;">MechPro</td>
              <td style="text-align:right;color:#888;font-size:13px;">Team Invite</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#aaa;font-size:13px;">${greeting}</p>
            <h1 style="margin:0 0 16px;font-size:22px;color:#ffffff;">You've been invited to join ${escapeHtml(args.shopName)}</h1>
            <p style="margin:0 0 8px;color:#e0e0e0;font-size:15px;line-height:1.6;">
              You've been added as a <strong style="color:#f97316;">${escapeHtml(roleLabel)}</strong> on the ${escapeHtml(args.shopName)} team.
            </p>
            <p style="margin:0 0 24px;color:#888;font-size:14px;">
              Sign in with this email address (${escapeHtml(args.to)}) to get started.
            </p>
            <table cellpadding="0" cellspacing="0"><tr><td>
              <a href="${escapeHtml(args.signInUrl)}" style="display:inline-block;padding:12px 28px;background:#f97316;color:#ffffff;font-weight:600;text-decoration:none;border-radius:8px;font-size:15px;">
                Sign In to MechPro
              </a>
            </td></tr></table>
            <p style="margin:24px 0 0;color:#666;font-size:12px;">
              If you didn't expect this invite, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#111;padding:16px 32px;border-top:1px solid #2a2a2a;">
            <p style="margin:0;color:#555;font-size:11px;text-align:center;">Powered by MechPro — Mobile Mechanic Business Platform</p>
            <p style="margin:8px 0 0;color:#444;font-size:10px;text-align:center;">
              MechPro &bull; 806 E Blvd N, Rapid City, SD 57701
            </p>
            <p style="margin:4px 0 0;color:#444;font-size:10px;text-align:center;">
              To unsubscribe from future emails, reply with "UNSUBSCRIBE" or contact us at lee@yourcarguy806.com.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
      greeting,
      ``,
      `You've been invited to join ${args.shopName} as a ${roleLabel}.`,
      ``,
      `Sign in with this email address (${args.to}) to get started:`,
      args.signInUrl,
      ``,
      `If you didn't expect this invite, you can safely ignore this email.`,
      ``,
      `---`,
      `MechPro | 806 E Blvd N, Rapid City, SD 57701`,
      `To unsubscribe, reply UNSUBSCRIBE or email lee@yourcarguy806.com`,
    ].join("\n");

    try {
      await hercules.email.send({
        from: "MechPro <lee@yourcarguy806.com>",
        to: args.to,
        subject: `You're invited to join ${args.shopName} on MechPro`,
        html,
        text,
      });
    } catch (error) {
      console.error("Failed to send invite email:", error);
      throw error;
    }
  },
});

// ─── Send Estimate Approval Link (public action for frontend) ────────────────

export const sendEstimateLinkFull = action({
  args: {
    customerEmail: v.string(),
    customerName: v.string(),
    roNumber: v.string(),
    vehicleSummary: v.string(),
    shopName: v.string(),
    shopPhone: v.optional(v.string()),
    approveUrl: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await requireAuthenticatedAction(ctx);
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#111;padding:24px 32px;border-bottom:1px solid #2a2a2a;">
            <table width="100%"><tr>
              <td style="font-size:24px;font-weight:bold;color:#f97316;letter-spacing:-0.5px;">MechPro</td>
              <td style="text-align:right;color:#888;font-size:13px;">${escapeHtml(args.shopName)}</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#aaa;font-size:13px;">Hi ${escapeHtml(args.customerName)},</p>
            <h1 style="margin:0 0 8px;font-size:24px;color:#ffffff;">Your Estimate Is Ready</h1>
            <p style="margin:0 0 20px;color:#888;font-size:14px;">${escapeHtml(args.vehicleSummary)} &bull; ${escapeHtml(args.roNumber)}</p>
            <p style="margin:0 0 24px;color:#ccc;font-size:14px;line-height:1.5;">
              We've prepared an estimate for the work on your vehicle.
              Please review the details and approve when you're ready for us to begin.
            </p>
            <table cellpadding="0" cellspacing="0"><tr><td>
              <a href="${escapeHtml(args.approveUrl)}" style="display:inline-block;padding:14px 32px;background:#f97316;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;border-radius:8px;">
                View &amp; Approve Estimate
              </a>
            </td></tr></table>
            <p style="margin:24px 0 0;color:#666;font-size:12px;">
              Or copy this link: ${escapeHtml(args.approveUrl)}
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#111;padding:16px 32px;border-top:1px solid #2a2a2a;">
            <p style="margin:0;color:#666;font-size:12px;text-align:center;">
              ${args.shopPhone ? `Questions? Call ${escapeHtml(args.shopPhone)} &bull; ` : ""}Powered by MechPro
            </p>
            <p style="margin:8px 0 0;color:#444;font-size:10px;text-align:center;">
              ${escapeHtml(args.shopName)} &bull; 806 E Blvd N, Rapid City, SD 57701
            </p>
            <p style="margin:4px 0 0;color:#444;font-size:10px;text-align:center;">
              You are receiving this email because you have a vehicle service relationship with us.
              To unsubscribe from future emails, reply with "UNSUBSCRIBE" or contact us at lee@yourcarguy806.com.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
      `Hi ${args.customerName},`,
      "",
      `Your estimate for ${args.vehicleSummary} (${args.roNumber}) is ready for review.`,
      "",
      `View and approve here: ${args.approveUrl}`,
      "",
      args.shopPhone ? `Questions? Call ${args.shopPhone}` : "",
      `— ${args.shopName}`,
      ``,
      `---`,
      `${args.shopName} | 806 E Blvd N, Rapid City, SD 57701`,
      `To unsubscribe, reply UNSUBSCRIBE or email lee@yourcarguy806.com`,
    ].join("\n");

    try {
      await hercules.email.send({
        from: `MechPro <lee@yourcarguy806.com>`,
        to: args.customerEmail,
        subject: `Your Estimate Is Ready — ${args.roNumber}`,
        html,
        text,
      });
    } catch (error) {
      console.error("Failed to send estimate email:", error);
      throw new Error("Failed to send estimate email. Please try again.");
    }
  },
});
