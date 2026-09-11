import { LegalTermsPrivacyPolicy } from "legal-terms-privacy-policy/react";
import { APP_EMAIL, LAST_REVISED_DATE } from "@/lib/constants";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "AI Broker";

export const metadata = {
  title: `${APP_NAME} Terms of Service and Privacy Policy`,
  description: `Terms of Service and Privacy Policy for ${APP_NAME}`,
};

/**
 * The clauses live in the shared `legal-terms-privacy-policy` package, so this
 * page and the ones on QwkSearch, Debate AI, Grab URL and Rights Institute
 * cannot drift apart. Only what is specific to this app is set here.
 *
 * Opens on the full combined document — Terms of Service and Privacy Policy —
 * with a switch to the plain-language summary. `/legal/terms` renders the
 * terms-only subset of the same source.
 */
export default function PrivacyPage() {
  return (
    <LegalTermsPrivacyPolicy
      appName={APP_NAME}
      contactEmail={APP_EMAIL}
      lastRevisedDate={LAST_REVISED_DATE}
      homeUrl="/"
      defaultVariant="full"
    />
  );
}
