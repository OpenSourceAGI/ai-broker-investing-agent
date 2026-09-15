import { LegalTermsPrivacyPolicy } from "legal-terms-privacy-policy/react";
import { APP_EMAIL, LAST_REVISED_DATE } from "@/lib/constants";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "AI Broker";

export const metadata = {
  title: `${APP_NAME} Terms of Service`,
  description: `Terms of Service for ${APP_NAME}`,
};

/**
 * The terms-only view: the same source document as `/legal/privacy`, narrowed
 * to the clauses that are terms rather than privacy notices, in the order this
 * page has always used. The privacy sections stay one link away.
 */
const TERMS_SECTIONS = [
  "introduction",
  "ai-ethics",
  "accounts",
  "use-of-services",
  "materials",
  "feedback",
  "liability",
  "changes",
  "termination",
  "contact",
];

export default function TermsPage() {
  return (
    <LegalTermsPrivacyPolicy
      appName={APP_NAME}
      contactEmail={APP_EMAIL}
      lastRevisedDate={LAST_REVISED_DATE}
      homeUrl="/"
      title={`${APP_NAME} Terms of Service`}
      variant="full"
      include={TERMS_SECTIONS}
      order={TERMS_SECTIONS}
      features={{ variantSwitch: false, badges: false }}
    />
  );
}
