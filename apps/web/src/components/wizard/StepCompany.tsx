import { Field, TextArea, TextInput } from "@/components/ui/Field";
import StepShell from "@/components/wizard/StepShell";
import type { CompanyProfile } from "@agent-org/shared/types";

interface StepCompanyProps {
  company: CompanyProfile;
  onChange: (patch: Partial<CompanyProfile>) => void;
  onNext: () => void;
  onLoadExample: () => void;
}

export default function StepCompany({
  company,
  onChange,
  onNext,
  onLoadExample,
}: StepCompanyProps) {
  return (
    <StepShell
      title="La empresa"
      subtitle="Tus agentes trabajan como una compañía. Esto es lo que saben de dónde trabajan, y va en el contexto de todos."
      onNext={onNext}
      nextDisabled={!company.name.trim()}
    >
      <div className="flex flex-col gap-7">
        <Field label="¿Cómo se llama?">
          <TextInput
            autoFocus
            value={company.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nimbo"
          />
        </Field>

        <Field
          label="¿A qué se dedica?"
          hint="Escribilo como se lo contarías a alguien que entra a trabajar mañana. Todos los agentes van a arrancar sabiendo esto."
        >
          <TextArea
            rows={6}
            value={company.purpose}
            onChange={(e) => onChange({ purpose: e.target.value })}
            placeholder="Vendemos un software de facturación para pymes. Cobramos una suscripción mensual y crecemos por búsqueda orgánica…"
          />
        </Field>

        <p className="text-[14px] leading-relaxed text-dim">
          ¿Preferís mirar uno ya armado?{" "}
          <button
            type="button"
            onClick={onLoadExample}
            className="text-ink underline underline-offset-4 hover:text-dim"
          >
            Cargá el ejemplo
          </button>{" "}
          y ajustalo a tu gusto.
        </p>
      </div>
    </StepShell>
  );
}
