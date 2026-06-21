import type { Metadata } from 'next'
import NewsletterSignupForm from '@/components/NewsletterSignupForm'

export const metadata: Metadata = {
  title: 'Earth, Maps & Models by Lenga Maps',
  description:
    'Geospatial thinking from the African frontier. A free weekly newsletter on GIS, African environmental data, and spatial analysis. Every Monday.',
  alternates: { canonical: 'https://www.lengamaps.com/newsletter' },
  openGraph: {
    title: 'Earth, Maps & Models by Lenga Maps',
    description: 'Geospatial thinking from the African frontier. Every Monday.',
    url: 'https://www.lengamaps.com/newsletter',
    siteName: 'Lenga Maps',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Earth, Maps & Models by Lenga Maps',
    description: 'Geospatial thinking from the African frontier. Every Monday.',
  },
}

const SECTIONS: { title: string; body: string }[] = [
  { title: 'From the Build', body: 'An honest note on what I shipped at Lenga Maps that week.' },
  { title: 'The Feature', body: 'One GIS concept or African environmental issue, explored properly.' },
  { title: 'Dataset Spotlight', body: 'One of our datasets, one real use case, and the decision it informs.' },
  { title: 'GIS Trick of the Week', body: 'One practical QGIS, Python or GDAL tip you can use that day.' },
  { title: 'The Question', body: 'One honest question. Hit reply, I read every one.' },
]

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>
}) {
  const sp  = await searchParams
  const src = (typeof sp?.src === 'string' ? sp.src : '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40)
  const source = src ? `newsletter_page_${src}` : 'newsletter_page'

  return (
    <main className="bg-dark text-white">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-14">
        <p className="text-[0.7rem] font-bold tracking-[0.18em] text-gold uppercase mb-4">
          The Lenga Maps newsletter
        </p>
        <h1 className="text-4xl sm:text-5xl font-black leading-[1.05] tracking-tight">
          Earth, Maps &amp; Models
        </h1>
        <p className="mt-3 text-lg text-gold-light font-semibold">
          Geospatial thinking from the African frontier.
        </p>
        <p className="mt-5 text-white/65 text-base leading-relaxed max-w-xl">
          A free weekly newsletter for GIS analysts, researchers, consultants, and anyone
          working with African environmental and spatial data. Every Monday, no spam.
        </p>

        <div className="mt-8">
          <NewsletterSignupForm source={source} />
        </div>
      </section>

      {/* What you get */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <h2 className="text-sm font-bold tracking-[0.16em] text-white/50 uppercase mb-6">
          What lands every Monday
        </h2>
        <ul className="space-y-4">
          {SECTIONS.map((s) => (
            <li
              key={s.title}
              className="bg-dark-light border border-white/10 rounded-xl px-5 py-4"
            >
              <p className="text-gold font-bold">{s.title}</p>
              <p className="text-white/65 text-sm mt-1 leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ul>

        <p className="text-white/50 text-sm mt-10 leading-relaxed">
          Written by Mulenga, founder of Lenga Maps, building Africa&apos;s largest and most
          centralised GIS data platform for Climate, Water and Industrial Projects.
        </p>
      </section>
    </main>
  )
}
