const query = "http://127.0.0.1:8000/api/get-regions"

export type Region = string

export async function listRegions(): Promise<Region[]> {
    const res = await fetch(query)

    if (!res.ok) {
        throw new Error(`regions fetch failed: HTTP ${res.status}`)
    }
    const regions = await res.json()
    return regions
}


