import { LegalShell } from "@/components/legal/LegalShell";

export const metadata = { title: "DMCA Policy · ppvs.io" };

export default function DmcaPage() {
  return (
    <LegalShell
      title="DMCA Policy"
      updated="June 2026"
      sections={[
        {
          heading: "1. Copyright Policy",
          paragraphs: [
            "ppvs.io respects intellectual property rights and responds to valid notices of alleged copyright infringement under the Digital Millennium Copyright Act (DMCA).",
          ],
        },
        {
          heading: "2. Filing a Notice of Infringement",
          paragraphs: [
            "To report content you believe infringes your copyright, send a written notice to our designated agent that includes:",
            "(1) your physical or electronic signature; (2) identification of the copyrighted work claimed to be infringed; (3) identification of the material that is claimed to be infringing and its location; (4) your contact information (name, address, email); (5) a statement that you have a good-faith belief the use is not authorized; and (6) a statement, under penalty of perjury, that the information is accurate and that you are the copyright owner or authorized to act on their behalf.",
          ],
        },
        {
          heading: "3. Designated Agent",
          paragraphs: [
            "Send notices to our designated agent: [Agent name and email — replace with your details].",
          ],
        },
        {
          heading: "4. Counter-Notification",
          paragraphs: [
            "If your content was removed and you believe it was a mistake or misidentification, you may submit a counter-notification containing the statements required by the DMCA. We may restore the content if the original complainant does not pursue legal action within the period required by law.",
          ],
        },
        {
          heading: "5. Repeat Infringers",
          paragraphs: [
            "We terminate, in appropriate circumstances, the accounts of users who are repeat infringers.",
          ],
        },
      ]}
    />
  );
}
