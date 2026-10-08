/**
 * Page not found (DESIGN.md, Loading, connecting and errors): the homepage's look, a "Not
 * in service" tablet, one line, and two ways back.
 */
import { useEffect } from "react";
import { NameTablet } from "../ui/NameTablet.tsx";
import "./home.css";

export function NotFound() {
  useEffect(() => {
    document.title = "Not in service · Stand Clear";
  }, []);
  return (
    <div className="hp">
      <header className="hp-top">
        <div className="hp-wrap">
          <a className="hp-brand" href="/" aria-label="Stand Clear home">
            <i aria-hidden="true" />
            Stand Clear
          </a>
        </div>
      </header>
      <main className="hp-wrap hp-hero">
        <div className="hp-wall sc-tilefield">
          <div className="hp-wall-tab">
            <NameTablet text="Not in service" rows={14} maxWidth={760} />
          </div>
          <div className="hp-lost">
            <p className="hp-lede">There's no page at this address.</p>
            <div className="hp-ctas">
              <a className="sc-btn ink hp-btn-lg" href="/play?daily">
                Play today's daily
              </a>
              <a className="sc-btn hp-btn-lg" href="/">
                Home
              </a>
            </div>
          </div>
          <div className="hp-hero-wains sc-wains-field" />
        </div>
      </main>
    </div>
  );
}
