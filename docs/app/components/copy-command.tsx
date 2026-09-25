'use client'

import { useState } from 'react'

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard unavailable (insecure context); the command stays selectable.
        }
      }}
      className="group inline-flex h-11 items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 font-mono text-sm text-foreground hover:border-[var(--accent)] transition-colors"
      aria-label={`Copy install command: ${command}`}
    >
      <span className="text-muted-foreground select-none">$</span>
      <span className="select-all">{command}</span>
      <span className="ml-2 text-xs text-muted-foreground group-hover:text-foreground" aria-live="polite">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  )
}
