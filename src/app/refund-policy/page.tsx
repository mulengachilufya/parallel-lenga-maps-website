import Footer from '@/components/Footer'
import Link from 'next/link'

export default function RefundPolicyPage() {
  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <div className="h-20" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">

          <div className="mb-10">
            <h1 className="text-3xl font-bold text-navy mb-2">Refund & Delivery Policy</h1>
            <p className="text-sm text-gray-500">Last updated: September 2026 · Lenga Maps (a product of Lenga Maps, registered in Zambia)</p>
          </div>

          <div className="space-y-10 text-gray-700 text-sm leading-relaxed">

            <section>
              <h2 className="text-base font-bold text-navy mb-3">Delivery of Service</h2>
              <p>Lenga Maps is an entirely digital platform. Upon successful payment verification, customers receive immediate access to their dashboard where they can browse and download geospatial dataset files by country. No physical goods are shipped at any time. Delivery is instant, and access does not expire.</p>
              <p className="mt-3">Payments are made by bank transfer, and access is activated within a few hours of payment verification by our team. You will receive a confirmation once your plan is active.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">Refund Policy</h2>
              <p>Because Lenga Maps delivers digital content that is accessible immediately upon payment activation, we generally do not offer refunds once dataset access has been granted.</p>
              <p className="mt-3">However, we will consider refund requests in the following circumstances:</p>
              <ul className="mt-3 space-y-2 list-none">
                {[
                  'Payment was made but your account was never activated due to a technical error on our side.',
                  'You were charged twice for the same plan.',
                  'You submitted a payment but changed your mind before we verified and activated your account.',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-3">Refund requests must be submitted within 7 days of payment.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">How to Request a Refund</h2>
              <p>To request a refund, contact us at <a href="mailto:support@lengamaps.com" className="text-primary font-medium">support@lengamaps.com</a> with your account email, payment date, and a brief description of the issue. We aim to respond within 2 business days.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">Contact</h2>
              <p>For any billing or delivery questions, reach us via <Link href="/contact-us" className="text-primary font-medium">our contact page</Link> or at <a href="mailto:support@lengamaps.com" className="text-primary font-medium">support@lengamaps.com</a>.</p>
            </section>

          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}