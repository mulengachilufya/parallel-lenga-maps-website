import { redirect } from 'next/navigation'

// Private messages were removed: teams talk in each project's discussion,
// with comments and voice notes everyone on the project can read.
export default function MessagesPage() {
  redirect('/workspace')
}
