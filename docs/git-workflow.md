# Flujo de Git

## Estado actual: main directo (excepción documentada)

BeastMoodApp está en fase single-user (tú como atleta/entrenador, ver
CLAUDE.md §0) y sin colaboradores activos todavía. Por eso, a diferencia del
flujo `dev`/PR de la plantilla base, **se trabaja directo sobre `main`**.
Esta es una excepción deliberada, no un descuido — documentada aquí para no
quedar solo como "una decisión que se tomó una vez" (ver
`docs/definition-of-done.md`).

El filtro de calidad no depende de un paso de PR humano, sino de dos capas
independientes:

1. **Subagente `code-reviewer`**: se invoca proactivamente antes de dar
   cualquier cambio no trivial por terminado. Reporta 🔴/🟡/🟢; los
   hallazgos 🔴 se resuelven antes de considerar el trabajo cerrado. No
   requiere que el usuario revise el diff línea por línea cada vez.
2. **CI en GitHub Actions** (`.github/workflows/ci.yml`): corre automático
   en cada push a `main` — lint, type-check, tests, escaneo de secretos
   (gitleaks) y auditoría de dependencias (`npm audit`). No depende de que
   nadie se acuerde de invocarlo.

Si además se toca un modelo de dato ya persistido (`DailyRecord`,
`HealthBaseline`, etc.), pasa también por `data-schema-reviewer` antes de
cerrarse.

## Cuándo reconsiderar este flujo

Volver a evaluar el flujo `dev` + PR real cuando ocurra cualquiera de:
- Se suma un segundo colaborador activo al código.
- La app pasa a tener usuarios reales más allá del desarrollador (ver
  CLAUDE.md §0, fase multi-usuario).
- Se empieza a publicar builds de producción con regularidad.

## Commits

Formato Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`,
`test:`, `chore:`. Le da contexto claro a Claude Code sobre qué tipo de
cambio es cada commit, y permite generar changelog con el subagente
`release-manager` cuando se corte un release.

## Ramas (si se necesita una rama de trabajo puntual)

`feature/nombre-descriptivo`, `fix/nombre-descriptivo` — opcional mientras
se trabaja directo a `main`; útil para cambios grandes que se quieren poder
descartar limpio antes de mezclar.
