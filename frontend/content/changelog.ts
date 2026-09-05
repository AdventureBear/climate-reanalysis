export type ChangelogDay = {
  date: string
  changes: string[]
}

export const changelogEntries: ChangelogDay[] = [
  {
    date: '2026-09-04',
    changes: [
      'Each page reload or refresh resets default values before applying parameters passed in via direct link. This fixes the bug where the map results may not align with the UI settings when clicking on a generated link.  Building and generating directly has always had this behavior. ',
      'Maps now use the unit preferences in the users settings for wind speed (knots vs m/s), accumulation (mm vs inches), and F vs C for temperature, even if the a saved link has different units.   A user can change their own settings if they want to chagne units, the link should not override perferences.'  ],
  },
  {
    date: '2026-09-03',
    changes: [
      'Added a new date mode option of "slice".   Slice looks at one or more hourly time frames (in 3 hour windows corresponding to the synoptic times and the times inbetween), and averages or sums those windows across the series of dates selected. This is an intuitive feature when compositing (averaging) or comparing variables with diurnal fluctuations such as temperature, cloud cover, solar energy and features that may be directly or indirectly related to them such as the Low Level Jet which increases in strength after solar heating is reduced.  Vertical slices of the atmosphere such as a skew-T profile would also be significantly different of created as a time-slice (every day at 12Z) vs a daily composite (00Z, 06Z, 12Z, 18Z averaged).  This is an exciting and needed update!'  ,
    'Improved front end time scale and time/date selection interface, adding  "Slice" as a new date mode.  Prior to this, time scale of Daily, and a single, range or list of dates silently sent an hour (00, 03, 06, 09, 12, 15, 18, 21) to the API as well.  The result was a map that represented a single slice of time across those dates.   In some cases this is what is intended, for example, creating a composite of afternoon temperatures during a heat wave.   We have made this an explicit choice, under the name "Slice", where the list of dates and the selection of 1 or more hours creates a cartesion product of those and averages them together, or in the case of an accumulation variable like Total Preciptation, adds them all together.   ' +
      'We suspect that in the majority of cases, the user wanted the daily composite - the average of the synoptic times (00, 06, 12, 18).   We have corrected this communication between the user interface and the API call, and clearly labeled teh resulting maps.' +
      '/n This affected only 2% of the maps saved in the library.  When those users recall those links in the browser, they will see a popup that explains the slice behavior and gives instructions as well as a direct link to switch to the daily composite mode instead.  ' +
      '/n Of the maps affected, only one style of map appeared to have a significantly different pattern as compared to the daily composite.  These were surface wind speeds over a tropical region and cloud cover, both of which have significant diurnal patterns, so in these cases it may have been exactly what the user intended. ' +
      'One of our leading principals at Pyre Weather is that the methods used for calculations, composites, anomalies and normalized maps are mathematically and scientifically sound, and that our user interface remains clear and easy to understand without ambiguity.  -SMA',
       ]
  },
  {
    date: '2026-09-02',
    changes: [
      'Added a /regions page that lists all available regions, and a preview blank map with coordinates and projection used. Links to the map builder with a new "blank map" option.',
      'Caribbean region added, using Mercator projection'  ],
  },

  {
    date: '2026-08-25',
    changes: [
      'Documented NWS/PSL methodology for calculating climatology & SD based on variable type in project documents',
        'Added PWAT anomaly & Normalization maps using R2 15 day moving average of 1990-2020 climatology, the most scientifically sound option currently based on NWS/PSL documents'
    ],
  },
  {
    date: '2026-08-24',
    changes: [
      'Added user options panel for units and layout, and removed those from each individual variable option. This is going to set us up for an improved more compact UI with room to grow',
        'Updated PWAT scale to represent moisture better (rather than heat)'
    ],
  },
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
