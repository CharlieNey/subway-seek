import type { SoloView } from "@subway-seek/engine";
import { describe, expect, it } from "vitest";
import { signUrl, staticPhotoUrl, withPhotoUrls } from "./sign.ts";

describe("signUrl", () => {
  it("reproduces Google's documented example", () => {
    // From Google's URL-signing documentation: this URL and private key give this signature.
    const signed = signUrl(
      "https://maps.googleapis.com/maps/api/geocode/json?address=New+York&client=clientID",
      "vNIXE0xscrmjlyV-12Nj_BvUPaw=",
    );
    expect(signed.endsWith("&signature=chaRF2hTJKOScPr-RQCEhZbSzIE=")).toBe(true);
  });

  it("signs the path and query only, so the host can't be swapped for a signed one", () => {
    const secret = "vNIXE0xscrmjlyV-12Nj_BvUPaw=";
    const a = signUrl("https://maps.googleapis.com/x?y=1", secret);
    const b = signUrl("https://evil.example/x?y=1", secret);
    expect(a.split("signature=")[1]).toBe(b.split("signature=")[1]);
    expect(signUrl("https://maps.googleapis.com/x?y=2", secret).split("signature=")[1]).not.toBe(
      a.split("signature=")[1],
    );
  });
});

describe("staticPhotoUrl", () => {
  const photo = { pano: "abc123", heading: 90, pitch: 5, fov: 90 };

  it("builds the Static API URL for the photo the game asked for", () => {
    const url = new URL(staticPhotoUrl(photo, { key: "K" }));
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/streetview");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      size: "640x400",
      pano: "abc123",
      heading: "90",
      pitch: "5",
      fov: "90",
      source: "outdoor",
      key: "K",
    });
    expect(url.searchParams.has("signature")).toBe(false);
  });

  it("signs every photo answer in a view and leaves the rest alone", () => {
    const view = {
      asked: [
        { q: { kind: "radar", miles: 1 }, answer: false, at: 0, answerAt: 60 },
        { q: { kind: "photo", from: "spot", look: "N" }, answer: { photo }, at: 0, answerAt: 60 },
        {
          q: { kind: "photo", from: "exit", look: "E" },
          answer: { vetoed: true },
          at: 0,
          answerAt: 60,
        },
      ],
    } as unknown as SoloView;
    const signed = withPhotoUrls(view, { key: "K", secret: "vNIXE0xscrmjlyV-12Nj_BvUPaw=" });
    const [radar, spot, vetoed] = signed.asked as { answer: unknown }[];
    expect(radar?.answer).toBe(false);
    const spotAnswer = spot?.answer as { photo: { url?: string } } | undefined;
    expect(spotAnswer?.photo.url).toMatch(/signature=/);
    expect(vetoed?.answer).toEqual({ vetoed: true });
    expect(withPhotoUrls(view, null)).toBe(view);
  });

  it("appends a signature when a secret is set", () => {
    const url = new URL(
      staticPhotoUrl(photo, { key: "K", secret: "vNIXE0xscrmjlyV-12Nj_BvUPaw=" }),
    );
    expect(url.searchParams.get("signature")).toMatch(/^[A-Za-z0-9_-]+=*$/);
  });
});
