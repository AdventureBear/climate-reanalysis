import { REGION_THUMBNAILS } from '../regionThumbnails'

export function RegionThumbnail({ regionKey, selected }: { regionKey: string; selected: boolean }) {
  const src = REGION_THUMBNAILS[regionKey]
  if (!src) return null

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`h-[52px] w-[52px] shrink-0 object-cover ${selected ? 'opacity-95' : 'opacity-85'}`}
    />
  )
}
