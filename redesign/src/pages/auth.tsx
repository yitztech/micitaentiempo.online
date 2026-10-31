import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff, MailCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

const email = z.string().min(1, "Escribe tu correo.").pipe(z.email("Escribe un correo válido."));
const password = z.string().min(8, "Usa al menos 8 caracteres.");

function Shell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{lead}</p>
      <div className="mt-8">{children}</div>
      {footer ? <p className="mt-8 text-center text-sm text-muted">{footer}</p> : null}
    </div>
  );
}

const linkCls = "font-semibold text-primary hover:underline";

function PasswordInput({
  show,
  onToggle,
  ...props
}: React.ComponentProps<typeof Input> & { show: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={show}
        className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink"
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

export function SignIn() {
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  const f = useForm({
    resolver: zodResolver(z.object({ email, password: z.string().min(1, "Escribe tu contraseña.") })),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = f.formState;
  return (
    <Shell
      title="Bienvenido de nuevo"
      lead="Ingresa para gestionar tus citas."
      footer={
        <>
          ¿Aún no tienes cuenta?{" "}
          <Link to="/registro" className={linkCls}>
            Crea una gratis
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={f.handleSubmit(() => nav("/panel"))} className="space-y-5">
        <Field label="Correo electrónico" error={errors.email?.message}>
          {(a) => (
            <Input
              {...a}
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              {...f.register("email")}
            />
          )}
        </Field>
        <Field label="Contraseña" error={errors.password?.message}>
          {(a) => (
            <PasswordInput
              {...a}
              autoComplete="current-password"
              show={show}
              onToggle={() => setShow((s) => !s)}
              {...f.register("password")}
            />
          )}
        </Field>
        <div className="flex justify-end">
          <Link to="/recuperar" className={`${linkCls} inline-flex min-h-11 items-center text-sm`}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          Ingresar
        </Button>
      </form>
    </Shell>
  );
}

export function SignUp() {
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  const f = useForm({
    resolver: zodResolver(
      z.object({
        name: z.string().min(2, "Escribe tu nombre."),
        business: z.string().min(2, "Escribe el nombre de tu negocio."),
        email,
        password,
      }),
    ),
    defaultValues: { name: "", business: "", email: "", password: "" },
  });
  const { errors, isSubmitting } = f.formState;
  return (
    <Shell
      title="Crea tu cuenta"
      lead="30 días de prueba, sin tarjeta de crédito."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/ingresar" className={linkCls}>
            Ingresa
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={f.handleSubmit(() => nav("/panel"))} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Tu nombre" error={errors.name?.message}>
            {(a) => <Input {...a} autoComplete="name" {...f.register("name")} />}
          </Field>
          <Field label="Nombre del negocio" error={errors.business?.message}>
            {(a) => <Input {...a} autoComplete="organization" {...f.register("business")} />}
          </Field>
        </div>
        <Field label="Correo electrónico" error={errors.email?.message}>
          {(a) => (
            <Input
              {...a}
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              {...f.register("email")}
            />
          )}
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres." error={errors.password?.message}>
          {(a) => (
            <PasswordInput
              {...a}
              autoComplete="new-password"
              show={show}
              onToggle={() => setShow((s) => !s)}
              {...f.register("password")}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          Crear cuenta gratis
        </Button>
        <p className="text-center text-xs text-muted">
          Al crear tu cuenta aceptas los términos y la política de privacidad.
        </p>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const [sent, setSent] = useState<string | null>(null);
  const f = useForm({ resolver: zodResolver(z.object({ email })), defaultValues: { email: "" } });
  if (sent)
    return (
      <Shell
        title="Revisa tu correo"
        lead={`Si ${sent} tiene una cuenta, te enviamos un enlace para restablecer tu contraseña.`}
      >
        <div
          role="status"
          className="flex items-center gap-3 rounded-card bg-success-soft p-4 text-success-fg"
        >
          <MailCheck className="size-6" aria-hidden /> Enlace enviado.
        </div>
        <Button asChild variant="outline" size="lg" className="mt-6 w-full">
          <Link to="/ingresar">Volver a ingresar</Link>
        </Button>
      </Shell>
    );
  return (
    <Shell
      title="Recupera tu contraseña"
      lead="Escribe tu correo y te enviaremos un enlace."
      footer={
        <Link to="/ingresar" className={linkCls}>
          Volver a ingresar
        </Link>
      }
    >
      <form noValidate onSubmit={f.handleSubmit((v) => setSent(v.email))} className="space-y-5">
        <Field label="Correo electrónico" error={f.formState.errors.email?.message}>
          {(a) => <Input {...a} type="email" autoComplete="email" {...f.register("email")} />}
        </Field>
        <Button type="submit" size="lg" className="w-full">
          Enviar enlace
        </Button>
      </form>
    </Shell>
  );
}

export function ResetPassword() {
  const [done, setDone] = useState(false);
  const [show, setShow] = useState(false);
  const f = useForm({
    resolver: zodResolver(
      z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, {
        path: ["confirm"],
        message: "Las contraseñas no coinciden.",
      }),
    ),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors } = f.formState;
  if (done)
    return (
      <Shell title="Contraseña actualizada" lead="Ya puedes ingresar con tu nueva contraseña.">
        <div
          role="status"
          className="flex items-center gap-3 rounded-card bg-success-soft p-4 text-success-fg"
        >
          <CheckCircle2 className="size-6" aria-hidden /> Cambio guardado.
        </div>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link to="/ingresar">Ingresar</Link>
        </Button>
      </Shell>
    );
  return (
    <Shell title="Nueva contraseña" lead="Elige una contraseña segura para tu cuenta.">
      <form noValidate onSubmit={f.handleSubmit(() => setDone(true))} className="space-y-5">
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres." error={errors.password?.message}>
          {(a) => (
            <PasswordInput
              {...a}
              autoComplete="new-password"
              show={show}
              onToggle={() => setShow((s) => !s)}
              {...f.register("password")}
            />
          )}
        </Field>
        <Field label="Confirma la contraseña" error={errors.confirm?.message}>
          {(a) => <Input {...a} type="password" autoComplete="new-password" {...f.register("confirm")} />}
        </Field>
        <Button type="submit" size="lg" className="w-full">
          Guardar contraseña
        </Button>
      </form>
    </Shell>
  );
}
