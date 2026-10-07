import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Spinner } from '../ui/feedback';

// Map step (ADDR-001, ADDR-003). Loaded lazily, with mapbox-gl, only when a Mapbox token is configured.

export interface PlaceFill {
  latitude: number;
  longitude: number;
  streetArea?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const LOAD_TIMEOUT_MS = 10_000;
const INDIA_CENTRE: [number, number] = [78.9629, 22.5937];

interface Feature {
  properties: {
    full_address?: string;
    name?: string;
    coordinates: { longitude: number; latitude: number };
    context?: Record<string, { name?: string } | undefined>;
  };
}

async function geocode(path: string, params: Record<string, string>): Promise<Feature[]> {
  const qs = new URLSearchParams({ ...params, country: 'in', access_token: TOKEN ?? '' });
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/${path}?${qs}`, { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`geocoding ${res.status}`);
  return ((await res.json()) as { features: Feature[] }).features ?? [];
}

function toFill(f: Feature | undefined, latitude: number, longitude: number): PlaceFill {
  const c = f?.properties.context ?? {};
  return {
    latitude, longitude,
    streetArea: c['street']?.name ?? c['neighborhood']?.name ?? c['locality']?.name,
    city: c['place']?.name ?? c['district']?.name,
    state: c['region']?.name,
    pincode: c['postcode']?.name,
  };
}

/**
 * Place search, a map with a draggable pin, and "Use my current location". Moving the pin reverse-geocodes
 * it to prefill the details step. Any failure — no token, map not loaded within 10 s, search error or
 * location denied — calls `onFail`, which offers the manual details step (ADDR-003, INT-005).
 */
export default function AddressMapStep({ initial, onConfirm, onFail }: { initial?: { latitude: number; longitude: number } | null; onConfirm: (fill: PlaceFill) => void; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Feature[]>([]);
  const [fill, setFill] = useState<PlaceFill | null>(null);
  const [busy, setBusy] = useState(false);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);

  const place = async (lng: number, lat: number, fly = true) => {
    marker.current?.setLngLat([lng, lat]);
    if (fly) map.current?.flyTo({ center: [lng, lat], zoom: 16 });
    try {
      const [f] = await geocode('reverse', { longitude: String(lng), latitude: String(lat), limit: '1' });
      setFill(toFill(f, lat, lng));
    } catch {
      setFill({ latitude: lat, longitude: lng });
    }
  };

  useEffect(() => {
    if (!TOKEN || !box.current) {
      failRef.current();
      return;
    }
    let done = false;
    const timer = window.setTimeout(() => !done && failRef.current(), LOAD_TIMEOUT_MS);
    try {
      mapboxgl.accessToken = TOKEN;
      const start: [number, number] = initial ? [initial.longitude, initial.latitude] : INDIA_CENTRE;
      const m = new mapboxgl.Map({ container: box.current, style: 'mapbox://styles/mapbox/streets-v12', center: start, zoom: initial ? 16 : 4 });
      map.current = m;
      marker.current = new mapboxgl.Marker({ draggable: true, color: '#b3204b' }).setLngLat(start).addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLngLat();
        void place(p.lng, p.lat, false);
      });
      m.on('load', () => {
        done = true;
        window.clearTimeout(timer);
        setReady(true);
        if (initial) void place(initial.longitude, initial.latitude, false);
      });
      m.on('error', () => !done && failRef.current());
    } catch {
      failRef.current();
    }
    return () => {
      window.clearTimeout(timer);
      map.current?.remove();
    };
    // The map is created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async () => {
    if (query.trim().length < 3) return;
    setBusy(true);
    try {
      setResults(await geocode('forward', { q: query.trim(), limit: '5' }));
    } catch {
      onFail();
    } finally {
      setBusy(false);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) return onFail();
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        void place(pos.coords.longitude, pos.coords.latitude);
      },
      () => {
        setBusy(false);
        onFail(); // location denied (ADDR-003)
      },
      { timeout: LOAD_TIMEOUT_MS },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <form className="relative flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <label htmlFor="place-q" className="sr-only">Search for a place</label>
        <Input id="place-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for your area, street or landmark" disabled={!ready} />
        <Button type="submit" variant="secondary" disabled={!ready} loading={busy && !!query} aria-label="Search"><Search className="size-4" aria-hidden="true" /></Button>
        {results.length > 0 && (
          <ul className="absolute inset-x-0 top-12 z-10 overflow-hidden rounded-md border border-line bg-surface shadow-2">
            {results.map((r) => (
              <li key={`${r.properties.coordinates.longitude},${r.properties.coordinates.latitude}`}>
                <button type="button" className="flex w-full items-start gap-2 px-3 py-2 text-left text-small hover:bg-surface-muted" onClick={() => {
                  setResults([]);
                  void place(r.properties.coordinates.longitude, r.properties.coordinates.latitude);
                }}>
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{r.properties.full_address ?? r.properties.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-muted sm:aspect-[16/9]">
        <div ref={box} className="absolute inset-0" aria-label="Map. Drag the pin to your exact location." role="application" />
        {!ready && <div className="absolute inset-0 flex items-center justify-center"><Spinner label="Loading map" /></div>}
      </div>
      <Button variant="secondary" onClick={locate} disabled={!ready || busy}><LocateFixed className="size-4" aria-hidden="true" />Use my current location</Button>
      {fill && <p className="text-small text-ink-soft"><MapPin className="mr-1 inline size-4" aria-hidden="true" />{[fill.streetArea, fill.city, fill.state, fill.pincode].filter(Boolean).join(', ') || 'Pin placed'}</p>}
      <Button onClick={() => fill && onConfirm(fill)} disabled={!fill}>Confirm location</Button>
    </div>
  );
}
