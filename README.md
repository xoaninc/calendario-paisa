# Calendario de 1º de Paisajismo (URJC · Mañana A)

Web del calendario de clase: clases, entregas, exámenes y clases obligatorias de 1º del Grado en Paisajismo (URJC Fuenlabrada, Mañana A), curso 2026-27.

**https://xoaninc.github.io/calendario-paisa/**

Es un calendario no oficial hecho con lo publicado en el Aula Virtual. Ante cualquier duda, manda lo que digan los profesores.

## Cómo funciona

- La fuente es el calendario de clase publicado en Outlook. Su enlace está en el secreto `ICS_URL` del repositorio, no en el código.
- La acción `Publicar la web` (`.github/workflows/pages.yml`) se ejecuta cada hora, con cada push a `main` y a mano desde la pestaña Actions.
  - `scripts/build.py` descarga el calendario y genera `_site/`:
    - la web (`web/`);
    - `eventos.json`;
    - `calendario.ics`, para suscribirse desde el móvil, Google o Outlook.
  - Si el calendario llega con menos de 50 eventos, la acción falla y se queda publicada la versión anterior.
- Para cambiar algo del calendario se cambia en Outlook; la web se actualiza sola en menos de una hora.

## Probarlo en local

```bash
python3 scripts/build.py --ics calendario.ics   # o ICS_URL=… python3 scripts/build.py
python3 -m http.server -d _site 8000
```
