'use client'

import { Suspense } from 'react'
import ResetPasswordPage from '../ResetPasswordPage'

export default function AuthResetPage() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  )
}
