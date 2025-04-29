import nodemailer from "nodemailer";
import { config } from "../config";
import { logger } from "../config/logger";

// Create a reusable transporter object using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.email.gmailUser, // your full gmail address
    pass: config.email.gmailAppPassword, // App Password, not your regular Gmail password
  },
});

export const initializeSmtp = () => {
  transporter.verify((error) => {
    if (error) {
      logger.error({ error }, "SMTP connection error");
    } else {
      logger.info("SMTP server is ready to send messages");
    }
  });
};

export async function sendVerificationEmail(
  email: string,
  link: string
): Promise<void> {
  try {
    await transporter.sendMail({
      from: `"From The Hart" <${config.email.fromAlias}>`, // "From The Hart" <noreply@fromthehart.tech>
      to: email,
      subject: "Verify your From The Hart account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to From The Hart!</h2>
          <p>Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="background-color: #4CAF50; color: white; padding: 15px 25px; text-decoration: none; border-radius: 4px;">Verify Email</a>
          </div>
          <p>If the button doesn't work, you can copy this link into your browser:</p>
          <p>${link}</p>
          <p>This link will expire in 24 hours.</p>
        </div>
      `,
      text: `Welcome to From The Hart! Please verify your email by clicking this link: ${link}`,
    });

    logger.info({ email }, "Verification email sent");
  } catch (error) {
    logger.error({ error, email }, "Failed to send verification email");
    throw error;
  }
}

export async function sendPasswordResetEmail(
  email: string,
  resetLink: string
): Promise<void> {
  try {
    await transporter.sendMail({
      from: `"From The Hart" <${config.email.fromAlias}>`,
      to: email,
      subject: "Reset your From The Hart password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #4CAF50; color: white; padding: 15px 25px; text-decoration: none; border-radius: 4px;">Reset Password</a>
          </div>
          <p>If you didn't request this change, you can ignore this email.</p>
          <p>This link will expire in 1 hour.</p>
        </div>
      `,
      text: `You requested to reset your password. Click this link to set a new password: ${resetLink}`,
    });

    logger.info({ email }, "Password reset email sent");
  } catch (error) {
    logger.error({ error, email }, "Failed to send password reset email");
    throw error;
  }
}
