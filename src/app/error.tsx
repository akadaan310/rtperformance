"use client";
import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="display mt-3 text-5xl text-ivory-50">Reset and go again.</h1>
        <p className="mt-4 text-sm text-stone-400">An unexpected error interrupted this page. Your saved data is safe.</p>
        <div className="mt-8 flex justify-center">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
