'use client'

// Old share links point at "/?variable=...". The builder now lives at /map,
// so forward any recipe-bearing query string there, preserving it verbatim.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { mapRecipeFromUrl } from '../mapRecipe'

export function RecipeRedirect() {
  const router = useRouter()
  useEffect(() => {
    const search = window.location.search
    if (!search) return
    const params = new URLSearchParams(search)
    // mapRecipeFromUrl returns a defaults-filled recipe for ANY non-empty
    // query, so require at least one recipe-defining key before redirecting
    // (otherwise /?utm_source=... and friends would bounce to the builder).
    const recipeKeys = ['variable', 'date', 'months', 'region', 'hour', 'mode']
    if (!recipeKeys.some(k => params.has(k))) return
    if (mapRecipeFromUrl(params)) {
      router.replace('/map' + search)
    }
  }, [router])
  return null
}
