

### Project Briefing: Climate-Ocean Reanalysis (CORe) Restoration Project

**Project Vision**
To restore and modernize the research capabilities lost with the decommissioning of legacy NCEP/PSL data interfaces. The project provides a unified engine to "slice and dice" CORe reanalysis data, enabling the creation of custom composites and high-fidelity visualizations across any global region, atmospheric level, or temporal range.

**Core Functional Requirements**
* **Multivariate & Multi-level Access:** Dynamic selection of any variable (e.g., Wind, Temperature, Humidity, Precipitable Water, any variable) across all pressure levels (1000mb to 10mb).
* **High-Efficiency "Surgical" Extraction:** Replicating the logic of the `get_core` protocol to pull only specific byte-ranges of data. This allows for the categorization and collapsing of massive time-series data (months or years) without downloading or processing unnecessary GRIB layers.
* **Advanced Composite Logic:**
    * **6-Hourly Snapshots:** Access to specific synoptic times (00z, 06z, 12z, 18z) for high-resolution event analysis.
    * **Daily/Monthly Composites:** Ability to aggregate multiple dates to find mean atmospheric states.
    * **Seasonal/List-Based Aggregation:** Creating composites from non-consecutive months or custom lists of dates to identify recurring climate patterns.
* **Anomaly & Correlation Mapping:** Real-time calculation of departures from climatological means to visualize how a specific period differs from the historical norm.
* **Statistical Departure Analysis (Anomaly Mapping):** Beyond plotting absolute values, the system must support "Anomaly Mode." This involves subtracting a long-term climatological mean (the "Base Period") from the current reanalysis data to highlight areas of significant departure from the norm.


**User Stories**

1.  **The Synoptic Instructor (Meteo 241 Context):** "As a meteorology instructor, I need to generate 6-hourly plots for specific historical storm events so that students can analyze the evolution of low-level jets and moisture transport at 850mb using the same visual standards found in professional agency research."
2.  **The Climate Researcher (Compositing):** "As a researcher, I need to select a custom list of months from the last decade to create a Monthly Composite, allowing me to visualize the mean temperature anomalies during specific El Niño phases across the North Pacific."
3.  **The Operational Analyst (Daily Means):** "As an analyst, I need to produce a Daily Mean Composite of multiple individual dates where heavy precipitation occurred, so I can identify the consistent atmospheric 'fingerprint' or precursor patterns associated with those events."

---

## Technical Strategy
### Functional Tiers

* **Data Retrieval Tier (Efficiency Focus):** The system implements a two-stage retrieval routine. First, it fetches the `.idx` metadata file to identify byte-offsets. Second, it performs a **Partial Content Request** to pull only the specific atmospheric messages needed for the current routine. This minimizes network throughput and local computation cycles, making large-scale compositing viable on standard hardware.
* **Compute Tier:** A Python-based backend using **Xarray** and **Dask** for high-performance computation, enabling real-time anomaly calculations and multi-date stacking.
* **Visualization Tier:** A robust implementation of **Cartopy** and **Matplotlib** that treats every plot as a "scientific product," complete with verified provenance metadata and high-resolution (200+ DPI) output.

### The Anomaly Engine
* **Climatological Base-Period Integration:** To calculate anomalies, the system maintains (or surgically fetches) a "Climatology" dataset—typically a 30-year average (e.g., 1991–2020) for the specific day and hour being viewed.
* **Delta-Processing Workflow:**
    1.  **Surgical Fetch:** The backend pulls the target field (e.g., 850mb Temperature for May 4, 2026).
    2.  **Climo Pull:** The backend fetches the corresponding 30-year mean for May 4 at the same synoptic hour.
    3.  **The Calculation:** $Anomaly = CurrentValue - MeanValue$.
    4.  **Divergent Visualization:** Anomalies are rendered using a "Divergent" color scale (e.g., Blues for below-normal, Reds for above-normal), centered at zero. the "neutral" color (often white or light grey) represents the climatological mean. This is a standard "quick-glance" feature for researchers to see zero-change zones.
* **Standardized Deviations (Optional Sigma):** The engine is designed to support "Standardized Anomalies" (dividing the delta by the standard deviation), allowing researchers to see how many "sigmas" an event is from the historical average, which is critical for identifying extreme weather events.
  


**Frontend Integration: The Research Console**
The choice of **React** and **Tailwind** for the frontend is driven by the need for a highly interactive "Composite Builder."
* **State Management:** React manages the complex UI state required to select disparate dates and variables, providing immediate validation before triggering the backend "surgical" pull.
* **The Full-Stack Loop:** The frontend sends a specific "Recipe" (e.g., 850mb U/V winds for a specific list of months). The backend uses the byte-range logic to fetch only those layers, collapses them into a mean/anomaly, and streams the final scientific product back to the UI.

### Prior Known Solutions and Drawbacks

**Existing Solution: `get_core.py` (NOAA/NWS/NCEP)**
The current industry-standard tool for accessing the CORe archive is the `get_core.py` script. This Python-based utility allows researchers to query the NOAA Open Data Dissemination (NODD) archive via HTTP and download specific meteorological fields using regular expression (regex) matching against index files (`.idx`).

**Analysis of Limitations & Drawbacks**
While `get_core.py` is a robust tool for data acquisition, it presents several significant drawbacks for a modern, high-interactivity research workstation:

* **File-System Dependency (The "Middleman" Bottleneck):** The existing script is designed as a standalone Command Line Interface (CLI). It requires data to be downloaded to a local directory before it can be used. For high-level routines—such as creating **Daily Mean** or **Monthly Composites**—this forces the system to perform hundreds of "Write-to-Disk" and "Read-from-Disk" operations. This introduces massive latency and unnecessary hardware wear.
* **Lack of Native Computation:** `get_core.py` is a delivery vehicle, not a processing engine. It cannot perform the "Slice and Dice" math (anomalies, means, or wind vector calculations) required for advanced synoptic analysis. Reusing it would require wrapping the script in a secondary layer of logic, leading to "spaghetti code" that is difficult to maintain.
* **Scaling and Memory Constraints:** To analyze a month of 6-hourly data, the existing solution would require downloading 120 full or partial GRIB files. Without a native integration into a multi-dimensional array handler like **Xarray**, the local system would likely encounter RAM saturation when trying to collapse these files into a single statistical product.
* **Infrastructure Mismatch:** The legacy approach relies on external utilities (like `wgrib2`) for indexing. This creates a "fragile" environment where the software's functionality depends on the user having correctly configured local C-libraries, which complicates the deployment of a universal web-based interface.

**The Proposed Advancement: The "Surgical" Retrieval Routine**
Rather than reusing the `get_core.py` code, this project re-implements its **surgical extraction methodology** directly into the application’s backend architecture.


By integrating **Partial Content Requests** (using HTTP Range headers) directly into our FastAPI/Xarray stack, we achieve several critical advantages:
1.  **In-Memory Processing:** Data is fetched from the NOAA/Google Cloud servers and piped directly into memory. This bypasses the local hard drive entirely, allowing for near-instantaneous rendering of complex composites.
2.  **Computational Synergy:** Because the data is loaded directly into a mathematical grid, we can perform anomaly and correlation calculations the moment the bytes arrive.
3.  **Horizontal Scalability:** Our custom routine is built for concurrency. While the old script processes files one-by-one, our architecture can initiate multiple simultaneous surgical pulls, aggregating years of climate data into a single visual product in a fraction of the time.

By adopting the *logic* of the prior solution without inheriting its *architectural baggage*, we ensure the project remains a high-performance, research-grade tool that can scale alongside the increasing complexity of climate reanalysis datasets.

---

### System Design Principles & Scientific Standards

#### 1. Conservation of Visual Meaning (Scale Invariance)
A central pillar of the system is the rejection of "relative" or "normalized" scaling.
* **The Principle:** Visual consistency must be maintained across temporal and spatial shifts. In a standard research environment, a specific color must represent a specific physical value (a "Hard-Coded Anchor") every time.
* **The Benefit:** This allows researchers to compare two different maps side-by-side—even if they are from different years or different regions—and perform an instant visual delta-analysis without checking the legend for scale shifts.

#### 2. Differentiation of Source Provenance
The system must distinguish between direct observational data and model-derived products.
* **The Principle:** Even when variables are stored in the same format (like GRIB2), the interface must recognize the difference between "raw" reanalysis fields and "derived" atmospheric calculations.
* **The Benefit:** This prevents the scientific "conflation" of data types, ensuring the user is always aware of the level of processing applied to the field they are viewing (e.g., distinguishing between a measured temperature and a calculated anomaly).

#### 3. Verification-Driven Metadata (The "Data-Aware" Header)
The visual product is inseparable from its documentation.
* **The Principle:** The map is not a standalone image; it is a "verified record." The system must programmatically extract the temporal and institutional metadata directly from the binary source to generate titles and labels.
* **The Benefit:** This eliminates human labeling error and ensures that any map exported from the system carries a permanent, verifiable "pedigree" or provenance, which is essential for peer-reviewed research and historical comparisons.

#### 4. Geospatial Contextualization (Projection Logic)
The system recognizes that "The Earth is not flat," and different meteorological phenomena require different perspectives.
* **The Principle:** The rendering engine must support a library of Coordinate Reference Systems (CRS) optimized for the research area—such as Mercator for tropical moisture flows, Albers Conical for mid-latitude expanses (US/Eurasia), or Stereographic for high-latitude studies.
* **The Benefit:** By matching the projection to the region, the system minimizes spatial distortion, allowing for accurate distance and area assessments during synoptic analysis.

#### 5. Threshold-Based Visualization (Deterministic Graduation)
The system prioritizes "Decision-Grade" visuals over aesthetic smoothing.
* **The Principle:** Data must be rendered using discrete, stepped color boundaries (normalization) rather than smooth gradients.
* **The Benefit:** This turns every map into a "Contour Analysis" tool. It allows a researcher to identify the exact physical boundary of a weather feature (e.g., a specific wind speed or temperature threshold) at a glance, which is a requirement for replicating the functionality of legacy agency tools.

