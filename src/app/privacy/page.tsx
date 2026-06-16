import { LegalShell } from "@/components/legal/LegalShell";

export const metadata = { title: "Privacy Policy · ppvs.io" };

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="June 2026"
      intro={[
        'ppvs.io ("ppvs.io", "we", "our", or "us") respects your privacy and is committed to protecting your personal information.',
        'This Privacy Policy explains how we collect, use, store, disclose, and protect information when you use our website, applications, and services (collectively, the "Service").',
        "By using the Service, you agree to the practices described in this Privacy Policy.",
      ]}
      sections={[
        {
          heading: "Information We Collect",
          blocks: [
            { kind: "p", text: "We may collect information that you provide to us, information generated through your use of the Service, and information received from third parties." },
            { kind: "h3", text: "Account Information" },
            { kind: "p", text: "When creating an account, we may collect:" },
            { kind: "ul", items: [
              "Name", "Email address", "Username", "Password (stored in encrypted form)",
              "Telegram account information", "Agency information",
            ] },
            { kind: "h3", text: "Creator Information" },
            { kind: "p", text: "Where applicable, we may collect:" },
            { kind: "ul", items: [
              "Creator profiles", "Creator usernames", "Content-related metadata",
              "Wallet addresses", "Withdrawal information",
            ] },
            { kind: "h3", text: "Fan Information" },
            { kind: "p", text: "Users may store fan-related information within the Service, including:" },
            { kind: "ul", items: [
              "Telegram usernames", "Notes", "Tags",
              "Purchase history", "Conversation-related metadata",
            ] },
            { kind: "p", text: "Users are responsible for ensuring they have the legal right to process and store such information." },
            { kind: "h3", text: "Content Uploaded to the Platform" },
            { kind: "p", text: "We may collect and store:" },
            { kind: "ul", items: [
              "Images", "Videos", "Text", "Media metadata", "Content tags and classifications",
            ] },
          ],
        },
        {
          heading: "Information Collected Automatically",
          blocks: [
            { kind: "p", text: "When you use the Service, we may automatically collect:" },
            { kind: "ul", items: [
              "IP address", "Browser type", "Device information", "Operating system",
              "Language preferences", "Referral URLs", "Usage data", "Pages viewed",
              "Time spent on the platform", "Error logs",
            ] },
            { kind: "p", text: "We may also collect information through cookies and similar technologies." },
          ],
        },
        {
          heading: "Telegram Data",
          blocks: [
            { kind: "p", text: "Certain features rely on Telegram integrations." },
            { kind: "p", text: "When authorized by you, we may access information necessary to provide platform functionality, including:" },
            { kind: "ul", items: [
              "Telegram account identifiers",
              "Messages processed through authorized integrations",
              "Telegram-related metadata",
            ] },
            { kind: "p", text: "We do not control Telegram and are not responsible for Telegram's privacy practices." },
          ],
        },
        {
          heading: "Payment Information",
          blocks: [
            { kind: "p", text: "Payments are processed by independent third-party payment providers." },
            { kind: "p", text: "ppvs.io does not store full payment card information." },
            { kind: "p", text: "Payment providers may collect:" },
            { kind: "ul", items: [
              "Billing information", "Payment method details",
              "Transaction information", "Identity verification information",
            ] },
            { kind: "p", text: "Such information is governed by the privacy policies of those providers." },
          ],
        },
        {
          heading: "How We Use Information",
          blocks: [
            { kind: "p", text: "We may use information to:" },
            { kind: "ul", items: [
              "Provide the Service",
              "Process transactions",
              "Manage user accounts",
              "Deliver content purchased through the platform",
              "Communicate with users",
            ] },
          ],
        },
        {
          heading: "Content Review and Moderation",
          blocks: [
            { kind: "p", text: "Content uploaded to the Service may be reviewed by ppvs.io personnel for moderation, compliance, safety, legal, and operational purposes." },
            { kind: "p", text: "Review of content does not transfer ownership rights to ppvs.io." },
          ],
        },
        {
          heading: "Sharing of Information",
          blocks: [
            { kind: "p", text: "We do not sell personal information." },
            { kind: "p", text: "We may share information with:" },
            { kind: "h3", text: "Service Providers" },
            { kind: "p", text: "Third-party providers assisting with:" },
            { kind: "ul", items: [
              "Hosting", "Analytics", "Infrastructure",
              "Customer support", "Payment processing", "Security services",
            ] },
            { kind: "h3", text: "Legal Compliance" },
            { kind: "p", text: "We may disclose information if required to:" },
            { kind: "ul", items: [
              "Comply with applicable law", "Respond to legal requests",
              "Protect our rights", "Prevent fraud", "Protect users and the public",
            ] },
            { kind: "h3", text: "Business Transfers" },
            { kind: "p", text: "If ppvs.io is involved in a merger, acquisition, sale, financing, or asset transfer, user information may be transferred as part of that transaction." },
          ],
        },
        {
          heading: "Data Retention",
          blocks: [
            { kind: "p", text: "We retain information only as long as reasonably necessary to:" },
            { kind: "ul", items: [
              "Provide the Service", "Meet legal obligations",
              "Resolve disputes", "Enforce agreements",
            ] },
            { kind: "p", text: "We may retain certain records after account closure where legally required or necessary for security, fraud prevention, or compliance purposes." },
          ],
        },
        {
          heading: "Security",
          blocks: [
            { kind: "p", text: "We implement reasonable technical, administrative, and organizational safeguards designed to protect information from unauthorized access, disclosure, alteration, or destruction." },
            { kind: "p", text: "However, no system can be guaranteed completely secure." },
            { kind: "p", text: "You use the Service at your own risk." },
          ],
        },
        {
          heading: "International Transfers",
          blocks: [
            { kind: "p", text: "Your information may be processed and stored in countries different from your country of residence." },
            { kind: "p", text: "By using the Service, you consent to such transfers where permitted by law." },
          ],
        },
        {
          heading: "Your Rights",
          blocks: [
            { kind: "p", text: "Depending on your location, you may have rights to:" },
            { kind: "ul", items: [
              "Access your information",
              "Correct inaccurate information",
              "Delete information",
              "Restrict processing",
              "Object to processing",
              "Request data portability",
            ] },
            { kind: "p", text: "Requests may be submitted using the contact information below." },
            { kind: "p", text: "We may require identity verification before fulfilling requests." },
          ],
        },
        {
          heading: "Cookies and Analytics",
          blocks: [
            { kind: "p", text: "We may use cookies and similar technologies to:" },
            { kind: "ul", items: [
              "Keep users logged in", "Remember preferences",
              "Analyze platform usage", "Improve performance",
              "Detect abuse and fraud",
            ] },
            { kind: "p", text: "You may disable cookies through your browser settings, though some features may not function properly." },
          ],
        },
        {
          heading: "Children's Privacy",
          blocks: [
            { kind: "p", text: "The Service is intended solely for adults." },
            { kind: "p", text: "Individuals under eighteen (18) years of age may not use the Service." },
            { kind: "p", text: "We do not knowingly collect information from minors." },
            { kind: "p", text: "If we become aware that information relating to a minor has been collected, we will take reasonable steps to delete it." },
          ],
        },
        {
          heading: "User Responsibilities",
          blocks: [
            { kind: "p", text: "Users remain responsible for:" },
            { kind: "ul", items: [
              "Information they upload",
              "Content they store",
              "Fan information entered into the platform",
              "Compliance with privacy laws applicable to their business activities",
            ] },
            { kind: "p", text: "Users must ensure they have all necessary rights and permissions to collect, store, and process information using the Service." },
          ],
        },
        {
          heading: "Third-Party Services",
          blocks: [
            { kind: "p", text: "The Service may integrate with third-party platforms and services." },
            { kind: "p", text: "We are not responsible for the privacy practices, security measures, or policies of third parties." },
            { kind: "p", text: "Users should review the privacy policies of those services separately." },
          ],
        },
        {
          heading: "Changes to This Privacy Policy",
          blocks: [
            { kind: "p", text: "We may update this Privacy Policy from time to time." },
            { kind: "p", text: "Updated versions will be posted on this page with a revised effective date." },
            { kind: "p", text: "Continued use of the Service after updates constitutes acceptance of the revised Privacy Policy." },
          ],
        },
        {
          heading: "Contact",
          blocks: [
            { kind: "p", text: "For privacy-related questions or requests, contact:" },
            { kind: "p", text: "Email: hello@ppvs.io" },
          ],
        },
      ]}
    />
  );
}
