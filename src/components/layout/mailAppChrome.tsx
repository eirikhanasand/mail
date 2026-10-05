import Image from 'next/image'
import { cookies } from 'next/headers'
import { AlarmClockCheck, Code2, FolderKanban, House, Mail, Menu, NotebookText, Server, Settings2, ShieldCheck, UserRound } from 'lucide-react'
import MailThemeToggle from './mailThemeToggle'

const mainSite = 'https://hanasand.com'

const navigation = [
    { label: 'Home', icon: House, href: '/dashboard' },
    { label: 'Security & intelligence', icon: ShieldCheck, items: [
        ['Findings', '/findings'], ['Threat intelligence', '/ti'],
    ] },
    { label: 'Logs & rules', icon: Settings2, items: [
        ['Logs', '/logs'], ['Rules', '/rules'],
    ] },
    { label: 'Automation', icon: AlarmClockCheck, items: [
        ['Scheduled tasks', '/automation/cron'],
    ] },
    { label: 'Infrastructure', icon: Server, items: [
        ['Virtual machines', '/vms'], ['System', '/system'],
    ] },
    { label: 'Content', icon: NotebookText, items: [
        ['Notes', '/notes'], ['Gallery', '/gallery'], ['Uploads', '/upload'], ['Projects', '/projects'],
    ] },
    { label: 'Communication', icon: Mail, items: [
        ['Mail', '/mail'], ['Support Chats', '/support'],
    ] },
    { label: 'Organization', icon: FolderKanban, href: '/organizations' },
    { label: 'Resources', icon: Code2, items: [
        ['API', '/api'], ['Status', '/status'], ['Documentation', '/developers'],
    ] },
]

export default async function MailAppChrome({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies()
    const userId = cookieStore.get('id')?.value || ''

    return <div className='enterprise-theme flex h-dvh min-h-0 flex-col overflow-hidden bg-ui-canvas text-ui-text'>
        <header data-site-header className='site-chrome z-20 flex h-18 shrink-0 items-center border-b border-ui-border bg-ui-panel px-3 text-ui-text sm:px-5 md:px-10 lg:px-16'>
            <div className='mx-auto flex w-full max-w-7xl items-center justify-between gap-3'>
                <a href={`${mainSite}/dashboard`} className='flex min-w-0 shrink-0 items-center gap-3' aria-label='Hanasand dashboard'>
                    <Image src='/hanasand-logo-transparent.png' alt='' width={36} height={36} className='h-9 w-9 shrink-0 object-contain' priority />
                </a>
                <div className='flex min-w-0 items-center justify-end gap-1 sm:gap-2'>
                    <a href={`${mainSite}/support`} className='hidden h-10 min-w-20 items-center justify-center rounded-lg px-3 text-sm font-semibold text-ui-muted transition hover:bg-ui-raised hover:text-ui-text lg:inline-flex'>Support</a>
                    <MailThemeToggle />
                    <a href={`${mainSite}/dashboard`} className='hidden h-11 items-center gap-2 rounded-lg bg-ui-text px-3 text-sm font-semibold text-ui-canvas shadow-sm transition hover:opacity-90 sm:inline-flex sm:px-4'>Dashboard</a>
                    <details className='relative'>
                        <summary aria-label='Account options' className='grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-ui-border text-ui-muted hover:bg-ui-raised hover:text-ui-text [&::-webkit-details-marker]:hidden'>
                            <UserRound className='h-5 w-5' />
                        </summary>
                        <div className='absolute right-0 top-12 z-30 grid w-60 gap-2 rounded-lg border border-ui-border bg-ui-panel p-3 text-sm text-ui-text shadow-xl'>
                            <p className='truncate px-2 py-1 font-mono text-xs text-ui-muted'>@{userId || 'account'}</p>
                            <div role='separator' className='border-t border-ui-border' />
                            <a href={`${mainSite}/profile/${encodeURIComponent(userId)}`} className='rounded-lg p-2 hover:bg-ui-raised'>Profile</a>
                            <a href={`${mainSite}/logout`} className='rounded-lg p-2 hover:bg-ui-raised'>Sign out</a>
                        </div>
                    </details>
                    <details className='relative lg:hidden'>
                        <summary aria-label='Open navigation' className='grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-ui-border text-ui-muted hover:bg-ui-raised hover:text-ui-text [&::-webkit-details-marker]:hidden'>
                            <Menu className='h-4 w-4' />
                        </summary>
                        <div className='absolute right-0 top-12 z-30 max-h-[calc(100dvh-6rem)] w-72 overflow-y-auto rounded-lg border border-ui-border bg-ui-panel p-2 shadow-xl'>
                            <NavigationLinks />
                        </div>
                    </details>
                </div>
            </div>
        </header>
        <div className='grid min-h-0 flex-1 grid-cols-1 gap-2 bg-ui-canvas p-2 lg:grid-cols-[auto_minmax(0,1fr)]'>
            <aside aria-label='Dashboard sidebar' className='site-chrome dashboard-sidebar-sticky hidden min-h-0 w-58 overflow-y-auto rounded-lg border border-ui-border bg-ui-panel p-2 text-ui-text shadow-sm shadow-ui-canvas/10 lg:block'>
                <nav aria-label='Dashboard navigation' className='grid gap-0.5'>
                    {navigation.map(section => {
                        const Icon = section.icon
                        if (section.href) return <a key={section.label} href={`${mainSite}${section.href}`} className='flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm text-ui-text hover:bg-ui-canvas'><Icon className='h-4 w-4 shrink-0 text-ui-muted' />{section.label}</a>
                        return <details key={section.label} open={section.label === 'Communication'}>
                            <summary className='flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-ui-text hover:bg-ui-canvas [&::-webkit-details-marker]:hidden'><Icon className='h-4 w-4 shrink-0 text-ui-muted' /><span className='min-w-0 flex-1'>{section.label}</span></summary>
                            <div className='ml-5 border-l border-ui-border pl-2'>
                                {section.items?.map(([label, href]) => <a key={href} href={`${mainSite}${href}`} aria-current={href === '/mail' ? 'page' : undefined} className={`flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-sm ${href === '/mail' ? 'bg-ui-primary/10 font-semibold text-ui-primary' : 'text-ui-text hover:bg-ui-canvas'}`}>
                                    {href === '/mail' && <Mail className='h-4 w-4' />}{label}
                                </a>)}
                            </div>
                        </details>
                    })}
                </nav>
            </aside>
            <main className='min-h-0 min-w-0 overflow-y-auto overscroll-contain'>
                {children}
            </main>
        </div>
    </div>
}

function NavigationLinks() {
    return <nav aria-label='Dashboard navigation' className='grid gap-0.5'>
        {navigation.flatMap(section => section.href
            ? [<a key={section.href} href={`${mainSite}${section.href}`} className='rounded-md px-3 py-2 text-sm text-ui-text hover:bg-ui-raised'>{section.label}</a>]
            : (section.items || []).map(([label, href]) => <a key={href} href={`${mainSite}${href}`} className={`rounded-md px-3 py-2 text-sm ${href === '/mail' ? 'bg-ui-primary/10 font-semibold text-ui-primary' : 'text-ui-text hover:bg-ui-raised'}`}>{label}</a>))}
    </nav>
}
