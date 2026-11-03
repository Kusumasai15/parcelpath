import crypto from 'crypto';

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  type: 'password_reset' | 'verification_code';
  resetUrl?: string;
  token?: string;
  code?: string;
  body: string;
  sentAt: string;
}

class EmailService {
  private testInbox: SentEmail[] = [];

  getBaseUrl(): string {
    if (process.env.APP_URL) {
      return process.env.APP_URL.replace(/\/$/, '');
    }
    if (process.env.VERCEL) {
      return 'https://parcelpath-brown.vercel.app';
    }
    return 'http://localhost:3000';
  }

  async sendPasswordResetEmail(to: string, name: string, token: string): Promise<{ success: boolean; resetUrl: string }> {
    const baseUrl = this.getBaseUrl();
    const resetUrl = `${baseUrl}/?reset_token=${encodeURIComponent(token)}`;

    const subject = 'Reset your ParcelPath password';
    const body = `Hello ${name || 'there'},\n\n` +
      `We received a request to reset the password for your ParcelPath account.\n\n` +
      `Click the secure link below to set a new password. This link is single-use and expires in 1 hour:\n` +
      `${resetUrl}\n\n` +
      `If you did not request this password reset, please ignore this email. Your existing password will remain secure.\n\n` +
      `Best regards,\nThe ParcelPath Security Team`;

    const emailRecord: SentEmail = {
      id: 'email_' + crypto.randomBytes(8).toString('hex'),
      to,
      subject,
      type: 'password_reset',
      resetUrl,
      token,
      body,
      sentAt: new Date().toISOString(),
    };

    // Store in authorized in-memory test inbox for verification and testing
    this.testInbox.unshift(emailRecord);
    if (this.testInbox.length > 50) {
      this.testInbox.pop();
    }

    console.log(`[EmailService] Password reset link generated for ${to}: ${resetUrl}`);

    // Real Provider: Resend (if configured)
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'ParcelPath Security <security@parcelpath.in>',
            to: [to],
            subject,
            text: body,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2d9cc; border-radius: 12px; background: #fffcf6; color: #1c1917;">
                <div style="margin-bottom: 20px;">
                  <span style="font-weight: 700; font-size: 18px; color: #8b5e3c;">ParcelPath</span>
                  <span style="font-size: 13px; color: #78716c; margin-left: 8px;">Security &amp; Account Protection</span>
                </div>
                <h2 style="font-size: 18px; margin: 0 0 12px; color: #1c1917;">Reset your password</h2>
                <p style="font-size: 14px; line-height: 1.5; color: #44403c;">
                  Hello ${name || 'there'}, we received a request to reset your password. Click the button below to choose a new password.
                </p>
                <div style="margin: 24px 0;">
                  <a href="${resetUrl}" style="background: #8b5e3c; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                    Reset Password
                  </a>
                </div>
                <p style="font-size: 12px; color: #78716c; line-height: 1.4;">
                  This link is single-use and expires in 1 hour. If the button does not work, copy and paste this URL into your browser:<br />
                  <a href="${resetUrl}" style="color: #8b5e3c; word-break: break-all;">${resetUrl}</a>
                </p>
                <hr style="border: none; border-top: 1px solid #e2d9cc; margin: 24px 0;" />
                <p style="font-size: 11px; color: #a8a29e; margin: 0;">
                  If you did not request this, you can safely ignore this email. Your current password remains secure.
                </p>
              </div>
            `,
          }),
        });
      } catch (err) {
        console.warn('[EmailService] Failed to dispatch via Resend API, falling back to recorded test inbox:', err);
      }
    }

    return { success: true, resetUrl };
  }

  async sendVerificationCodeEmail(to: string, name: string, code: string, action: string): Promise<{ success: boolean }> {
    const actionDesc = action === 'delete_account' ? 'permanently delete your ParcelPath account' : 'change your account password';
    const subject = `Your ParcelPath Security Verification Code: ${code}`;
    const body = `Hello ${name || 'there'},\n\n` +
      `You requested to ${actionDesc}.\n\n` +
      `Your single-use 6-digit security code is: ${code}\n\n` +
      `This code will expire in 10 minutes. Never share this code with anyone.\n\n` +
      `Best regards,\nThe ParcelPath Security Team`;

    const emailRecord: SentEmail = {
      id: 'email_' + crypto.randomBytes(8).toString('hex'),
      to,
      subject,
      type: 'verification_code',
      code,
      body,
      sentAt: new Date().toISOString(),
    };

    this.testInbox.unshift(emailRecord);
    if (this.testInbox.length > 50) {
      this.testInbox.pop();
    }

    console.log(`[EmailService] Verification code for ${to} (${action}): ${code}`);

    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'ParcelPath Security <security@parcelpath.in>',
            to: [to],
            subject,
            text: body,
          }),
        });
      } catch (err) {
        console.warn('[EmailService] Failed to dispatch verification code via Resend:', err);
      }
    }

    return { success: true };
  }

  getTestInbox(): SentEmail[] {
    return [...this.testInbox];
  }

  clearTestInbox(): void {
    this.testInbox = [];
  }
}

export const emailService = new EmailService();
