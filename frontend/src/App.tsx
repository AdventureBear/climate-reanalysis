import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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
    variables: string[];
    file_used: string;
}

const App: React.FC = () => {
    const [data, setData] = useState<AnomalyData | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    const fetchAnomaly = async (): Promise<void> => {
        setLoading(true);
        try {
            // Ensure your backend is running on 8000!
            const response = await fetch('http://127.0.0.1:8000/get-anomaly');
            if (!response.ok) throw new Error('Network response was not ok');
            const result: AnomalyData = await response.json();
            setData(result);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
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
                <MapContainer
                    center={[39.82, -98.57]}
                    zoom={4}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {data && (
                        <Marker position={[39.82, -98.57]}>
                            <Popup>
                                <strong>CORE Model Success</strong> <br />
                                File: {data.file_used} <br />
                                Found: {data.variables.join(', ')}
                            </Popup>
                        </Marker>
                    )}
                </MapContainer>
            </main>
        </div>
    );
};

export default App;