'use client'

import dynamic from 'next/dynamic'

// SSR deaktiviert — Three.js braucht browser APIs
const CelestialOrrery = dynamic(
  () => import('../components/CelestialOrrery'),
  { ssr: false }
)

export default function Home() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <CelestialOrrery />
    </div>
  )
}
