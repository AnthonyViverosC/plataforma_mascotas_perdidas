import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const CONTROL =
  'block w-full rounded-lg border bg-white px-3 text-sm text-tinta placeholder:text-gray-400 transition focus:outline-none focus:ring-2 focus:ring-acento/30 disabled:bg-fondo disabled:text-suave';

const borde = (error?: string) => (error ? 'border-alerta focus:border-alerta' : 'border-borde focus:border-acento');

interface Envoltura {
  etiqueta: string;
  error?: string;
  ayuda?: ReactNode;
  opcional?: boolean;
}

function Marco({ id, etiqueta, error, ayuda, opcional, children }: Envoltura & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-xs font-semibold text-tinta">
        <span>{etiqueta}</span>
        {opcional && <span className="font-normal text-suave">Opcional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-alerta">
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-xs text-suave">{ayuda}</p>
      ) : null}
    </div>
  );
}

export function Campo({ etiqueta, error, ayuda, opcional, className, ...resto }: Envoltura & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Marco id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} opcional={opcional}>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${CONTROL} h-10 ${borde(error)} ${className ?? ''}`}
        {...resto}
      />
    </Marco>
  );
}

export function Selector({
  etiqueta,
  error,
  ayuda,
  opcional,
  className,
  children,
  ...resto
}: Envoltura & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Marco id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} opcional={opcional}>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={`${CONTROL} h-10 ${borde(error)} ${className ?? ''}`}
        {...resto}
      >
        {children}
      </select>
    </Marco>
  );
}

export function AreaTexto({
  etiqueta,
  error,
  ayuda,
  opcional,
  className,
  maxLength,
  value,
  ...resto
}: Envoltura & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const largo = typeof value === 'string' ? value.length : 0;
  return (
    <Marco
      id={id}
      etiqueta={etiqueta}
      error={error}
      opcional={opcional}
      ayuda={
        <span className="flex justify-between gap-2">
          <span>{ayuda}</span>
          {maxLength ? <span className="font-mono">{largo}/{maxLength}</span> : null}
        </span>
      }
    >
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        maxLength={maxLength}
        value={value}
        className={`${CONTROL} min-h-[88px] py-2 ${borde(error)} ${className ?? ''}`}
        {...resto}
      />
    </Marco>
  );
}

export function Casilla({
  etiqueta,
  error,
  ...resto
}: { etiqueta: ReactNode; error?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-tinta">
        <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-borde accent-teal-700" {...resto} />
        <span>{etiqueta}</span>
      </label>
      {error && (
        <p role="alert" className="pl-7 text-xs font-medium text-alerta">
          {error}
        </p>
      )}
    </div>
  );
}
