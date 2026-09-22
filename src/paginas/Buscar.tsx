import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Boton } from "../componentes/Boton";
import { Campo, Selector } from "../componentes/Campo";
import { IconoBuscar, IconoMapa } from "../componentes/Iconos";
import { MapaPuntos, SelectorUbicacion } from "../componentes/Mapa";
import { TarjetaCaso } from "../componentes/TarjetaCaso";
import { TarjetaReporte } from "../componentes/TarjetaReporte";
import {
  Aviso,
  Cargando,
  EncabezadoPagina,
  Tarjeta,
  Vacio,
} from "../componentes/ui";
import { distanciaKm, formatearDistancia, type Punto } from "../lib/geo";
import { mensajeError, supabase } from "../lib/supabase";
import {
  COLORES,
  ETIQUETA_ESPECIE,
  ETIQUETA_ESTADO_ANIMAL,
  ETIQUETA_TAMANO,
  type CasoPublico,
  type Reporte,
} from "../tipos/tipos";

type Pestana = "perdidas" | "hallazgos";

interface Filtros {
  q: string;
  especie: string;
  raza: string;
  color: string;
  tamano: string;
  desde: string;
  hasta: string;
  radioZona: number;
}

const limpiar = (t: string) => t.replace(/[,()%*\\]/g, " ").trim();

export function Buscar() {
  const [params] = useSearchParams();
  const [pestana, setPestana] = useState<Pestana>("perdidas");
  const [filtros, setFiltros] = useState<Filtros>({
    q: params.get("q") ?? "",
    especie: "",
    raza: "",
    color: "",
    tamano: "",
    desde: "",
    hasta: "",
    radioZona: 5,
  });
  const [zona, setZona] = useState<Punto | null>(null);
  const [verZona, setVerZona] = useState(false);

  const [verFiltros, setVerFiltros] = useState(false);
  const [casos, setCasos] = useState<CasoPublico[]>([]);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (campo: keyof Filtros, valor: string | number) =>
    setFiltros((f) => ({ ...f, [campo]: valor }));

  const buscar = useCallback(
    async (f: Filtros, pest: Pestana, z: Punto | null) => {
      setCargando(true);
      setError(null);
      const desde = f.desde
        ? new Date(`${f.desde}T00:00:00`).toISOString()
        : null;
      const hasta = f.hasta
        ? new Date(`${f.hasta}T23:59:59`).toISOString()
        : null;
      if (desde && hasta && desde > hasta) {
        setError('La fecha "desde" no puede ser posterior a la fecha "hasta".');
        setCargando(false);
        return;
      }

      if (pest === "perdidas") {
        let consulta = supabase
          .from("casos_publicos")
          .select("*")
          .eq("tipo", "PERDIDA")
          .neq("estado", "CERRADO");
        if (f.especie) consulta = consulta.eq("especie", f.especie);
        if (f.raza) consulta = consulta.ilike("raza", `%${limpiar(f.raza)}%`);
        if (f.color) consulta = consulta.eq("color_principal", f.color);
        if (f.tamano) consulta = consulta.eq("tamano", f.tamano);
        if (desde) consulta = consulta.gte("ocurrido_en", desde);
        if (hasta) consulta = consulta.lte("ocurrido_en", hasta);
        const q = limpiar(f.q);
        if (q)
          consulta = consulta.or(
            `mascota_nombre.ilike.%${q}%,raza.ilike.%${q}%,color_principal.ilike.%${q}%,direccion_texto.ilike.%${q}%`,
          );
        const { data, error: err } = await consulta
          .order("creado_en", { ascending: false })
          .limit(200);
        if (err) setError(mensajeError(err));
        let lista = (data as CasoPublico[] | null) ?? [];
        if (z)
          lista = lista.filter(
            (c) =>
              distanciaKm(z, { lat: c.lat_publica, lng: c.lng_publica }) <=
              f.radioZona,
          );
        setCasos(lista);
      } else {
        let consulta = supabase.from("reportes").select("*");
        if (f.especie) consulta = consulta.eq("especie", f.especie);
        if (f.raza) consulta = consulta.ilike("raza", `%${limpiar(f.raza)}%`);
        if (f.color) consulta = consulta.eq("color", f.color);
        if (f.tamano) consulta = consulta.eq("tamano", f.tamano);
        if (desde) consulta = consulta.gte("ocurrido_en", desde);
        if (hasta) consulta = consulta.lte("ocurrido_en", hasta);
        const q = limpiar(f.q);
        if (q)
          consulta = consulta.or(
            `raza.ilike.%${q}%,color.ilike.%${q}%,nota.ilike.%${q}%`,
          );
        const { data, error: err } = await consulta
          .order("ocurrido_en", { ascending: false })
          .limit(200);
        if (err) setError(mensajeError(err));
        let lista = (data as Reporte[] | null) ?? [];
        if (z) lista = lista.filter((r) => distanciaKm(z, r) <= f.radioZona);
        setReportes(lista);
      }
      setCargando(false);
    },
    [],
  );

  // Búsqueda inicial y al cambiar de pestaña
  useEffect(() => {
    void buscar(filtros, pestana, zona);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pestana, buscar]);

  const puntos =
    pestana === "perdidas"
      ? casos.map((c) => ({
          id: c.id,
          lat: c.lat_publica,
          lng: c.lng_publica,
          titulo: c.mascota_nombre ?? "Mascota",
          detalle: "Ubicación aproximada",
          enlace: `/caso/${c.id}`,
          tono: "alerta" as const,
        }))
      : reportes.map((r) => ({
          id: r.id,
          lat: r.lat,
          lng: r.lng,
          titulo: ETIQUETA_ESPECIE[r.especie],
          detalle: ETIQUETA_ESTADO_ANIMAL[r.estado_animal],
          enlace: `/reporte/${r.id}`,
          tono: "acento" as const,
        }));

  return (
    <div>
      <EncabezadoPagina titulo="Buscar mascotas" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-borde bg-white p-0.5 text-sm">
          {(["perdidas", "hallazgos"] as Pestana[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPestana(p)}
              className={`rounded-md px-3 py-1.5 font-medium ${pestana === p ? "bg-tinta text-white" : "text-suave hover:text-tinta"}`}
            >
              {p === "perdidas" ? "Mascotas perdidas" : "Animales encontrados"}
            </button>
          ))}
        </div>
        <Boton
          variante="secundario"
          tamano="sm"
          icono={<IconoBuscar tamano={14} />}
          onClick={() => setVerFiltros((v) => !v)}
        >
          {verFiltros ? "Ocultar filtros" : "Filtrar"}
        </Boton>
      </div>

      <div
        className={`grid gap-4 ${verFiltros ? "lg:grid-cols-[300px_1fr]" : ""}`}
      >
        {verFiltros && (
          <Tarjeta className="h-fit space-y-3 p-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void buscar(filtros, pestana, zona);
              }}
            >
              <Campo
                etiqueta="Texto libre"
                value={filtros.q}
                onChange={(e) => cambiar("q", e.target.value)}
                placeholder="Nombre, raza, color…"
              />
              <Selector
                etiqueta="Especie"
                value={filtros.especie}
                onChange={(e) => cambiar("especie", e.target.value)}
              >
                <option value="">Todas</option>
                {Object.entries(ETIQUETA_ESPECIE).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </Selector>
              <Campo
                etiqueta="Raza"
                value={filtros.raza}
                onChange={(e) => cambiar("raza", e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Selector
                  etiqueta="Color"
                  value={filtros.color}
                  onChange={(e) => cambiar("color", e.target.value)}
                >
                  <option value="">Todos</option>
                  {COLORES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Selector>
                <Selector
                  etiqueta="Tamaño"
                  value={filtros.tamano}
                  onChange={(e) => cambiar("tamano", e.target.value)}
                >
                  <option value="">Todos</option>
                  {Object.entries(ETIQUETA_TAMANO).map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </Selector>
                <Campo
                  etiqueta="Desde"
                  type="date"
                  value={filtros.desde}
                  onChange={(e) => cambiar("desde", e.target.value)}
                />
                <Campo
                  etiqueta="Hasta"
                  type="date"
                  value={filtros.hasta}
                  onChange={(e) => cambiar("hasta", e.target.value)}
                />
              </div>
              <div className="space-y-2 rounded-lg border border-borde p-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-xs font-semibold"
                  onClick={() => setVerZona((v) => !v)}
                >
                  <span className="flex items-center gap-1.5">
                    <IconoMapa tamano={14} /> Zona{" "}
                    {zona ? `(${filtros.radioZona} km)` : ""}
                  </span>
                  <span className="text-acento">
                    {verZona ? "Ocultar" : zona ? "Cambiar" : "Elegir en mapa"}
                  </span>
                </button>
                {verZona && (
                  <>
                    <SelectorUbicacion
                      valor={zona}
                      onCambio={setZona}
                      alto={200}
                      radioKm={filtros.radioZona}
                    />
                    <Selector
                      etiqueta="Radio"
                      value={filtros.radioZona}
                      onChange={(e) =>
                        cambiar("radioZona", Number(e.target.value))
                      }
                    >
                      {[1, 2, 5, 10, 20].map((k) => (
                        <option key={k} value={k}>
                          {k} km
                        </option>
                      ))}
                    </Selector>
                    {zona && (
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        onClick={() => setZona(null)}
                      >
                        Quitar zona
                      </Boton>
                    )}
                  </>
                )}
              </div>
              <Boton
                type="submit"
                ancho
                icono={<IconoBuscar tamano={16} />}
                cargando={cargando}
              >
                Buscar
              </Boton>
            </form>
          </Tarjeta>
        )}

        <div className="space-y-4">
          {error && <Aviso tipo="alerta">{error}</Aviso>}
          {puntos.length > 0 && (
            <Tarjeta className="p-2">
              <MapaPuntos
                puntos={puntos}
                centro={zona ?? undefined}
                zoom={12}
                alto={260}
              />
            </Tarjeta>
          )}
          {cargando ? (
            <Cargando />
          ) : pestana === "perdidas" ? (
            casos.length === 0 ? (
              <Vacio icono={<IconoBuscar />} titulo="Sin resultados">
                Prueba con menos filtros o una zona más amplia.
              </Vacio>
            ) : (
              <>
                <p className="text-xs text-suave">
                  {casos.length} casos encontrados
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {casos.map((c) => (
                    <TarjetaCaso
                      key={c.id}
                      caso={c}
                      extra={
                        zona
                          ? `A ${formatearDistancia(distanciaKm(zona, { lat: c.lat_publica, lng: c.lng_publica }))} de la zona elegida`
                          : undefined
                      }
                    />
                  ))}
                </div>
              </>
            )
          ) : reportes.length === 0 ? (
            <Vacio
              icono={<IconoBuscar />}
              titulo="Sin reportes con esos filtros"
            />
          ) : (
            <>
              <p className="text-xs text-suave">
                {reportes.length} reportes encontrados
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {reportes.map((r) => (
                  <TarjetaReporte
                    key={r.id}
                    reporte={r}
                    extra={
                      zona
                        ? `A ${formatearDistancia(distanciaKm(zona, r))} de la zona elegida`
                        : undefined
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
