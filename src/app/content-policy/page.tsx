import { LegalShell } from "@/components/legal/LegalShell";

export const metadata = { title: "Content Policy · ppvs.io" };

export default function ContentPolicyPage() {
  return (
    <LegalShell
      title="Content Policy"
      updated="June 2026"
      intro={[
        'This Content Policy forms part of the Terms of Service and Acceptable Use Policy governing the use of ppvs.io ("ppvs.io", "we", "our", or "us").',
        "All users are responsible for ensuring that content uploaded, stored, distributed, sold, or otherwise made available through the Service complies with this Policy.",
        "Failure to comply may result in content removal, account suspension, account termination, withdrawal restrictions, or reporting to relevant authorities.",
      ]}
      sections={[
        {
          heading: "Content Review",
          blocks: [
            { kind: "p", text: "All content uploaded to ppvs.io may be manually reviewed before approval." },
            { kind: "p", text: "ppvs.io reserves the right to:" },
            { kind: "ul", items: [
              "Approve or reject content.",
              "Request additional information.",
              "Request proof of identity or age.",
              "Remove previously approved content.",
              "Suspend or terminate accounts associated with prohibited content.",
            ] },
            { kind: "p", text: "Approval of content does not constitute legal verification, endorsement, or acceptance of responsibility by ppvs.io." },
            { kind: "p", text: "Users remain solely responsible for their content at all times." },
          ],
        },
        {
          heading: "Age Requirements",
          blocks: [
            { kind: "p", text: "All individuals appearing in uploaded content must:" },
            { kind: "ul", items: [
              "Be at least eighteen (18) years old.",
              "Have participated voluntarily.",
              "Have provided lawful consent where required.",
            ] },
            { kind: "p", text: "Users must maintain records reasonably sufficient to verify the age and identity of all individuals appearing in uploaded content." },
            { kind: "p", text: "ppvs.io may request such documentation at any time." },
            { kind: "p", text: "Failure to provide requested documentation may result in immediate suspension, content removal, or account termination." },
          ],
        },
        {
          heading: "Allowed Content",
          blocks: [
            { kind: "p", text: "Subject to compliance with applicable laws and this Policy, users may upload:" },
            { kind: "ul", items: [
              "Original photos and videos.",
              "Adult content featuring consenting adults.",
              "Promotional content.",
              "Text content.",
              "Digital media bundles.",
              "Creator-generated content intended for sale through the platform.",
            ] },
            { kind: "p", text: "All content must be owned or properly licensed by the user uploading it." },
          ],
        },
        {
          heading: "Prohibited Content",
          blocks: [
            { kind: "p", text: "The following content is strictly prohibited." },
            { kind: "h3", text: "Underage Content" },
            { kind: "p", text: "Any content depicting, involving, promoting, or appearing to involve individuals under eighteen (18) years of age." },
            { kind: "p", text: "This includes:" },
            { kind: "ul", items: [
              "Real images.",
              "AI-generated content.",
              "Digitally altered content.",
              "Animated or illustrated content intended to depict minors in sexual situations.",
            ] },
            { kind: "p", text: "Any suspected underage content may be reported to law enforcement authorities." },
            { kind: "h3", text: "Non-Consensual Content" },
            { kind: "p", text: "Content distributed without the consent of all individuals depicted, including:" },
            { kind: "ul", items: [
              "Secret recordings.", "Leaked content.",
              "Revenge pornography.", "Blackmail material.",
              "Content obtained unlawfully.",
            ] },
            { kind: "h3", text: "Copyright-Infringing Content" },
            { kind: "p", text: "Content that infringes any copyright, trademark, privacy, publicity, or other intellectual property rights." },
            { kind: "p", text: "Users must own or possess all rights necessary to upload and distribute content through the Service." },
            { kind: "h3", text: "Deepfake and Impersonation Content" },
            { kind: "p", text: "Content that falsely depicts another person without authorization, including:" },
            { kind: "ul", items: [
              "Deepfakes.", "AI-generated impersonations.", "Misleading manipulated media.",
            ] },
            { kind: "h3", text: "Violent or Exploitative Content" },
            { kind: "p", text: "Content depicting or promoting:" },
            { kind: "ul", items: [
              "Serious physical injury.", "Torture.", "Sexual violence.",
              "Coercion.", "Human trafficking.", "Exploitation.", "Abuse.",
            ] },
            { kind: "h3", text: "Illegal Content" },
            { kind: "p", text: "Content that violates applicable law or promotes illegal activity." },
          ],
        },
        {
          heading: "Content Ownership",
          blocks: [
            { kind: "p", text: "Users retain ownership of content uploaded to the platform." },
            { kind: "p", text: "By uploading content, users represent and warrant that:" },
            { kind: "ul", items: [
              "They own the content or possess all necessary rights.",
              "They have authority to distribute the content.",
              "The content complies with this Policy.",
              "The content does not violate any third-party rights.",
            ] },
            { kind: "p", text: "Users remain solely responsible for their content." },
          ],
        },
        {
          heading: "Content Removal",
          blocks: [
            { kind: "p", text: "ppvs.io may remove content at any time for any reason, including where content:" },
            { kind: "ul", items: [
              "Violates this Policy.",
              "Creates legal risk.",
              "Creates payment-processing risk.",
              "Creates regulatory risk.",
              "Creates reputational risk.",
              "Generates user complaints.",
              "Is subject to a valid legal request.",
            ] },
            { kind: "p", text: "We are not obligated to provide advance notice before removing content." },
          ],
        },
        {
          heading: "Reporting Copyright Violations",
          blocks: [
            { kind: "p", text: "Copyright owners who believe content on the platform infringes their rights may contact:" },
            { kind: "p", text: "Email: hello@ppvs.io" },
            { kind: "p", text: "Reports should include:" },
            { kind: "ul", items: [
              "Identification of the copyrighted work.",
              "Identification of the allegedly infringing content.",
              "Contact information.",
              "A statement made in good faith that the use is unauthorized.",
            ] },
            { kind: "p", text: "ppvs.io may remove allegedly infringing content while an investigation is conducted." },
          ],
        },
        {
          heading: "Reporting Non-Consensual Content",
          blocks: [
            { kind: "p", text: "Individuals who believe content depicting them has been uploaded without consent may contact:" },
            { kind: "p", text: "Email: hello@ppvs.io" },
            { kind: "p", text: "Reports should include sufficient information to identify the content and verify the claimant's identity." },
            { kind: "p", text: "ppvs.io may remove content while an investigation is conducted." },
          ],
        },
        {
          heading: "Platform Risk",
          blocks: [
            { kind: "p", text: "ppvs.io reserves the right to reject, remove, restrict, or disable access to any content, user, creator, agency, business model, or activity that presents legal, regulatory, operational, reputational, security, or payment-processing risk to the platform." },
            { kind: "p", text: "This right may be exercised even where the activity is not expressly prohibited by this Policy." },
          ],
        },
        {
          heading: "User Responsibility",
          blocks: [
            { kind: "p", text: "Users are solely responsible for:" },
            { kind: "ul", items: [
              "Uploaded content.",
              "Content accuracy.",
              "Content legality.",
              "Obtaining required permissions.",
              "Maintaining age-verification records.",
              "Compliance with applicable laws and regulations.",
            ] },
            { kind: "p", text: "ppvs.io acts solely as a software platform and does not assume responsibility for user-generated content." },
          ],
        },
        {
          heading: "Enforcement",
          blocks: [
            { kind: "p", text: "Violations of this Policy may result in:" },
            { kind: "ul", items: [
              "Content removal.",
              "Account suspension.",
              "Account termination.",
              "Withdrawal restrictions.",
              "Reporting to payment providers.",
            ] },
          ],
        },
      ]}
    />
  );
}
