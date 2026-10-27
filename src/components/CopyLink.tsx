'use client'
import { useState } from 'react'

/** Share button: uses the phone's share sheet when there is one, otherwise copies the link. */
export function CopyLink({ url, label, done }: { url: string; label: string; done: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className="s-btn s-btn-ghost" onClick={async () => {
      try {
        if (navigator.share) { await navigator.share({ url }); return }
        await navigator.clipboard.writeText(url)
        setOk(true); setTimeout(() => setOk(false), 2000)
      } catch { /* cancelled */ }
    }}>{ok ? done : label}</button>
  )
}
