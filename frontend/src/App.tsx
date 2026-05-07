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

interface MapData {
    status: string;
    grid: {
        lat: number[];
        lon: number[];
        values: number[][]; // This is our 2D wind speed array
    };
}

const App: React.FC = () => {
    const [data, setData] = useState<MapData | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

// Inside your App.tsx component


    const fetchMap = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://127.0.0.1:8000/get-map');
            const result = await response.json();

            setData(result);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getColor = (speed: number) => {
        // Converted from Knots to Meters per Second (m/s)
        if (speed >= 41.1) return '#a15d0a'; // 80 kt+ (Extreme)
        if (speed >= 39.0) return '#8b5a2b'; // 75 kt
        if (speed >= 36.0) return '#faf061'; // 70 kt
        if (speed >= 31.0) return '#faf061'; // 65 kt
        if (speed >= 30.8) return '#f04f4f'; // 60 kt
        if (speed >= 28.2) return '#de2a3c'; // 55 kt
        if (speed >= 25.7) return '#c90028'; // 50 kt
        if (speed >= 23.1) return '#a11397'; // 45 kt
        if (speed >= 20.5) return '#c95bbe'; // 40 kt
        if (speed >= 18.0) return '#e695db'; // 35 kt
        if (speed >= 15.4) return '#6b5acc'; // 30 kt
        if (speed >= 12.8) return '#87cefa'; // 25 kt
        if (speed >= 10.3) return '#f2f9ff'; // 20 kt
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
                    onClick={fetchMap}
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