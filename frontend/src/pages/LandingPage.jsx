import { Link } from 'react-router-dom'
import {
  GitBranch,
  Phone,
  Route,
  Truck,
  ArrowRight,
} from 'lucide-react'
import truckHero from '../assets/truck-hero.png'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

const FEATURES = [
  {
    title: 'Piggyback recovery',
    description: 'Attach misplaced packages to trucks already en route.',
    icon: Truck,
  },
  {
    title: 'Live route graph',
    description: 'Telangana hub network scored in real time.',
    icon: GitBranch,
  },
  {
    title: 'Driver coordination',
    description: 'Call drivers via voice when incidents fire.',
    icon: Phone,
  },
  {
    title: 'Incident lifecycle',
    description: 'Detect → analyze → assign → confirm → resolve.',
    icon: Route,
  },
]

const STEPS = [
  { num: '01', label: 'Detect' },
  { num: '02', label: 'Analyze' },
  { num: '03', label: 'Assign' },
  { num: '04', label: 'Confirm' },
  { num: '05', label: 'Resolve' },
]

export default function LandingPage() {
  return (
    <div className="app-grain min-h-dvh">
      <header className="sticky top-0 z-40 border-b-2 border-border bg-secondary-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-base border-2 border-border bg-main shadow-shadow">
              <Truck className="size-4" strokeWidth={2.4} />
            </span>
            <span className="text-lg font-heading tracking-tight">SH-205</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex" aria-label="Primary">
            <a href="#top" className="underline decoration-2 underline-offset-6">
              Home
            </a>
            <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">
              Product
            </a>
            <a href="#process" className="text-muted-foreground transition-colors hover:text-foreground">
              Recovery
            </a>
          </nav>
          <Link
            to="/dashboard"
            className={cn(buttonVariants({ size: 'sm' }))}
          >
            Open dashboard
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </header>

      <section
        id="top"
        className="relative mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:py-16"
      >
        <div className="relative z-10 max-w-xl">
          <Badge variant="neutral" className="mb-4 uppercase tracking-[0.12em]">
            Logistics intelligence
          </Badge>
          <p className="mb-3 text-4xl font-heading tracking-tight sm:text-5xl lg:text-6xl">
            SH-205
          </p>
          <h1 className="text-pretty text-2xl font-semibold tracking-tight text-foreground/90 sm:text-3xl">
            Recover misplaced shipments on trucks already moving.
          </h1>
          <p className="mt-4 max-w-[42ch] text-base text-muted-foreground text-pretty">
            Piggyback recovery for operators who need precise, real-time exception handling across the Telangana network.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className={cn(buttonVariants({ size: 'lg' }))}
            >
              Open dashboard
            </Link>
            <a
              href="#process"
              className={cn(buttonVariants({ variant: 'neutral', size: 'lg' }))}
            >
              How it works
            </a>
          </div>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-base border-2 border-border bg-secondary-background shadow-shadow">
            <img
              src={truckHero}
              alt="Freight truck on the highway at sunset"
              width={720}
              height={900}
              className="aspect-[4/5] w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-4 -left-3 hidden rounded-base border-2 border-border bg-main px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] shadow-shadow sm:block">
            Live ops graph
          </div>
        </div>
      </section>

      <section id="features" className="border-t-2 border-border bg-secondary-background/60 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="max-w-[18ch] text-2xl font-heading tracking-tight sm:text-3xl">
            Built for operators who move freight.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon
              return (
                <Card
                  key={feature.title}
                  className={index === 0 ? 'shadow-shadow sm:col-span-2 lg:col-span-1' : 'shadow-none'}
                >
                  <CardHeader>
                    <div className="mb-2 flex size-10 items-center justify-center rounded-base border-2 border-border bg-background">
                      <Icon className="size-5" strokeWidth={2.2} />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section id="process" className="py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-heading tracking-tight sm:text-3xl">
            Recovery process
          </h2>
          <ol className="mt-8 grid gap-3 sm:grid-cols-5">
            {STEPS.map((step) => (
              <li key={step.num}>
                <Card size="sm" className="h-full shadow-none">
                  <CardContent className="pt-1">
                    <p className="font-mono text-2xl font-bold tabular-nums tracking-tight">
                      {step.num}
                    </p>
                    <p className="mt-2 text-sm font-semibold uppercase tracking-[0.08em]">
                      {step.label}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <Card className="bg-main shadow-shadow sm:col-span-1">
              <CardHeader>
                <CardDescription className="text-foreground/70">
                  Operating network
                </CardDescription>
                <CardTitle className="font-mono text-4xl tabular-nums">91</CardTitle>
                <p className="text-sm font-medium">Hubs mapped</p>
              </CardHeader>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardDescription>Graph scoring</CardDescription>
                <CardTitle className="text-3xl">Live</CardTitle>
                <p className="text-sm text-muted-foreground">Feasibility + weighted recovery</p>
              </CardHeader>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardDescription>Driver notify</CardDescription>
                <CardTitle className="text-3xl">On assign</CardTitle>
                <p className="text-sm text-muted-foreground">Voice coordination when plans land</p>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <section
        id="cta"
        className="border-t-2 border-border bg-secondary-background py-16"
      >
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-pretty text-2xl font-heading tracking-tight sm:text-3xl">
            Ready to recover the next misplaced shipment?
          </h2>
          <p className="mx-auto mt-3 max-w-[42ch] text-muted-foreground">
            Open the control surface and turn routing mishaps into recovered value.
          </p>
          <Link
            to="/dashboard"
            className={cn(buttonVariants({ size: 'lg' }), 'mt-7 inline-flex')}
          >
            Open dashboard
          </Link>
        </div>
      </section>

      <footer className="border-t-2 border-border bg-background py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <strong className="font-heading">SH-205</strong>
            <p className="text-sm text-muted-foreground">
              Intelligent shipment piggybacking
            </p>
          </div>
          <nav className="flex gap-4 text-sm text-muted-foreground" aria-label="Footer">
            <a href="#features">Product</a>
            <a href="#process">Recovery</a>
            <a href="#cta">Contact</a>
          </nav>
          <p className="text-xs text-muted-foreground">© 2026 SH-205</p>
        </div>
      </footer>
    </div>
  )
}
