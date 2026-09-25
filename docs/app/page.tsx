import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from './components/docs/theme-toggle'
import { CopyCommand } from './components/copy-command'
import { siteConfig } from '@/lib/theme-config'
import { withBasePath } from '@/lib/utils'

const features = [
  {
    title: 'Always slim',
    body: 'SimSlim and avdslim trim every simulator and emulator. Devices booted from Xcode or Android Studio are slimmed automatically.',
    stat: '3.8 → 1.3 GB',
  },
  {
    title: 'Live dashboard',
    body: 'Every device streams into one browser wall. Android runs as hardware H.264 with real touch, drag, and scroll.',
    stat: '15–80 ms',
  },
  {
    title: 'Lanes, not port juggling',
    body: 'One worktree, one device, one leased Metro port per environment range. Lanes never steal a device or a port.',
    stat: '1 lane = 1 port',
  },
  {
    title: 'Native builds once',
    body: 'An Expo build-cache provider fingerprints native inputs and single-flights misses, so parallel agents share one build.',
    stat: '0 rebuilds on env switch',
  },
  {
    title: 'Agents you can see',
    body: 'Every Claude Code or Codex call is attributed to the device it touches. Claim devices; see who drives what from the menu bar.',
    stat: 'Claude + Codex',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Image src={withBasePath('/logo.svg')} alt="" width={24} height={24} className="rounded-md" />
            simfleet
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/docs" className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors">
              Docs
            </Link>
            <Link href="/docs/api-reference" className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              API
            </Link>
            <a href={siteConfig.links.github} className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors">
              GitHub
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-5 pt-20 pb-16 sm:pt-28">
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
            v0.1 · macOS · MIT
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl sm:text-6xl font-semibold tracking-tight text-foreground text-balance">
            One control plane for every simulator on your Mac.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-pretty">
            Run many React Native worktrees in parallel on slimmed iOS simulators and Android emulators, with one live
            dashboard, leased Metro ports, a shared native build cache, and devices that know which agent is driving them.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:items-center">
            <CopyCommand command="bun add -g simfleet" />
            <Link
              href="/docs/quickstart"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--accent)] px-5 text-sm font-medium text-[var(--accent-foreground)] hover:opacity-90 transition-opacity"
            >
              Get started
            </Link>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-5 pb-20">
          <div className="overflow-hidden rounded-2xl border border-border/60">
            <Image
              src={withBasePath('/images/hero.webp')}
              alt="Three iPhones running a demo app in front of a display showing the simfleet dashboard streaming a live Android emulator"
              width={2560}
              height={1600}
              priority
              className="w-full h-auto dark:hidden"
            />
            <Image
              src={withBasePath('/images/hero-dark.webp')}
              alt="Three iPhones running a demo app in front of a display showing the simfleet dashboard streaming a live Android emulator"
              width={2560}
              height={1600}
              className="w-full h-auto hidden dark:block"
            />
          </div>
        </section>

        <section className="border-t border-border/60">
          <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="bg-background p-6 sm:p-8">
                <p className="font-mono text-xs text-[var(--accent)]">{feature.stat}</p>
                <h2 className="mt-3 text-base font-semibold text-foreground">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.body}</p>
              </div>
            ))}
            <div className="bg-background p-6 sm:p-8 flex flex-col justify-between">
              <p className="text-sm leading-6 text-muted-foreground">
                Works with Expo and bare React Native. Built on SimSlim, Baguette, avdslim, and scrcpy.
              </p>
              <Link href="/docs" className="mt-4 text-sm font-medium text-[var(--accent)] hover:underline">
                Read the docs →
              </Link>
            </div>
          </div>
          </div>
        </section>

        <section className="border-t border-border/60">
          <div className="max-w-6xl mx-auto px-5 py-20 grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Three commands to a running lane.</h2>
              <p className="mt-4 text-muted-foreground">
                Boot a slim device, start a lane from any worktree, and launch. simfleet leases the Metro port, waits for it to
                be healthy, and opens the dev client on the right device.
              </p>
            </div>
            <pre className="rounded-xl border border-border bg-muted/40 p-5 text-sm leading-7 overflow-x-auto font-mono">
              <code>
                <span className="text-muted-foreground">$ </span>simfleet sim boot 8CB8…{'\n'}
                <span className="text-muted-foreground">$ </span>simfleet lane start ~/app-feature-x 8CB8…{'\n'}
                <span className="text-muted-foreground">  → lane feature-x · development · Metro :8104{'\n'}</span>
                <span className="text-muted-foreground">$ </span>simfleet lane launch feature-x
              </code>
            </pre>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row gap-3 justify-between text-sm text-muted-foreground">
          <p>MIT License · © {new Date().getFullYear()} Vishesh Raheja</p>
          <div className="flex gap-4">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <a href={siteConfig.links.github} className="hover:text-foreground">GitHub</a>
            <a href={siteConfig.links.npm} className="hover:text-foreground">npm</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
