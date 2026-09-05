import type { Metadata } from "next";
import { LegalPage } from "@/components/quantedge/legal-page";

export const metadata: Metadata = {
  title: "Terms & Conditions · DeeYoung Pro",
  description: "The terms that govern your use of DeeYoung Pro: subscriptions, acceptable use, disclaimers and liability.",
};

export default function TermsPage() {
  return <LegalPage doc="TOS" />;
}
