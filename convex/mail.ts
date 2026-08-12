/**
 * Shared outbound email helper.
 * Prefers Amazon SES when SES_FROM_EMAIL is configured (AWS cutover);
 * falls back to Hercules email when only HERCULES_API_KEY is present.
 */
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { Hercules } from "@usehercules/sdk";

export type SendMailArgs = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

let hercules: Hercules | null = null;
let ses: SESClient | null = null;

function getHercules(): Hercules {
  if (!hercules) {
    hercules = new Hercules({
      apiKey: process.env.HERCULES_API_KEY,
      apiVersion: "2025-12-09",
    });
  }
  return hercules;
}

function getSes(): SESClient {
  if (!ses) {
    ses = new SESClient({
      region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
    });
  }
  return ses;
}

function parseAddress(from: string): { email: string; name?: string } {
  const match = from.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
  }
  return { email: from.trim() };
}

export async function sendMail(args: SendMailArgs): Promise<void> {
  const sesFrom = process.env.SES_FROM_EMAIL;
  if (sesFrom) {
    const parsed = parseAddress(args.from);
    const source = parsed.name ? `${parsed.name} <${sesFrom}>` : sesFrom;
    await getSes().send(
      new SendEmailCommand({
        Source: source,
        Destination: { ToAddresses: [args.to] },
        Message: {
          Subject: { Data: args.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: args.html, Charset: "UTF-8" },
            Text: { Data: args.text, Charset: "UTF-8" },
          },
        },
      }),
    );
    return;
  }

  if (!process.env.HERCULES_API_KEY) {
    throw new Error("Email is not configured (set SES_FROM_EMAIL or HERCULES_API_KEY)");
  }

  await getHercules().email.send({
    from: args.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
}
