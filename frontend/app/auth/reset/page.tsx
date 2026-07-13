'use client'

import { Suspense } from 'react'
import ResetPasswordPage from '../../../auth/ResetPasswordPage'

export default function AuthResetPage() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  )
}
