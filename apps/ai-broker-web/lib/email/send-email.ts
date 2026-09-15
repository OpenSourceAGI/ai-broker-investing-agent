import { createMimeMessage } from "mimetext";
import { EmailMessage } from "cloudflare:email";
import { env } from "cloudflare:workers";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
}

export interface SendEmailResult {
  success: boolean;
  provider: "cloudflare" | "console";
  error?: string;
}

/**
 * Send transactional email through Cloudflare Email Workers.
 *
 * The `SEND_EMAIL` binding in wrangler.jsonc is the only delivery path —
 * there is no third-party provider (Resend, SendGrid, SES) fallback. It
 * requires Email Routing enabled on the zone and the sender address
 * configured under a verified domain.
 *
 * When the binding is absent (plain `vite build`, unit tests, an unconfigured
 * local environment) the message is logged instead so auth and invitation
 * flows never hard-fail during development.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const from = options.from || process.env.EMAIL_FROM || "noreply@autoinvestment.broker";
  const fromName = options.fromName || "Auto Investment Broker";

  if (env?.SEND_EMAIL) {
    try {
      const msg = createMimeMessage();
      msg.setSender({ name: fromName, addr: from });
      msg.setRecipient(options.to);
      msg.setSubject(options.subject);
      if (options.text) {
        msg.addMessage({ contentType: "text/plain", data: options.text });
      }
      msg.addMessage({ contentType: "text/html", data: options.html });

      await env.SEND_EMAIL.send(
        new EmailMessage(from, options.to, msg.asRaw()) as never,
      );
      return { success: true, provider: "cloudflare" };
    } catch (error) {
      console.error("Cloudflare email send failed:", error);
      return { success: false, provider: "cloudflare", error: String(error) };
    }
  }

  // No SEND_EMAIL binding — log instead of failing the flow.
  console.log(`
    ============================================
    EMAIL (Cloudflare SEND_EMAIL binding absent)
    ============================================
    To: ${options.to}
    Subject: ${options.subject}
    ${options.text || options.html}
    ============================================
  `);
  return { success: true, provider: "console" };
}

/** Shared minimal HTML wrapper for transactional emails. */
export function renderEmailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #10b981 0%, #047857 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 26px;">${title}</h1>
    </div>
    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
      ${bodyHtml}
    </div>
    <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
      <p>This is an automated email. Please do not reply.</p>
    </div>
  </body>
</html>`;
}

/** Styled call-to-action button for transactional emails. */
export function renderEmailButton(label: string, url: string): string {
  return `<div style="text-align: center; margin: 30px 0;">
    <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #047857 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      ${label}
    </a>
  </div>`;
}
