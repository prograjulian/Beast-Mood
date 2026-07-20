# Definition of Done

No se marca una tarea como terminada hasta pasar este checklist.

## Funcional

- [ ] Se probó con datos/escenarios representativos (idealmente varios
      días de historial simulado, no solo un registro suelto), no solo el
      caso trivial.
- [ ] Rutas de error cubiertas, no solo el happy path: ¿qué pasa si
      `AsyncStorage` falla o está vacío, si falta el baseline, si falta el
      microciclo, si el bloque anterior en el historial no coincide con el
      esperado?
- [ ] Los tests de Jest pasan ANTES de la prueba manual en la app — nunca
      al revés. Si algo falla manualmente pero los tests pasaban, el test
      estaba incompleto: se agrega el caso, no se ignora (ya pasó dos veces
      en este proyecto — ver CLAUDE.md §4/§6).

## Fidelidad a la lógica deportiva (específico de este proyecto)

- [ ] Ningún valor de HRV/FC se comparó contra un umbral poblacional en vez
      del baseline propio del atleta (CLAUDE.md §1).
- [ ] Ninguna decisión de juicio deportivo pendiente (CLAUDE.md §5) se
      resolvió en silencio con un valor inventado.
- [ ] Si el cambio declara un estado de alto impacto con datos
      incompletos, la confianza baja queda explícita, no implícita.

## Seguridad

- [ ] Ver `docs/security-checklist.md` — al menos la sección relevante al
      cambio.
- [ ] Ningún dato sensible del atleta depende de algo que venga del
      cliente sin validar de nuevo del lado del servidor, una vez exista
      backend.

## Calidad de código

- [ ] `npm run lint` (ESLint vía `expo lint`) sin errores.
- [ ] `npx tsc --noEmit` limpio (config de app y, si se tocaron tests,
      `tsconfig.jest.json` también).
- [ ] Pasó por el subagente `code-reviewer` antes de considerarse cerrado.
      Si tocó un modelo de dato ya persistido, también por
      `data-schema-reviewer`.

## Documentación

- [ ] README actualizado si cambió algo que afecta a quien clona/corre el
      proyecto (nueva dependencia, nuevo comando, nueva variable de
      entorno).
- [ ] Si hubo una decisión de arquitectura o de lógica ATR relevante, está
      en CLAUDE.md (§4 estado actual, o resolviendo un punto de §5) — no
      solo en la cabeza de quien la tomó. Nueva entrada breve en §6
      (Registro de sesiones) al cerrar la sesión.

## Antes de tocar datos reales / producción

- [ ] Se confirmó que el cambio no puede tocar datos de un entorno real
      desde desarrollo local (ver `docs/environments.md` — hoy N/A sin
      backend, pero revisar igual cuando exista).
- [ ] Si el cambio modifica la forma de un dato ya persistido, pasó por el
      subagente `data-schema-reviewer`.
