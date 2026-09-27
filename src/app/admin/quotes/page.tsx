// /admin/quotes — quote requests now live in the sales pipeline, where each
// one arrives as an organisation that has already replied.
import { redirect } from 'next/navigation'

export default function AdminQuotesPage() {
  redirect('/admin/sales?tab=prospects')
}
