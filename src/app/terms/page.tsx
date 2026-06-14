import { LegalShell } from "@/components/legal/LegalShell";

export const metadata = { title: "Terms of Service · ppvs.io" };

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="June 2026"
      sections={[
        {
          heading: "1. Acceptance of Terms",
          paragraphs: [
            "By accessing or using ppvs.io (the “Service”), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.",
          ],
        },
        {
          heading: "2. Eligibility",
          paragraphs: [
            "You must be at least 18 years old and able to form a binding contract. The Service is intended for professional agencies and creators operating lawful adult-content businesses.",
          ],
        },
        {
          heading: "3. Description of the Service",
          paragraphs: [
            "ppvs.io provides software for agencies to manage creators, chatters, content, and sales conducted inside Telegram. We are a software provider and are not a party to transactions between you and your fans.",
          ],
        },
        {
          heading: "4. Accounts & Responsibility",
          paragraphs: [
            "You are responsible for your account credentials, the activity of your chatters, and the Telegram accounts you connect. Keep your login secure and notify us of any unauthorized use.",
          ],
        },
        {
          heading: "5. Acceptable Use",
          paragraphs: [
            "You agree not to use the Service for unlawful content, non-consensual content, content involving minors, fraud, or any activity that violates Telegram’s terms or applicable law. We may remove content or suspend accounts that breach this section.",
          ],
        },
        {
          heading: "6. Fees & Payments",
          paragraphs: [
            "ppvs.io charges a platform fee of 10% on transactions processed through the Service. There are no subscription or setup fees. We may change fees with reasonable notice.",
          ],
        },
        {
          heading: "7. Payouts",
          paragraphs: [
            "Earnings are credited to your balance and may be withdrawn subject to the withdrawal methods and minimums shown in the app. You are solely responsible for any taxes owed on your earnings.",
          ],
        },
        {
          heading: "8. Content & Intellectual Property",
          paragraphs: [
            "You retain ownership of content you upload. You grant ppvs.io a limited license to host and process it solely to provide the Service. You represent that you hold all rights necessary to distribute the content.",
          ],
        },
        {
          heading: "9. Termination",
          paragraphs: [
            "We may suspend or terminate accounts that violate these Terms or applicable law. You may stop using the Service at any time.",
          ],
        },
        {
          heading: "10. Disclaimers & Limitation of Liability",
          paragraphs: [
            "The Service is provided “as is” without warranties of any kind. To the maximum extent permitted by law, ppvs.io is not liable for indirect, incidental, or consequential damages arising from your use of the Service.",
          ],
        },
        {
          heading: "11. Changes to These Terms",
          paragraphs: [
            "We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.",
          ],
        },
        {
          heading: "12. Contact",
          paragraphs: [
            "Questions about these Terms? Reach us via the contact link in the site footer.",
          ],
        },
      ]}
    />
  );
}
