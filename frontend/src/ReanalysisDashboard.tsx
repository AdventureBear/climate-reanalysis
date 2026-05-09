import { useState } from 'react';
import { Settings, Calendar, Globe, BarChart3, Info, ChevronDown, Map as MapIcon } from 'lucide-react';

type AnalysisMode = '6-hourly' | 'daily' | 'monthly';

const ReanalysisDashboard = () => {
    // Core State66
    const [mode, setMode] = useState<AnalysisMode>('6-hourly');
    const [variable, setVariable] = useState('hgt');
    const [level, setLevel] = useState('1000mb');
    const [plotType, setPlotType] = useState('mean');

    // Spatial State
    const [region, setRegion] = useState('custom');
    const [bounds, setBounds] = useState({ lowLat: '-90', highLat: '90', westLon: '0', eastLon: '360' });

    // Temporal State
    const [dates, setDates] = useState([{ year: '2024', month: '01', day: '01', hour: '00' }]);
    const [seasonalRange, setSeasonalRange] = useState({ startYear: '1948', endYear: '2024', startMonth: '1', endMonth: '12' });

    // Unified API URL Constructor
    const constructUrl = () => {
        const baseUrl = "http://127.0.0.1:8000/api/get-map";

        // Formatting time based on the active mode
        let timeParam = "";
        if (mode === 'monthly') {
            timeParam = `${seasonalRange.startYear}-${seasonalRange.endYear}_M${seasonalRange.startMonth}-${seasonalRange.endMonth}`;
        } else {
            // Joins dates into a string: YYYYMMDDHH or YYYYMMDD
            timeParam = dates.map(d =>
                `${d.year}${d.month.padStart(2, '0')}${d.day.padStart(2, '0')}${mode === '6-hourly' ? d.hour.replace('z','') : ''}`
            ).join(',');
        }

        const params = new URLSearchParams({
            mode: mode,
            variable: variable,
            level: level.replace('mb', ''),
            plot: plotType,
            range: timeParam,
            lat: `${bounds.lowLat},${bounds.highLat}`,
            lon: `${bounds.westLon},${bounds.eastLon}`
        });

        const finalUrl = `${baseUrl}?${params.toString()}`;
        console.log("Requesting Python Backend:", finalUrl);
        // return finalUrl; // Or fetch(finalUrl)...
    };

    return (
        <div className="max-w-6xl mx-auto p-4 lg:p-8 bg-slate-50 min-h-screen text-slate-800">
            <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">PyRe <span className="font-light text-blue-600">Reanalysis</span></h1>
                    <p className="text-xs text-slate-500 font-mono italic">target: /api/get-map</p>
                </div>
                <div className="flex gap-4">
                    {['6-hourly', 'daily', 'monthly'].map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m as AnalysisMode)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                                mode === m ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 hover:bg-slate-100'
                            }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* DATA SOURCE CARD */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h2 className="flex items-center gap-2 text-sm font-bold uppercase mb-4 text-slate-400">
                            <BarChart3 size={16} /> Dataset Configuration
                        </h2>
                        <div className="space-y-4">
                            <div className="group">
                                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Variable</label>
                                <select
                                    className="w-full bg-slate-100 p-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    value={variable}
                                    onChange={(e) => setVariable(e.target.value)}
                                >
                                    <option value="hgt">Geopotential Height</option>
                                    <option value="air">Air Temperature</option>
                                    <option value="uwnd">U-Wind Speed</option>
                                    <option value="vwnd">V-Wind Speed</option>
                                    <option value="pr_wtr">Precipitable Water</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Level (hPa)</label>
                                <select
                                    className="w-full bg-slate-100 p-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500"
                                    value={level}
                                    onChange={(e) => setLevel(e.target.value)}
                                >
                                    {[1000, 850, 700, 500, 300, 200, 100].map(l => (
                                        <option key={l} value={`${l}mb`}>{l} mb</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h2 className="flex items-center gap-2 text-sm font-bold uppercase mb-4 text-slate-400">
                            <Globe size={16} /> Spatial Domain
                        </h2>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <input
                                type="number" placeholder="Min Lat" className="p-3 bg-slate-100 rounded-xl outline-none"
                                value={bounds.lowLat} onChange={(e) => setBounds({...bounds, lowLat: e.target.value})}
                            />
                            <input
                                type="number" placeholder="Max Lat" className="p-3 bg-slate-100 rounded-xl outline-none"
                                value={bounds.highLat} onChange={(e) => setBounds({...bounds, highLat: e.target.value})}
                            />
                            <input
                                type="number" placeholder="West Lon" className="p-3 bg-slate-100 rounded-xl outline-none"
                                value={bounds.westLon} onChange={(e) => setBounds({...bounds, westLon: e.target.value})}
                            />
                            <input
                                type="number" placeholder="East Lon" className="p-3 bg-slate-100 rounded-xl outline-none"
                                value={bounds.eastLon} onChange={(e) => setBounds({...bounds, eastLon: e.target.value})}
                            />
                        </div>
                        <p className="mt-3 text-[10px] text-slate-400 italic">Coordinates follow GRIB standard (0-360 Lon)</p>
                    </div>
                </div>

                {/* TEMPORAL & SUBMIT CARD */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[300px] flex flex-col">
                        <h2 className="flex items-center gap-2 text-sm font-bold uppercase mb-4 text-slate-400">
                            <Calendar size={16} /> Temporal Range
                        </h2>

                        <div className="flex-grow">
                            {mode === 'monthly' ? (
                                <div className="grid grid-cols-2 gap-8 py-4">
                                    <div className="space-y-4">
                                        <label className="text-xs font-bold block">Years</label>
                                        <div className="flex gap-2">
                                            <input type="number" value={seasonalRange.startYear} className="w-full p-3 bg-slate-100 rounded-xl" />
                                            <span className="self-center">to</span>
                                            <input type="number" value={seasonalRange.endYear} className="w-full p-3 bg-slate-100 rounded-xl" />
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <label className="text-xs font-bold block">Months</label>
                                        <div className="flex gap-2">
                                            <select className="w-full p-3 bg-slate-100 rounded-xl"><option>January</option></select>
                                            <span className="self-center">to</span>
                                            <select className="w-full p-3 bg-slate-100 rounded-xl"><option>December</option></select>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {dates.map((d, i) => (
                                        <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-left-2">
                                            <input className="w-24 p-3 bg-slate-100 rounded-xl" value={d.year} />
                                            <input className="w-16 p-3 bg-slate-100 rounded-xl" value={d.month} />
                                            <input className="w-16 p-3 bg-slate-100 rounded-xl" value={d.day} />
                                            {mode === '6-hourly' && (
                                                <select className="w-24 p-3 bg-slate-100 rounded-xl" value={d.hour}>
                                                    <option>00z</option><option>06z</option><option>12z</option><option>18z</option>
                                                </select>
                                            )}
                                            <button onClick={() => setDates(dates.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500 transition-colors px-2 text-xl">×</button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => setDates([...dates, { year: '2024', month: '01', day: '01', hour: '00' }])}
                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase mt-4"
                                    >
                                        + Add Time Step
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                            <div className="flex gap-2">
                                {['mean', 'anomaly', 'climo'].map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setPlotType(t)}
                                        className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter border-2 transition-all ${
                                            plotType === t ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-100 text-slate-400'
                                        }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={constructUrl}
                                className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-600 hover:shadow-xl hover:shadow-blue-200 transition-all flex items-center gap-2"
                            >
                                <MapIcon size={14} /> Generate Analysis
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReanalysisDashboard;