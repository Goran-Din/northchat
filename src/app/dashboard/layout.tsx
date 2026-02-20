import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { SoftphoneProvider } from '@/contexts/SoftphoneContext'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile with tenant info
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, tenants(*), roles(*)')
    .eq('id', user.id)
    .single()

  return (
    <SoftphoneProvider>
      <DashboardShell user={user} profile={profile}>
        {children}
      </DashboardShell>
    </SoftphoneProvider>
  )
}
