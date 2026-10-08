import { useEffect } from 'react'

let users = 0

function update() {
  const vv = window.visualViewport
  if (!vv) return
  const style = document.documentElement.style
  style.setProperty('--vv-top', `${vv.offsetTop}px`)
  style.setProperty('--vv-height', `${vv.height}px`)
}

/**
 * Publishes the visible part of the screen as `--vv-top` and `--vv-height` on the root element. iOS Safari doesn't
 * shrink the page for the on-screen keyboard; it pans over it, so anything pinned to the full screen height slides
 * partly out of reach. Sizing to these variables keeps a fixed panel inside what the user can actually see.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    if (users++ === 0) {
      update()
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
    }
    return () => {
      if (--users > 0) return
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--vv-top')
      document.documentElement.style.removeProperty('--vv-height')
    }
  }, [])
}
