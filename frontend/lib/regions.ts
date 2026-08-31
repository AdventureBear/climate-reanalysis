const query = "http://127.0.0.1:8000/api/get-regions"


export type Region =
    Record<
        string ,
            [
                lon_min: number,
            lon_max: number,
            lat_min: number,
            lat_max: number
            ]
        >


export async function listRegions(): Promise<Region> {
    const res = await fetch(query)

    if (!res.ok) {
        throw new Error(`regions fetch failed: HTTP ${res.status}`)
    } else {
        // console.log(res.json())
        const data = await res.json()
        console.log(data)
        return data  //return regions list
    }
}


