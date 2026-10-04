'use client'

import type { ReactNode } from 'react'
import {
    Archive,
    Forward,
    Inbox,
    Mail,
    Trash2,
    ShieldAlert,
} from 'lucide-react'
import {
    mailBlobUrl,
    messageAction,
    type DraftAttachment,
} from '@/utils/mail/client'
import type {
    MailAddress,
    MailAttachment,
    MailMessage,
    MailOverview,
} from '@/utils/mail/types'
import Image from 'next/image'

export type ComposerMode = 'new' | 'reply' | 'replyAll' | 'forward'

export type ComposerState = {
    open: boolean
    mode: ComposerMode
    to: string
    cc: string
    bcc: string
    subject: string
    body: string
    attachments: DraftAttachment[]
}

export const emptyComposer: ComposerState = {
    open: false,
    mode: 'new',
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    attachments: [],
}

export const toolbarButton = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-ui-border bg-ui-raised px-2.5 text-[11px] font-medium text-ui-text transition hover:border-ui-primary hover:bg-ui-panel disabled:cursor-not-allowed disabled:opacity-45'
export const iconButton = 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ui-border bg-ui-raised text-ui-muted transition hover:border-ui-primary hover:bg-ui-panel hover:text-ui-text disabled:cursor-not-allowed disabled:opacity-45'
export const subtleInput = 'h-8 rounded-lg border border-ui-border bg-ui-raised px-3 text-xs text-ui-text outline-none transition placeholder:text-ui-muted focus:border-ui-primary focus:bg-ui-panel'

export function composeFromReply(mode: ComposerMode, message: MailMessage, ownAddress?: string): ComposerState {
    const subject = mode === 'forward'
        ? prefixSubject(message.subject, 'Fwd:')
        : prefixSubject(message.subject, 'Re:')

    const recipients = mode === 'reply'
        ? message.replyTo.length ? message.replyTo : message.from
        : mode === 'replyAll'
            ? dedupeAddresses(
                [...(message.replyTo.length ? message.replyTo : message.from), ...message.to, ...message.cc]
                    .filter((address) => address.email.toLowerCase() !== (ownAddress || '').toLowerCase())
            )
            : []

    const quoted = `\n\nOn ${formatDate(message.receivedAt, true)}, ${message.from.map((from) => from.email).join(', ')} wrote:\n${message.textBody.split('\n').map((line) => `> ${line}`).join('\n')}`

    return {
        open: true,
        mode,
        to: recipients.map((address) => address.email).join(', '),
        cc: '',
        bcc: '',
        subject,
        body: mode === 'forward' ? `\n\n---------- Forwarded message ----------\n${message.textBody}` : quoted,
        attachments: [],
    }
}

export function prefixSubject(subject: string, prefix: string) {
    return subject.toLowerCase().startsWith(prefix.toLowerCase()) ? subject : `${prefix} ${subject}`
}

export function dedupeAddresses(addresses: MailAddress[]) {
    const seen = new Set<string>()
    return addresses.filter((address) => {
        const key = address.email.toLowerCase()
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

export async function runAction(
    messageId: string,
    overview: MailOverview,
    setError: (value: string) => void,
    load: (params?: {
        mailboxId?: string | null
        messageId?: string | null
        mailboxUser?: string | null
        silent?: boolean
    }) => Promise<void>,
    action: 'read' | 'unread' | 'flag' | 'unflag' | 'archive' | 'junk' | 'ham' | 'trash' | 'restore',
) {
    try {
        await messageAction(messageId, { mailboxUser: overview.mailboxUser, action })
        await load(['archive', 'trash', 'junk', 'ham', 'restore'].includes(action)
            ? { silent: true, messageId: null }
            : { silent: true })
    } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to update message.')
    }
}

export function iconForMailbox(role?: string) {
    if (role === 'inbox') return <Inbox className='h-3.5 w-3.5 text-ui-primary' />
    if (role === 'archive') return <Archive className='h-3.5 w-3.5 text-ui-success' />
    if (role === 'junk') return <ShieldAlert className='h-3.5 w-3.5 text-ui-text' />
    if (role === 'trash') return <Trash2 className='h-3.5 w-3.5 text-ui-text' />
    return <Mail className='h-3.5 w-3.5 text-ui-muted' />
}

export function formatDate(value: string, verbose = false) {
    if (!value) {
        return 'Unknown time'
    }

    return new Intl.DateTimeFormat('en', {
        dateStyle: verbose ? 'full' : 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

export function formatRelativeTime(value: number, now: number) {
    const diffMinutes = Math.max(1, Math.floor((now - value) / 60_000))
    if (diffMinutes < 60) {
        return `${diffMinutes}m`
    }

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) {
        return `${diffHours}h`
    }

    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d`
}

export function formatMailboxAddress(address: MailAddress) {
    return address.name ? `${address.name} <${address.email}>` : address.email
}

export function prettyBytes(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function buildMailFrameHtml(html: string, theme: 'light' | 'dark' = 'light') {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: ${theme}; }
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: CanvasText;
      font-family: Manrope, Aptos, sans-serif;
    }
    body {
      padding: 12px;
      font-size: 14px;
      line-height: 1.6;
    }
    img, iframe, video {
      max-width: 100%;
      height: auto;
      border-radius: 14px;
    }
    a { color: LinkText; }
    table { max-width: 100%; }
    pre, code {
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>${html}</body>
</html>`
}

export async function fileToDraftAttachment(file: File): Promise<DraftAttachment> {
    const buffer = await file.arrayBuffer()
    return {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        contentBase64: arrayBufferToBase64(buffer),
    }
}

export function AttachmentPreview({ attachment, mailboxUser }: { attachment: MailAttachment, mailboxUser: string }) {
    const url = mailBlobUrl(mailboxUser, attachment.blobId, attachment.name)
    if (attachment.type.startsWith('image/')) {
        return (
            <a href={url} target='_blank' rel='noopener noreferrer' className='rounded-lg border border-ui-border bg-ui-raised p-2.5 transition hover:bg-ui-panel'>
                <Image src={url} alt={attachment.name} className='h-36 w-full rounded-lg object-cover' />
                <p className='mt-2 truncate text-[11px] font-medium text-ui-text'>{attachment.name}</p>
            </a>
        )
    }

    if (attachment.type === 'application/pdf') {
        return (
            <div className='rounded-lg border border-ui-border bg-ui-raised p-2.5'>
                <iframe title={attachment.name} src={url} className='h-48 w-full rounded-lg bg-ui-canvas' />
                <a href={url} target='_blank' rel='noopener noreferrer' className='mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-ui-text'>
                    {attachment.name}
                    <Forward className='h-3.5 w-3.5' />
                </a>
            </div>
        )
    }

    return (
        <a href={url} target='_blank' rel='noopener noreferrer' className='rounded-lg border border-ui-border bg-ui-raised p-2.5 text-[11px] text-ui-muted transition hover:bg-ui-panel'>
            <p className='truncate font-medium text-ui-text'>{attachment.name}</p>
            <p className='mt-1 text-[10px] text-ui-muted'>{attachment.type} • {prettyBytes(attachment.size)}</p>
        </a>
    )
}

export function withInlineAttachments(message: MailMessage, mailboxUser: string) {
    let html = message.htmlBody
    for (const attachment of message.attachments) {
        if (attachment.cid) {
            const url = mailBlobUrl(mailboxUser, attachment.blobId, attachment.name)
            html = html.replaceAll(`cid:${attachment.cid}`, url)
            html = html.replaceAll(`cid:<${attachment.cid}>`, url)
        }
    }

    return html
}

export function ActionIconButton({ label, icon, onClick, disabled }: { label: string, icon: ReactNode, onClick: () => void, disabled?: boolean }) {
    return (
        <button disabled={disabled} title={label} aria-label={label} className={iconButton} onClick={onClick}>
            {icon}
        </button>
    )
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return btoa(binary)
}

export function MailSketch() {
    return (
        <svg className='pointer-events-none absolute -right-6 bottom-2 h-auto w-44 rotate-[1.5deg] text-ui-muted/20' viewBox='0 0 430 190' aria-hidden='true'>
            <path fill='none' stroke='currentColor' strokeWidth='1.15' strokeLinecap='round' strokeLinejoin='round' d='M31 154 L31 90 L112 63 L197 93 L197 154' />
            <path fill='none' stroke='currentColor' strokeWidth='1.15' strokeLinecap='round' strokeLinejoin='round' d='M31 90 L112 44 L197 93' />
            <path fill='none' stroke='currentColor' strokeWidth='1.15' strokeLinecap='round' strokeLinejoin='round' d='M112 44 L112 154' />
            <path fill='none' stroke='currentColor' strokeWidth='1.15' strokeLinecap='round' strokeLinejoin='round' d='M62 154 V101 H92 V154' />
            <path fill='none' stroke='currentColor' strokeWidth='1.15' strokeLinecap='round' strokeLinejoin='round' d='M128 154 V111 H180 V154' />
            <path fill='none' stroke='currentColor' strokeWidth='0.95' strokeLinecap='round' strokeLinejoin='round' d='M225 147 L225 88 L282 62 L340 88 L340 147' />
            <path fill='none' stroke='currentColor' strokeWidth='0.95' strokeLinecap='round' strokeLinejoin='round' d='M225 88 L282 36 L340 88' />
            <path fill='none' stroke='currentColor' strokeWidth='0.95' strokeLinecap='round' strokeLinejoin='round' d='M250 147 V101 H316 V147' />
            <path fill='none' stroke='currentColor' strokeWidth='0.95' strokeLinecap='round' strokeLinejoin='round' d='M351 151 V100 L382 81 L414 100 V151' />
            <path fill='none' stroke='currentColor' strokeOpacity='0.55' strokeWidth='0.85' strokeLinecap='round' strokeLinejoin='round' d='M16 171 C67 162 102 178 153 167 C204 156 238 174 291 164 C331 156 366 168 419 160' />
        </svg>
    )
}
