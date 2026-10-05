import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import MailWorkspace from '@/components/mail/mailWorkspace'

export default async function EmbeddedMailPage(props: { searchParams: Promise<{ mailboxUser?: string }> }) {
    const cookieStore = await cookies()
    if (!cookieStore.get('id')?.value || !cookieStore.get('access_token')?.value) {
        return redirect('https://hanasand.com/logout?path=%2Flogin%3Fpath%3D%2Fmail%26expired=true')
    }
    const searchParams = await props.searchParams
    return <MailWorkspace mailboxUser={searchParams.mailboxUser || null} />
}
