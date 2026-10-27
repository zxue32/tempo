'use client'
import { useEffect } from 'react'
import { track } from './track'

export function Track({ slug, step }: { slug: string; step: 'store' | 'start' | 'time' | 'details' }) {
  useEffect(() => { track(slug, step) }, [slug, step])
  return null
}
