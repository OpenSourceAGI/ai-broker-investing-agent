"use server";

import { sendEmail, renderEmailLayout, renderEmailButton } from "./send-email";

export async function sendTeamInvitationEmail(
  email: string,
  teamName: string,
  inviterId: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const signupUrl = `${appUrl}/auth/signup?email=${encodeURIComponent(email)}`;

  const result = await sendEmail({
    to: email,
    subject: `You've been invited to join ${teamName}`,
    text: `You've been invited to join the team ${teamName}. Sign up to accept: ${signupUrl}`,
    html: renderEmailLayout(
      "Team Invitation",
      `
      <h2 style="color: #333; margin-top: 0;">You've been invited!</h2>
      <p style="font-size: 16px; color: #555;">
        You've been invited to join the team <strong>${teamName}</strong>.
      </p>
      <p style="font-size: 16px; color: #555;">
        To accept this invitation, you'll need to create an account first.
      </p>
      ${renderEmailButton("Sign Up & Join Team", signupUrl)}
      <p style="font-size: 14px; color: #888; margin-top: 30px;">
        This invitation will expire in 7 days.
      </p>
      <p style="font-size: 14px; color: #888;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
      `
    ),
  });

  if (!result.success) {
    throw new Error(result.error || "Failed to send invitation email");
  }

  return { success: true };
}
