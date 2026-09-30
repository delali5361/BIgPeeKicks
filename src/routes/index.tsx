import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Truck, ShieldCheck, RefreshCw } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const ShoeScene = lazy(() => import("@/components/ShoeScene"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Big Pee Kicks | Sneaker Shop for Rare Heat" },
      {
        name: "description",
        content:
          "Big Pee Kicks is a sneaker shop built on rare heat — hi-tops, runners and court classics, hand-picked by Big Pee and shipped worldwide.",
      },
      { property: "og:title", content: "Big Pee Kicks | Sneaker Shop for Rare Heat" },
      {
        property: "og:description",
        content:
          "Shop hand-picked sneakers from Big Pee — limited drops, court classics and everyday runners.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader showBack={false} />

      {/* Trust marquee */}
      <div className="mt-[73px] overflow-hidden border-y border-border bg-surface">
        <div className="marquee-track py-4">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex shrink-0">
              {[
                "Rare heat",
                "Worldwide shipping",
                "100% authentic",
                "Hand-picked by Big Pee",
                "New drops monthly",
              ].map((t) => (
                <span
                  key={t + k}
                  className="px-8 font-display text-sm tracking-widest text-muted-foreground"
                >
                  {t} <span className="text-primary">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden border-b border-border pt-4 md:pt-16">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
        <div className="mx-auto grid max-w-6xl items-stretch gap-8 px-5 pb-10 md:grid-cols-[0.9fr_1.1fr] md:pb-16">
          <div className="contents">
            <div className="flex flex-col justify-center py-8 md:row-start-1 md:py-16">
            <p className="mb-4 inline-flex rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-primary">
              Drop 04 — live now
            </p>
            <h1 className="text-5xl leading-[0.9] sm:text-6xl lg:text-7xl">
              Kicks with <span className="ember-text">weight</span> behind them
            </h1>
            <p className="mt-5 max-w-md text-base text-muted-foreground">
              Big Pee hunts the heat so you don't have to. Spin the shoe, pick
              your size, and step out different.
            </p>
            </div>

          <div className="relative min-h-[390px] overflow-hidden border border-border bg-surface/60 sm:min-h-[500px] md:col-start-2 md:row-span-2 md:row-start-1 md:min-h-[620px]">
            <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-border px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>Featured / 01</span>
              <span className="text-primary">Ember Hi-Top</span>
            </div>
            <ClientOnly
              fallback={
                <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                  Loading 3D…
                </div>
              }
            >
              <Suspense
                fallback={
                  <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                    Loading 3D…
                  </div>
                }
              >
                <ShoeScene />
              </Suspense>
            </ClientOnly>
            <p className="absolute inset-x-0 bottom-0 border-t border-border bg-background/70 px-4 py-3 text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground backdrop-blur">
              Drag to inspect / 360° view
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pb-8 md:row-start-2 md:pb-16">
              <a
                href="/shop"
                className="ember-fill shadow-ember rounded-md px-7 py-3.5 font-display text-sm tracking-widest transition-transform duration-300 hover:scale-105"
              >
                Shop the drop
              </a>
              <a
                href="#story"
                className="rounded-md border border-border px-7 py-3.5 font-display text-sm tracking-widest text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                Meet Big Pee
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Story */}
      <section id="story" className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
          <Reveal>
            <h2 className="text-4xl sm:text-5xl">
              Run by <span className="ember-text">Big Pee</span>
            </h2>
            <p className="mt-5 text-muted-foreground">
             What started as a passion for quality footwear grew into a brand built on style, confidence, and trust. Big Pee Kicks was created with a simple vision: to make great footwear accessible to people who appreciate quality, comfort, and a look that speaks for itself.

             Every pair is carefully selected and inspected from the stitching and materials to the box and insole. Nothing makes it onto the shelf without meeting the standard. Whether it’s a fresh pair of sneakers, a classic shoe, or a comfortable pair of slippers, every product is chosen with the customer in mind.

             At Big Pee, footwear is more than just something you wear. It’s part of your everyday style, your confidence, and the way you show up. That’s why we’re committed to offering pieces that combine quality, comfort, and personality.

             From everyday essentials to standout pairs, Big Pee is here to help you step out looking good and feeling confident. Every pair has a purpose, every customer matters, and every purchase is a reflection of the standard we stand by.

             Big Pee Step In. Stand Out.

            </p>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {[
                ["12k+", "Pairs shipped"],
                ["2 yrs", "In the game"],
                ["4.9", "Customer rating"],
              ].map(([n, l]) => (
                <div key={l}>
                  <p className="font-display text-2xl text-primary">{n}</p>
                  <p className="text-xs text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-1">
            {[
              [Truck, "Fast nationwide delivery", "2–5 days to most cities."],
              [ShieldCheck, "Legit-checked", "Every pair verified in-store."],
              [RefreshCw, "14-day swaps", "Wrong size? Easy exchange."],
            ].map(([Icon, title, copy], i) => {
              const I = Icon as typeof Truck;
              return (
                <Reveal key={title as string} delay={i * 100}>
                  <div className="flex items-start gap-4 rounded-xl border border-border bg-background p-5 transition-colors hover:border-primary">
                    <I className="mt-0.5 size-5 text-primary" />
                    <div>
                      <p className="font-display text-sm">{title as string}</p>
                      <p className="text-sm text-muted-foreground">
                        {copy as string}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
