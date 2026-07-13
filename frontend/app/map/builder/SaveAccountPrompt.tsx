import { Save, X } from 'lucide-react'

// Friendly account pitch shown when a signed-out user clicks Save on a
// rendered map. Hands off to the AuthModal in signup or login mode.
export function SaveAccountPrompt({ onClose, onCreateAccount, onSignIn }: {
  onClose: () => void
  onCreateAccount: () => void
  onSignIn: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto bg-slate-900 border border-slate-700 rounded-2xl w-[min(96vw,24rem)] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700">
            <span className="inline-flex items-center gap-2 font-semibold text-sm">
              <Save size={15} className="text-sky-300" /> Save this map
            </span>
            <button type="button" onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
              <X size={15} />
            </button>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm leading-relaxed text-slate-300">
              Nice map! To keep it, create a free account. Saved maps live in your
              personal library, ready to reload from any device.
            </p>
            <button type="button" onClick={onCreateAccount}
              className="mt-4 w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 transition-colors">
              Create a free account
            </button>
            <button type="button" onClick={onSignIn}
              className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 transition-colors">
              I already have one, sign me in
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
