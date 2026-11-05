import crypto from 'crypto';
import nodemailer from 'nodemailer';

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  type: 'password_reset' | 'verification_code' | 'account_verification';
  resetUrl?: string;
  verificationUrl?: string;
  token?: string;
  code?: string;
  body: string;
  sentAt: string;
  deliveredViaProvider?: boolean;
  providerError?: string;
}

class EmailService {
  private testInbox: SentEmail[] = [];

  getBaseUrl(): string {
    if (process.env.APP_URL) {
      return process.env.APP_URL.replace(/\/$/, '');
    }
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
    }
    if (process.env.VERCEL) {
      return 'https://parcelpath-7q1d.vercel.app';
    }
    return 'http://localhost:3000';
  }

  getSenderAddress(): string {
    if (process.env.EMAIL_FROM) {
      return process.env.EMAIL_FROM;
    }
    if (process.env.SMTP_USER || process.env.GMAIL_USER) {
      return `ParcelPath Security <${process.env.SMTP_USER || process.env.GMAIL_USER}>`;
    }
    // Resend sandbox requires onboarding@resend.dev when custom domain is not yet DNS-verified
    return 'ParcelPath <onboarding@resend.dev>';
  }

  private getSmtpTransporter() {
    const user = process.env.SMTP_USER || process.env.GMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) return null;

    if (user.includes('@gmail.com') || process.env.GMAIL_USER) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    }

    const host = process.env.SMTP_HOST || 'smtp.resend.com';
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  async sendAccountVerificationEmail(
    to: string,
    name: string,
    token: string,
    code: string
  ): Promise<{ success: boolean; deliveredViaProvider: boolean; verificationUrl: string; code: string; providerError?: string }> {
    const baseUrl = this.getBaseUrl();
    const verificationUrl = `${baseUrl}/?verify_token=${encodeURIComponent(token)}`;
    const subject = `Verify your ParcelPath email: ${code}`;
    const body =
      `Hello ${name || 'there'},\n\n` +
      `Thank you for registering with ParcelPath. To activate your account and access your delivery dashboard, please verify your email address.\n\n` +
      `Your 6-digit verification code is: ${code}\n\n` +
      `Or click this secure link to verify instantly:\n` +
      `${verificationUrl}\n\n` +
      `This link and code will expire in 24 hours.\n\n` +
      `Best regards,\nThe ParcelPath Security Team`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2d9cc; border-radius: 12px; background: #fffcf6; color: #1c1917;">
        <div style="margin-bottom: 20px;">
          <span style="font-weight: 700; font-size: 18px; color: #8b5e3c;">ParcelPath</span>
          <span style="font-size: 13px; color: #78716c; margin-left: 8px;">Account Verification</span>
        </div>
        <h2 style="font-size: 18px; margin: 0 0 12px; color: #1c1917;">Verify your email address</h2>
        <p style="font-size: 14px; line-height: 1.5; color: #44403c;">
          Hello ${name || 'there'}, please verify your email address to complete your ParcelPath account setup.
        </p>
        <div style="margin: 20px 0; padding: 16px; background: #f5efe6; border-radius: 8px; text-align: center;">
          <span style="display: block; font-size: 12px; color: #78716c; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Verification Code</span>
          <span style="font-size: 28px; font-weight: 700; letter-spacing: 0.25em; color: #8b5e3c; font-family: monospace;">${code}</span>
        </div>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${verificationUrl}" style="background: #8b5e3c; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
            Verify My Email Address
          </a>
        </div>
        <p style="font-size: 12px; color: #78716c; line-height: 1.4;">
          This link expires in 24 hours. If the button does not work, copy and paste this link into your browser:<br />
          <a href="${verificationUrl}" style="color: #8b5e3c; word-break: break-all;">${verificationUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2d9cc; margin: 24px 0;" />
        <p style="font-size: 11px; color: #a8a29e; margin: 0;">
          If you did not register for ParcelPath, please disregard this email.
        </p>
      </div>
    `;

    let deliveredViaProvider = false;
    let providerError: string | undefined;

    // 1. Try SMTP if configured (universal real email delivery to any mailbox)
    const transporter = this.getSmtpTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: this.getSenderAddress(),
          to,
          subject,
          text: body,
          html,
        });
        deliveredViaProvider = true;
        console.log(`[EmailService] Verification email sent to ${to} via SMTP.`);
      } catch (err: unknown) {
        providerError = err instanceof Error ? err.message : 'SMTP dispatch error';
        console.warn('[EmailService] SMTP dispatch failed:', providerError);
      }
    }

    // 2. Try Resend if SMTP was not used or failed
    if (!deliveredViaProvider && process.env.RESEND_API_KEY) {
      try {
        const fromAddress = this.getSenderAddress();
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [to],
            subject,
            text: body,
            html,
          }),
        });

        if (res.ok) {
          deliveredViaProvider = true;
          console.log(`[EmailService] Verification email dispatched to ${to} via Resend.`);
        } else {
          const errData = await res.json().catch(() => ({ message: res.statusText }));
          const rawMsg = errData.message || `Resend returned HTTP ${res.status}`;
          if (rawMsg.includes('only send testing emails to your own email address')) {
            providerError = 'Resend sandbox is restricted to its account owner. To send to all inboxes, set up SMTP (or verify domain in Resend). In-app verification link & code are ready below.';
          } else {
            providerError = rawMsg;
          }
          console.warn(`[EmailService] Resend dispatch rejected (${res.status}):`, providerError);
        }
      } catch (err: unknown) {
        providerError = err instanceof Error ? err.message : 'Network error dispatching via Resend';
        console.warn('[EmailService] Failed to dispatch via Resend:', providerError);
      }
    }

    if (!deliveredViaProvider && !providerError) {
      providerError = 'No outbound email credentials configured (SMTP or RESEND_API_KEY). Direct verification is available below.';
    }

    const emailRecord: SentEmail = {
      id: 'email_' + crypto.randomBytes(8).toString('hex'),
      to,
      subject,
      type: 'account_verification',
      verificationUrl,
      token,
      code,
      body,
      sentAt: new Date().toISOString(),
      deliveredViaProvider,
      providerError,
    };

    this.testInbox.unshift(emailRecord);
    if (this.testInbox.length > 50) this.testInbox.pop();

    return {
      success: true,
      deliveredViaProvider,
      verificationUrl,
      code,
      providerError,
    };
  }

  getResetSenderAddress(): string {
    if (process.env.RESET_EMAIL_FROM) {
      return process.env.RESET_EMAIL_FROM;
    }
    return this.getSenderAddress();
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    token: string
  ): Promise<{ success: boolean; deliveredViaProvider: boolean; resetUrl: string; providerError?: string }> {
    const baseUrl = this.getBaseUrl();
    const resetUrl = `${baseUrl}/?reset_token=${encodeURIComponent(token)}`;

    const subject = 'Reset your ParcelPath password';
    const body =
      `Hello ${name || 'there'},\n\n` +
      `We received a request to reset the password for your ParcelPath account.\n\n` +
      `Click the secure single-use link below to set a new password (expires in 15 minutes):\n\n` +
      `Open Generated Reset Link:\n` +
      `${resetUrl}\n\n` +
      `If you did not request this password reset, please ignore this email. Your existing password will remain secure.\n\n` +
      `Best regards,\nThe ParcelPath Security Team`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2d9cc; border-radius: 12px; background: #fffcf6; color: #1c1917;">
        <div style="margin-bottom: 20px;">
          <span style="font-weight: 700; font-size: 18px; color: #8b5e3c;">ParcelPath</span>
          <span style="font-size: 13px; color: #78716c; margin-left: 8px;">Security &amp; Account Protection</span>
        </div>
        <h2 style="font-size: 18px; margin: 0 0 12px; color: #1c1917;">Reset your password</h2>
        <p style="font-size: 14px; line-height: 1.5; color: #44403c;">
          Hello ${name || 'there'}, we received a request to reset your password. Click the button below to choose a new password. This link is single-use and expires in 15 minutes.
        </p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${resetUrl}" style="background: #8b5e3c; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
            Open Generated Reset Link
          </a>
        </div>
        <p style="font-size: 12px; color: #78716c; line-height: 1.4;">
          This link is single-use and expires in 15 minutes. If the button does not work, copy and paste this link into your browser:<br />
          <a href="${resetUrl}" style="color: #8b5e3c; word-break: break-all;">${resetUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2d9cc; margin: 24px 0;" />
        <p style="font-size: 11px; color: #a8a29e; margin: 0;">
          If you did not request this, you can safely ignore this email. Your current password remains secure.
        </p>
      </div>
    `;

    let deliveredViaProvider = false;
    let providerError: string | undefined;
    const fromAddress = this.getResetSenderAddress();

    const transporter = this.getSmtpTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: fromAddress,
          to,
          subject,
          text: body,
          html,
        });
        deliveredViaProvider = true;
        console.log(`[EmailService] Password reset link sent to ${to} via SMTP.`);
      } catch (err: unknown) {
        providerError = err instanceof Error ? err.message : 'SMTP dispatch error';
      }
    }

    if (!deliveredViaProvider && process.env.RESEND_API_KEY) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [to],
            subject,
            text: body,
            html,
          }),
        });

        if (res.ok) {
          deliveredViaProvider = true;
          console.log(`[EmailService] Password reset link dispatched to ${to} via Resend.`);
        } else {
          const errData = await res.json().catch(() => ({ message: res.statusText }));
          providerError = errData.message || `Provider returned HTTP ${res.status}`;
          console.warn(`[EmailService] Resend dispatch rejected (${res.status}):`, providerError);
        }
      } catch (err: unknown) {
        providerError = err instanceof Error ? err.message : 'Network error dispatching via Resend';
      }
    }

    if (!deliveredViaProvider && !providerError) {
      providerError = 'No outbound email credentials configured (RESEND_API_KEY or SMTP). Direct reset link is available.';
    }

    const emailRecord: SentEmail = {
      id: 'email_' + crypto.randomBytes(8).toString('hex'),
      to,
      subject,
      type: 'password_reset',
      resetUrl,
      token,
      body,
      sentAt: new Date().toISOString(),
      deliveredViaProvider,
      providerError,
    };

    this.testInbox.unshift(emailRecord);
    if (this.testInbox.length > 50) this.testInbox.pop();

    return { success: true, deliveredViaProvider, resetUrl, providerError };
  }

  async sendVerificationCodeEmail(
    to: string,
    name: string,
    code: string,
    action: string
  ): Promise<{ success: boolean; deliveredViaProvider: boolean; providerError?: string }> {
    const actionDesc = action === 'delete_account' ? 'permanently delete your ParcelPath account' : 'change your account password';
    const subject = `Your ParcelPath Security Verification Code: ${code}`;
    const body =
      `Hello ${name || 'there'},\n\n` +
      `You requested to ${actionDesc}.\n\n` +
      `Your single-use 6-digit security code is: ${code}\n\n` +
      `This code will expire in 10 minutes. Never share this code with anyone.\n\n` +
      `Best regards,\nThe ParcelPath Security Team`;

    let deliveredViaProvider = false;
    let providerError: string | undefined;

    const transporter = this.getSmtpTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: this.getSenderAddress(),
          to,
          subject,
          text: body,
        });
        deliveredViaProvider = true;
      } catch (err: unknown) {
        providerError = err instanceof Error ? err.message : 'SMTP dispatch error';
      }
    }

    if (!deliveredViaProvider && process.env.RESEND_API_KEY) {
      try {
        const fromAddress = this.getSenderAddress();
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [to],
            subject,
            text: body,
          }),
        });

        if (res.ok) {
          deliveredViaProvider = true;
        } else {
          const errData = await res.json().catch(() => ({ message: res.statusText }));
          providerError = errData.message || `Provider returned HTTP ${res.status}`;
        }
      } catch (err: unknown) {
        providerError = err instanceof Error ? err.message : 'Network error dispatching code';
      }
    }

    if (!deliveredViaProvider && !providerError) {
      providerError = 'No outbound email credentials configured. Code is available in session verification.';
    }

    const emailRecord: SentEmail = {
      id: 'email_' + crypto.randomBytes(8).toString('hex'),
      to,
      subject,
      type: 'verification_code',
      code,
      body,
      sentAt: new Date().toISOString(),
      deliveredViaProvider,
      providerError,
    };

    this.testInbox.unshift(emailRecord);
    if (this.testInbox.length > 50) this.testInbox.pop();

    return { success: true, deliveredViaProvider, providerError };
  }

  getTestInbox(): SentEmail[] {
    return [...this.testInbox];
  }

  clearTestInbox(): void {
    this.testInbox = [];
  }
}

export const emailService = new EmailService();
