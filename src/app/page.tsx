import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import MailWorkspace from '@/components/mail/mailWorkspace'

export default async function Page(props: { searchParams: Promise<{ mailboxUser?: string }> }) {
    const cookieStore = await cookies()
    if (!cookieStore.get('id')?.value || !cookieStore.get('access_token')?.value) {
        return redirect('https://hanasand.com/dashboard/mail')
    }
    const searchParams = await props.searchParams
    return <MailWorkspace mailboxUser={searchParams.mailboxUser || null} />
}
