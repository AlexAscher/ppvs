import { LegalShell } from "@/components/legal/LegalShell";

export const metadata = { title: "Privacy Policy · ppvs.io" };

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="June 2026"
      sections={[
        {
          heading: "1. Information We Collect",
          paragraphs: [
            "We collect the account information you provide (such as your email), usage data, the content you upload, and data accessed from the Telegram accounts you connect to the Service.",
          ],
        },
        {
          heading: "2. How We Use Information",
          paragraphs: [
            "We use information to provide and improve the Service, process payments and payouts, prevent abuse, and keep the platform secure.",
          ],
        },
        {
          heading: "3. Telegram Data",
          paragraphs: [
            "When you connect a Telegram account, we access messages and contacts via Telegram’s API solely to provide the chatting and sales features. We do not sell this data.",
          ],
        },
        {
          heading: "4. Sharing",
          paragraphs: [
            "We share data with service providers (such as hosting and payment processors) only as needed to operate the Service. We do not sell your personal data.",
          ],
        },
        {
          heading: "5. Data Retention",
          paragraphs: [
            "We retain data while your account is active and for as long as needed to comply with legal obligations and resolve disputes.",
          ],
        },
        {
          heading: "6. Security",
          paragraphs: [
            "We use industry-standard measures to protect data. No method of transmission or storage is fully secure, and we cannot guarantee absolute security.",
          ],
        },
        {
          heading: "7. Your Rights",
          paragraphs: [
            "Depending on your jurisdiction, you may request access to, correction of, or deletion of your personal data, subject to legal limits.",
          ],
        },
        {
          heading: "8. Cookies",
          paragraphs: [
            "We use cookies for authentication and basic analytics. You can control cookies through your browser settings.",
          ],
        },
        {
          heading: "9. Changes to This Policy",
          paragraphs: [
            "We may update this Policy from time to time. The “Last updated” date above reflects the latest revision.",
          ],
        },
        {
          heading: "10. Contact",
          paragraphs: [
            "Privacy questions? Reach us via the contact link in the site footer.",
          ],
        },
      ]}
    />
  );
}
