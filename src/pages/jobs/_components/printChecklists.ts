import { escapeHtml } from "../../../lib/escapeHtml.ts";

export type PrintDiagnosticItem = {
  item: string;
  category?: string;
  toolsRequired?: string[];
  verificationCriteria?: string;
  completed: boolean;
  notes?: string;
};

export type PrintRepairStep = {
  step: number;
  title: string;
  details: string;
  toolsRequired?: string[];
  torqueSpecs?: string;
  warning?: string;
  completed: boolean;
  notes?: string;
};

function joinTools(tools: string[] | undefined): string {
  return (tools ?? []).map((tool) => escapeHtml(tool)).join(", ");
}

export function buildDiagnosticPrintHtml(
  items: PrintDiagnosticItem[],
  completedCount: number,
): string {
  const rows = items
    .map((item, i) => {
      const tools = item.toolsRequired?.length
        ? `<div class="meta"><strong>Tools:</strong> ${joinTools(item.toolsRequired)}</div>`
        : "";
      const criteria = item.verificationCriteria
        ? `<div class="meta"><strong>Pass criteria:</strong> ${escapeHtml(item.verificationCriteria)}</div>`
        : "";
      const notes = item.notes
        ? `<div class="meta"><strong>Notes:</strong> ${escapeHtml(item.notes)}</div>`
        : "";
      const category = item.category
        ? `<span class="badge">${escapeHtml(item.category)}</span>`
        : "";

      return `
        <div class="item ${item.completed ? "completed" : ""}">
          <div class="item-header"><span class="checkbox"></span>${i + 1}. ${escapeHtml(item.item)}</div>
          ${category}
          ${tools}
          ${criteria}
          ${notes}
        </div>`;
    })
    .join("");

  return `<html><head><title>Diagnostic Checklist</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; font-size: 13px; }
        h2 { margin-bottom: 8px; }
        .item { border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 8px; }
        .item-header { font-weight: 600; margin-bottom: 4px; }
        .meta { color: #666; font-size: 11px; margin-top: 4px; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; background: #f0f0f0; margin-right: 4px; }
        .checkbox { width: 14px; height: 14px; border: 2px solid #999; border-radius: 3px; display: inline-block; margin-right: 8px; vertical-align: middle; }
        .completed .checkbox { background: #22c55e; border-color: #22c55e; }
        @media print { body { padding: 12px; } }
      </style></head><body>
      <h2>Diagnostic Verification Checklist</h2>
      <p style="color:#666;margin-bottom:16px;">${completedCount}/${items.length} completed</p>
      ${rows}
      </body></html>`;
}

export function buildRepairPrintHtml(
  steps: PrintRepairStep[],
  completedCount: number,
): string {
  const rows = steps
    .map((step) => {
      const tools = step.toolsRequired?.length
        ? `<div class="meta"><strong>Tools:</strong> ${joinTools(step.toolsRequired)}</div>`
        : "";
      const torque = step.torqueSpecs
        ? `<div class="meta"><strong>Torque:</strong> ${escapeHtml(step.torqueSpecs)}</div>`
        : "";
      const warning = step.warning
        ? `<div class="warning">⚠ ${escapeHtml(step.warning)}</div>`
        : "";
      const notes = step.notes
        ? `<div class="meta"><strong>Notes:</strong> ${escapeHtml(step.notes)}</div>`
        : "";

      return `
        <div class="step ${step.completed ? "completed" : ""}">
          <div class="step-header"><span class="checkbox"></span>Step ${escapeHtml(step.step)}: ${escapeHtml(step.title)}</div>
          <div class="step-details">${escapeHtml(step.details)}</div>
          ${tools}
          ${torque}
          ${warning}
          ${notes}
        </div>`;
    })
    .join("");

  return `<html><head><title>Repair Procedure</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; font-size: 13px; }
        h2 { margin-bottom: 8px; }
        .step { border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
        .step-header { font-weight: 600; margin-bottom: 4px; }
        .step-details { color: #333; margin-bottom: 4px; }
        .meta { color: #666; font-size: 11px; margin-top: 4px; }
        .warning { color: #d97706; font-size: 11px; margin-top: 4px; font-weight: 500; }
        .checkbox { width: 14px; height: 14px; border: 2px solid #999; border-radius: 3px; display: inline-block; margin-right: 8px; vertical-align: middle; }
        .completed .checkbox { background: #22c55e; border-color: #22c55e; }
        @media print { body { padding: 12px; } }
      </style></head><body>
      <h2>Repair Procedure Checklist</h2>
      <p style="color:#666;margin-bottom:16px;">${completedCount}/${steps.length} completed</p>
      ${rows}
      </body></html>`;
}
