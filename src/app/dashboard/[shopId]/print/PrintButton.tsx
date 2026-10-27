'use client'
export function PrintButton({ label }: { label: string }) {
  return <button className="btn btn-sm btn-primary" onClick={() => window.print()}>{label}</button>
}
