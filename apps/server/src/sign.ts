/**
 * Signed Street View Static URLs (DESIGN.md, open question "Sign Street View Static
 * URLs"). The browser key's referrer restriction isn't enforced on requests with no
 * referrer, so the key alone could fetch images; a signature made with a secret only
 * the server holds means a photo URL is good for exactly the photo the game asked for.
 *
 * Google's scheme (developers.google.com/maps/documentation/streetview/digital-signature):
 * HMAC-SHA1 of the URL's path and query, keyed by the URL-safe-base64 secret, appended as
 * `&signature=` in URL-safe base64. `signUrl` reproduces Google's documented example.
 *
 * Once the signing secret is set, the Static Street View API's unsigned quota in the
 * Cloud console can go to 0 (docs/LAUNCH.md).
 */
import { createHmac } from "node:crypto";
import type { HiderView, Photo, SoloView } from "@subway-seek/engine";

/** Google's URL signing: the secret is URL-safe base64; so is the signature. */
export function signUrl(url: string, secret: string): string {
  const u = new URL(url);
  const key = Buffer.from(secret.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const signature = createHmac("sha1", key)
    .update(u.pathname + u.search)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${url}&signature=${signature}`;
}

export interface StaticPhotoOptions {
  /** The browser (Maps JavaScript + Street View Static) key the client uses. */
  key: string;
  /** The URL signing secret from the Cloud console; unsigned when absent. */
  secret?: string | null;
  /** `WxH`, at most 640x640 on the Static API. */
  size?: string;
}

/** The Street View Static image URL for a photo answer, signed when a secret is set. */
export function staticPhotoUrl(
  photo: Photo,
  { key, secret, size = "640x400" }: StaticPhotoOptions,
) {
  const q = new URLSearchParams({
    size,
    pano: photo.pano,
    heading: String(photo.heading),
    pitch: String(photo.pitch),
    fov: String(photo.fov),
    source: "outdoor",
    key,
  });
  const url = `https://maps.googleapis.com/maps/api/streetview?${q}`;
  return secret ? signUrl(url, secret) : url;
}

/**
 * The seeker's view with every photo answer carrying its signed image URL. Pending
 * answers aren't in the view yet, so nothing is signed before it's shown. With no
 * options (no secret configured) the view is returned as is and the client builds
 * unsigned URLs itself.
 */
export function withPhotoUrls<T extends SoloView>(view: T, opts: StaticPhotoOptions | null): T {
  if (!opts) return view;
  let changed = false;
  const asked = view.asked.map((a) => {
    const answer = a.answer;
    if (typeof answer !== "object" || answer === null || !("photo" in answer)) return a;
    changed = true;
    const photo = answer.photo;
    return { ...a, answer: { photo: { ...photo, url: staticPhotoUrl(photo, opts) } } };
  });
  if ("role" in view && view.role === "hider") {
    const h = view as unknown as HiderView;
    return {
      ...view,
      asked,
      spotPhoto: h.spotPhoto ? { ...h.spotPhoto, url: staticPhotoUrl(h.spotPhoto, opts) } : null,
      incoming: h.incoming.map((p) => {
        const a = p.trueAnswer;
        return typeof a === "object" && "photo" in a
          ? { ...p, trueAnswer: { photo: { ...a.photo, url: staticPhotoUrl(a.photo, opts) } } }
          : p;
      }),
    };
  }
  return changed ? { ...view, asked } : view;
}
