import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// Password field with a show/hide toggle, shared by the auth modal and the
// reset-password page. Visibility is per-field; autoComplete tells password
// managers whether this is a new or an existing credential.
export function PasswordInput({ value, onChange, autoComplete, minLength }: {
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  minLength?: number
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input type={visible ? 'text' : 'password'} required minLength={minLength}
        value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete}
        className="input w-full pr-9" />
      <button type="button" onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-slate-200 cursor-pointer">
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}
