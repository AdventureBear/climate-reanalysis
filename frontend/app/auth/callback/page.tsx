'use client'

import { Suspense } from 'react'
import AuthCallback from '../../../auth/AuthCallback'

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <AuthCallback />
    </Suspense>
  )
}
