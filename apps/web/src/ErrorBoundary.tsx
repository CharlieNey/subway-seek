/**
 * A thrown error in one part of the page shows a plaque there instead of blanking the
 * whole page (DESIGN.md, Loading, connecting and errors: what happened, what's safe, what
 * to do). The page has one around everything, and Street View and the map have their own,
 * since Google's scripts can fail inside them while the round carries on.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Plaque } from "./ui/vocab.tsx";

export class ErrorBoundary extends Component<
  { fallback: (error: Error, reset: () => void) => ReactNode; children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  override render() {
    return this.state.error
      ? this.props.fallback(this.state.error, this.reset)
      : this.props.children;
  }
}

/** The whole page broke: a plaque on the tile field, and a reload. */
export function PageBroke({ error, safe }: { error: Error; safe: string }) {
  return (
    <main className="sc-tilefield flex min-h-screen w-full items-center justify-center bg-glaze p-4 text-ink">
      <Plaque
        className="w-[400px] max-w-full"
        title="This page stopped working"
        safe={safe}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button kind="ink" onClick={() => location.reload()}>
              Reload
            </Button>
          </div>
        }
        details={error.message}
      >
        <p>Something in the page went wrong, and it couldn't carry on drawing.</p>
      </Plaque>
    </main>
  );
}
