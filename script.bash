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
import fs from 'node:fs/promises';

const CLAVE_API = process.env.GEMINI_API_KEY;
const ARCHIVO_DATOS = './estado.json';
const URL_MODELO = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CLAVE_API}`;

async function buscarNovedadesPorTema(tema, titulosPrevios) {
      const instruccion = `
          Busca en la web novedades reales y recientes sobre: "${tema.consulta}".
              Fecha de referencia actual: ${new Date().toISOString()}.
                  Ignora por completo noticias que hablen de estos temas ya reportados: ${JSON.stringify(titulosPrevios)}.
                      
                          Devuelve UNICAMENTE un bloque JSON válido con este formato exacto (sin texto adicional):
                              [
                                      {
                                                "titulo": "Titular claro y conciso",
                                                        "resumen": "Explicación de 2 o 3 oraciones con los datos clave.",
                                                                "fuente": "Nombre del medio o sitio web",
                                                                        "url": "URL directa si está disponible o cadena vacía"
                                      }
                              ]
                                `;

                                  const respuesta = await fetch(URL_MODELO, {
                                        method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                          contents: [{ parts: [{ text: instruccion }] }],
                                                                tools: [{ google_search: {} }]
})
});

  const datos = await respuesta.json();
    const texto = datos?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const coincidencia = texto.match(/\[[\s\S]*\]/);
        if (!coincidencia) return [];

          const items = JSON.parse(coincidencia[0]);
            const enlacesGrounding = datos?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
              
                return items.map((item, indice) => ({
                        id: crypto.randomUUID(),
                            temaId: tema.id,
                                temaNombre: tema.nombre,
                                    fecha: new Date().toISOString(),
                                        titulo: item.titulo,
                                            resumen: item.resumen,
                                                fuente: item.fuente || 'Web',
                                                    url: item.url || enlacesGrounding[indice]?.web?.uri || '#'
}));
}

async function ejecutar() {
      const contenido = await fs.readFile(ARCHIVO_DATOS, 'utf-8');
        const base = JSON.parse(contenido);
          const ahora = Date.now();
            let huboCambios = false;

              for (const tema of base.temas) {
                    const ultimaVez = new Date(tema.ultimaEjecucion).getTime();
                        const horasTranscurridas = (ahora - ultimaVez) / (1000 * 60 * 60);

                            if (horasTranscurridas >= tema.frecuenciaHoras) {
                                      const titulosPrevios = base.novedades
                                              .filter(n => n.temaId === tema.id)
                                                      .slice(0, 8)
                                                              .map(n => n.titulo);

                                                                    try {
                                                                                const nuevas = await buscarNovedadesPorTema(tema, titulosPrevios);
                                                                                        base.novedades = [...nuevas, ...base.novedades].slice(0, 100);
                                                                                                tema.ultimaEjecucion = new Date().toISOString();
                                                                                                        huboCambios = true;
                                                                    } catch (error) {
                                                                                console.error(`Error en ${tema.nombre}:`, error);
                                                                    }
                            }
              }

                if (huboCambios) {
                        await fs.writeFile(ARCHIVO_DATOS, JSON.stringify(base, null, 2), 'utf-8');
                }
}

ejecutar();
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
                                                                          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
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