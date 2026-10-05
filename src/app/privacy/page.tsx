import type { Metadata } from 'next'
import Link from 'next/link'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Privacy Policy | Lenga Maps',
  description: 'What Lenga Maps records about you, why, who processes it, how long it is kept and how to see, correct or delete it.',
}

/**
 * Plain-language privacy policy. Keep it true to the code: if what we
 * record changes (download_events, workspace, payments, analytics), change
 * this page in the same pull request.
 */
export default function PrivacyPage() {
  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <div className="h-20" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">

          <div className="mb-10">
            <h1 className="text-3xl font-bold text-navy mb-2">Privacy Policy</h1>
            <p className="text-sm text-gray-500">Last updated: October 2026 · Lenga Maps, registered in Zambia</p>
          </div>

          <div className="space-y-10 text-gray-700 text-sm leading-relaxed">

            <section>
              <h2 className="text-base font-bold text-navy mb-3">1. In short</h2>
              <p>We record what we need to run your account, deliver the data you pay for and keep the platform secure. We do not sell your data, we do not show advertising, and we do not use advertising or tracking cookies. You can ask to see, correct or delete what we hold about you at any time.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">2. Who we are</h2>
              <p>Lenga Maps operates lengamaps.com and is responsible for the personal data described here. For anything about your data, email <a href="mailto:support@lengamaps.com" className="text-primary font-medium">support@lengamaps.com</a>.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">3. Wherever you are</h2>
              <p>Lenga Maps is based in Zambia and used by people across Africa, Europe and beyond. We give everyone the same protections described here, whatever their country. The laws that apply include the Data Protection Act 2021 of Zambia and, where they cover you, the EU and UK General Data Protection Regulation (GDPR), South Africa&apos;s Protection of Personal Information Act (POPIA), Kenya&apos;s Data Protection Act 2019, Nigeria&apos;s Data Protection Act 2023, Ghana&apos;s Data Protection Act 2012 and similar laws elsewhere. Where the law of your country gives you more rights than this policy describes, you have those rights too.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">4. What we record</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><b>Your account.</b> Name, email address, country, sector and organisation, and your team and role if you join one. Passwords are handled by our sign in provider and stored only in hashed form; we never see them.</li>
                <li><b>Payments.</b> Your plan, the amount, the payment method (mobile money or bank transfer), the reference and the payment screenshot you upload so we can verify it.</li>
                <li><b>Downloads.</b> Each time you download a file, from the website, the dashboard or the API, we record the dataset, the country, the format, the size, how it was downloaded and when. We use this to apply your plan, to show your team its download history, to warn you before you download the same file twice and to understand which data people need.</li>
                <li><b>Workspace.</b> Projects, the files you upload, layers, comments, voice notes, saved views and the change history of each project.</li>
                <li><b>API use.</b> The API keys you create and how many requests and how much data each one uses per month.</li>
                <li><b>Messages to us.</b> What you send through the contact, quote and data request forms, and your email address if you subscribe to our newsletter.</li>
                <li><b>Technical data.</b> Your IP address is used briefly to limit abusive traffic. Our hosting provider counts page visits without cookies and without identifying you. Error logs may include the page and time of an error.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">5. Why we use it</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>To provide the service you signed up for: your account, your plan, downloads, the workspace and the API.</li>
                <li>To verify payments and keep the records that accounting and tax law require.</li>
                <li>To keep the platform secure and prevent misuse, including unauthorised redistribution of datasets.</li>
                <li>To answer your questions and send service emails, such as payment confirmations and team invitations.</li>
                <li>To improve the platform, using totals such as which datasets and countries are downloaded most.</li>
                <li>To send the newsletter, only if you subscribed. You can unsubscribe from any newsletter email.</li>
              </ul>
              <p className="mt-3">We rely on the contract between us for the first four, our legitimate interest in running and improving the platform for the fifth, and your consent for the newsletter.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">6. Who can see it</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><b>Your team.</b> If you are on a team, its members can see the team&apos;s download history and the projects, comments and voice notes shared with them.</li>
                <li><b>Lenga Maps staff,</b> only as needed to verify payments, support you and keep the platform running.</li>
                <li><b>Our service providers,</b> who process data only on our instructions: Supabase (database, sign in and storage), Cloudflare (file storage), Vercel (hosting and visit counts) and Resend (email). Section 7 says where they keep it.</li>
              </ul>
              <p className="mt-3">We do not sell, rent or trade personal data, and we only disclose it to authorities where the law requires it.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">7. Where your data is stored</h2>
              <p>Our database is hosted in London, United Kingdom. The website runs on servers in Cape Town, South Africa. Files are stored on Cloudflare&apos;s network and emails are sent through Resend in the United States. This means your data may be stored or processed in a country other than your own. Each provider is bound by a data processing agreement that limits what it may do with your data and requires it to keep the data secure; for data leaving the European Economic Area or the United Kingdom, those agreements include the standard contractual clauses approved for such transfers.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">8. Files you upload</h2>
              <p>Files, boundaries and imagery your team uploads stay in your team&apos;s private storage. They are used only to show your project to the people you invite. They are never shared, sold or published, and never added to the Lenga database. An NDA is available on request.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">9. How long we keep it</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Account data is kept while your account is open.</li>
                <li>When you delete your account, your profile and API keys are deleted. Your download records are kept without your name or email, as anonymous counts. Comments and layers you added to shared team projects stay with that team.</li>
                <li>Uploaded files are deleted when the project or team they belong to is deleted, or when you ask us.</li>
                <li>Payment records are kept for as long as accounting and tax law requires.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">10. Cookies</h2>
              <p>We use only the cookies needed to keep you signed in. There are no advertising or cross site tracking cookies, so there is nothing to accept or decline.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">11. Your rights</h2>
              <p>Wherever you live, you can ask us to:</p>
              <ul className="list-disc pl-5 space-y-1.5 mt-2">
                <li>show you the personal data we hold about you and give you a copy in a common format;</li>
                <li>correct it if it is wrong or incomplete;</li>
                <li>delete it;</li>
                <li>stop or limit a particular use of it, including any use based on our legitimate interests;</li>
                <li>withdraw your consent to the newsletter at any time.</li>
              </ul>
              <p className="mt-3">You can delete your account yourself from your dashboard, or email <a href="mailto:support@lengamaps.com" className="text-primary font-medium">support@lengamaps.com</a> and we will respond within 30 days. We will not charge you, and we may ask you to confirm your identity first. If you are not satisfied with our answer, you can complain to the data protection authority where you live or work, for example the Office of the Data Protection Commissioner in Zambia, the Information Regulator in South Africa, the Office of the Data Protection Commissioner in Kenya, or your national authority in the EU or the UK.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">12. Security</h2>
              <p>Data is encrypted in transit, files are stored in private storage reached only through short lived signed links, and staff access is limited to the people who need it. No system is perfectly secure; if a breach affects your data, we will tell you and the regulator as the law requires.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">13. Children</h2>
              <p>Lenga Maps is a professional service and is not directed at children under 16.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">14. Changes</h2>
              <p>If we change what we record or why, we will update this page and email active customers about material changes. See also our <Link href="/terms" className="text-primary font-medium">Terms &amp; Conditions</Link>.</p>
            </section>

          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
