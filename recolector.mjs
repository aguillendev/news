import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const estadoPath = fileURLToPath(new URL("./estado.json", import.meta.url));
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Falta la variable de entorno GEMINI_API_KEY.");
}

function extraerArregloJson(texto) {
  const contenido = texto.trim();
  const inicio = contenido.indexOf("[");

  if (inicio === -1) {
    throw new Error("La respuesta de Gemini no contiene un arreglo JSON.");
  }

  let profundidad = 0;
  let dentroDeCadena = false;
  let escape = false;

  for (let indice = inicio; indice < contenido.length; indice += 1) {
    const caracter = contenido[indice];

    if (dentroDeCadena) {
      if (escape) {
        escape = false;
      } else if (caracter === "\\") {
        escape = true;
      } else if (caracter === '"') {
        dentroDeCadena = false;
      }
      continue;
    }

    if (caracter === '"') {
      dentroDeCadena = true;
    } else if (caracter === "[") {
      profundidad += 1;
    } else if (caracter === "]") {
      profundidad -= 1;
      if (profundidad === 0) {
        const resultado = JSON.parse(contenido.slice(inicio, indice + 1));
        if (!Array.isArray(resultado)) {
          throw new Error("La respuesta de Gemini no es un arreglo JSON.");
        }
        return resultado;
      }
    }
  }

  throw new Error("El arreglo JSON de la respuesta de Gemini está incompleto.");
}

function obtenerWebsConGrounding(respuesta) {
  const chunks =
    respuesta.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

  return chunks
    .map((chunk) => chunk.web)
    .filter((web) => typeof web?.uri === "string" && web.uri.length > 0);
}

function validarNoticia(noticia, indice, webs) {
  if (!noticia || typeof noticia !== "object" || Array.isArray(noticia)) {
    throw new Error(`La noticia ${indice + 1} no es un objeto JSON.`);
  }

  for (const campo of ["titulo", "resumen", "fuente", "url"]) {
    if (typeof noticia[campo] !== "string") {
      throw new Error(
        `La noticia ${indice + 1} no contiene el campo "${campo}" como texto.`,
      );
    }
  }

  const grounding = webs[indice] ?? webs[0];
  const url = noticia.url.trim() || grounding?.uri || "";
  const fuente = noticia.fuente.trim() || grounding?.title || "";

  return {
    titulo: noticia.titulo.trim(),
    resumen: noticia.resumen.trim(),
    fuente,
    url,
  };
}

async function recolectarTema(tema, estado) {
  const titulosRecientes = estado.novedades
    .filter((noticia) => noticia.temaId === tema.id)
    .slice(0, 8)
    .map((noticia) => noticia.titulo);

  const prompt = [
    `Consulta del tema: ${tema.consulta}`,
    "",
    "Busca en la web noticias recientes, reales y verificables que respondan a esta consulta.",
    "No inventes información ni enlaces. No repitas ninguna de las noticias indicadas abajo.",
    "Devuelve estrictamente un arreglo JSON, sin bloques Markdown ni texto adicional.",
    'Cada elemento debe incluir exactamente estos campos de texto: "titulo", "resumen", "fuente" y "url".',
    "Si no encuentras novedades relevantes, devuelve [].",
    "",
    "Últimos títulos existentes que debes usar para deduplicar:",
    titulosRecientes.length > 0
      ? titulosRecientes.map((titulo) => `- ${titulo}`).join("\n")
      : "- Ninguno",
  ].join("\n");

  const endpoint = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
  );
  endpoint.searchParams.set("key", apiKey);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: [
              "Eres un recolector de novedades web. Usa Google Search Grounding para buscar noticias recientes, reales y verificables sobre la consulta del usuario.",
              "No inventes información ni enlaces y no repitas los títulos existentes que recibes.",
              'Responde estrictamente con un arreglo JSON, sin bloques Markdown ni texto adicional. Cada elemento debe contener únicamente los campos de texto "titulo", "resumen", "fuente" y "url".',
              "Si no encuentras novedades relevantes, responde con [].",
            ].join(" "),
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!response.ok) {
    const detalle = await response.text();
    throw new Error(
      `Gemini devolvió HTTP ${response.status} para el tema "${tema.id}": ${detalle}`,
    );
  }

  const resultado = await response.json();
  const texto = resultado.candidates?.[0]?.content?.parts
    ?.map((parte) => parte.text)
    .filter((parte) => typeof parte === "string")
    .join("");

  if (typeof texto !== "string" || texto.length === 0) {
    throw new Error(`Gemini no devolvió contenido para el tema "${tema.id}".`);
  }

  const noticias = extraerArregloJson(texto);
  const webs = obtenerWebsConGrounding(resultado);
  const titulosExistentes = new Set(
    estado.novedades
      .filter((noticia) => noticia.temaId === tema.id)
      .map((noticia) => noticia.titulo.trim().toLocaleLowerCase()),
  );

  return noticias
    .map((noticia, indice) => validarNoticia(noticia, indice, webs))
    .filter((noticia) => {
      const clave = noticia.titulo.toLocaleLowerCase();
      if (!clave || titulosExistentes.has(clave)) {
        return false;
      }
      titulosExistentes.add(clave);
      return true;
    })
    .map((noticia) => ({
      ...noticia,
      temaId: tema.id,
      fecha: new Date().toISOString(),
    }));
}

const estado = JSON.parse(await readFile(estadoPath, "utf8"));

if (!Array.isArray(estado.temas) || !Array.isArray(estado.novedades)) {
  throw new Error('estado.json debe contener arreglos "temas" y "novedades".');
}

const ahora = Date.now();

for (const tema of estado.temas) {
  const ultimaEjecucion = Date.parse(tema.ultimaEjecucion);
  const frecuenciaMs = Number(tema.frecuenciaHoras) * 60 * 60 * 1000;

  if (
    !Number.isFinite(ultimaEjecucion) ||
    !Number.isFinite(frecuenciaMs) ||
    frecuenciaMs <= 0
  ) {
    throw new Error(`Configuración de frecuencia o fecha inválida: "${tema.id}".`);
  }

  if (ahora - ultimaEjecucion <= frecuenciaMs) {
    console.log(`Se omite "${tema.nombre}": aún no corresponde actualizar.`);
    continue;
  }

  const nuevasNoticias = await recolectarTema(tema, estado);
  estado.novedades = [...nuevasNoticias, ...estado.novedades].slice(0, 100);
  tema.ultimaEjecucion = new Date().toISOString();

  await writeFile(estadoPath, `${JSON.stringify(estado, null, 2)}\n`, "utf8");
  console.log(
    `"${tema.nombre}" actualizado: ${nuevasNoticias.length} novedad(es) nueva(s).`,
  );
}
