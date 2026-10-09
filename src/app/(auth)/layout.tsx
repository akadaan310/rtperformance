import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/brand/rt-mark";
import { IMAGERY } from "@/lib/brand/imagery";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="grain relative hidden overflow-hidden lg:block" aria-hidden>
        <Image src={IMAGERY.auth.src} alt="" fill sizes="50vw" className="object-cover" style={{ objectPosition: IMAGERY.auth.position }} priority />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-ink-950/40" />
        <div className="absolute inset-x-0 bottom-0 z-10 p-12">
          <p className="display text-6xl text-ivory-50">
            Built on discipline.
            <span className="editorial block text-[0.62em] text-gold-300">Engineered for progress.</span>
          </p>
        </div>
      </aside>
      <main id="main" className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="self-start" aria-label="RT Performance home">
          <Wordmark />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
      </main>
    </div>
  );
}
