import type { Metadata } from "next";
import { LegalPage } from "@/components/quantedge/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · DeeYoung Pro",
  description: "What DeeYoungs Ltd collects, why, how it is stored and protected, and the control you have over your data.",
};

export default function PrivacyPage() {
  return <LegalPage doc="PRIVACY" />;
}
