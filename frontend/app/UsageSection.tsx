// Usage and attribution FAQ, the last section of the landing page.
// No em-dashes.
const USES = [
  {
    q: 'School projects?',
    a: 'Yes. No attribution needed.',
  },
  {
    q: 'Blog posts?',
    a: 'Yes. Please link to the PyRe home page in the body of your post.',
  },
  {
    q: 'Social media?',
    a: 'Yes. We know how onerous links are in social posts. For two or three maps per post there is no need to link back, but we appreciate it when you can.',
  },
  {
    q: 'Videos and YouTube?',
    a: 'Yes, we would love it if you used our maps! Please put a link to the home page in the description of your video.',
  },
  {
    q: 'Personal use, just to have?',
    a: 'Yes. No attribution needed, no permission to request.',
  },
  {
    q: 'Commercial use?',
    a: 'Yes. Create an account and email suzyq@pyreweather.org so we know where the maps are being used. We will add you to the Collaborators section of the About page, and you can link back to PyRe from the credits of your article or video.',
  },
]

export function UsageSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-14">
      <h2 className="text-center text-2xl font-bold text-slate-100">Can I use these maps for...</h2>
      <div className="mx-auto mt-6 grid max-w-4xl gap-x-10 gap-y-5 sm:grid-cols-2">
        {USES.map(u => (
          <div key={u.q}>
            <h3 className="text-base font-semibold text-sky-300">{u.q}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{u.a}</p>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-10 max-w-2xl text-center text-base leading-relaxed text-slate-200">
        If you love how easy it is to make atmospheric maps, please share them with friends,
        on social media, with your professors and with your students.
      </p>
    </section>
  )
}
