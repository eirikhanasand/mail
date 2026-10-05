'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export default function MailThemeToggle() {
    const [light, setLight] = useState(false)

    useEffect(() => {
        setLight(document.documentElement.classList.contains('light'))
    }, [])

    function toggle() {
        const nextLight = !document.documentElement.classList.contains('light')
        document.documentElement.classList.toggle('light', nextLight)
        document.cookie = `theme=${nextLight ? 'light' : 'dark'}; Path=/; Domain=.hanasand.com; Max-Age=31536000; SameSite=Lax; Secure`
        setLight(nextLight)
    }

    return <button type='button' onClick={toggle} aria-label={`Switch to ${light ? 'dark' : 'light'} theme`} title={`Switch to ${light ? 'dark' : 'light'} theme`} className='grid h-10 w-10 place-items-center rounded-lg text-ui-muted transition hover:bg-ui-raised hover:text-ui-text'>
        {light ? <Moon className='h-4 w-4' /> : <Sun className='h-4 w-4' />}
    </button>
}
