import { useEffect, useRef } from 'react'

const SITE_NAME = 'Vivero Dulcinea'

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | ${SITE_NAME}`
  }, [title])
}

export function useHeadingFocus<T extends HTMLElement>(trigger: string) {
  const headingRef = useRef<T>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [trigger])

  return headingRef
}
