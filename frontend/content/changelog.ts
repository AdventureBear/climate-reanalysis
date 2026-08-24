export type ChangelogDay = {
  date: string
  changes: string[]
}

export const changelogEntries: ChangelogDay[] = [
  {
    date: '2026-08-23',
    changes: [
      'Added lifted index, relative vorticity, storm helicity index, storm motion and wind gust variables'
    ],
  },
  {
    date: '2026-08-21',
    changes: [
      'Added accumulated precipitation, cloud-cover layers, and radiation flux maps to the map builder.',
    ],
  },
  {
    date: '2026-08-01',
    changes: [
      'Improved wind barbs, vectors, isotachs, and overlay defaults.',
    ],
  },
  {
    date: '2026-07-30',
    changes: [
      'Added a climatology source setting for anomaly and climatology maps.',
    ],
  },

  {
    date: '2026-07-27',
    changes: [
      'Updated wind anomaly overlays so barbs and vectors show anomaly winds instead of actual winds.',
    ],
  },

  {
    date: '2026-07-20',
    changes: [
      'Added the Synopsis section in order to post about  weather events, with feature to insert generated or saved maps.',
    ],
  },
  {
    date: '2026-07-09',
    changes: [
      'Added contour overlays for pressure, height, and temperature.',
      'Added H/L pressure-center markers.',
      'Added isotachs and more flexible wind overlay controls.',
    ],
  },
  {
    date: '2026-07-08',
    changes: [
      'Added new map variables including omega, precipitation rate, OLR, CAPE, CIN, 2m dewpoint, absolute vorticity, and snow depth.',
      'Added surface-variable climatology support for anomaly and climatology maps.',
    ],
  },
  {
    date: '2026-07-07',
    changes: [
      'Added accounts and saved map libraries, sign-in, password reset, privacy, and terms pages.',
    ],
  },
  {
    date: '2026-07-03',
    changes: [
      'Added 3-hourly map support.',
    ],
  },

  {
    date: '2026-05-14',
    changes: [
      'Added region thumbnails and improved regional and hemisphere map projections.',
    ],
  },
  {
    date: '2026-05-13',
    changes: [
      'Added wind-vector anomaly maps for tropical and monsoon analysis.',
      'Added knots and meters-per-second options for wind maps.'
    ],
  },

  {
    date: '2026-05-08',
    changes: [
      'Added Albers map projection, fixed color scales, relative humidity maps, and wind overlays.',
    ],
  },
  {
    date: '2026-05-07',
    changes: [
      'Created server side rendering of map image',
    ],
  },
  {
    date: '2026-05-06',
    changes: [
      'Project creation',
        'Fetch a grib2 file and calculate wind speed for a location',
        'plot wind speed on a leaflet map'
    ],
  }
]
