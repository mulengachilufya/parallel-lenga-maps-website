/**
 * /docs/api  —  Public-facing API reference for the Business+API tier.
 *
 * Server-rendered (no client interactivity needed). Anyone can read this;
 * Business users come here from the dashboard, prospects come here from the
 * pricing page to evaluate.
 */

import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { ArrowLeft, KeyRound, Terminal, Boxes, Globe2, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react'

export const metadata = {
  title: 'REST API · Lenga Maps',
  description: 'The Lenga Maps REST API — programmatic access to GIS datasets across Africa.',
}

const BASE = 'https://lenga-maps.com'

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-32 pb-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition-colors mb-6">
          <ArrowLeft size={16} /> Back home
        </Link>

        {/* Header */}
        <div className="mb-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent mb-3">REST API · v1</p>
          <h1 className="text-4xl sm:text-5xl font-black text-navy leading-tight mb-4">
            Pull every Lenga Maps dataset<br />from one endpoint.
          </h1>
          <p className="text-gray-600 leading-relaxed text-lg max-w-2xl">
            Stable JSON. Bearer auth. Presigned downloads from Cloudflare R2.
            Designed so a research script can grab continental coverage in a
            single call — no GUI, no manual hunt.
          </p>
        </div>

        {/* Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {[
            { icon: Globe2,      title: '54 countries',   blurb: 'Africa-wide coverage in every dataset where applicable.' },
            { icon: ShieldCheck, title: 'Stable contracts', blurb: 'Versioned at /v1/. Breaking changes go to /v2/.' },
            { icon: Sparkles,    title: 'Reproducible',   blurb: 'Same key, same script, same data — every nightly run.' },
          ].map(({ icon: Icon, title, blurb }) => (
            <div key={title} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <Icon className="text-primary mb-3" size={22} />
              <p className="font-bold text-navy">{title}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{blurb}</p>
            </div>
          ))}
        </div>

        {/* Auth */}
        <Section icon={KeyRound} title="Authentication">
          <p className="mb-4 text-gray-700 leading-relaxed">
            Generate a bearer token on the{' '}
            <Link href="/dashboard/api-keys" className="text-primary font-semibold hover:underline">API keys page</Link>.
            Available on the <strong>Business — On-site</strong> tier ($225/mo, includes 3 seats).
            The dashboard-only $75 Business tier doesn&apos;t include API access. Send it on every request:
          </p>
          <Code block>{`Authorization: Bearer lm_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Code>
          <p className="mt-4 text-sm text-gray-500 leading-relaxed">
            Keys are shown once at creation time. We store only a SHA-256 hash —
            if you lose your key, revoke it and mint a new one.
          </p>
        </Section>

        {/* Quotas */}
        <Section icon={ShieldCheck} title="Quotas">
          <ul className="text-gray-700 leading-relaxed space-y-1.5 text-sm">
            <li>· <span className="font-bold">5,000 requests / month</span> per key</li>
            <li>· <span className="font-bold">50 GB egress / month</span> per key (counted as the size of every file we sign)</li>
            <li>· Hard 429 on overage — email <a href="mailto:lengamaps@gmail.com" className="text-primary font-semibold">lengamaps@gmail.com</a> for a higher cap</li>
            <li>· Pre-signed URLs are valid for 1 hour</li>
          </ul>
        </Section>

        {/* Endpoints */}
        <Section icon={Terminal} title="Endpoints">
          {/* List datasets */}
          <Endpoint
            method="GET"
            path="/api/v1/datasets"
            summary="List every dataset and its file count."
          >
            <Code block>{`curl ${BASE}/api/v1/datasets \\
  -H "Authorization: Bearer lm_live_…"`}</Code>
            <p className="text-xs text-gray-500 mt-3">Response (truncated):</p>
            <Code block>{`{
  "datasets": [
    {
      "id":          "rivers",
      "name":        "River networks",
      "description": "HydroSHEDS / FAO river networks per African country.",
      "category":    "hydrology",
      "source":      "HydroSHEDS / FAO",
      "file_count":  54
    },
    { "id": "watersheds", "...": "..." }
  ],
  "quotas": {
    "requests_used":  12,
    "requests_limit": 5000,
    "egress_bytes_used":  4421160960,
    "egress_bytes_limit": 53687091200
  }
}`}</Code>
          </Endpoint>

          {/* Dataset detail */}
          <Endpoint
            method="GET"
            path="/api/v1/datasets/{id}"
            summary="Full metadata for a dataset, plus the per-country file list (no presigned URLs)."
          >
            <Code block>{`curl "${BASE}/api/v1/datasets/rivers?country=ZM" \\
  -H "Authorization: Bearer lm_live_…"`}</Code>
            <p className="text-xs text-gray-500 mt-3">
              <span className="font-semibold">Query params:</span> <code className="text-navy">country</code> (optional) — ISO-3 code (<code>ZM</code>) or full name (<code>Zambia</code>).
            </p>
          </Endpoint>

          {/* Single download */}
          <Endpoint
            method="GET"
            path="/api/v1/datasets/{id}/download?country=ZM"
            summary="Presigned download URL for ONE country's file. Valid for 1 hour."
          >
            <Code block>{`curl "${BASE}/api/v1/datasets/lulc/download?country=ZM" \\
  -H "Authorization: Bearer lm_live_…"`}</Code>
            <p className="text-xs text-gray-500 mt-3">Response:</p>
            <Code block>{`{
  "file": {
    "country_iso3":        "ZMB",
    "country_name":        "Zambia",
    "r2_key":              "datasets/zambia/lulc/zmb_lulc_2021.tif",
    "file_size_mb":        118.4,
    "file_format":         "GeoTIFF",
    "source":              "ESA WorldCover 2021 v200",
    "download_url":        "https://…r2.cloudflarestorage.com/…?X-Amz-…",
    "download_expires_in": 3600
  }
}`}</Code>
          </Endpoint>

          {/* Bundle */}
          <Endpoint
            method="GET"
            path="/api/v1/datasets/{id}/bundle"
            summary="Presigned URLs for EVERY country file in the dataset — continental coverage in one call."
          >
            <Code block>{`curl "${BASE}/api/v1/datasets/rivers/bundle" \\
  -H "Authorization: Bearer lm_live_…"`}</Code>
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
              Returns a JSON manifest of all files with presigned URLs. Stream them in
              parallel from your client — we don&apos;t serve a single ZIP because a 50 GB
              concatenation would burn through your quota and our memory budget. The
              official <code>lenga-maps</code> Python client does this transparently.
            </p>
          </Endpoint>
        </Section>

        {/* Python example */}
        <Section icon={Boxes} title="Quick Python example">
          <Code block>{`import os, requests
from pathlib import Path

API = "${BASE}/api/v1"
HEADERS = {"Authorization": f"Bearer {os.environ['LENGA_API_KEY']}"}

# Pull all river networks for Africa in one shot
bundle = requests.get(f"{API}/datasets/rivers/bundle", headers=HEADERS).json()

out = Path("rivers")
out.mkdir(exist_ok=True)

for f in bundle["bundle"]["files"]:
    dst = out / f"{f['country_iso3']}.zip"
    print(f"→ {f['country_name']}  ({f['file_size_mb']:.1f} MB)")
    with requests.get(f["download_url"], stream=True) as r:
        r.raise_for_status()
        with dst.open("wb") as fh:
            for chunk in r.iter_content(1024 * 1024):
                fh.write(chunk)`}</Code>
        </Section>

        {/* Error reference */}
        <Section icon={ShieldCheck} title="Errors">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">error</th>
                <th className="py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              <tr><td className="py-2 pr-4 font-mono">401</td><td className="py-2 pr-4 font-mono">missing_api_key</td>     <td className="py-2">No <code>Authorization</code> header.</td></tr>
              <tr><td className="py-2 pr-4 font-mono">401</td><td className="py-2 pr-4 font-mono">invalid_api_key</td>     <td className="py-2">Key not recognised.</td></tr>
              <tr><td className="py-2 pr-4 font-mono">401</td><td className="py-2 pr-4 font-mono">revoked_api_key</td>     <td className="py-2">Key was revoked.</td></tr>
              <tr><td className="py-2 pr-4 font-mono">403</td><td className="py-2 pr-4 font-mono">plan_inactive</td>       <td className="py-2">Account isn&apos;t Business / plan expired.</td></tr>
              <tr><td className="py-2 pr-4 font-mono">404</td><td className="py-2 pr-4 font-mono">dataset_not_found</td>   <td className="py-2">Dataset id doesn&apos;t exist.</td></tr>
              <tr><td className="py-2 pr-4 font-mono">404</td><td className="py-2 pr-4 font-mono">file_not_found</td>      <td className="py-2">Country has no file in this dataset.</td></tr>
              <tr><td className="py-2 pr-4 font-mono">429</td><td className="py-2 pr-4 font-mono">quota_exceeded</td>      <td className="py-2">Monthly request or egress cap hit.</td></tr>
            </tbody>
          </table>
        </Section>

        <div className="mt-12 bg-navy text-white rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black mb-1">Need the API on a custom plan?</h3>
            <p className="text-sm text-blue-200">Higher quotas, dedicated support, on-prem mirror — talk to us.</p>
          </div>
          <a
            href="mailto:lengamaps@gmail.com?subject=API%20—%20custom%20plan"
            className="bg-accent text-navy text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-yellow-400 transition-colors whitespace-nowrap"
          >
            Email sales
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Layout primitives ──────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="flex items-center gap-2.5 text-2xl font-black text-navy mb-4">
        <Icon className="text-primary" size={22} />
        {title}
      </h2>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {children}
      </div>
    </section>
  )
}

function Endpoint({ method, path, summary, children }: { method: string; path: string; summary: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 last:mb-0 pb-8 last:pb-0 border-b last:border-b-0 border-gray-100">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-2 py-1 rounded">{method}</span>
        <code className="font-mono text-sm text-navy break-all">{path}</code>
      </div>
      <p className="text-sm text-gray-600 mb-3 leading-relaxed">{summary}</p>
      {children}
    </div>
  )
}

function Code({ children, block }: { children: React.ReactNode; block?: boolean }) {
  if (block) {
    return (
      <pre className="bg-navy text-blue-100 text-xs font-mono rounded-lg p-4 overflow-x-auto leading-relaxed">
        <code>{children}</code>
      </pre>
    )
  }
  return <code className="bg-gray-100 text-navy px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
}
