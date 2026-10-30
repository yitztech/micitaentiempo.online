import {
  Bell,
  CalendarCheck2,
  CalendarClock,
  CreditCard,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  Link2,
  type LucideIcon,
  MonitorSmartphone,
  MoreHorizontal,
  PawPrint,
  Scale,
  Scissors,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  UsersRound,
} from "lucide-react";

/**
 * Contenido de demostración del rediseño. Es estático: este proyecto es la capa visual y no se conecta
 * a la API real (ver README). Los nombres y cifras salen de la lámina de referencia aprobada.
 */

export type Category = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone: "blue" | "pink" | "teal" | "orange" | "violet" | "sky" | "green" | "gray";
  fg: string;
};

export const categories: Category[] = [
  { id: "salud", label: "Salud y bienestar", icon: Stethoscope, tone: "blue", fg: "text-blue" },
  { id: "belleza", label: "Belleza y estética", icon: Scissors, tone: "pink", fg: "text-[#be185d]" },
  { id: "veterinarias", label: "Veterinarias", icon: PawPrint, tone: "teal", fg: "text-[#0f766e]" },
  { id: "barberias", label: "Barberías", icon: Scissors, tone: "orange", fg: "text-[#c2410c]" },
  { id: "asesorias", label: "Asesorías legales", icon: Scale, tone: "violet", fg: "text-violet" },
  { id: "educacion", label: "Educación", icon: GraduationCap, tone: "sky", fg: "text-blue" },
  { id: "fitness", label: "Fitness", icon: Dumbbell, tone: "green", fg: "text-[#15803d]" },
  { id: "mas", label: "Más categorías", icon: MoreHorizontal, tone: "gray", fg: "text-ink" },
];

export const heroStats = [
  { value: "2,500+", label: "Profesionales activos", icon: UsersRound, tone: "bg-cat-blue text-blue" },
  {
    value: "120,000+",
    label: "Citas reservadas al mes",
    icon: CalendarCheck2,
    tone: "bg-cat-violet text-violet",
  },
  { value: "99.9%", label: "Disponibilidad", icon: ShieldCheck, tone: "bg-cat-teal text-[#0f766e]" },
  { value: "200+", label: "Categorías de negocio", icon: HeartPulse, tone: "bg-cat-pink text-[#be185d]" },
];

export const checklist = [
  "Reservas en línea 24/7",
  "Recordatorios automáticos por correo y WhatsApp",
  "Pagos en línea (opcional)",
  "Calendario sincronizado con Google, Outlook y más",
  "Personaliza tu página de reservas",
  "Funciona en cualquier dispositivo",
];

export const benefits = [
  {
    title: "Horarios a tu medida",
    text: "Define tus servicios, descansos y días especiales.",
    icon: CalendarClock,
    tone: "bg-cat-blue text-blue",
  },
  {
    title: "Menos ausencias",
    text: "Recordatorios automáticos por correo y WhatsApp.",
    icon: Bell,
    tone: "bg-danger-soft text-danger-fg",
  },
  {
    title: "Más clientes",
    text: "Facilita la reserva desde tu sitio web y redes sociales.",
    icon: UsersRound,
    tone: "bg-cat-teal text-[#0f766e]",
  },
  {
    title: "Tu negocio, en control",
    text: "Toda tu información en un solo lugar.",
    icon: MonitorSmartphone,
    tone: "bg-cat-violet text-violet",
  },
];

export const features = [
  {
    title: "Reservas en línea 24/7",
    text: "Tus clientes eligen servicio, día y hora desde tu página, sin llamadas ni mensajes.",
    icon: CalendarCheck2,
  },
  {
    title: "Recordatorios automáticos",
    text: "Avisos por correo y WhatsApp antes de cada cita para reducir las ausencias.",
    icon: Bell,
  },
  {
    title: "Pagos en línea (opcional)",
    text: "Cobra el servicio o un anticipo al reservar, solo si lo activas.",
    icon: CreditCard,
  },
  {
    title: "Calendario sincronizado",
    text: "Conecta Google, Outlook y más para evitar dobles reservas.",
    icon: CalendarClock,
  },
  {
    title: "Página de reservas propia",
    text: "Personaliza tu enlace y compártelo en tu sitio web y redes sociales.",
    icon: Link2,
  },
  {
    title: "Funciona en cualquier dispositivo",
    text: "Panel y reservas pensados para móvil, tablet y computadora.",
    icon: Smartphone,
  },
  {
    title: "Equipo y sucursales",
    text: "Agendas por persona y por sede, con permisos para cada integrante.",
    icon: UsersRound,
  },
  {
    title: "Integraciones de IA",
    text: "Conecta tu asistente de IA para consultar y gestionar tu agenda.",
    icon: Sparkles,
  },
];

export const testimonials = [
  {
    name: "Dra. Ana Garcia",
    role: "Consulta médica · CDMX",
    avatar: "ana-garcia",
    text: "Pasé de contestar mensajes toda la tarde a que mis pacientes reserven solos. Las ausencias bajaron casi a cero.",
  },
  {
    name: "Carlos Méndez",
    role: "Barbería · Guadalajara",
    avatar: "carlos-mendez",
    text: "Mis clientes reservan desde Instagram y yo solo reviso el calendario. Es limpio, rápido y no se me cruza ninguna cita.",
  },
  {
    name: "Laura Torres",
    role: "Clínica veterinaria · Monterrey",
    avatar: "laura-torres",
    text: "El panel muestra lo que necesito cada mañana: las citas de hoy y los avisos pendientes. Nada más.",
  },
];

export const faqs = [
  {
    q: "¿Necesito tarjeta de crédito para empezar?",
    a: "No. Puedes crear tu cuenta y probar el servicio durante 30 días sin tarjeta de crédito.",
  },
  {
    q: "¿Cuánto tarda la configuración?",
    a: "Se configura en minutos: defines tus servicios y horarios y compartes tu enlace de reservas.",
  },
  {
    q: "¿Mis clientes necesitan una cuenta?",
    a: "No. Reservan con su nombre y un medio de contacto; reciben la confirmación y los recordatorios automáticamente.",
  },
  {
    q: "¿Funciona con mi calendario actual?",
    a: "Sí. Se sincroniza con Google, Outlook y otros calendarios para evitar dobles reservas.",
  },
  {
    q: "¿Puedo cobrar al reservar?",
    a: "Los pagos en línea son opcionales: los activas solo para los servicios que quieras cobrar por adelantado.",
  },
  {
    q: "¿Sirve para varias sucursales?",
    a: "Sí. El plan Sucursales gestiona varias sedes y equipos desde un solo panel.",
  },
];

export const plans = [
  {
    id: "personal",
    name: "Personal",
    audience: "Para profesionales independientes con una sola agenda.",
    price: "US$5",
    period: "al mes",
    items: [
      "1 tablero",
      "Hasta 10 personas en tu equipo",
      "Reservas, avisos y recordatorios",
      "Sincronización y embed",
      "Conecta tu IA",
    ],
    cta: "Empieza la prueba",
    featured: false,
  },
  {
    id: "sucursales",
    name: "Sucursales",
    audience: "Para negocios con varias sedes, salas o profesionales.",
    price: "US$20",
    period: "al mes",
    items: [
      "Hasta 10 tableros",
      "Hasta 10 personas por tablero",
      "Un enlace y un embed para cada tablero",
      "Todo lo del plan Personal",
    ],
    cta: "Empieza la prueba",
    featured: false,
  },
];

/** Citas del día de demostración (20 de octubre de 2026). */
export type Appointment = {
  id: string;
  time: string;
  end: string;
  title: string;
  client: string;
  avatar: string;
  tone: "blue" | "teal" | "orange" | "violet";
  status: "confirmada" | "pendiente";
};
export const appointments: Appointment[] = [
  {
    id: "a1",
    time: "09:00",
    end: "09:45",
    title: "Consulta inicial",
    client: "Ana García",
    avatar: "ana-garcia",
    tone: "teal",
    status: "confirmada",
  },
  {
    id: "a2",
    time: "10:30",
    end: "11:15",
    title: "Corte de cabello",
    client: "Carlos Méndez",
    avatar: "carlos-mendez",
    tone: "blue",
    status: "confirmada",
  },
  {
    id: "a3",
    time: "12:00",
    end: "12:45",
    title: "Consulta veterinaria",
    client: "Laura Torres",
    avatar: "laura-torres",
    tone: "orange",
    status: "pendiente",
  },
  {
    id: "a4",
    time: "15:00",
    end: "15:45",
    title: "Asesoría legal",
    client: "Pedro Ramírez",
    avatar: "pedro-ramirez",
    tone: "violet",
    status: "confirmada",
  },
];

export const slots = ["09:00", "09:30", "10:30", "11:00", "12:00", "12:30", "15:00", "16:30"];

export const metrics = [
  {
    label: "Citas hoy",
    value: "12",
    delta: "+2 que ayer",
    icon: CalendarCheck2,
    tone: "bg-cat-blue text-blue",
  },
  {
    label: "Esta semana",
    value: "28",
    delta: "+12%",
    icon: CalendarClock,
    tone: "bg-cat-teal text-[#0f766e]",
  },
  {
    label: "Clientes nuevos",
    value: "9",
    delta: "+18%",
    icon: UsersRound,
    tone: "bg-cat-green text-[#15803d]",
  },
  { label: "Asistencia", value: "98%", delta: "+4%", icon: HeartPulse, tone: "bg-cat-pink text-[#be185d]" },
];

export type Professional = {
  id: string;
  name: string;
  profession: string;
  category: string;
  city: string;
  rating: number;
  reviews: number;
  avatar: string;
  services: string[];
  from: string;
  slug: string;
};
export const professionals: Professional[] = [
  {
    id: "p1",
    name: "Dra. Ana García",
    profession: "Medicina general",
    category: "salud",
    city: "Ciudad de México",
    rating: 4.9,
    reviews: 212,
    avatar: "ana-garcia",
    services: ["Consulta inicial", "Seguimiento", "Chequeo anual"],
    from: "$45",
    slug: "ana-garcia",
  },
  {
    id: "p2",
    name: "Barbería Méndez",
    profession: "Barbería clásica",
    category: "barberias",
    city: "Guadalajara",
    rating: 4.8,
    reviews: 168,
    avatar: "carlos-mendez",
    services: ["Corte de cabello", "Barba", "Corte + barba"],
    from: "$12",
    slug: "barberia-mendez",
  },
  {
    id: "p3",
    name: "Clínica Patitas",
    profession: "Veterinaria",
    category: "veterinarias",
    city: "Monterrey",
    rating: 4.9,
    reviews: 304,
    avatar: "laura-torres",
    services: ["Consulta veterinaria", "Vacunación", "Baño y corte"],
    from: "$30",
    slug: "clinica-patitas",
  },
  {
    id: "p4",
    name: "Ramírez & Asociados",
    profession: "Asesoría legal",
    category: "asesorias",
    city: "Ciudad de México",
    rating: 4.7,
    reviews: 96,
    avatar: "pedro-ramirez",
    services: ["Primera asesoría", "Contratos", "Trámites"],
    from: "$60",
    slug: "ramirez-asociados",
  },
  {
    id: "p5",
    name: "Studio Sofía",
    profession: "Estética y spa",
    category: "belleza",
    city: "Puebla",
    rating: 4.9,
    reviews: 251,
    avatar: "sofia-ruiz",
    services: ["Facial", "Manicure", "Masaje relajante"],
    from: "$28",
    slug: "studio-sofia",
  },
  {
    id: "p6",
    name: "FitLab Herrera",
    profession: "Entrenamiento personal",
    category: "fitness",
    city: "Querétaro",
    rating: 4.8,
    reviews: 143,
    avatar: "diego-herrera",
    services: ["Evaluación", "Sesión personal", "Plan mensual"],
    from: "$20",
    slug: "fitlab-herrera",
  },
  {
    id: "p7",
    name: "Aula Valeria",
    profession: "Clases particulares",
    category: "educacion",
    city: "Monterrey",
    rating: 4.9,
    reviews: 88,
    avatar: "valeria-cruz",
    services: ["Inglés", "Matemáticas", "Preparación de exámenes"],
    from: "$15",
    slug: "aula-valeria",
  },
  {
    id: "p8",
    name: "Dra. María López",
    profession: "Nutrición",
    category: "salud",
    city: "Guadalajara",
    rating: 4.8,
    reviews: 130,
    avatar: "maria-lopez",
    services: ["Primera consulta", "Plan alimenticio", "Control mensual"],
    from: "$35",
    slug: "maria-lopez",
  },
];

export const cities = ["Ciudad de México", "Guadalajara", "Monterrey", "Puebla", "Querétaro"];

export const customers = [
  {
    id: "c1",
    name: "Ana García",
    contact: "ana.garcia@correo.com",
    phone: "+52 55 1234 5678",
    visits: 8,
    last: "20 oct 2026",
    avatar: "ana-garcia",
  },
  {
    id: "c2",
    name: "Carlos Méndez",
    contact: "carlos.mendez@correo.com",
    phone: "+52 33 2345 6789",
    visits: 14,
    last: "20 oct 2026",
    avatar: "carlos-mendez",
  },
  {
    id: "c3",
    name: "Laura Torres",
    contact: "laura.torres@correo.com",
    phone: "+52 81 3456 7890",
    visits: 5,
    last: "18 oct 2026",
    avatar: "laura-torres",
  },
  {
    id: "c4",
    name: "Pedro Ramírez",
    contact: "pedro.ramirez@correo.com",
    phone: "+52 55 4567 8901",
    visits: 3,
    last: "15 oct 2026",
    avatar: "pedro-ramirez",
  },
  {
    id: "c5",
    name: "Sofía Ruiz",
    contact: "sofia.ruiz@correo.com",
    phone: "+52 22 5678 9012",
    visits: 11,
    last: "12 oct 2026",
    avatar: "sofia-ruiz",
  },
];

export const notices = [
  {
    id: "n1",
    title: "Nueva cita reservada",
    text: "Ana García reservó «Consulta inicial» para hoy a las 09:00.",
    time: "Hace 12 min",
    unread: true,
    icon: CalendarCheck2,
  },
  {
    id: "n2",
    title: "Recordatorio enviado",
    text: "Se envió el recordatorio de las 10:30 a Carlos Méndez por WhatsApp.",
    time: "Hace 1 h",
    unread: true,
    icon: Bell,
  },
  {
    id: "n3",
    title: "Cita confirmada",
    text: "Pedro Ramírez confirmó su «Asesoría legal» de las 15:00.",
    time: "Ayer",
    unread: false,
    icon: ShieldCheck,
  },
  {
    id: "n4",
    title: "Calendario sincronizado",
    text: "Google Calendar se sincronizó correctamente.",
    time: "Ayer",
    unread: false,
    icon: CalendarClock,
  },
];

export const nav = [
  { to: "/funciones", label: "Funciones" },
  { to: "/precios", label: "Precios" },
  { to: "/directorio", label: "Directorio" },
  { to: "/#preguntas", label: "Ayuda" },
];
