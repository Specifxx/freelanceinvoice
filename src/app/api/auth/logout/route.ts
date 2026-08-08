import { redirect } from 'next/navigation'
import { destroySession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST() {
  await destroySession()
  redirect('/')
}
