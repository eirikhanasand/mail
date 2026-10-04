import type { CSSProperties, ReactNode } from 'react'

type DashboardPageProps = { children: ReactNode; className?: string; style?: CSSProperties }
type DashboardPanelProps = { children: ReactNode; className?: string; id?: string }

export const dashboardPanelClass = 'rounded-lg border border-ui-border bg-ui-panel shadow-sm shadow-ui-canvas/10 dark:shadow-ui-canvas/20'

export function DashboardPage({ children, className = '', style }: DashboardPageProps) {
    return <main style={style} className={`grid min-h-full w-full content-start gap-3 px-2 py-4 text-ui-text sm:gap-4 ${className}`.trim()}>{children}</main>
}

export function DashboardPanel({ children, className = '', id }: DashboardPanelProps) {
    return <section id={id} className={`${dashboardPanelClass} ${className}`.trim()}>{children}</section>
}
