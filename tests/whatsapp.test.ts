import { describe, expect, it } from 'vitest';
import {
  MARCA_TAPADO,
  MAX_NOTA,
  detectarColor,
  detectarEspecie,
  detectarEstado,
  huellaMensaje,
  leerMensajes,
  normalizar,
  taparContactos,
} from '../src/lib/whatsapp';

const EXPORTACION = `12/9/26, 3:45 p. m. - Los mensajes y las llamadas están cifrados de extremo a extremo.
12/9/26, 3:46 p. m. - Fundación Patas: creó el grupo "Rescate Pasto"
12/9/26, 3:50 p. m. - Marta Ruiz: Rescatamos un perrito macho, pequeño, color café, muy asustado.
Lo encontramos por el barrio Las Cuadras. Escribir al 3001234567 o a marta@correo.com
12/9/26, 3:51 p. m. - Marta Ruiz: <Multimedia omitido>
12/9/26, 4:05 p. m. - Luis: ok gracias
13/9/26, 9:10 a. m. - Luis: Gatita atigrada hembra perdida cerca del parque Bolívar, la vieron herida ayer.`;

describe('leerMensajes · exportación de WhatsApp', () => {
  const { casos, descartados } = leerMensajes(EXPORTACION);

  it('crea un caso por mensaje con animal y descarta los avisos del sistema y los mensajes sin contenido', () => {
    expect(casos).toHaveLength(2);
    expect(descartados).toBe(4);
  });

  it('lee fecha, autor y rasgos del primer mensaje', () => {
    const c = casos[0];
    expect(c.autor).toBe('Marta Ruiz');
    expect(c.fecha?.getFullYear()).toBe(2026);
    expect(c.fecha?.getMonth()).toBe(8);
    expect(c.fecha?.getDate()).toBe(12);
    expect(c.fecha?.getHours()).toBe(15); // 3:50 p. m.
    expect(c.especie).toBe('PERRO');
    expect(c.sexo).toBe('MACHO');
    expect(c.tamano).toBe('PEQUENO');
    expect(c.color).toBe('Marrón');
    expect(c.estadoAnimal).toBe('LO_RECOGI');
    expect(c.zona).toMatch(/barrio Las Cuadras/i);
  });

  it('une las líneas siguientes al mismo mensaje y tapa celulares y correos', () => {
    const c = casos[0];
    expect(c.texto).toContain('Las Cuadras');
    expect(c.texto).not.toMatch(/3001234567/);
    expect(c.texto).not.toMatch(/marta@correo\.com/);
    expect(c.texto).toContain(MARCA_TAPADO);
    expect(c.contactosTapados).toBe(2);
  });

  it('interpreta las 9:10 a. m. y un animal herido', () => {
    const c = casos[1];
    expect(c.fecha?.getHours()).toBe(9);
    expect(c.especie).toBe('GATO');
    expect(c.sexo).toBe('HEMBRA');
    expect(c.color).toBe('Atigrado');
    expect(c.estadoAnimal).toBe('REQUIERE_ATENCION');
  });
});

describe('leerMensajes · texto libre', () => {
  it('separa por líneas en blanco cuando no hay fechas', () => {
    const r = leerMensajes(`Perro grande negro visto en la calle 18 con carrera 20.\n\nGato blanco y negro en el parque Infantil, parece perdido.`);
    expect(r.casos).toHaveLength(2);
    expect(r.casos[0].fecha).toBeNull();
    expect(r.casos[0].autor).toBeNull();
    expect(r.casos[1].color).toBe('Manchado');
  });

  it('un texto vacío o solo con ruido no produce casos', () => {
    expect(leerMensajes('').casos).toHaveLength(0);
    expect(leerMensajes('   \n\n  ok \n\n gracias').casos).toHaveLength(0);
  });

  it('recorta la nota a 500 caracteres', () => {
    const largo = `Perro negro encontrado ${'muy cariñoso '.repeat(80)}`;
    const [c] = leerMensajes(largo).casos;
    expect(c.texto.length).toBeLessThanOrEqual(MAX_NOTA);
  });

  it('no inventa especie ni color cuando el mensaje no los dice', () => {
    const [c] = leerMensajes('Encontramos un animalito en la plaza, escríbanos por favor para entregarlo.').casos;
    expect(c.especie).toBe('');
    expect(c.color).toBe('');
    expect(c.tamano).toBe('');
    expect(c.estadoAnimal).toBe('SIGUE_EN_LUGAR');
  });
});

describe('detectores', () => {
  it('especie: gana la que aparece primero', () => {
    expect(detectarEspecie(normalizar('Gato y perro juntos'))).toBe('GATO');
    expect(detectarEspecie(normalizar('Perrito con un gatico'))).toBe('PERRO');
    expect(detectarEspecie(normalizar('Un conejo suelto'))).toBe('OTRO');
  });

  it('color: dos colores = manchado, tres = tricolor, una palabra explícita manda', () => {
    expect(detectarColor('negro')).toBe('Negro');
    expect(detectarColor('blanco y negro')).toBe('Manchado');
    expect(detectarColor('blanco, negro y cafe')).toBe('Tricolor');
    expect(detectarColor('gris con rayas atigrado')).toBe('Atigrado');
  });

  it('estado: herido pesa más que rescatado', () => {
    expect(detectarEstado('lo rescatamos, esta herido')).toBe('REQUIERE_ATENCION');
    expect(detectarEstado('se fue corriendo')).toBe('SE_FUE');
  });
});

describe('taparContactos', () => {
  it('tapa celulares con formatos distintos, +57 y correos', () => {
    const r = taparContactos('Llamar 300 123 4567, +57 310-555-1234 o 3205556677; correo a@b.co');
    expect(r.tapados).toBe(4);
    expect(r.texto).not.toMatch(/\d{3}[ -]?\d{3}/);
  });

  it('no toca fechas ni cifras cortas', () => {
    const r = taparContactos('Visto el 12/09/2026 a las 15:30, pesa 12 kilos, calle 18 # 20-30');
    expect(r.tapados).toBe(0);
  });
});

describe('huellaMensaje', () => {
  it('es estable: mismo mensaje, misma huella, aunque cambien tildes, mayúsculas o espacios', async () => {
    const a = await huellaMensaje({ texto: 'Perro negro  en Bolívar', fecha: new Date(2026, 8, 12, 15, 50) });
    const b = await huellaMensaje({ texto: 'perro negro en bolivar', fecha: new Date(2026, 8, 12, 15, 50) });
    expect(a).toBe(b);
    expect(a).toMatch(/^wa-[0-9a-f]{32}$/);
  });

  it('cambia con otro texto u otra fecha', async () => {
    const base = await huellaMensaje({ texto: 'Perro negro', fecha: null });
    expect(await huellaMensaje({ texto: 'Perro blanco', fecha: null })).not.toBe(base);
    expect(await huellaMensaje({ texto: 'Perro negro', fecha: new Date(2026, 8, 12) })).not.toBe(base);
  });
});
