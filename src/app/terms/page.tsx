import Link from "next/link";

// Full port of terms.txt (v2 brief). Standalone page so we can hit the
// exact typography / callout style from the HTML sample without dragging
// LegalShell along. Same colour tokens (--bg #0a0e16 etc) mapped to
// inline style objects because Tailwind doesn't know them.

export const metadata = { title: "Terms of Service · ppvs.io" };

const C = {
  bg: "#0a0e16",
  bgRaised: "#11161f",
  bgCard: "#141a25",
  line: "#232a38",
  text: "#f4f6fa",
  textDim: "#aab3c5",
  textFaint: "#6b7488",
  accent: "#2fb8ff",
  accentGlow: "rgba(47,184,255,0.14)",
  green: "#34d399",
  gold: "#f0b94d",
  red: "#f87171",
};

type Block =
  | { kind: "p"; children: React.ReactNode }
  | { kind: "ul"; items: React.ReactNode[] }
  | { kind: "h3"; children: React.ReactNode }
  | { kind: "callout"; variant: "info" | "warn" | "danger" | "success"; children: React.ReactNode };

type Section = { id: string; num: number; heading: string; blocks: Block[] };

const SECTIONS: Section[] = [
  {
    id: "s1", num: 1, heading: "Acceptance of Terms",
    blocks: [
      { kind: "p", children: <>These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you (&quot;User,&quot; &quot;Creator,&quot; &quot;Agency,&quot; or &quot;you&quot;) and ppvs.io (&quot;ppvs.io,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) governing your access to and use of the ppvs.io platform, including the agency dashboard, chatter workspace, content vault, payment processing features, and all associated services (collectively, the &quot;Platform&quot;).</> },
      { kind: "p", children: "By creating an account, connecting a Telegram account, uploading content, or otherwise using the Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy, which is incorporated herein by reference." },
      { kind: "p", children: "If you do not agree to these Terms, you must not access or use the Platform." },
    ],
  },
  {
    id: "s2", num: 2, heading: "Eligibility",
    blocks: [
      { kind: "callout", variant: "danger", children: <><b>Age Requirement:</b> You must be at least 18 years of age to use ppvs.io. This requirement is strictly enforced. Any account found to be held by a person under 18 will be immediately and permanently terminated.</> },
      { kind: "p", children: "By using the Platform, you represent and warrant that:" },
      { kind: "ul", items: [
        "You are at least 18 years of age;",
        "You have the full legal capacity to enter into a binding contract in your jurisdiction;",
        "Your use of the Platform does not violate any applicable law or regulation in your country of residence or operation;",
        "You are not located in a jurisdiction where access to or use of the Platform is prohibited;",
        "You have not previously been banned or suspended from the Platform or any related service for violation of these Terms.",
      ] },
      { kind: "h3", children: "Age Verification of Content Subjects" },
      { kind: "p", children: "If you upload, sell, or distribute content depicting real persons, you must be able to provide verifiable documentation confirming that every person depicted in such content was at least 18 years of age at the time the content was produced. ppvs.io reserves the right to request such documentation at any time. Failure to provide it will result in immediate account termination and removal of the relevant content." },
    ],
  },
  {
    id: "s3", num: 3, heading: "Account Registration",
    blocks: [
      { kind: "p", children: "To use the Platform you must register an account by connecting your Telegram account through our authorisation flow. You agree to:" },
      { kind: "ul", items: [
        "Provide accurate and complete information during registration;",
        "Keep your account credentials secure and not share access with unauthorised parties;",
        "Notify us immediately if you suspect any unauthorised use of your account;",
        "Be solely responsible for all activity that occurs under your account, including activity by chatters or team members you have granted access.",
      ] },
      { kind: "p", children: "One individual or legal entity may operate multiple creator accounts only with prior written consent from ppvs.io. Accounts created to circumvent a prior suspension or ban are prohibited and will be terminated." },
    ],
  },
  {
    id: "s4", num: 4, heading: "Creator & Agency Responsibilities",
    blocks: [
      { kind: "p", children: "As a creator or agency operating on ppvs.io, you are solely responsible for all content you upload, store, or distribute through the Platform. You represent and warrant that:" },
      { kind: "ul", items: [
        "You own or have obtained all necessary rights, licences, consents, and permissions to upload, sell, and distribute any content you place in your vault;",
        "All individuals depicted in your content have provided their express, documented consent to appear in and for the distribution of such content;",
        "Your content, and the manner in which you sell it, complies with all applicable local, national, and international laws, including but not limited to laws relating to obscenity, privacy, consent, and data protection;",
        "You will not use the Platform to deceive, defraud, or engage in any misleading conduct toward fans or other users;",
        "You will ensure that all chatters and team members operating under your account are aware of and comply with these Terms.",
      ] },
      { kind: "p", children: "Agency owners are jointly and severally responsible for the conduct of all chatters and team members operating under their account." },
    ],
  },
  {
    id: "s5", num: 5, heading: "Prohibited Content",
    blocks: [
      { kind: "callout", variant: "danger", children: <><b>Zero Tolerance:</b> The following content is strictly prohibited and will result in immediate, permanent account termination and referral to law enforcement where applicable.</> },
      { kind: "h3", children: "Absolutely Prohibited" },
      { kind: "ul", items: [
        <><b>Child Sexual Abuse Material (CSAM):</b> Any content that sexually exploits, depicts, or endangers minors. We operate automated and manual detection systems specifically targeting CSAM and cooperate fully with law enforcement authorities worldwide.</>,
        "Any content depicting or simulating sexual activity involving persons who appear to be, or are presented as, under the age of 18, regardless of claimed fictional nature.",
        "Non-consensual intimate imagery (\"revenge porn\") — content depicting a real person in a sexual manner without that person's documented and ongoing consent.",
        "Content that depicts, promotes, or glorifies violence, rape, or sexual assault.",
        "Content depicting real, identifiable persons in a sexual context without their documented written consent.",
      ] },
      { kind: "h3", children: "Additionally Prohibited" },
      { kind: "ul", items: [
        "Content that violates any third party's intellectual property rights, including copyrighted material shared without authorisation;",
        "Content designed to harass, threaten, dox, or intimidate any individual;",
        "Spam, phishing, or fraudulent communications to fans;",
        "Content promoting illegal activities, including drug trafficking, human trafficking, or financial fraud;",
        "Malware, viruses, or any malicious code;",
        "Content that violates Telegram's Terms of Service or Bot Developer Terms.",
      ] },
    ],
  },
  {
    id: "s6", num: 6, heading: "Content Moderation",
    blocks: [
      { kind: "callout", variant: "info", children: <><b>Manual Review:</b> All content uploaded to the ppvs.io vault is manually reviewed by our moderation team before it becomes available for sale. By uploading content you consent to this review process.</> },
      { kind: "p", children: "ppvs.io operates a continuous content review process for all vault uploads. Our moderation team, supported by an on-premise AI system, reviews content 24/7 to ensure compliance with these Terms, applicable law, and Telegram's Terms of Service. We reserve the right to:" },
      { kind: "ul", items: [
        "Reject or remove any content that violates these Terms, at our sole discretion;",
        "Place a temporary hold on content pending further review;",
        "Request additional verification documents (e.g. performer age documentation) before approving content for distribution;",
        "Terminate accounts that repeatedly submit prohibited or borderline content.",
      ] },
      { kind: "p", children: "Content moderation decisions are final. While we endeavour to review uploads promptly, we do not guarantee approval timelines. ppvs.io accepts no liability for revenue lost due to review delays." },
      { kind: "p", children: <>Reporting: if you encounter content on our Platform that you believe violates these Terms, please contact <a href="mailto:hello@ppvs.io" style={{ color: C.accent }}>hello@ppvs.io</a> immediately.</> },
    ],
  },
  {
    id: "s7", num: 7, heading: "Payments, Fees & Payouts",
    blocks: [
      { kind: "h3", children: "Platform Fee" },
      { kind: "p", children: <>ppvs.io charges a platform fee of <b>15%</b> of each sale. Stars convert to GRAM — we cover the conversion fee from our cut. You retain 85% of each sale in full, with no further deductions.</> },
      { kind: "h3", children: "Payment Currency" },
      { kind: "p", children: "All payments from fans are made in Telegram Stars. Stars are converted to GRAM (on the TON blockchain network) for payout purposes. The conversion rate is determined by Telegram's published withdrawal rate ($0.013 USD per Star at the time of these Terms) and by the prevailing GRAM market price at the time of conversion. ppvs.io does not guarantee any specific USD payout amount per Star beyond the rate published by Telegram." },
      { kind: "callout", variant: "warn", children: <><b>Important:</b> The amount fans pay to purchase Stars may differ from the $0.013 withdrawal rate. Fans purchasing Stars through Apple Pay or Google Pay may pay more due to Apple&apos;s and Google&apos;s 30% in-app purchase fees. ppvs.io has no control over these fees and they do not increase your payout.</> },
      { kind: "h3", children: "Holding Period" },
      { kind: "p", children: <>All Star rewards are subject to a <b>25-day holding period</b> from the date of the relevant purchase. This period comprises Telegram&apos;s mandatory 21-day holding window plus a 4-day internal review buffer maintained by ppvs.io for fraud prevention purposes. Rewards are not available for withdrawal before this period has elapsed.</> },
      { kind: "h3", children: "Minimum Withdrawal" },
      { kind: "p", children: <>The minimum withdrawal amount is <b>$30.00</b> (USD equivalent in GRAM at the time of withdrawal). Balances below this threshold will accumulate until the minimum is reached.</> },
      { kind: "h3", children: "Withdrawal Process" },
      { kind: "p", children: "Eligible balances may be withdrawn to a TON-compatible wallet address provided by you in your account settings. ppvs.io processes withdrawal requests on a rolling basis. Processing times may vary. ppvs.io is not responsible for delays caused by network congestion, wallet configuration errors, or incorrect wallet addresses provided by you. An incorrect wallet address that results in lost funds is solely your responsibility." },
      { kind: "h3", children: "Fraud & Chargebacks" },
      { kind: "p", children: "ppvs.io operates a zero-tolerance policy for fraudulent activity, including self-purchasing (purchasing your own content to generate artificial revenue), coordinated fraud, and Star refund abuse. Any account found to have engaged in fraudulent activity will be immediately terminated, all pending and available balances will be forfeited, and the matter may be referred to relevant authorities. ppvs.io reserves the right to reverse payouts that are subsequently identified as fraudulent, including after processing." },
      { kind: "h3", children: "Taxes" },
      { kind: "p", children: "You are solely responsible for determining and paying any taxes applicable to payments you receive through the Platform, including income tax, VAT, or any other applicable tax in your jurisdiction. ppvs.io does not withhold tax on your behalf and does not provide tax advice." },
    ],
  },
  {
    id: "s8", num: 8, heading: "Intellectual Property",
    blocks: [
      { kind: "h3", children: "Your Content" },
      { kind: "p", children: "You retain all ownership rights to content you upload to the Platform. By uploading content, you grant ppvs.io a non-exclusive, royalty-free, worldwide licence to host, store, display, and transmit your content solely for the purpose of providing the Platform's services — including displaying your content to fans who have made a valid payment. This licence does not grant ppvs.io any right to sublicence, sell, or otherwise commercialise your content outside of this purpose." },
      { kind: "h3", children: "ppvs.io Intellectual Property" },
      { kind: "p", children: "All software, design, trademarks, logos, and other materials comprising the ppvs.io platform are owned by or licenced to ppvs.io and are protected by applicable intellectual property laws. You may not copy, modify, distribute, or create derivative works from any ppvs.io materials without our express written permission." },
      { kind: "h3", children: "Third-Party Content" },
      { kind: "p", children: "You may not upload, sell, or distribute content to which you do not hold the necessary rights. Uploading copyrighted material without authorisation constitutes infringement and may result in immediate account termination, removal of the content, and civil or criminal liability. ppvs.io responds to valid DMCA notices — see Section 11." },
    ],
  },
  {
    id: "s9", num: 9, heading: "Privacy & Data",
    blocks: [
      { kind: "p", children: "Your use of the Platform is subject to our Privacy Policy, which describes how we collect, use, store, and protect your personal data. By using the Platform, you consent to the data practices described in our Privacy Policy." },
      { kind: "p", children: "With respect to fan data, you acknowledge that:" },
      { kind: "ul", items: [
        "Fan usernames are masked within the chatter workspace to protect fan privacy; you will not attempt to circumvent this masking or identify fans beyond the information provided by the Platform;",
        "You must not use fan data obtained through the Platform for purposes outside the scope of the service (e.g. unsolicited marketing, selling fan data to third parties, or contacting fans through channels other than Telegram);",
        "Any personal data you access through the Platform must be handled in accordance with applicable data protection law.",
      ] },
      { kind: "h3", children: "MTProto & Telegram Data" },
      { kind: "p", children: "ppvs.io accesses Telegram functionality via the MTProto API on your behalf. By using the Platform, you authorise this access. You remain solely responsible for your Telegram account and for ensuring your use of the Platform is consistent with Telegram's Terms of Service. ppvs.io is not affiliated with Telegram Messenger Inc. and cannot guarantee Telegram's continued availability or API access." },
    ],
  },
  {
    id: "s10", num: 10, heading: "Platform Conduct",
    blocks: [
      { kind: "p", children: "When using ppvs.io, you agree not to:" },
      { kind: "ul", items: [
        "Attempt to reverse-engineer, decompile, or otherwise derive the source code of the Platform;",
        "Use automated tools, scripts, or bots to interact with the Platform in a manner not expressly authorised;",
        "Circumvent or attempt to circumvent any security, access control, or rate-limiting measure;",
        "Interfere with or disrupt the integrity or performance of the Platform or its infrastructure;",
        "Access accounts, systems, or data that you are not authorised to access;",
        "Use the Platform to transmit malware, viruses, or any harmful code;",
        "Misrepresent your identity, affiliation, or the nature of your content;",
        "Engage in or facilitate money laundering or the proceeds of crime through the Platform.",
      ] },
    ],
  },
  {
    id: "s11", num: 11, heading: "DMCA & Copyright Takedowns",
    blocks: [
      { kind: "p", children: "ppvs.io respects intellectual property rights and complies with the Digital Millennium Copyright Act (DMCA) and equivalent applicable legislation." },
      { kind: "h3", children: "How to Submit a Takedown Notice" },
      { kind: "p", children: <>If you believe content on our Platform infringes your copyright, please submit a written notice to <a href="mailto:hello@ppvs.io" style={{ color: C.accent }}>hello@ppvs.io</a> containing:</> },
      { kind: "ul", items: [
        "Your full name and contact information;",
        "A description of the copyrighted work you believe has been infringed;",
        "A description of where the infringing content is located on the Platform sufficient for us to locate it;",
        "A statement that you have a good faith belief that the use is not authorised by the copyright owner, its agent, or the law;",
        "A statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorised to act on their behalf;",
        "Your physical or electronic signature.",
      ] },
      { kind: "p", children: "Upon receipt of a valid takedown notice, ppvs.io will remove or disable access to the allegedly infringing content promptly and notify the uploader. The uploader may file a counter-notice if they believe the removal was in error." },
    ],
  },
  {
    id: "s12", num: 12, heading: "Account Suspension & Termination",
    blocks: [
      { kind: "h3", children: "Termination by You" },
      { kind: "p", children: "You may close your account at any time by contacting support. Any eligible balance above the minimum withdrawal threshold will be paid out to your registered wallet address within 30 days following the completion of the applicable holding period. Balances below the minimum threshold will be forfeited upon account closure." },
      { kind: "h3", children: "Termination by ppvs.io" },
      { kind: "p", children: "ppvs.io reserves the right to suspend or permanently terminate your account, with or without notice, if we determine in our sole discretion that you have:" },
      { kind: "ul", items: [
        "Violated any provision of these Terms;",
        "Engaged in fraudulent, abusive, or illegal activity;",
        "Submitted prohibited content;",
        "Posed a legal, reputational, or security risk to ppvs.io or other users;",
        "Failed to respond to a request for content documentation or verification within a reasonable time.",
      ] },
      { kind: "p", children: "Upon termination for cause, all pending and available balances may be forfeited. For terminations not related to fraud or prohibited content, ppvs.io will endeavour to release any eligible balance after completing its review." },
      { kind: "h3", children: "Effect of Termination" },
      { kind: "p", children: "Upon termination, your right to access and use the Platform ceases immediately. ppvs.io may delete your account data and content in accordance with our data retention policy. Sections of these Terms that by their nature should survive termination (including Sections 5, 7, 8, 11, 13, and 14) shall survive." },
    ],
  },
  {
    id: "s13", num: 13, heading: "Disclaimers & Limitation of Liability",
    blocks: [
      { kind: "h3", children: "Platform Provided \"As Is\"" },
      { kind: "p", children: "THE PLATFORM IS PROVIDED ON AN \"AS IS\" AND \"AS AVAILABLE\" BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. ppvs.io DOES NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT ANY DEFECTS WILL BE CORRECTED. TO THE FULLEST EXTENT PERMITTED BY LAW, ppvs.io DISCLAIMS ALL WARRANTIES INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT." },
      { kind: "h3", children: "Telegram Dependency" },
      { kind: "p", children: "The Platform relies on Telegram's infrastructure, API, and Stars payment system. ppvs.io has no control over Telegram's availability, policies, or decisions. ppvs.io accepts no liability for losses arising from Telegram downtime, API changes, policy enforcement by Telegram, or changes to the Stars system, including changes to the per-Star withdrawal value." },
      { kind: "h3", children: "Crypto & Market Risk" },
      { kind: "p", children: "Payouts are made in GRAM, a cryptocurrency. The USD value of GRAM may fluctuate significantly. ppvs.io accepts no liability for losses arising from cryptocurrency price movements between the time Stars are earned and the time GRAM is received or sold." },
      { kind: "h3", children: "Limitation of Liability" },
      { kind: "p", children: <>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ppvs.io SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE PLATFORM, EVEN IF ppvs.io HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN NO EVENT SHALL ppvs.io&apos;S AGGREGATE LIABILITY EXCEED THE TOTAL PLATFORM FEES PAID BY YOU TO ppvs.io IN THE THREE MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.</> },
    ],
  },
  {
    id: "s14", num: 14, heading: "Indemnification",
    blocks: [
      { kind: "p", children: "You agree to indemnify, defend, and hold harmless ppvs.io and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or in any way connected with:" },
      { kind: "ul", items: [
        "Your use of or access to the Platform;",
        "Your violation of these Terms;",
        "Content you upload or distribute through the Platform;",
        "Your violation of any third-party rights, including intellectual property rights or privacy rights;",
        "Any claim that your content caused damage to a third party;",
        "The conduct of your chatters or team members.",
      ] },
    ],
  },
  {
    id: "s15", num: 15, heading: "Governing Law & Disputes",
    blocks: [
      { kind: "p", children: "These Terms are governed by and construed in accordance with applicable law. Any dispute arising out of or in connection with these Terms that cannot be resolved through good-faith negotiation between the parties shall be submitted to binding arbitration or the competent courts of the jurisdiction in which ppvs.io is registered, as applicable." },
      { kind: "p", children: "You agree that any dispute resolution proceedings will be conducted on an individual basis and not as part of a class or representative action." },
      { kind: "callout", variant: "info", children: <>For any issues or concerns, please reach out to our support team at <a href="mailto:hello@ppvs.io" style={{ color: C.accent }}>hello@ppvs.io</a> before pursuing formal proceedings. We aim to resolve all issues quickly and fairly.</> },
    ],
  },
  {
    id: "s16", num: 16, heading: "Changes to These Terms",
    blocks: [
      { kind: "p", children: "ppvs.io reserves the right to modify these Terms at any time. We will notify registered users of material changes by posting a notice within the Platform dashboard, by email to your registered address, or via our official Telegram channel. The updated Terms will indicate the date of the most recent revision." },
      { kind: "p", children: "Your continued use of the Platform after the effective date of any modification constitutes your acceptance of the updated Terms. If you do not agree to the updated Terms, you must stop using the Platform and close your account." },
    ],
  },
  {
    id: "s17", num: 17, heading: "Contact",
    blocks: [
      { kind: "p", children: <>For questions regarding these Terms, contact <a href="mailto:hello@ppvs.io" style={{ color: C.accent }}>hello@ppvs.io</a>.</> },
    ],
  },
];

function CalloutBox({ variant, children }: { variant: "info" | "warn" | "danger" | "success"; children: React.ReactNode }) {
  const map = {
    info: { bg: C.accentGlow, border: "rgba(47,184,255,0.3)", color: C.accent },
    warn: { bg: "rgba(240,185,77,0.08)", border: "rgba(240,185,77,0.3)", color: C.gold },
    danger: { bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.3)", color: C.red },
    success: { bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.3)", color: C.green },
  }[variant];
  return (
    <div style={{ background: map.bg, border: `1px solid ${map.border}`, color: map.color, borderRadius: 10, padding: "16px 20px", margin: "20px 0", fontSize: 14, lineHeight: 1.65 }}>
      {children}
    </div>
  );
}

function BlockRender({ b }: { b: Block }) {
  if (b.kind === "p")
    return <p style={{ fontSize: 15, color: C.textDim, marginBottom: 14 }}>{b.children}</p>;
  if (b.kind === "h3")
    return <h3 style={{ fontSize: 16, fontWeight: 600, margin: "24px 0 10px", color: C.text, fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em" }}>{b.children}</h3>;
  if (b.kind === "ul")
    return (
      <ul style={{ paddingLeft: 20, marginBottom: 14 }}>
        {b.items.map((it, i) => (
          <li key={i} style={{ fontSize: 15, color: C.textDim, marginBottom: 7, lineHeight: 1.65 }}>{it}</li>
        ))}
      </ul>
    );
  return <CalloutBox variant={b.variant}>{b.children}</CalloutBox>;
}

export default function TermsPage() {
  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "'Inter',-apple-system,sans-serif", lineHeight: 1.7 }}>
      {/* nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(14px)", background: "rgba(10,14,22,0.84)", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 48px", maxWidth: 1200, margin: "0 auto" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em", color: C.text, textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/logo.png" alt="ppvs.io" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />
            ppvs.io
          </Link>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", padding: "10px 20px", borderRadius: 10, fontWeight: 600, fontSize: 14, border: `1px solid ${C.line}`, color: C.text, textDecoration: "none", background: "transparent" }}>
            ← Back to home
          </Link>
        </div>
      </nav>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 32px" }}>
        <div style={{ padding: "64px 0 48px", borderBottom: `1px solid ${C.line}`, marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: C.accent, marginBottom: 14, textTransform: "uppercase" }}>Legal</div>
          <h1 style={{ fontSize: 40, fontWeight: 700, marginBottom: 12, fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em" }}>Terms of Service</h1>
          <p style={{ color: C.textDim, fontSize: 15 }}>Please read these Terms carefully before using the ppvs.io platform. By registering or using the platform, you agree to be bound by these Terms.</p>
          <div style={{ display: "flex", gap: 24, marginTop: 20, fontSize: 13, color: C.textFaint }}>
            <span><b style={{ color: C.textDim }}>Effective date:</b> 1 July 2026</span>
            <span><b style={{ color: C.textDim }}>Last updated:</b> 1 July 2026</span>
          </div>
        </div>

        {/* TOC */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.line}`, borderRadius: 14, padding: "24px 28px", marginBottom: 56 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textDim, marginBottom: 14, letterSpacing: ".06em", textTransform: "uppercase", fontFamily: "'Space Grotesk','Inter',sans-serif" }}>Table of Contents</h3>
          <ol style={{ paddingLeft: 18 }}>
            {SECTIONS.map((s) => (
              <li key={s.id} style={{ fontSize: 14, color: C.textFaint, marginBottom: 7 }}>
                <a href={`#${s.id}`} style={{ color: C.textFaint, textDecoration: "none" }}>{s.heading}</a>
              </li>
            ))}
          </ol>
        </div>

        {SECTIONS.map((s) => (
          <div key={s.id} id={s.id} style={{ marginBottom: 56, scrollMarginTop: 80 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 18, paddingBottom: 12, borderBottom: `1px solid ${C.line}`, fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em" }}>
              {s.num}. {s.heading}
            </h2>
            {s.blocks.map((b, i) => <BlockRender key={i} b={b} />)}
          </div>
        ))}
      </div>

      <footer style={{ borderTop: `1px solid ${C.line}`, padding: "40px 0 28px", marginTop: 80 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ fontSize: 12, color: C.textFaint, textAlign: "center" }}>© {new Date().getFullYear()} ppvs.io. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
