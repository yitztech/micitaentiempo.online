import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { features } from "@/lib/data";

export default function Features() {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
          Todo lo que necesitas para <span className="gradient-text">agendar sin esfuerzo</span>
        </h1>
        <p className="mt-4 text-lg text-muted">
          Funciones pensadas para que reserves, recuerdes y cobres sin complicaciones.
        </p>
      </div>
      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => (
          <li
            key={f.title}
            className="rounded-card border border-line/70 bg-surface p-6 shadow-card transition-shadow hover:shadow-pop"
          >
            <span
              className={`grid size-12 place-items-center rounded-2xl ${["bg-cat-blue text-blue", "bg-cat-pink text-[#be185d]", "bg-cat-green text-[#15803d]", "bg-cat-violet text-violet"][i % 4]}`}
            >
              <f.icon className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-bold">{f.title}</h2>
            <p className="mt-1.5 text-muted">{f.text}</p>
          </li>
        ))}
      </ul>
      <div className="mt-12 text-center">
        <Button asChild size="lg">
          <Link to="/registro">Empieza gratis</Link>
        </Button>
      </div>
    </div>
  );
}
