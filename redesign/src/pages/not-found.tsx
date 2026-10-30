import { SearchX } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="container-page max-w-xl py-24">
      <EmptyState
        icon={SearchX}
        title="Página no encontrada"
        text="La dirección no existe o fue movida."
        action={
          <Button asChild>
            <Link to="/">Ir al inicio</Link>
          </Button>
        }
      />
    </div>
  );
}
