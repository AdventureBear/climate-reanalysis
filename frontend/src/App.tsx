import React, { useState } from 'react';
import { MapContainer, TileLayer, Popup, Rectangle } from 'react-leaflet';
import { Wind } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface AnomalyData {
    status: string;
    grid: {
        lat: number[];
        lon: number[];
        values: number[][]; // This is our 2D wind speed array
    };
}

const App: React.FC = () => {
    const [data, setData] = useState<AnomalyData | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [maxWind, setMaxWind] = useState<number | null>(null);

// Inside your App.tsx component


    const fetchAnomaly = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://127.0.0.1:8000/get-anomaly');
            const result = await response.json();

            // Find the max value in the 2D array sent by Python
            const allValues = result.grid.values.flat();
            const max = Math.max(...allValues);

            setMaxWind(max);
            setData(result);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getColor = (speed: number) => {
        // Converted from Knots to Meters per Second (m/s)
        if (speed >= 41.1) return '#8b5a2b'; // 80 kt+ (Extreme)
        if (speed >= 36.0) return '#cd853f'; // 70 kt
        if (speed >= 30.8) return '#f4a460'; // 60 kt
        if (speed >= 25.7) return '#e9967a'; // 50 kt
        if (speed >= 23.1) return '#d02090'; // 45 kt
        if (speed >= 20.5) return '#ba55d3'; // 40 kt
        if (speed >= 18.0) return '#9370db'; // 35 kt
        if (speed >= 15.4) return '#add8e6'; // 30 kt
        if (speed >= 12.8) return '#b0e0e6'; // 25 kt
        if (speed >= 10.3) return '#f0f8ff'; // 20 kt
        return 'transparent';              // Below ~20kt / 10m/s
    };

    return (
        <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
            <header style={{
                padding: '1rem',
                background: '#1a202c',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Wind size={32} color="#63b3ed" />
                    <h1 style={{ fontSize: '1.5rem', margin: 0 }}>PyRe: Climate Reanalysis</h1>
                </div>
                <button
                    onClick={fetchAnomaly}
                    style={{
                        padding: '0.6rem 1.2rem',
                        borderRadius: '6px',
                        background: '#3182ce',
                        color: 'white',
                        border: 'none',
                        fontWeight: 'bold',
                        cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                    disabled={loading}
                >
                    {loading ? 'Processing GRIB...' : 'Analyze 850mb Jet'}
                </button>
            </header>

            <main style={{ flex: 1, position: 'relative' }}>
                <MapContainer center={[38, -97]} zoom={4} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                    {data && data.grid.values.map((row, i) =>
                        row.map((speed, j) => {
                            // Only plot if there's significant wind to keep it fast
                            if (speed < 5) return null;

                            const lat = data.grid.lat[i];
                            const lon = data.grid.lon[j];

                            return (
                                <Rectangle
                                    key={`${i}-${j}`}
                                    bounds={[
                                        [lat, lon],
                                        [lat - 0.5, lon + 0.5] // Adjust based on your GRIB resolution
                                    ]}
                                    pathOptions={{
                                        fillColor: getColor(speed),
                                        fillOpacity: 0.6,
                                        stroke: false
                                    }}
                                >
                                    <Popup>Speed: {speed.toFixed(1)} m/s</Popup>
                                </Rectangle>
                            );
                        })
                    )}
                </MapContainer>
            </main>
        </div>
    );
};

export default App;