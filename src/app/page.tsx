import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { RTMark, Wordmark } from "@/components/brand/rt-mark";
import { ButtonLink } from "@/components/ui/button";
import { IMAGERY } from "@/lib/brand/imagery";
import { getSessionUser } from "@/lib/auth/context";
import { isSupabaseConfigured } from "@/lib/env";

const PRIMARY_SLUG = process.env.NEXT_PUBLIC_PRIMARY_WORKSPACE_SLUG;

export default async function LandingPage() {
  const user = isSupabaseConfigured() ? await getSessionUser() : null;
  return (
    <div className="bg-ink-950 text-ivory-100">
      <SiteHeader signedIn={Boolean(user)} />
      <main id="main">
        <Hero signedIn={Boolean(user)} />
        <Philosophy />
        <Programming />
        <TechGuy />
        <AthleteExperience />
        <Network />
        <ClosingCta signedIn={Boolean(user)} />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
        <Link href="/" aria-label="RT Performance home">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-8 text-xs font-semibold uppercase tracking-[0.18em] text-ivory-200 lg:flex">
          <a href="#philosophy" className="hover:text-accent">Philosophy</a>
          <a href="#programming" className="hover:text-accent">Programming</a>
          <a href="#tech-guy" className="hover:text-accent">The Tech Guy</a>
          <a href="#athletes" className="hover:text-accent">Athletes</a>
          <a href="#coaches" className="hover:text-accent">Coaches</a>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <ButtonLink href="/home" size="sm">
              My workspace
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                Sign in
              </ButtonLink>
              <ButtonLink href="/login" size="sm">
                Enter
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="grain relative flex min-h-[100svh] items-end overflow-hidden" aria-labelledby="hero-title">
      <Image src={IMAGERY.hero.src} alt={IMAGERY.hero.alt} fill priority sizes="100vw" className="object-cover" style={{ objectPosition: IMAGERY.hero.position }} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/45 to-ink-950/10" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-ink-950/75 via-ink-950/10 to-transparent" />
      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 pt-40 md:px-8 md:pb-24">
        <p className="eyebrow animate-rise text-gold-300">Raymond Tate Performance · Tampa, Florida</p>
        <h1 id="hero-title" className="display mt-5 max-w-5xl animate-rise text-[clamp(3.25rem,10vw,9rem)] text-ivory-50 [animation-delay:80ms]">
          Discipline creates momentum.
          <span className="editorial mt-2 block text-[0.62em] leading-[1.05] text-gold-300">Progress makes it measurable.</span>
        </h1>
        <div className="mt-8 grid max-w-5xl animate-rise gap-8 [animation-delay:160ms] md:grid-cols-[1.2fr_1fr] md:items-end">
          <p className="max-w-xl text-base leading-relaxed text-ivory-200 md:text-lg">
            Personal training built around intentional programming, consistent execution, and intelligent adjustment.
          </p>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <ButtonLink href={signedIn ? "/home" : "/login"} size="lg">
              {signedIn ? "Open my workspace" : "Sign in to train"} <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            {PRIMARY_SLUG ? (
              <ButtonLink href={`/t/${PRIMARY_SLUG}`} variant="secondary" size="lg">
                Meet Raymond
              </ButtonLink>
            ) : (
              <ButtonLink href="#philosophy" variant="secondary" size="lg">
                The method
              </ButtonLink>
            )}
          </div>
        </div>
        <div className="rule-accent mt-14 w-full opacity-70" />
        <dl className="mt-6 grid grid-cols-2 gap-6 text-xs uppercase tracking-[0.18em] text-stone-400 md:grid-cols-4">
          {[
            ["Relentless", "Training"],
            ["Intelligent", "Progress"],
            ["Planned vs.", "Performed"],
            ["Coach-led", "Always"],
          ].map(([a, b]) => (
            <div key={a}>
              <dt className="text-ivory-100">{a}</dt>
              <dd>{b}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function SectionLabel({ index, label, onLight = false }: { index: string; label: string; onLight?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <span className={`display-tight text-sm ${onLight ? "text-gold-700" : "text-accent"}`}>{index}</span>
      <span className="h-px w-10 bg-ink-600" aria-hidden />
      <span className="eyebrow">{label}</span>
    </div>
  );
}

function Philosophy() {
  const pillars = [
    { title: "Discipline", body: "Show up, execute the plan, record what actually happened. Consistency compounds before talent does." },
    { title: "Deliberate progression", body: "Load, volume and complexity rise on purpose — week over week, written down before the work begins." },
    { title: "Intelligent adjustment", body: "Real training data informs the next decision. When life or the body says otherwise, the plan adapts." },
  ];
  return (
    <section id="philosophy" className="relative bg-ivory-50 text-ink-900" aria-labelledby="philosophy-title">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 md:grid-cols-12 md:px-8 [&>*]:min-w-0 md:py-32">
        <div className="md:col-span-7">
          <div className="[--color-stone-400:#5d584f]">
            <SectionLabel index="01" label="The philosophy" onLight />
          </div>
          <h2 id="philosophy-title" className="display mt-8 text-5xl text-ink-950 md:text-7xl">
            Relentless training.
            <span className="editorial block text-[0.7em] text-gold-700">Intelligent progress.</span>
          </h2>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-700">
            RT Performance is Raymond Tate&apos;s coaching method made into a system: built on discipline, engineered for progress, and honest about what the
            numbers say.
          </p>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xs border border-ink-900/10 bg-ink-900/10 sm:grid-cols-3">
            {pillars.map((p, i) => (
              <li key={p.title} className="bg-ivory-50 p-6">
                <span className="display-tight text-3xl text-gold-700">0{i + 1}</span>
                <h3 className="mt-4 text-sm font-bold uppercase tracking-[0.14em] text-ink-950">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <figure className="relative md:col-span-5">
          <div className="relative aspect-[3/4] overflow-hidden rounded-xs">
            <Image src={IMAGERY.philosophy.src} alt={IMAGERY.philosophy.alt} fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover grayscale" style={{ objectPosition: IMAGERY.philosophy.position }} />
          </div>
          <figcaption className="mt-3 text-[11px] uppercase tracking-[0.2em] text-ink-500">The work is the method.</figcaption>
        </figure>
      </div>
    </section>
  );
}

function Programming() {
  const spec = [
    ["A1", "Back Squat", "4 × 5", "RPE 7", "3010", "3:00"],
    ["A2", "Romanian Deadlift", "3 × 8", "RPE 7", "3010", "2:00"],
    ["B1", "One-Arm Dumbbell Row", "3 × 10", "—", "2011", "1:00"],
    ["B2", "Plank", "3 × 40s", "—", "—", "0:45"],
  ];
  return (
    <section id="programming" className="relative overflow-hidden border-t border-ink-800" aria-labelledby="programming-title">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 py-24 md:grid-cols-12 md:px-8 [&>*]:min-w-0 md:py-32">
        <div className="md:col-span-5">
          <SectionLabel index="02" label="Structured programming" />
          <h2 id="programming-title" className="display mt-8 text-5xl text-ivory-50 md:text-6xl">
            Every rep has a reason.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-stone-300">
            Multi-week programs with exact sets, reps, load targets, tempo, rest and progression. Templates stay separate from what each athlete was
            actually assigned, so history is never rewritten.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-ivory-200">
            {[
              "Versioned programs — published plans are locked; revisions create a new version",
              "Planned values and performed values recorded side by side",
              "Attendance, adherence, personal records and trends calculated from real logs",
              "Substitutions that respect equipment and athlete-reported limitations",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden className="mt-2 h-px w-4 shrink-0 bg-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-7">
          <div className="relative aspect-[16/10] overflow-hidden rounded-xs">
            <Image src={IMAGERY.programming.src} alt={IMAGERY.programming.alt} fill sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/20 to-transparent" />
          </div>
          <div className="surface-raised relative -mt-24 ml-4 mr-4 p-5 md:-mt-28 md:ml-12 md:mr-0">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">Example prescription · Day 1 · Lower strength</p>
              <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Illustrative</span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <caption className="sr-only">An example session showing how prescriptions are written</caption>
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
                    <th className="pb-2 font-semibold">Block</th>
                    <th className="pb-2 font-semibold">Exercise</th>
                    <th className="pb-2 font-semibold">Sets × reps</th>
                    <th className="pb-2 font-semibold">Load</th>
                    <th className="pb-2 font-semibold">Tempo</th>
                    <th className="pb-2 font-semibold">Rest</th>
                  </tr>
                </thead>
                <tbody>
                  {spec.map(([b, n, sr, l, t, r]) => (
                    <tr key={n} className="border-t border-ink-700/80">
                      <td className="py-2.5 font-semibold text-accent">{b}</td>
                      <td className="py-2.5 text-ivory-50">{n}</td>
                      <td className="py-2.5">{sr}</td>
                      <td className="py-2.5">{l}</td>
                      <td className="py-2.5 text-stone-400">{t}</td>
                      <td className="py-2.5 text-stone-400">{r}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TechGuy() {
  const prompts = [
    "Create a beginner three-day strength program.",
    "Show me the athletes who missed two scheduled sessions.",
    "Summarize my coaching week.",
    "Revise this program based on the last four weeks of recorded performance.",
  ];
  return (
    <section id="tech-guy" className="relative border-t border-ink-800 bg-ink-900" aria-labelledby="techguy-title">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 py-24 md:grid-cols-12 md:px-8 [&>*]:min-w-0 md:py-32">
        <div className="md:col-span-6">
          <SectionLabel index="03" label="Intelligent coaching assistance" />
          <h2 id="techguy-title" className="display mt-8 text-5xl text-ivory-50 md:text-6xl">
            Meet <span className="text-accent">The Tech Guy.</span>
          </h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-stone-300">
            A practical technical partner built into the coaching workspace. He reads the workspace&apos;s real records, drafts programs in the actual program
            builder, and prepares the busywork — while the coach stays in charge.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-stone-300 sm:grid-cols-2">
            <p className="surface p-4">
              <span className="block font-semibold text-ivory-50">Drafts, never surprises</span>
              Programs arrive as drafts for review. Publishing, assigning, invitations and branding changes wait for an explicit confirmation.
            </p>
            <p className="surface p-4">
              <span className="block font-semibold text-ivory-50">Your workspace only</span>
              Every action runs with the coach&apos;s own permissions. Conversations stay private to the coach who had them.
            </p>
          </div>
        </div>
        <div className="md:col-span-6">
          <div className="surface-raised overflow-hidden">
            <div className="flex items-center gap-3 border-b border-ink-700 px-5 py-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">TG</span>
              <span className="text-sm font-semibold text-ivory-50">Ask The Tech Guy</span>
            </div>
            <ul className="divide-y divide-ink-700/70">
              {prompts.map((p) => (
                <li key={p} className="flex items-center justify-between gap-4 px-5 py-4 text-sm text-ivory-200">
                  <span className="editorial text-lg text-ivory-100">&ldquo;{p}&rdquo;</span>
                  <ArrowUpRight className="size-4 shrink-0 text-accent" aria-hidden />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function AthleteExperience() {
  return (
    <section id="athletes" className="relative border-t border-ink-800" aria-labelledby="athletes-title">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 md:grid-cols-12 md:px-8 [&>*]:min-w-0 md:py-32">
        <div className="relative md:col-span-6">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xs">
            <Image src={IMAGERY.athlete.src} alt={IMAGERY.athlete.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover grayscale" style={{ objectPosition: IMAGERY.athlete.position }} />
          </div>
          <div className="surface-raised absolute -bottom-10 right-4 w-64 p-4 md:-right-8" aria-hidden>
            <p className="eyebrow">Today · Example</p>
            <p className="display-tight mt-2 text-xl text-ivory-50">Upper Strength</p>
            <div className="mt-3 space-y-2 text-xs">
              {[
                ["Bench Press", "4 × 5", true],
                ["Chest-Supported Row", "3 × 10", true],
                ["Lateral Raise", "3 × 12", false],
              ].map(([n, s, done]) => (
                <div key={n as string} className="flex items-center justify-between border-t border-ink-700 pt-2">
                  <span className={done ? "text-stone-500 line-through" : "text-ivory-100"}>{n}</span>
                  <span className={done ? "text-accent" : "text-stone-400"}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="md:col-span-5 md:col-start-8">
          <SectionLabel index="04" label="The athlete experience" />
          <h2 id="athletes-title" className="display mt-8 text-5xl text-ivory-50 md:text-6xl">
            Open the app. <span className="editorial block text-[0.7em] text-gold-300">Know exactly what to do.</span>
          </h2>
          <p className="mt-6 text-base leading-relaxed text-stone-300">
            A mobile-first portal for every athlete: today&apos;s session with coaching cues, set-by-set logging, personal records, goals and progress charts —
            and the notes their coach chose to share.
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-4 text-sm">
            {["Today's session", "Set-by-set logging", "Records & goals", "Progress charts", "Effort & recovery check-ins", "Installable on your phone"].map((t) => (
              <li key={t} className="border-t border-ink-700 pt-3 text-ivory-200">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Network() {
  return (
    <section id="coaches" className="relative overflow-hidden border-t border-ink-800 bg-ink-900" aria-labelledby="network-title">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 py-24 md:grid-cols-12 md:px-8 [&>*]:min-w-0 md:py-32">
        <div className="md:col-span-7">
          <SectionLabel index="05" label="The trainer network" />
          <h2 id="network-title" className="display mt-8 text-5xl text-ivory-50 md:text-6xl">
            One standard. <span className="text-accent">Many coaches.</span>
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-stone-300">
            Raymond invites trainers into the RT Performance network. Each receives an independent workspace with their own brand, clients, programs and
            assistant — built on the same engine.
          </p>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xs border border-ink-700 bg-ink-700 sm:grid-cols-3">
            {[
              ["Independent workspaces", "Own athletes, programs, notes, settings and AI history."],
              ["Private by design", "A trainer's client records are not visible to the network by default."],
              ["White-label ready", "Logo, colors, coach profile and a branded athlete portal."],
            ].map(([t, b]) => (
              <div key={t} className="bg-ink-900 p-5">
                <h3 className="text-sm font-semibold text-ivory-50">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">{b}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <ButtonLink href="/login" variant="secondary">
              Coach sign in
            </ButtonLink>
            <ButtonLink href="/signup" variant="quiet">
              Invited as a trainer? Create your account
            </ButtonLink>
          </div>
        </div>
        <div className="relative md:col-span-5">
          <div className="relative aspect-[3/4] overflow-hidden rounded-xs">
            <Image src={IMAGERY.network.src} alt={IMAGERY.network.alt} fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-900 via-transparent to-transparent" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ClosingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="grain relative overflow-hidden" aria-labelledby="cta-title">
      <Image src={IMAGERY.cta.src} alt="" fill sizes="100vw" className="object-cover opacity-40" style={{ objectPosition: IMAGERY.cta.position }} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-ink-950 via-ink-950/60 to-ink-950" />
      <div className="relative z-10 mx-auto max-w-7xl px-5 py-32 text-center md:px-8 md:py-44">
        <RTMark className="mx-auto h-14 w-14" />
        <h2 id="cta-title" className="display mx-auto mt-8 max-w-4xl text-5xl text-ivory-50 md:text-8xl">
          Built on discipline.
          <span className="editorial block text-[0.62em] text-gold-300">Engineered for progress.</span>
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <ButtonLink href={signedIn ? "/home" : "/login"} size="lg">
            {signedIn ? "Open my workspace" : "Sign in"}
          </ButtonLink>
          {!signedIn && (
            <ButtonLink href="/signup" variant="secondary" size="lg">
              Create an account
            </ButtonLink>
          )}
        </div>
        <p className="mx-auto mt-6 max-w-md text-xs leading-relaxed text-stone-400">
          Access is by invitation from your coach. Create an account with the email address they invited, then open your invitation link.
        </p>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-ink-800 bg-ink-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-12 md:px-8 [&>*]:min-w-0">
        <div className="md:col-span-5">
          <Wordmark />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-stone-400">Relentless Training. Intelligent Progress. Personal training and coaching from Tampa, Florida.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 text-sm md:col-span-7 md:grid-cols-3">
          <div>
            <p className="eyebrow mb-3">Method</p>
            <ul className="space-y-2 text-stone-300">
              <li><a href="#philosophy" className="hover:text-accent">Philosophy</a></li>
              <li><a href="#programming" className="hover:text-accent">Programming</a></li>
              <li><a href="#tech-guy" className="hover:text-accent">The Tech Guy</a></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-3">Access</p>
            <ul className="space-y-2 text-stone-300">
              <li><Link href="/login" className="hover:text-accent">Athlete sign in</Link></li>
              <li><Link href="/login" className="hover:text-accent">Coach sign in</Link></li>
              <li><Link href="/signup" className="hover:text-accent">Create an account</Link></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-3">Account</p>
            <ul className="space-y-2 text-stone-300">
              <li><Link href="/forgot-password" className="hover:text-accent">Reset password</Link></li>
              <li><Link href="/home" className="hover:text-accent">My workspace</Link></li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t border-ink-800">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-[11px] uppercase tracking-[0.18em] text-stone-500 md:flex-row md:justify-between md:px-8">
          <span>© {new Date().getFullYear()} Raymond Tate Performance</span>
          <span>Editorial photography via Unsplash · Not medical advice</span>
        </div>
      </div>
    </footer>
  );
}
