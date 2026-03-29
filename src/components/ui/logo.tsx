'use client'

import { useEffect, useState } from 'react'

type LogoSize = 16 | 28 | 48 | 88

interface LogoProps {
  size?: LogoSize
  className?: string
}

export default function Logo({ size = 48, className }: LogoProps) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Check initial state
    setIsDark(document.documentElement.classList.contains('dark'))

    // Watch for changes
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  const theme = isDark ? 'dark' : 'light'
  const src = `/logos/${theme}-${size}.svg`
  const px = size === 16 ? 16 : size === 28 ? 28 : size === 48 ? 48 : 88

  return (
    <img
      src={src}
      alt="Takrar"
      width={px}
      height={px}
      className={className}
    />
  )
}
