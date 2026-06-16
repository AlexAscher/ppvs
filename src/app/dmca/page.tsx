import { LegalShell } from "@/components/legal/LegalShell";

export const metadata = { title: "Copyright & DMCA Policy · ppvs.io" };

export default function DmcaPage() {
  return (
    <LegalShell
      title="Copyright & DMCA Policy"
      updated="June 2026"
      intro={[
        'ppvs.io ("ppvs.io", "we", "our", or "us") respects the intellectual property rights of others and expects all users of the platform to do the same.',
        "This Copyright & DMCA Policy explains how copyright owners may report alleged copyright infringement and how ppvs.io responds to such reports.",
        "This Policy forms part of the Terms of Service, Acceptable Use Policy, and Content Policy.",
      ]}
      sections={[
        {
          heading: "Copyright Ownership",
          blocks: [
            { kind: "p", text: "Users may only upload, distribute, sell, or otherwise make available content that they:" },
            { kind: "ul", items: [
              "Own;",
              "Have created themselves; or",
              "Have obtained all necessary rights, permissions, licenses, and authorizations to use.",
            ] },
            { kind: "p", text: "Users are solely responsible for ensuring they possess the rights required to upload and distribute content through the Service." },
          ],
        },
        {
          heading: "Copyright Infringement",
          blocks: [
            { kind: "p", text: "Users may not upload, distribute, sell, or otherwise make available content that infringes:" },
            { kind: "ul", items: [
              "Copyright rights;", "Trademark rights;", "Publicity rights;",
              "Privacy rights; or", "Any other intellectual property rights.",
            ] },
            { kind: "p", text: "Uploading stolen, copied, leaked, or otherwise unauthorized content is strictly prohibited." },
          ],
        },
        {
          heading: "Reporting Copyright Infringement",
          blocks: [
            { kind: "p", text: "If you believe content available through ppvs.io infringes your copyright, you may submit a notice to:" },
            { kind: "p", text: "Email: hello@ppvs.io" },
            { kind: "p", text: "Your notice should include:" },
            { kind: "h3", text: "Identification of the copyrighted work" },
            { kind: "p", text: "A description of the copyrighted work you claim has been infringed." },
            { kind: "h3", text: "Identification of the allegedly infringing content" },
            { kind: "p", text: "Information sufficient to locate the content on the platform." },
            { kind: "h3", text: "Contact information" },
            { kind: "p", text: "Including:" },
            { kind: "ul", items: ["Full name", "Email address", "Telephone number (if available)"] },
            { kind: "h3", text: "Good-faith statement" },
            { kind: "p", text: "A statement that you have a good-faith belief that the use of the material is not authorized by the copyright owner, its agent, or the law." },
            { kind: "h3", text: "Accuracy statement" },
            { kind: "p", text: "A statement that the information provided is accurate and that you are the copyright owner or authorized to act on behalf of the copyright owner." },
          ],
        },
        {
          heading: "Investigation Process",
          blocks: [
            { kind: "p", text: "Upon receiving a copyright complaint, ppvs.io may:" },
            { kind: "ul", items: [
              "Review the complaint.",
              "Request additional information.",
              "Contact the affected user.",
              "Temporarily disable access to content.",
              "Remove content.",
              "Suspend accounts.",
              "Terminate accounts.",
            ] },
            { kind: "p", text: "We reserve the right to determine, in our sole discretion, how to investigate and resolve copyright complaints." },
          ],
        },
        {
          heading: "Counter-Notifications",
          blocks: [
            { kind: "p", text: "If your content has been removed as a result of a copyright complaint and you believe the removal was made in error, you may submit a counter-notification." },
            { kind: "p", text: "Counter-notifications should include:" },
            { kind: "ul", items: [
              "Identification of the removed content.",
              "A statement explaining why you believe the removal was incorrect.",
              "Your contact information.",
              "Any supporting evidence demonstrating your rights to the content.",
            ] },
          ],
        },
        {
          heading: "Repeat Infringers",
          blocks: [
            { kind: "p", text: "ppvs.io may suspend or terminate accounts belonging to users who repeatedly infringe the intellectual property rights of others." },
            { kind: "p", text: "We reserve the right to determine what constitutes repeated infringement." },
          ],
        },
        {
          heading: "Non-Consensual and Stolen Content",
          blocks: [
            { kind: "p", text: "If you believe content depicting you has been uploaded without authorization, consent, or legal rights, you may contact:" },
            { kind: "p", text: "Email: hello@ppvs.io" },
            { kind: "p", text: "Reports should include sufficient information to:" },
            { kind: "ul", items: [
              "Identify the content.",
              "Verify your identity.",
              "Explain the basis of the complaint.",
            ] },
            { kind: "p", text: "ppvs.io may remove content while an investigation is conducted." },
          ],
        },
        {
          heading: "False Reports",
          blocks: [
            { kind: "p", text: "Submitting knowingly false, misleading, or fraudulent copyright complaints is prohibited." },
            { kind: "p", text: "ppvs.io reserves the right to reject complaints and take action against users who abuse the reporting process." },
          ],
        },
        {
          heading: "No Liability for User Content",
          blocks: [
            { kind: "p", text: "ppvs.io acts solely as a software platform that enables users to upload and distribute content." },
            { kind: "p", text: "Users remain solely responsible for all content uploaded through the Service." },
            { kind: "p", text: "Nothing in this Policy shall be interpreted as creating any obligation for ppvs.io to actively monitor all content for potential copyright violations." },
          ],
        },
        {
          heading: "Reservation of Rights",
          blocks: [
            { kind: "p", text: "ppvs.io reserves the right to:" },
            { kind: "ul", items: [
              "Remove any content at any time.",
              "Disable access to content.",
              "Restrict user accounts.",
              "Suspend withdrawals.",
              "Terminate accounts.",
              "Cooperate with copyright owners, payment providers, regulators, and law enforcement authorities.",
            ] },
            { kind: "p", text: "Such actions may be taken even where infringement has not been conclusively established." },
          ],
        },
        {
          heading: "Changes to This Policy",
          blocks: [
            { kind: "p", text: "We may update this Policy from time to time." },
            { kind: "p", text: "Updated versions will be published with a revised effective date." },
            { kind: "p", text: "Continued use of the Service following publication of an updated version constitutes acceptance of the revised Policy." },
          ],
        },
        {
          heading: "Contact",
          blocks: [{ kind: "p", text: "Email: hello@ppvs.io" }],
        },
      ]}
    />
  );
}
