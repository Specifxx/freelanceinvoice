import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'FreelanceInvoice — Get paid faster',
    template: '%s · FreelanceInvoice',
  },
  description:
    'Create a branded invoice in under a minute, send it, and get paid — with a one-tap payment link and automatic reminders that chase late payers for you.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
