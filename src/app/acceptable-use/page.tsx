import { LegalShell } from "@/components/legal/LegalShell";

export const metadata = { title: "Acceptable Use Policy · ppvs.io" };

export default function AcceptableUsePage() {
  return (
    <LegalShell
      title="Acceptable Use Policy"
      updated="June 2026"
      intro={[
        'This Acceptable Use Policy ("Policy") forms part of the Terms of Service governing the use of ppvs.io ("ppvs.io", "we", "our", or "us").',
        "By using the Service, you agree to comply with this Policy.",
        "This Policy exists to protect users, creators, agencies, fans, payment providers, and the integrity of the platform.",
      ]}
      sections={[
        {
          heading: "Compliance With Laws",
          blocks: [
            { kind: "p", text: "Users must comply with all applicable laws, regulations, and legal obligations in the jurisdictions where they operate." },
            { kind: "p", text: "You may not use the Service for any unlawful purpose." },
          ],
        },
        {
          heading: "Adult Content Requirements",
          blocks: [
            { kind: "p", text: "All content uploaded to the platform must:" },
            { kind: "ul", items: [
              "Feature only consenting adults aged 18 years or older.",
              "Be created and distributed legally.",
              "Comply with applicable laws and regulations.",
              "Be uploaded by users who possess all necessary rights and permissions.",
            ] },
            { kind: "p", text: "Users are solely responsible for maintaining records verifying the age and identity of all individuals appearing in uploaded content." },
            { kind: "p", text: "ppvs.io may request such documentation at any time." },
            { kind: "p", text: "Failure to provide requested documentation may result in immediate suspension or termination." },
          ],
        },
        {
          heading: "Prohibited Content",
          blocks: [
            { kind: "p", text: "The following content is strictly prohibited:" },
            { kind: "h3", text: "Underage Content" },
            { kind: "p", text: "Any content depicting, promoting, or involving individuals under the age of 18." },
            { kind: "h3", text: "Non-Consensual Content" },
            { kind: "p", text: "Content created, distributed, or shared without the consent of all individuals depicted." },
            { kind: "h3", text: "Deepfake and Impersonation Content" },
            { kind: "p", text: "Content that falsely depicts or impersonates another individual without authorization, including AI-generated or manipulated media intended to deceive." },
            { kind: "h3", text: "Copyright-Infringing Content" },
            { kind: "p", text: "Content that infringes any copyright, trademark, privacy, publicity, or other intellectual property rights." },
            { kind: "h3", text: "Violent or Exploitative Content" },
            { kind: "p", text: "Content depicting:" },
            { kind: "ul", items: [
              "Serious physical harm", "Torture", "Coercion",
              "Sexual violence", "Exploitation", "Human trafficking",
            ] },
            { kind: "h3", text: "Illegal Content" },
            { kind: "p", text: "Content that violates applicable law or promotes illegal activity." },
          ],
        },
        {
          heading: "Fraud and Financial Abuse",
          blocks: [
            { kind: "p", text: "Users may not use the Service to:" },
            { kind: "ul", items: [
              "Commit fraud", "Facilitate scams", "Mislead purchasers",
              "Engage in deceptive business practices", "Launder money",
              "Circumvent financial regulations", "Abuse payment systems",
              "Manipulate transactions",
            ] },
            { kind: "p", text: "Any suspected fraudulent activity may be reported to appropriate authorities and payment providers." },
          ],
        },
        {
          heading: "Prohibited Platform Activities",
          blocks: [
            { kind: "p", text: "Users may not:" },
            { kind: "ul", items: [
              "Create fake accounts.",
              "Circumvent platform restrictions.",
              "Attempt to access unauthorized accounts.",
              "Interfere with platform operations.",
              "Scrape platform data without authorization.",
              "Reverse engineer the Service.",
              "Distribute malware or harmful software.",
              "Conduct phishing attacks.",
              "Abuse APIs or integrations.",
              "Attempt to bypass security measures.",
            ] },
          ],
        },
        {
          heading: "Spam and Harassment",
          blocks: [
            { kind: "p", text: "Users may not use the Service to:" },
            { kind: "ul", items: [
              "Send spam.",
              "Conduct mass unsolicited messaging.",
              "Harass, threaten, intimidate, or abuse others.",
              "Promote hate speech or discrimination.",
              "Encourage violence against individuals or groups.",
            ] },
          ],
        },
        {
          heading: "Content Review",
          blocks: [
            { kind: "p", text: "All content uploaded to ppvs.io may be reviewed before approval." },
            { kind: "p", text: "ppvs.io reserves the right to reject, remove, restrict, or disable access to any content at its sole discretion." },
            { kind: "p", text: "Approval of content does not constitute legal verification, endorsement, or acceptance of responsibility by ppvs.io." },
            { kind: "p", text: "Users remain solely responsible for all uploaded content." },
          ],
        },
        {
          heading: "Enforcement",
          blocks: [
            { kind: "p", text: "If we believe a user has violated this Policy, we may take any action we deem appropriate, including:" },
            { kind: "ul", items: [
              "Removing content.",
              "Restricting account functionality.",
              "Suspending accounts.",
              "Permanently terminating accounts.",
              "Delaying or refusing withdrawals.",
              "Cooperating with law enforcement.",
              "Reporting violations to payment providers or relevant authorities.",
            ] },
            { kind: "p", text: "We are not obligated to provide advance notice before taking enforcement action." },
          ],
        },
        {
          heading: "Reporting Violations",
          blocks: [
            { kind: "p", text: "If you believe content or activity on the platform violates this Policy, please contact:" },
            { kind: "p", text: "Email: compliance@ppvs.io" },
            { kind: "p", text: "Please provide sufficient information to allow us to investigate the matter." },
          ],
        },
        {
          heading: "Changes to This Policy",
          blocks: [
            { kind: "p", text: "We may modify this Policy at any time." },
            { kind: "p", text: "Updated versions will be posted on the platform with a revised effective date." },
            { kind: "p", text: "Continued use of the Service following any update constitutes acceptance of the revised Policy." },
          ],
        },
        {
          heading: "Contact",
          blocks: [
            { kind: "p", text: "For questions regarding this Policy, contact:" },
            { kind: "p", text: "Email: compliance@ppvs.io" },
          ],
        },
      ]}
    />
  );
}
