mkdir radar-novedades && cd radar-novedades
mkdir -p .github/workflows

# 1. Crear estado.json
cat << 'EOF' > estado.json
{
      "temas": [
            {
                      "id": "ia-desarrollo",
                            "nombre": "IA y Agentes de Código",
                                  "consulta": "Nuevos lanzamientos de herramientas de IA para programadores, modelos LLM y agentes CLI",
                                        "frecuenciaHoras": 12,
                                              "ultimaEjecucion": "2026-01-01T00:00:00.000Z"
            },
                {
                          "id": "arquitectura-backend",
                                "nombre": "Ecosistema Backend y Cloud",
                                      "consulta": "Novedades importantes sobre Java, Spring, microservicios, Docker y bases de datos",
                                            "frecuenciaHoras": 24,
                                                  "ultimaEjecucion": "2026-01-01T00:00:00.000Z"
                }
      ],
        "novedades": []
}
EOF

# 2. Crear recolector.mjs
cat << 'EOF' > recolector.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const estadoPath = fileURLToPath(new URL("./estado.json", import.meta.url));
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("Falta la variable de entorno OPENAI_API_KEY.");
}

function extraerArregloJson(texto) {
  const contenido = texto.trim();
  const inicio = contenido.indexOf("[");

  if (inicio === -1) {
    throw new Error("La respuesta del modelo no contiene un arreglo JSON.");
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
          throw new Error("La respuesta del modelo no es un arreglo JSON.");
        }
        return resultado;
      }
    }
  }

  throw new Error("El arreglo JSON de la respuesta del modelo está incompleto.");
}

function obtenerFuentesWeb(respuesta) {
  const partes = respuesta.output?.flatMap((elemento) => elemento.content ?? []) ?? [];

  return partes
    .flatMap((parte) => parte.annotations ?? [])
    .filter(
      (anotacion) =>
        anotacion.type === "url_citation" &&
        typeof anotacion.url === "string" &&
        anotacion.url.length > 0,
    )
    .map((anotacion) => ({ uri: anotacion.url, title: anotacion.title }));
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

  const fuenteCitada = webs[indice] ?? webs[0];
  const url = noticia.url.trim() || fuenteCitada?.uri || "";
  const fuente = noticia.fuente.trim() || fuenteCitada?.title || "";

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

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      instructions: [
        "Eres un recolector de novedades web. Usa la búsqueda web para encontrar noticias recientes, reales y verificables sobre la consulta.",
        "No inventes información ni enlaces y no repitas los títulos existentes que recibes.",
        'Responde estrictamente con un arreglo JSON, sin bloques Markdown ni texto adicional. Cada elemento debe contener únicamente los campos de texto "titulo", "resumen", "fuente" y "url".',
        "Si no encuentras novedades relevantes, responde con [].",
      ].join(" "),
      input: prompt,
      tools: [{ type: "web_search_preview" }],
    }),
  });

  if (!response.ok) {
    const detalle = await response.text();
    throw new Error(
      `OpenAI devolvió HTTP ${response.status} para el tema "${tema.id}": ${detalle}`,
    );
  }

  const resultado = await response.json();
  const texto = resultado.output
    ?.filter((elemento) => elemento.type === "message")
    .flatMap((elemento) => elemento.content ?? [])
    .filter(
      (parte) => parte.type === "output_text" && typeof parte.text === "string",
    )
    .map((parte) => parte.text)
    .join("");

  if (typeof texto !== "string" || texto.length === 0) {
    throw new Error(`OpenAI no devolvió contenido para el tema "${tema.id}".`);
  }

  const noticias = extraerArregloJson(texto);
  const webs = obtenerFuentesWeb(resultado);
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
EOF

# 3. Crear el workflow de GitHub Actions
cat << 'EOF' > .github/workflows/radar.yml
name: Actualizar Novedades IA

on:
  schedule:
      - cron: '0 */2 * * *'
        workflow_dispatch:

        permissions:
          contents: write

          jobs:
            recolectar:
                runs-on: ubuntu-latest
                    steps:
                          - uses: actions/checkout@v4
                                - uses: actions/setup-node@v4
                                        with:
                                                  node-version: '22'
                                                        - name: Consultar IA y actualizar JSON
                                                                env:
                                                                          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
                                                                                  run: node recolector.mjs
                                                                                        - name: Guardar cambios
                                                                                                run: |
                                                                                                          git config user.name "Radar Bot"
                                                                                                                    git config user.email "bot@noreply.github.com"
                                                                                                                              git add estado.json
                                                                                                                                        git diff --staged --quiet || (git commit -m "Actualización automática" && git push)
                                                                                                                                        EOF

                                                                                                                                        # 4. Crear index.html
                                                                                                                                        cat << 'EOF' > index.html
                                                                                                                                        <!DOCTYPE html>
                                                                                                                                        <html lang="es">
                                                                                                                                        <head>
                                                                                                                                          <meta charset="UTF-8">
                                                                                                                                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                                                                                                                              <title>Mi Radar de Novedades</title>
                                                                                                                                                <style>
                                                                                                                                                    :root { --fondo: #0f172a; --tarjeta: #1e293b; --texto: #f8fafc; --secundario: #94a3b8; --acento: #38bdf8; }
                                                                                                                                                        body { font-family: system-ui, sans-serif; background: var(--fondo); color: var(--texto); margin: 0; padding: 16px; max-width: 720px; margin-inline: auto; }
                                                                                                                                                            header { margin-bottom: 20px; border-bottom: 1px solid #334155; padding-bottom: 12px; }
                                                                                                                                                                h1 { font-size: 1.4rem; margin: 0 0 8px 0; }
                                                                                                                                                                    .filtros { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 16px; }
                                                                                                                                                                        button { background: var(--tarjeta); color: var(--texto); border: 1px solid #334155; padding: 8px 14px; border-radius: 99px; cursor: pointer; white-space: nowrap; font-size: 0.9rem; }
                                                                                                                                                                            button.activo { background: var(--acento); color: #0f172a; border-color: var(--acento); font-weight: 600; }
                                                                                                                                                                                .tarjeta { background: var(--tarjeta); border-radius: 12px; padding: 16px; margin-bottom: 12px; border: 1px solid #334155; }
                                                                                                                                                                                    .meta { font-size: 0.78rem; color: var(--acento); margin-bottom: 6px; display: flex; justify-content: space-between; }
                                                                                                                                                                                        .titulo { font-size: 1.05rem; font-weight: 600; margin: 0 0 8px 0; }
                                                                                                                                                                                            .resumen { font-size: 0.92rem; color: #cbd5e1; line-height: 1.5; margin: 0 0 12px 0; }
                                                                                                                                                                                                .enlace { font-size: 0.85rem; color: var(--acento); text-decoration: none; font-weight: 500; }
                                                                                                                                                                                                  </style>
                                                                                                                                                                                                  </head>
                                                                                                                                                                                                  <body>
                                                                                                                                                                                                    <header>
                                                                                                                                                                                                        <h1>Radar de Novedades</h1>
                                                                                                                                                                                                            <small id="estado-sync" style="color: var(--secundario);">Cargando datos...</small>
                                                                                                                                                                                                              </header>
                                                                                                                                                                                                                <div id="barra-filtros" class="filtros"></div>
                                                                                                                                                                                                                  <main id="contenedor-noticias"></main>
                                                                                                                                                                                                                    <script>
                                                                                                                                                                                                                        let datosGlobales = { temas: [], novedades: [] };
                                                                                                                                                                                                                            let temaSeleccionado = 'todos';
                                                                                                                                                                                                                                async function iniciar() {
                                                                                                                                                                                                                                          const res = await fetch('./estado.json?t=' + Date.now());
                                                                                                                                                                                                                                                datosGlobales = await res.json();
                                                                                                                                                                                                                                                      dibujarFiltros();
                                                                                                                                                                                                                                                            dibujarNoticias();
                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                    function dibujarFiltros() {
                                                                                                                                                                                                                                              const barra = document.getElementById('barra-filtros');
                                                                                                                                                                                                                                                    const botonTodos = `<button class="${temaSeleccionado === 'todos' ? 'activo' : ''}" onclick="filtrar('todos')">Todos</button>`;
                                                                                                                                                                                                                                                          const botonesTemas = datosGlobales.temas.map(t => `<button class="${temaSeleccionado === t.id ? 'activo' : ''}" onclick="filtrar('${t.id}')">${t.nombre} (${t.frecuenciaHoras}h)</button>`).join('');
                                                                                                                                                                                                                                                                barra.innerHTML = botonTodos + botonesTemas;
                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                        function filtrar(id) { temaSeleccionado = id; dibujarFiltros(); dibujarNoticias(); }
                                                                                                                                                                                                                                            function dibujarNoticias() {
                                                                                                                                                                                                                                                      const contenedor = document.getElementById('contenedor-noticias');
                                                                                                                                                                                                                                                            const lista = temaSeleccionado === 'todos' ? datosGlobales.novedades : datosGlobales.novedades.filter(n => n.temaId === temaSeleccionado);
                                                                                                                                                                                                                                                                  document.getElementById('estado-sync').textContent = `Mostrando ${lista.length} novedades`;
                                                                                                                                                                                                                                                                        if (!lista.length) { contenedor.innerHTML = `<p style="color: var(--secundario);">Sin novedades aún.</p>`; return; }
                                                                                                                                                                                                                                                                              contenedor.innerHTML = lista.map(item => `
                                                                                                                                                                                                                                                                                      <article class="tarjeta">
                                                                                                                                                                                                                                                                                                <div class="meta"><span>${item.temaNombre}</span><span>${new Date(item.fecha).toLocaleString('es-AR')}</span></div>
                                                                                                                                                                                                                                                                                                          <h2 class="titulo">${item.titulo}</h2>
                                                                                                                                                                                                                                                                                                                    <p class="resumen">${item.resumen}</p>
                                                                                                                                                                                                                                                                                                                              ${item.url && item.url !== '#' ? `<a class="enlace" href="${item.url}" target="_blank" rel="noopener">Fuente: ${item.fuente} →</a>` : ''}
                                                                                                                                                                                                                                                                                                                                      </article>`).join('');
                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                iniciar();
                                                                                                                                                                                                                                                  </script>
                                                                                                                                                                                                                                                  </body>
                                                                                                                                                                                                                                                  </html>
                                                                                                                                                                                                                                                  EOF

                                                                                                                                                                                                                                                  # 5. Inicializar Git, crear el repositorio en tu cuenta y subir todo
                                                                                                                                                                                                                                                  git init -b main
                                                                                                                                                                                                                                                  git add .
                                                                                                                                                                                                                                                  git commit -m "Instalación inicial de Radar de Novedades"
                                                                                                                                                                                                                                                  gh repo create radar-novedades --public --source=. --remote=origin --push
                                                                                                                                                                                                                                                  
                                                                    }
                            }
            }
      ]
}