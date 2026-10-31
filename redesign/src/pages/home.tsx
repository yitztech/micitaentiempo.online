import { ArrowRight, BadgeCheck, CheckCircle2, ChevronDown, CirclePlay, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { AppointmentCard } from "@/components/booking/appointment-card";
import { BookingCalendar, type CalendarMonth } from "@/components/booking/booking-calendar";
import { BookingCard, NewBookingNotice } from "@/components/booking/booking-card";
import { BusinessCard } from "@/components/business/business-card";
import { CategoryCard } from "@/components/business/category-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { assets } from "@/lib/assets";
import { appointments, benefits, categories, checklist, faqs, heroStats, testimonials } from "@/lib/data";

function Eyebrow({ children, icon }: { children: string; icon?: boolean }) {
  return (
    <Badge className="bg-primary-50/90 px-3.5 py-1.5 text-[11px] uppercase tracking-wide ring-1 ring-primary-100">
      {icon ? <BadgeCheck className="size-3.5" aria-hidden /> : null}
      {children}
    </Badge>
  );
}

function Hero() {
  const [month, setMonth] = useState<CalendarMonth>({ year: 2026, month: 9 });
  const [day, setDay] = useState<number | null>(20);
  return (
    <section className="bg-hero-glow relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-canvas"
      />
      <div className="container-page relative grid items-center gap-10 pb-14 pt-10 lg:grid-cols-[1.02fr_1fr] lg:gap-6 lg:pb-20 lg:pt-16">
        <div className="animate-rise">
          <Badge className="bg-white px-3.5 py-1.5 shadow-card ring-1 ring-primary-100">
            <BadgeCheck className="size-4" aria-hidden /> Agenda en línea para profesionales
          </Badge>
          <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.04] tracking-tight xs:text-5xl lg:text-[3.6rem] 2xl:text-[4.1rem]">
            Tus clientes reservan.
            <span className="gradient-text block pb-1">Tú ganas tiempo.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Una plataforma simple y poderosa para gestionar tus citas, recordatorios, pagos y más. Enfócate en
            lo importante: tu negocio.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/registro">Empieza gratis</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/funciones">
                <CirclePlay className="size-5" /> Ver demo
              </Link>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-muted">
            {["Sin tarjeta de crédito", "30 días de prueba", "Configuración en minutos"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Composición: fotografía + notificación + calendario + citas del día */}
        <div className="relative mx-auto w-full max-w-[640px] animate-rise [animation-delay:120ms] lg:max-w-none">
          <div className="relative ml-[6%] w-[80%] sm:ml-[12%] sm:w-[72%] lg:ml-[8%] lg:w-[74%]">
            <img
              src={assets.hero.src}
              srcSet={assets.hero.srcSet}
              sizes="(min-width:1024px) 34vw, 70vw"
              width={assets.hero.width}
              height={assets.hero.height}
              alt="Profesional sonriendo mientras atiende reservas desde su negocio"
              fetchPriority="high"
              className="aspect-[1.08/1] w-full rounded-[22px] object-cover object-[50%_40%] shadow-photo"
            />
            <img
              src={assets.sparkle}
              alt=""
              aria-hidden
              className="absolute -right-4 -top-8 size-14 sm:-right-8"
            />
            <NewBookingNotice className="absolute -left-[8%] top-[10%] z-10 w-[64%] min-w-[200px] max-w-[280px] sm:-left-[24%] sm:top-[26%] lg:-left-[26%]" />
          </div>
          <div className="relative z-10 mt-6 grid gap-3 sm:-mt-6 sm:grid-cols-[1.02fr_1fr] lg:-mt-8 lg:grid-cols-[1fr_1fr]">
            <BookingCalendar
              value={month}
              onMonthChange={setMonth}
              selected={day}
              onSelect={setDay}
              marked={[6, 9, 13, 16, 20, 22, 27]}
              onNew={() => undefined}
              className="shadow-pop"
              compact
            />
            <div className="rounded-card border border-line/70 bg-surface p-4 shadow-pop">
              <h3 className="text-sm font-bold">Martes, 20 de octubre</h3>
              <ul className="mt-3 space-y-2">
                {appointments.map((a) => (
                  <li key={a.id}>
                    <AppointmentCard a={a} variant="block" className="py-2" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  return (
    <section aria-label="Cifras de la plataforma" className="container-page -mt-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 rounded-panel border border-line/70 bg-surface p-5 shadow-card md:grid-cols-4 md:p-6">
        {heroStats.map((s) => (
          <div key={s.label} className="flex items-center gap-3 md:gap-4">
            <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${s.tone}`}>
              <s.icon className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-xl font-extrabold tracking-tight sm:text-2xl">{s.value}</p>
              <p className="text-xs text-muted sm:text-sm">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Categories() {
  return (
    <section id="categorias" className="container-page pt-20 text-center">
      <Eyebrow icon>PARA TODO TIPO DE NEGOCIOS</Eyebrow>
      <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
        Una solución, muchas posibilidades
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-lg text-muted">
        Desde consultorios médicos y veterinarias, hasta salones de belleza, abogados y más.
      </p>
      <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {categories.map((c) => (
          <li key={c.id}>
            <CategoryCard c={c} className="h-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Showcase() {
  return (
    <section className="container-page pt-20">
      <div className="grid items-center gap-8 overflow-hidden rounded-[28px] bg-gradient-to-br from-primary-50 via-[#f1eeff] to-white p-5 ring-1 ring-primary-100 sm:p-8 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:p-10">
        <div>
          <Eyebrow icon>CITAS SIN COMPLICACIONES</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Agenda, gestiona y haz crecer tu negocio
          </h2>
          <ul className="mt-6 space-y-3">
            {checklist.map((t) => (
              <li key={t} className="flex items-start gap-3 text-[15px] font-medium">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="mt-8">
            <Link to="/funciones">
              Ver todas las funciones <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="relative">
          <img
            src={assets.negocio.src}
            srcSet={assets.negocio.srcSet}
            sizes="(min-width:1024px) 45vw, 90vw"
            width={assets.negocio.width}
            height={assets.negocio.height}
            alt="Profesional sonriendo mientras consulta su agenda en una tableta"
            loading="lazy"
            decoding="async"
            className="aspect-[1.1/1] w-full rounded-[22px] object-cover object-[55%_20%] shadow-photo sm:aspect-[1.35/1]"
          />
          <img src={assets.sparkle} alt="" aria-hidden className="absolute -right-2 -top-6 size-14" />
          <BookingCard className="absolute -bottom-5 right-3 w-[min(88%,320px)] sm:-right-4" />
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section aria-label="Beneficios" className="container-page pt-14">
      <div className="grid gap-6 rounded-panel border border-line/70 bg-surface p-6 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        {benefits.map((b) => (
          <BusinessCard key={b.title} {...b} />
        ))}
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section className="container-page pt-24">
      <div className="text-center">
        <Eyebrow icon>TESTIMONIOS</Eyebrow>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Profesionales que ya ganan tiempo
        </h2>
      </div>
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {testimonials.map((t) => (
          <li
            key={t.name}
            className="flex flex-col rounded-card border border-line/70 bg-surface p-6 shadow-card"
          >
            <p className="flex gap-0.5 text-[#f59e0b]" role="img" aria-label="5 de 5 estrellas">
              {["1", "2", "3", "4", "5"].map((k) => (
                <Star key={k} className="size-4 fill-current" aria-hidden />
              ))}
            </p>
            <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed">“{t.text}”</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <Avatar slug={t.avatar} name={t.name} className="size-11" />
              <span>
                <span className="block text-sm font-bold">{t.name}</span>
                <span className="block text-xs text-muted">{t.role}</span>
              </span>
            </figcaption>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="preguntas" className="container-page max-w-3xl pt-24">
      <div className="text-center">
        <Eyebrow icon>PREGUNTAS FRECUENTES</Eyebrow>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Resolvemos tus dudas</h2>
      </div>
      <div className="mt-8 space-y-3">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q} className="rounded-card border border-line/70 bg-surface shadow-card">
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-3 text-left font-semibold"
                >
                  {f.q}
                  <ChevronDown
                    aria-hidden
                    className={`size-5 shrink-0 text-primary transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </h3>
              <section id={`faq-${i}`} aria-label={f.q} hidden={!isOpen} className="px-5 pb-5 text-muted">
                {f.a}
              </section>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="container-page pt-24">
      <div className="bg-cta-glow relative overflow-hidden rounded-[28px] px-6 py-14 text-center text-white sm:px-12">
        <img
          src={assets.sparkle}
          alt=""
          aria-hidden
          className="absolute right-10 top-8 hidden size-14 opacity-70 sm:block"
        />
        <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
          Empieza hoy y recupera tu tiempo
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-lg text-white/80">
          Crea tu página de reservas en minutos. 30 días de prueba, sin tarjeta de crédito.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild variant="light" size="lg">
            <Link to="/registro">Empieza gratis</Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="border border-white/40 bg-transparent shadow-none hover:bg-white/10"
          >
            <Link to="/precios">Ver precios</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <Stats />
      <Categories />
      <Showcase />
      <Benefits />
      <Testimonials />
      <Faq />
      <FinalCta />
    </>
  );
}
