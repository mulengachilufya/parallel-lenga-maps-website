import { permanentRedirect } from 'next/navigation'

// Services was folded into Use cases (same full-bleed design, one section per kind of work).
export default function ServicesPage() {
  permanentRedirect('/use-cases')
}
