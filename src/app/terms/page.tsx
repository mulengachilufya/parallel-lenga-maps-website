import Footer from '@/components/Footer'
import Link from 'next/link'

export default function TermsPage() {
  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <div className="h-20" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">

          <div className="mb-10">
            <h1 className="text-3xl font-bold text-navy mb-2">Terms & Conditions</h1>
            <p className="text-sm text-gray-500">Last updated: October 2026 · Lenga Maps (a product of Lenga Maps, registered in Zambia)</p>
          </div>

          <div className="space-y-10 text-gray-700 text-sm leading-relaxed">

            <section>
              <h2 className="text-base font-bold text-navy mb-3">1. Acceptance of Terms</h2>
              <p>By accessing or using the Lenga Maps platform at lengamaps.com, you agree to be bound by these Terms and Conditions. If you do not agree, do not use the platform.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">2. Description of Service</h2>
              <p>Lenga Maps provides a self-serve digital platform for downloading processed geospatial datasets covering all 54 African countries. Access is provided via plans (Individual, and Team packages for organisations) paid in USD in advance for a fixed access period of three (3) months. Plans do not renew automatically. All delivery is digital — no physical goods are shipped.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">3. Account Registration</h2>
              <p>You must create an account to access paid content. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must provide accurate and current information during registration.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">4. Plans and Payment</h2>
              <p>Plans are a one-time payment in USD, made by bank transfer. There is no subscription and no recurring charge. Access is activated once we verify your payment and does not expire. Team plans are sold as packages (up to 4 seats, or up to 12 seats) and confirmed by quote. Creating an account and browsing the catalogue is free; downloading datasets requires an active paid plan.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">5. Acceptable Use</h2>
              <p>You may use downloaded datasets for personal, academic, commercial, or organisational purposes within the scope of your plan. Except as set out in the next paragraph, you may not redistribute, resell, sublicense, or make datasets publicly available to third parties. You may not use the platform for any unlawful purpose.</p>
              <p className="mt-3"><strong>Share-alike data.</strong> Some files are built on sources whose licences require that adaptations stay under the same licence: OpenStreetMap (Open Database License, ODbL 1.0) and some district boundaries (ODbL 1.0 or Creative Commons Attribution-ShareAlike). These are the Road Surface, Power Plants and Protected Areas datasets, and the district boundaries of Botswana, Cabo Verde, Eswatini, Ethiopia, Guinea-Bissau, Mauritania, Mauritius, Morocco, São Tomé and Príncipe, Somalia, Togo and Tunisia (each file names its boundary licence in its <code>boundary_licence</code> field and <code>about</code> table). Those files are licensed to you under the same share-alike licence, and nothing in these Terms restricts the rights that licence gives you. You pay for our processing, packaging and service, not for the underlying open data.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">6. Intellectual Property</h2>
              <p>The Lenga Maps platform, including its processing pipelines, curation logic, UI, and brand, is the intellectual property of Lenga Maps. Underlying datasets are sourced from open-data providers (IGRAC, CHIRPS, CHELSA, HydroSHEDS, ISRIC, ESA, and others) under their respective licences. Attribution requirements of source licences are the responsibility of the customer when publishing derived work.</p>
              <p className="mt-3">Each file states its sources, licences and citation in its <code>about</code> table (GeoPackage) or metadata (GeoTIFF). Notices some sources require you to carry when you publish work built on their data:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Crop Production (IFPRI MapSPAM, CC BY 4.0): &ldquo;This data was provided by the International Food Policy Research Institute (IFPRI). IFPRI bears no responsibility for the analyses or interpretations of the data presented here.&rdquo;</li>
                <li>Solar resource (Global Solar Atlas, CC BY 4.0): credit &ldquo;Global Solar Atlas 2.0, Solargis, World Bank Group (ESMAP)&rdquo; and follow globalsolaratlas.info/support/terms-of-use.</li>
                <li>OpenStreetMap-based files (ODbL): &ldquo;© OpenStreetMap contributors&rdquo;.</li>
                <li>Other sources are CC BY 4.0, CC BY 3.0 IGO or public domain (USGS, CHIRPS): credit the source named in the file.</li>
              </ul>
              <p className="mt-3">Modelled datasets (crop production and suitability, soils, population, solar and wind) are estimates for screening and planning, not measurements or official statistics, and are provided as is.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">7. Data Accuracy</h2>
              <p>Lenga Maps curates and validates datasets to professional standards, but does not warrant that all data is error-free or suitable for every use case. Users are responsible for verifying data fitness for their specific applications, particularly for regulatory, safety-critical, or legal purposes.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">8. Limitation of Liability</h2>
              <p>Lenga Maps shall not be liable for any indirect, incidental, or consequential damages arising from use of the platform or downloaded data. Our total liability to any subscriber shall not exceed the amount paid in the 30 days preceding the claim.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">9. Termination</h2>
              <p>We reserve the right to suspend or terminate accounts that violate these terms, engage in fraudulent activity, or abuse the platform. Because plans are paid once, there is no recurring billing to cancel. You may ask us to close your account at any time.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">10. Changes to Terms</h2>
              <p>We may update these Terms from time to time. Continued use of the platform after changes constitutes acceptance of the revised Terms. We will notify active customers of material changes via email.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">11. Governing Law</h2>
              <p>These Terms are governed by the laws of the Republic of Zambia. Any disputes shall be subject to the jurisdiction of Zambian courts.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-navy mb-3">12. Contact</h2>
              <p>For any questions regarding these Terms, contact us at <a href="mailto:support@lengamaps.com" className="text-primary font-medium">support@lengamaps.com</a> or via our <Link href="/contact-us" className="text-primary font-medium">contact page</Link>.</p>
            </section>

          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}