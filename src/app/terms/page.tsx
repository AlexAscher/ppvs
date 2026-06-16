import { LegalShell } from "@/components/legal/LegalShell";

export const metadata = { title: "Terms of Service · ppvs.io" };

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="June 2026"
      intro={[
        'Welcome to ppvs.io ("ppvs.io", "we", "our", or "us").',
        'These Terms of Service ("Terms") govern your access to and use of the ppvs.io website, platform, products, and services (collectively, the "Service").',
        "By creating an account, accessing, or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms, you may not use the Service.",
      ]}
      sections={[
        {
          heading: "Eligibility",
          blocks: [
            { kind: "p", text: "You must be at least eighteen (18) years old to use the Service." },
            { kind: "p", text: "By using the Service, you represent and warrant that:" },
            { kind: "ul", items: [
              "You are at least 18 years old.",
              "You have the legal capacity to enter into binding agreements.",
              "You will comply with all applicable laws and regulations.",
              "Any content uploaded to the Service features only consenting adults aged 18 or older.",
            ] },
            { kind: "p", text: "We reserve the right to request age or identity verification at any time." },
          ],
        },
        {
          heading: "Description of Service",
          blocks: [
            { kind: "p", text: "ppvs.io provides software that enables agencies, creators, and their authorized representatives to manage content, communicate with fans through Telegram, facilitate paid content sales, and manage related activities." },
            { kind: "p", text: "ppvs.io is a software platform and is not a financial institution, payment processor, bank, escrow provider, or money transmitter." },
          ],
        },
        {
          heading: "User Accounts",
          blocks: [
            { kind: "p", text: "You are responsible for:" },
            { kind: "ul", items: [
              "Maintaining the security of your account.",
              "Restricting access to your login credentials.",
              "All activities conducted through your account.",
            ] },
            { kind: "p", text: "You must immediately notify us of any unauthorized access or security breach." },
            { kind: "p", text: "We may suspend or terminate accounts that violate these Terms." },
          ],
        },
        {
          heading: "Fees",
          blocks: [
            { kind: "p", text: "Use of the Service is subject to the fees displayed on the platform." },
            { kind: "p", text: "Unless otherwise stated, ppvs.io charges a platform fee equal to twelve percent (12%) of completed sales processed through the Service." },
            { kind: "p", text: "Fees may be updated at any time upon notice." },
            { kind: "p", text: "All fees are non-refundable except where required by law." },
          ],
        },
        {
          heading: "Payments and Withdrawals",
          blocks: [
            { kind: "p", text: "Payments made through the Service are processed by independent third-party payment providers." },
            { kind: "p", text: "By using the Service, you acknowledge and agree that:" },
            { kind: "ul", items: [
              "Payment processing is performed by third parties.",
              "Additional processing fees may be charged to purchasers.",
              "ppvs.io does not control or guarantee the performance of payment providers.",
              "Processing delays may occur.",
              "Blockchain network fees, banking fees, and payment processing fees may apply.",
            ] },
            { kind: "p", text: "Withdrawals are subject to platform requirements, security reviews, and applicable limits." },
          ],
        },
        {
          heading: "Content Ownership",
          blocks: [
            { kind: "p", text: "You retain ownership of content you upload to the Service." },
            { kind: "p", text: "By uploading content, you grant ppvs.io a limited, non-exclusive license to store, process, display, transmit, and deliver such content solely for the purpose of operating the Service." },
            { kind: "p", text: "You represent and warrant that:" },
            { kind: "ul", items: [
              "You own or control all rights necessary to upload the content.",
              "The content does not infringe the rights of any third party.",
              "All individuals depicted are consenting adults aged 18 or older.",
            ] },
          ],
        },
        {
          heading: "Age Verification and Records",
          blocks: [
            { kind: "p", text: "Users are solely responsible for maintaining legally required records verifying the identity and age of all individuals depicted in uploaded content." },
            { kind: "p", text: "Upon request, users must provide documentation reasonably sufficient to verify:" },
            { kind: "ul", items: ["Identity", "Age", "Consent"] },
            { kind: "p", text: "Failure to provide requested documentation may result in suspension, removal of content, or termination of the account." },
          ],
        },
        {
          heading: "Content Review",
          blocks: [
            { kind: "p", text: "ppvs.io may review content submitted to the platform before approval." },
            { kind: "p", text: "Content review does not create any obligation on the part of ppvs.io and does not constitute verification, endorsement, or legal approval of any content." },
            { kind: "p", text: "Users remain solely responsible for all uploaded content." },
          ],
        },
        {
          heading: "Prohibited Content and Activities",
          blocks: [
            { kind: "p", text: "Users may not upload, distribute, promote, or facilitate:" },
            { kind: "ul", items: [
              "Content depicting individuals under 18 years of age.",
              "Non-consensual content.",
              "Deepfake content involving real persons without consent.",
              "Copyright-infringing content.",
              "Fraudulent or deceptive activities.",
              "Harassment, threats, or abuse.",
              "Content that violates applicable laws.",
              "Malware, hacking tools, or attempts to compromise the Service.",
              "Money laundering or other financial crimes.",
            ] },
            { kind: "p", text: "We may remove content or terminate accounts at our sole discretion." },
          ],
        },
        {
          heading: "Telegram Integration",
          blocks: [
            { kind: "p", text: "Certain features rely on Telegram and other third-party services." },
            { kind: "p", text: "ppvs.io is not affiliated with, endorsed by, or sponsored by Telegram." },
            { kind: "p", text: "We are not responsible for:" },
            { kind: "ul", items: [
              "Service interruptions",
              "API changes",
              "Account restrictions",
              "Platform outages",
              "Actions taken by Telegram or other third parties",
            ] },
          ],
        },
        {
          heading: "Service Availability",
          blocks: [
            { kind: "p", text: "We do not guarantee that the Service will be available at all times or without interruption." },
            { kind: "p", text: "The Service may be modified, suspended, or discontinued at any time without liability." },
          ],
        },
        {
          heading: "Limitation of Liability",
          blocks: [
            { kind: "p", text: "To the maximum extent permitted by law, ppvs.io and its affiliates, officers, employees, contractors, and agents shall not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages." },
            { kind: "p", text: "This includes, without limitation:" },
            { kind: "ul", items: [
              "Loss of profits", "Loss of revenue", "Loss of data", "Loss of content",
              "Loss of business opportunities", "Payment processor failures",
              "Blockchain network issues", "Unauthorized account access",
            ] },
          ],
        },
        {
          heading: "Indemnification",
          blocks: [
            { kind: "p", text: "You agree to indemnify and hold harmless ppvs.io and its affiliates from any claims, damages, liabilities, costs, and expenses arising from:" },
            { kind: "ul", items: [
              "Your use of the Service.",
              "Your content.",
              "Your violation of these Terms.",
              "Your violation of any law or third-party rights.",
            ] },
          ],
        },
        {
          heading: "Force Majeure",
          blocks: [
            { kind: "p", text: "ppvs.io shall not be liable for any failure or delay in performance resulting from causes beyond its reasonable control, including:" },
            { kind: "ul", items: [
              "Natural disasters", "War", "Terrorism", "Government actions",
              "Internet outages", "Power failures", "Cyberattacks",
              "Payment processor failures", "Banking disruptions",
              "Blockchain network disruptions", "Labor disputes",
            ] },
          ],
        },
        {
          heading: "Suspension and Termination",
          blocks: [
            { kind: "p", text: "We may suspend, restrict, or terminate access to the Service at any time for:" },
            { kind: "ul", items: [
              "Violations of these Terms.",
              "Legal compliance requirements.",
              "Security concerns.",
              "Suspected fraud or abuse.",
            ] },
            { kind: "p", text: "Termination may result in removal of content and loss of access to the Service." },
          ],
        },
        {
          heading: "Changes to These Terms",
          blocks: [
            { kind: "p", text: "We may modify these Terms at any time." },
            { kind: "p", text: "Continued use of the Service following publication of updated Terms constitutes acceptance of the revised Terms." },
          ],
        },
        {
          heading: "Governing Law",
          blocks: [
            { kind: "p", text: "These Terms shall be governed by and construed in accordance with the laws, without regard to conflict-of-law principles." },
          ],
        },
        {
          heading: "Contact",
          blocks: [
            { kind: "p", text: "For questions regarding these Terms, contact:" },
            { kind: "p", text: "Email: hello@ppvs.io" },
          ],
        },
      ]}
    />
  );
}
