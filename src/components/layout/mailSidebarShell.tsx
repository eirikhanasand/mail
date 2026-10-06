'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, House, Menu, Search } from 'lucide-react'

export default function MailSidebarShell({ children }: { children: ReactNode }) {
    const sidebar = useRef<HTMLElement>(null)
    const [collapsed, setCollapsed] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    const [query, setQuery] = useState('')

    function toggleSections() {
        const sections = Array.from(sidebar.current?.querySelectorAll('details') || [])
        const shouldOpen = sections.some(section => !section.open)
        sections.forEach(section => { section.open = shouldOpen })
    }

    function filterNavigation(value: string) {
        setQuery(value)
        const needle = value.trim().toLocaleLowerCase()
        const rows = sidebar.current?.querySelectorAll<HTMLElement>('[data-sidebar-section]') || []
        rows.forEach(row => { row.hidden = Boolean(needle) && !row.innerText.toLocaleLowerCase().includes(needle) })
    }

    return <aside ref={sidebar} aria-label='Dashboard sidebar' data-collapsed={collapsed} className={`site-chrome dashboard-sidebar-sticky hidden min-h-0 overflow-y-auto rounded-lg border border-ui-border bg-ui-panel p-2 text-ui-text shadow-sm shadow-ui-canvas/10 transition-[width] lg:block ${collapsed ? 'w-16' : 'w-72'}`}>
        <nav aria-label='Dashboard navigation' className='grid gap-0.5'>
            <div className='mb-2 flex items-center justify-between gap-1 border-b border-ui-border px-1 pb-2'>
                <a href='https://hanasand.com/dashboard' aria-label='Home' title='Home' className='grid h-10 w-10 place-items-center rounded-lg text-ui-muted hover:bg-ui-raised hover:text-ui-text'><House className='h-5 w-5' /></a>
                <button type='button' onClick={toggleSections} aria-label='Expand or collapse all sections' title='Expand or collapse all sections' className={`grid h-10 w-10 place-items-center rounded-lg text-ui-muted hover:bg-ui-raised hover:text-ui-text ${collapsed ? 'hidden' : ''}`}><ChevronDown className='h-5 w-5 rotate-180' /></button>
                <button type='button' onClick={() => { setSearchOpen(value => !value); setQuery(''); filterNavigation('') }} aria-label='Find a page' title='Find a page' className={`grid h-10 w-10 place-items-center rounded-lg text-ui-muted hover:bg-ui-raised hover:text-ui-text ${collapsed ? 'hidden' : ''}`}><Search className='h-5 w-5' /></button>
                <button type='button' onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className='grid h-10 w-10 place-items-center rounded-lg text-ui-muted hover:bg-ui-raised hover:text-ui-text'><Menu className='h-5 w-5' /></button>
            </div>
            {searchOpen && !collapsed && <input autoFocus aria-label='Find a page' placeholder='Find a page' value={query} onChange={event => filterNavigation(event.target.value)} className='mb-2 h-10 rounded-lg border border-ui-border bg-ui-canvas px-3 text-sm text-ui-text outline-none placeholder:text-ui-muted focus:border-ui-muted' />}
            <div className={collapsed ? 'hidden' : 'grid gap-0.5'}>{children}</div>
        </nav>
    </aside>
}
