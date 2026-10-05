/**
 * Loads the Google Maps JavaScript API once. Key: VITE_GOOGLE_MAPS_API_KEY (a browser
 * key restricted to this site and the Maps JS + Street View Static APIs).
 */
let loading: Promise<void> | null = null;

export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export function loadGoogleMaps(): Promise<void> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!GOOGLE_MAPS_KEY) return reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not set"));
    const w = window as unknown as Record<string, unknown>;
    w.__standClearMapsReady = () => resolve();
    // Google calls this when it rejects the key (wrong referrer, API not enabled, quota…).
    w.gm_authFailure = () => console.error("Google Maps rejected the API key");
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly&loading=async&callback=__standClearMapsReady`;
    script.async = true;
    script.onerror = () => reject(new Error("Couldn't load the Google Maps script"));
    document.head.append(script);
  });
  return loading;
}
