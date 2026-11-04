# Radar de novedades

Sitio estático para consultar novedades por tema. La página lee los temas y las
noticias publicados en `estado.json`.

## Preferencias

En **Personaliza tu radar** puedes elegir los temas que quieres seguir y cada
cuánto tiempo el navegador vuelve a consultar `estado.json`. Las preferencias se
guardan localmente en el navegador; al abrir el sitio en otro navegador o
dispositivo tendrás que configurarlas de nuevo.

La frecuencia elegida controla la consulta del archivo publicado, no la búsqueda
de nuevas noticias. La recolección sigue siendo compartida: GitHub Actions ejecuta
el flujo cada dos horas, y `recolector.mjs` respeta el valor `frecuenciaHoras` de
cada tema en `estado.json`.