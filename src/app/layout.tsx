import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import './globals.css'

export const metadata = {
    title: 'Hanasand Mail',
    description: 'Hanasand mail',
    robots: { index: false, follow: false },
}

export default async function RootLayout({ children }: { children: ReactNode }) {
    const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark'
    return <html lang='en' className={theme}><body>{children}</body></html>
}
