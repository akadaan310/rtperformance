import { ButtonLink } from "@/components/ui/button";
import { RTMark } from "@/components/brand/rt-mark";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <RTMark className="mx-auto h-12 w-12" />
        <p className="eyebrow mt-8">404 · Not found</p>
        <h1 className="display mt-3 text-5xl text-ivory-50">Nothing here.</h1>
        <p className="mt-4 text-sm leading-relaxed text-stone-400">
          The page doesn&apos;t exist, or you don&apos;t have access to it. If you followed a link from your coach, sign in with the email address they invited.
        </p>
        <div className="mt-8 flex justify-center gap-2">
          <ButtonLink href="/home">Go to my workspace</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Home
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
