# Beast Mood — Contexto del Proyecto (CLAUDE.md)

> Este archivo es la memoria persistente del proyecto para cualquier sesión de Claude Code.
> Debe leerse ANTES de proponer código, esquemas, endpoints o pantallas.
> Este archivo se actualiza constantemente. Los documentos maestro (sección 9) casi no cambian;
> las secciones 4, 5 y 6 de este archivo sí, y deben mantenerse al día en cada sesión de trabajo.

---

## 0. Qué es Beast Mood

Plataforma inteligente de monitoreo y optimización del rendimiento deportivo. Caso de uso
inicial: taekwondo de alto rendimiento. Diseñada para ser adaptable a otras disciplinas después,
pero **sin codificar esa limitación en la arquitectura** (ver sección 2).

**No es una app de visualización de métricas.** Es un motor de interpretación deportiva que usa
periodización ATR (Ajuste, Carga, Impacto, Recuperación, Activación, Competitivo) e
individualización total por atleta (baseline propio, nunca valores poblacionales) para ayudar
al entrenador a decidir — no para reemplazar su criterio.

**Fase actual del proyecto:** construir primero para uso propio (single-user real, tú como
atleta/entrenador), validar que la lógica funciona con datos reales, y luego generalizar a
multi-usuario. El esquema de datos ya se diseña pensando en multi-usuario desde ahora
(todo indexado por `atleta_id`) para no rehacer trabajo después, pero la app en sí no necesita
auth/roles/multi-tenant completo todavía.

---

## 1. Principio rector (no negociable)

Cuando exista tensión entre "más fácil de programar" y "más fiel a la lógica deportiva
acordada", **gana la lógica deportiva**, aunque implique más trabajo técnico.

**Filtro de las 3 preguntas** — toda funcionalidad nueva debe poder responder:
1. ¿Qué ocurrió?
2. ¿Por qué ocurrió?
3. ¿Qué debería hacerse ahora?

Si una función no contribuye a esto, no pertenece al proyecto, sin importar qué tan atractiva
sea técnicamente o qué tan fácil sea de implementar.

**Individualización siempre:** nunca usar valores universales de HRV/FC. Todo se compara contra
el baseline propio del atleta y el perfil esperado de su microciclo actual.

---

## 2. Rol del asistente de IA (Claude / Claude Code) en este proyecto

- **Guardián de la lógica deportiva:** señalar activamente cuando una propuesta técnica
  (esquema, endpoint, componente UI) simplifique, aproxime o contradiga una regla ya acordada
  en los documentos maestro. No sobrescribir en silencio.
- **Traductor dominio deportivo → software:** convertir reglas de ciencias del deporte en
  lógica explícita y trazable (funciones puras / reglas declarativas), no lógica enterrada
  en componentes de UI.
- **No inventar juicio deportivo:** jerarquía de variables, qué variables "bloquean" un
  estado, qué significa "listo para competir", etc. son decisiones del entrenador. Si no
  están resueltas en los documentos, decirlo explícitamente en vez de asumir un valor.
- **No decorar prematuramente:** no proponer mejoras visuales/animaciones antes de que la
  lógica de interpretación correspondiente esté funcionalmente resuelta.
- **No declarar estados de alto impacto con datos incompletos** (fatiga excesiva, riesgo
  crítico, listo para competir) sin señalar explícitamente la confianza baja del análisis.

---

## 3. Arquitectura de referencia (según documentos maestro — puede diferir del código actual, ver sección 5)

- Frontend: React Native + Expo (a revisar/discutir — ver sección 6, pendiente evaluar código actual).
- Backend previsto: Firebase.
- Integraciones: Apple Health, Apple Watch, API de OpenAI.
- El motor ATR procesa las variables **antes** de mostrarlas en el dashboard. Nunca al revés.
- Seis módulos conceptuales (solo el 1 está detallado hoy):
  1. Registro (Apple Health + formularios subjetivos por botones/descriptores, no números)
  2–6. Pendientes de definir (probablemente: motor ATR, historial/BD, dashboard entrenador,
     IA, predicción de rendimiento — sin confirmar división exacta)

---

## 4. Estado actual del proyecto (ACTUALIZAR EN CADA SESIÓN)

> Última actualización: 2026-07-21 — quinta ronda del día: mensaje de arranque en frío (§1.8),
> comparación secundaria "vs. día anterior", estructura drill-down con veto visual de dolor, escala
> de Borg CR-10 oficial, y toggle Vista Entrenador/Atleta que por fin APLICA la exclusión de "Listo
> para competir" en vez de solo dejarla comentada — implementa la sección 5 punto 13 completa
> (frontend/UX) que había quedado guardada sin codificar en la ronda anterior. También se confirmó
> (sin cambio de código, ya coincidía) el fundamento de literatura para los umbrales de días del
> IRL, y se recibió la spec completa de "Entrenador IA" (sigue bloqueada por falta de
> backend/proxy, sección 5 punto 12). Verificado end-to-end en el navegador. Ver la cuarta y quinta
> entrada de sesión 2026-07-21 en sección 6. Repo en GitHub:
> https://github.com/prograjulian/Beast-Mood

- [x] **Resuelto — captura de datos real en `register.tsx` (2026-07-21).** Hasta esta sesión, todo
      el motor construido en las rondas anteriores (IRL, post-entreno, Listo para competir, notas
      compartibles) no tenía forma de recibir datos reales: los campos de Health eran
      `ReadOnlyMetric` alimentados por `getLiveHealthSnapshot`, que nada escribía (Apple Health
      vacío), y `CoachMetrics` no tenía ninguna pantalla que lo capturara. Se agregaron campos
      editables para FC/HRV/sueño (lectura matutina), post-entreno (2h ±15min) y pre-sueño
      (contexto), y una card "Entrenador (uso del staff)" con las 9 variables de `CoachMetrics` +
      nota privada + nota compartible. `handleSave` arma `HealthSnapshot`/`CoachMetrics` completos
      en vez de reenviar el snapshot vacío sin tocar. **Verificado corriendo la app de verdad**
      (`expo start --web`, navegador vía Chrome DevTools Protocol): flujo completo
      onboarding → registro → home, con FC/HRV/sueño/dolor reales guardados en `AsyncStorage`
      (confirmado leyendo el registro guardado), arranque en frío correcto (sin baseline aún,
      `home.tsx` muestra "Pendiente de evaluación" con confianza Baja, no un estado inventado),
      alerta de dolor visible, IRL correctamente suprimido en "Bajo" (dolor presente pero sin
      confirmación fisiológica por falta de baseline). `npx tsc --noEmit`, `npm run lint` y
      `npm test` (89/89) limpios. **Pasado por `code-reviewer` antes de commitear** (regla de
      sección 10.6): encontró dos hallazgos críticos, ambos corregidos en la misma sesión — (1)
      `handleSave` y la carga inicial de `register.tsx` no tenían `try/catch` (violaba la regla de
      "nunca fallar en silencio", sección 10.1); ahora ambos capturan el error, lo loguean con
      contexto y muestran una alerta al usuario sin perder lo ya escrito en pantalla. (2)
      `register.tsx`/`home.tsx` leían/escribían un campo `currentMicrocycle`/`microcycle` que no
      existía en `AthleteProfile` usando `as any` — se formalizó `currentMicrocycle?: MicrocycleType`
      en `src/model/athletedata/athlete.ts` (opcional, revisado con `data-schema-reviewer`: perfiles
      ya guardados sin el campo siguen cargando bien). `npx tsc --noEmit`, lint y tests (89/89)
      reverificados después de estas correcciones.

- [x] **Resuelto — tercera ronda de decisiones 2026-07-21: Índice de Riesgo de Lesión (IRL) y
      notas privadas/compartibles del entrenador.** Ver la tercera entrada de sesión 2026-07-21
      (sección 6). Resumen: nuevo `src/engine/injuryRiskEngine.ts` (`evaluateInjuryRisk`), árbol
      de decisión acumulativo de 4 niveles (Bajo/Moderado/Alto/Crítico) gateado por dolor/molestia
      presente — resuelve CLAUDE.md §5 punto 8 y Motor ATR §11.2. Refactor de apoyo: se extrajeron
      las tablas de rango FC/HRV/Borg y las funciones de Capa 1 a
      `src/engine/physiologicalRanges.ts` (compartido entre `atrEngine.ts` e
      `injuryRiskEngine.ts`, evita duplicar datos de dominio reales en dos archivos); de paso se
      corrigió una duplicación de tipos ya existente de la ronda anterior
      (`PostWorkoutObservation`/`PostWorkoutTrendResult` declarados dos veces, en
      `postWorkoutEngine.ts` y en `atr.ts` — ahora `postWorkoutEngine.ts` importa del modelo).
      `CoachMetrics` gana `shareableNote` (separado de `coachNotes`, que sigue siendo privado por
      defecto). `buildExplanationPayload` (motor de explicación) gana un parámetro `audience`
      ("coach" por defecto | "athlete") que EXCLUYE `readiness` del payload cuando es "athlete" —
      el guardrail de "nunca revela listo/no listo al atleta" queda aplicado en el paso
      determinístico, no depende de que un futuro paso 2 lo recuerde. 89/89 tests (10 nuevos),
      `tsc`/`eslint` limpios.

- [x] **Resuelto — segunda ronda de decisiones 2026-07-21: "Listo para competir", Índice de
      Confianza, motor de explicación, disonancia texto-vs-número.** Ver la segunda entrada de
      sesión 2026-07-21 (sección 6) para el detalle completo. Resumen: nuevo veredicto "Listo para
      competir" (`evaluateCompetitionReadiness` en `atrEngine.ts`, expuesto como
      `ATRInterpretation.competitionReadiness`) — distinto de Supercompensación, umbral mínimo
      para competir, visible solo en `home.tsx` (decisión de producto: nunca al atleta, efecto
      nocebo documentado). `computeConfidenceLevel` implementa el Índice de Confianza
      (Alta/Media/Baja) que CLAUDE.md §5 ya tenía pre-aprobado como no-bloqueante. Nuevo
      `src/engine/explanationEngine.ts`: tabla fija estado→acción y `buildExplanationPayload`,
      el paso 1 (determinístico) del motor de explicación generalizado — el paso 2 (redacción con
      la API de OpenAI) queda explícitamente sin implementar, decisión explícita del usuario
      (no hay backend/proxy hoy que no exponga la API key en el cliente, CLAUDE.md §10).
      `detectFreeTextDissonance` detecta palabras clave de dolor en `subjective.athleteNotes`
      (campo que ya existía) contra los valores numéricos — mismo mecanismo que la divergencia
      FC/HRV, nunca mueve `state`. 76/76 tests (19 nuevos), `tsc`/`eslint` limpios.

- [x] **Resuelto — informe de decisiones del entrenador 2026-07-21 (primera ronda): 5 bugs + 1
      métrica nueva.**
      Ver la primera entrada de sesión 2026-07-21 (sección 6) para el detalle completo de cada uno. Resumen:
      (A) `isExcessiveFatigue` ya no usa umbrales fijos, usa los mismos rangos+tolerancia por
      microciclo que Capa 1 — restringido a Carga/Impacto a propósito (generalizarlo a los 6
      microciclos rompía Recuperación→Activación, ver el comentario en el código). (B) Modelo de
      captura con 3 tipos de lectura (matutina/post-entreno 2h/pre-sueño,
      `src/model/athletedata/health.ts`) y baseline con ventana móvil real de 7 días
      (`src/engine/baselineEngine.ts`, reemplaza el valor estático) — resuelve el punto 6 de la
      sección 5 (parcialmente: la exclusión de outliers sigue sin resolver). (C) Técnica
      autoreportada pesa menos (no veto) en Capa 2; técnica observada por el entrenador puede
      escalar Fatiga funcional → Fatiga excesiva en Capa 4 (primera vez que Capa 4 hace algo en
      código, antes `input.coach` no se usaba). (D) Supercompensación separa 4 variables
      obligatorias de 3 de apoyo — dato obligatorio faltante ya no cae en silencio a "Recuperación
      adecuada", queda señalado explícitamente. (E) Comentario corregido, la prioridad FC>HRV
      siempre fue una regla confirmada (Motor ATR §2.3), nunca estuvo en duda. Métrica nueva:
      Recuperación Autonómica Post-Entreno (`src/engine/postWorkoutEngine.ts`), Nivel 1 observación
      + Nivel 2 alerta de tendencia, con heurística de "deterioro progresivo" explícitamente
      provisional. 57/57 tests pasando (23 nuevos), `npx tsc --noEmit` y `npm run lint` limpios.

- [x] **Resuelto — test suite en Jest para `atrEngine.ts` (34 tests, todos pasando).**
      Se instaló `jest` + `ts-jest` + `@types/jest` como devDependencies. `jest.config.js` usa
      `tsconfig.jest.json` (extiende el tsconfig principal, agrega `types: ["jest"]` y ajusta
      `rootDir`/`include` a `src/**/*.ts`). El tsconfig principal ahora excluye `**/*.test.ts`
      (Expo no necesita compilar los tests, y sin esa exclusión `npx tsc --noEmit` fallaba
      porque no reconocía los globals de Jest). Nuevo script `npm test`. Cobertura en
      `src/engine/atrEngine.test.ts`: Capa 1 (incluye tests de regresión específicos para el bug
      de divergencia FC/HRV encontrado la sesión anterior), Capa 2 (dominancia de dolor/fatiga,
      umbrales de rendimiento por microciclo), Capa 3 + Nivel 1 (los 5 estados oficiales, incluida
      Supercompensación con y sin coherencia multivariable), Nivel 2 (las 5 transiciones, con
      casos de "ocurrió"/"no ocurrió", bloque anterior ausente, y salto de microciclo sin regla
      documentada), Nivel 3 (el gate de historial insuficiente, incluido el conteo correcto de
      macrociclos completos), `describeExpectedVsActual`, y casos borde (sin microciclo, sin
      baseline).
      **Segundo bug real encontrado (esta vez escribiendo los tests, antes de correrlos):** en
      Carga/Impacto, cuando FC y HRV caían *dentro* del rango esperado (que ya es la zona de
      fatiga funcional por diseño, Motor ATR §1.2/§1.3) con subjetivo coherente, el motor
      devolvía "Recuperación adecuada" en vez de "Fatiga funcional" — `mapDissonanceToState`
      trataba la etiqueta genérica "Dentro de lo esperado" de la Capa 3 igual en todos los
      microciclos, sin considerar que en Carga/Impacto esa etiqueta específicamente significa
      fatiga funcional, no neutralidad. Corregido con un caso especial para esos dos microciclos;
      hay un test de regresión (`"Carga dentro del rango esperado... -> Fatiga funcional"`) que
      lo fija. **Tercer ajuste (no bug, aclaración):** el texto de la nota de Nivel 2 para
      Activación→Competitivo insinuaba que esa transición no afectaba el estado final: sí lo
      afecta (puede promover a "Preparación insuficiente", igual que las demás transiciones,
      correcto según la definición general de §0.1) — solo Supercompensación en sí la sigue
      decidiendo el Nivel 1. Se reescribió el texto para no ser engañoso.

- [x] **Resuelto — Capas 1–3 del motor (§2–4), Nivel 2 (§5.2) y estados oficiales (§0.1).**
      `atr.ts`: `ATRState` ahora son los 5 estados oficiales del documento (`Recuperacion
      adecuada`, `Fatiga funcional`, `Fatiga excesiva`, `Preparacion insuficiente`,
      `Supercompensacion`, más `Pendiente de evaluacion`) — ya no hay estados no oficiales.
      `atrEngine.ts` reescrito con la arquitectura de capas documentada: Capa 1 resuelve FC vs
      HRV con prioridad de FC y bandera `divergenceFcHrv` (banda de tolerancia ±3%, §2.1,
      "sugerido", provisional); Capa 2 agrega variables subjetivas con dolor/fatiga/molestia
      dominante (umbral ≥8, ya usado antes en el motor) — la fórmula exacta de agregación sigue
      pendiente de validar (§14.1), esto es una implementación provisional razonable, no la
      versión final; Capa 3 implementa la tabla de cruce fisiológico×subjetivo de 7 resultados
      (§4) y expone la etiqueta de disonancia (`dissonanceLabel`) en `ATRInterpretation`.
      **Bug encontrado y corregido durante pruebas:** la clasificación cruda de HRV usa una
      convención de signo opuesta a la de FC (FC alto = más fatiga; HRV alto = más fresco), así
      que comparar las etiquetas crudas directamente marcaba como "divergencia" los casos donde
      ambas fuentes coincidían perfectamente en "más fatiga" o "más fresco". Se agregó
      `toFatigueAxis` para normalizar HRV al mismo eje antes de comparar. Verificado con smoke
      tests manuales (compilados a JS y ejecutados con `node`, ver escenarios en la sesión) —
      no hay test suite automatizado en el repo todavía.
      Nivel 2 (`evaluateLevel2`/`evaluateTransition` en `atrEngine.ts`): detecta bloques
      contiguos de microciclo en el historial (`DailyRecord[]`) y aplica las 5 reglas de
      transición documentadas (§5.2: Ajuste→Carga, Carga→Impacto, Impacto→Recuperación,
      Recuperación→Activación, Activación→Competitivo) comparando promedios de bloque. Solo se
      evalúa si el bloque anterior coincide exactamente con el predecesor esperado en la
      secuencia — si el entrenador saltó o repitió un microciclo, Nivel 2 se abstiene en vez de
      forzar una regla que no aplica. Puede promover el estado final a `Preparacion insuficiente`
      o `Fatiga excesiva` (§5.2: "alimentan directamente" esos dos estados). `DailyRecord` ahora
      guarda `atrState`/`dissonanceLabel`/`divergenceFcHrv` calculados (CLAUDE.md §8: ninguna
      bandera de disonancia se descarta) — `home.tsx` los persiste de vuelta al historial cada
      vez que carga.
      **Nivel 3 (§5.3) deliberadamente NO implementado como análisis real:** requiere al menos
      2–3 macrociclos completos de historial (que el proyecto todavía no tiene, recién empezando)
      y está ligado al roadmap de IA (aprendizaje de patrones, no solo comparación numérica).
      `evaluateLevel3` solo cuenta macrociclos completos y devuelve un mensaje honesto de
      "historial insuficiente" (mismo patrón que el arranque en frío del baseline, §1.8) — se
      decidió así en vez de inventar lógica de patrones sin datos reales para probarla contra.
      Índice de Evolución ATR (§5.5) y Perfil Competitivo Individual (§13) siguen sin
      implementar — dependen de macrociclos completos, mismo bloqueo que Nivel 3.

- [x] **Resuelto — historial real de registros diarios.** `metricsRepository.ts` fue reescrito:
      ya no guarda un único objeto por categoría, ahora acumula un array `DailyRecord[]` por
      `athleteId` (`saveDailyRecord` hace upsert por `date`, nunca sobreescribe otro día). Nuevo
      modelo `src/model/athletedata/dailyRecord.ts` unifica health/subjective/training/coach/
      microciclo/notas en un solo registro diario (reemplaza el `DailyMetrics` viejo, que
      duplicaba campos con nombres divergentes — `technicalQuality` vs `techniqueQuality`, etc.
      — y quedó eliminado). ~~`HealthBaseline` sigue siendo un valor único por atleta (no
      histórico) porque el tamaño de ventana móvil y el umbral de outliers todavía no están
      confirmados por el entrenador~~ **la ventana móvil se resolvió el 2026-07-21** (7 días, ver
      `src/engine/baselineEngine.ts` y la entrada de sesión correspondiente) — el umbral de
      exclusión de outliers sigue sin confirmar (sección 5, punto 6). Se agregó
      `getLiveHealthSnapshot`/`saveLiveHealthSnapshot` como slot único explícito para el dato de
      Health "en vivo" del día en curso, antes de confirmarse como parte del historial (distinto
      del historial real, a propósito). Todo indexado por `athleteId` desde ahora (sección 8).
      `register.tsx` y `home.tsx` migrados al nuevo API; `home.tsx` ahora lee `getLatestDailyRecord`
      en vez de cuatro objetos sueltos. Esto desbloquea (pero todavía no implementa) baseline con
      ventana móvil, Niveles 2/3 de comparación e Índice de Evolución ATR.

- [x] Código existente revisado con Claude (proyecto Expo/React Native en `BeastMoodApp/`, no el
      código Python suelto de `BeastMood/`, que es un prototipo previo/paralelo sin relación
      directa con este stack).
- [x] Confirmado: el stack actual sí es React Native + Expo, coincide con lo documentado
      (Documento Maestro Extendido §9). No hay motivo detectado para cambiar de framework —
      el problema es "lógica ATR incompleta", no "stack incorrecto", como se sospechaba.
- [x] Auditado qué parte del Motor ATR v1 está implementada (`src/engine/atrEngine.ts`) vs. lo
      documentado. Hallazgos:
  - **Bien alineado:** captura subjetiva 100% por botones/descriptores (`register.tsx`, cumple
    Documento Maestro §7 módulo 1), perfiles esperados de FC/HRV/Borg por microciclo (tabla §1.7),
    regla de "más fresco de lo esperado ≠ bueno" en Carga/Impacto (§1.2/1.3).
  - ~~Falta implementar — modelo de capas del motor (§2–4)~~ **resuelto el 2026-07-16**, ver
    primer punto de esta sección.
  - ~~Falta implementar — Niveles 2 y 3 de comparación (§5)~~ **Nivel 2 resuelto el 2026-07-16;
    Nivel 3 deliberadamente diferido** (requiere historial de macrociclos que no existe todavía
    y está ligado al roadmap de IA) — ver primer punto de esta sección.
  - ~~Estados oficiales (§0.1) no coinciden exactamente~~ **resuelto el 2026-07-16**, ver primer
    punto de esta sección.
  - **Sigue sin implementar:** Índice de Evolución ATR (§5.5), Índice de Riesgo de Lesión / IRL
    (§11), Perfil Competitivo Individual (§13, esperable en esta fase — bloqueados por falta de
    macrociclos completos, igual que Nivel 3), modelo de recomendación explícito qué/por
    qué/qué hacer generalizado a los 5 estados (§10.1, hoy solo resuelto conceptualmente para
    fatiga excesiva en el documento, no como plantilla de texto en código), Capa 4 — entrenador
    (§6, ni `CoachMetrics` tiene pantalla que lo capture todavía).
- [x] ~~Hallazgo crítico — violación del principio "no negociable" de persistencia longitudinal~~
      **resuelto el 2026-07-16**, ver primer punto de esta sección para el detalle.
- [x] Integración Apple Health (`src/services/health/*.ts`: appleHealth, healthConnect,
      healthService, mapper, permissions) — **archivos vacíos (0 líneas), aún no arrancada**.
      Coherente con el roadmap declarado (System Prompt §4/§6: Apple Health → BD → historial →
      dashboard → IA), no es un desvío, solo el siguiente paso pendiente.
- [x] `athleteRepository.ts` también vacío (0 líneas).
- [x] ~~No hay separación Dashboard Atleta / Dashboard Entrenador~~ **parcialmente resuelto el
      2026-07-21** — `home.tsx` gana un toggle de UI "Vista Entrenador / Vista Atleta" (`viewMode`)
      que oculta la card "Listo para competir" en modo Atleta (antes solo era un comentario sin
      aplicar en código). Es explícitamente un filtro de PRESENTACIÓN, no una separación real de
      pantallas/rutas ni un límite de seguridad (el proyecto sigue en fase single-user, sin
      auth/roles, CLAUDE.md §0) — sigue sin existir una pantalla de atleta genuinamente separada
      (ruta propia, contenido propio más allá de ocultar una card). Cuando exista multi-usuario
      real, este toggle debe reemplazarse por una separación real, no solo ampliarse.
- [x] ~~`CoachMetrics` existe como modelo (guardado/leído) pero ninguna pantalla lo captura
      todavía~~ **resuelto el 2026-07-21** — se captura en una card dedicada dentro de
      `register.tsx` ("Entrenador (uso del staff)"). Sigue sin existir una pantalla SEPARADA para
      el entrenador (eso es la separación de dashboards, bullet de arriba, un gap distinto).
- [ ] No existe "procedencia del dato" (medido/reportado/ausente). ~~Índice de Confianza del
      Análisis~~ **implementado el 2026-07-21**, ver sección 5.
- [x] ~~No hay mensaje de arranque en frío (§1.8) cuando falta baseline~~ **resuelto el 2026-07-21**
      — `atrEngine.ts` ahora distingue, dentro del `default` de `mapDissonanceToState`, si la causa
      es específicamente falta de baseline (`fcBaseline`/`hrvBaseline` no numéricos) y en ese caso
      usa `COLD_START_MESSAGE` en vez del genérico "Pendiente de evaluación.". Verificado en el
      navegador con un perfil recién creado, sin historial: el mensaje real que aparece es
      "Recolectando datos para dar un análisis concreto...". `expectedVsActualReady` sigue
      existiendo tal cual para la UI que ya lo consumía.
- Lógica deportiva (documentos maestro): ampliamente definida, ver sección 9.
- Huecos de diseño abiertos: ver sección 5 (varios requieren decisión del entrenador antes de
  poder codificarse con confianza).

---

## 5. Decisiones pendientes (resumen vivo — fuente completa: `Beast_Mood_Preguntas_Estructurales.md`)

### Requieren al entrenador (NO inventar, preguntar):
1. ~~Variables obligatorias vs. de apoyo para declarar "listo para competir" en general~~
   **resuelto el 2026-07-21** — estado nuevo "Listo para competir" (`evaluateCompetitionReadiness`
   en `atrEngine.ts`), distinto de Supercompensación: 4 obligatorias (FC, HRV, piernas ≥6, técnica
   ≥6 como piso individual) + veto total por dolor/fatiga/molestia ≥8 + 4 de apoyo (explosividad,
   velocidad/reacción, confianza, motivación). El umbral de 6 para las variables de apoyo de este
   veredicto específico (`READINESS_SUPPORTING_THRESHOLD`) es una elección provisional propia, no
   confirmada por el entrenador — el informe de decisiones no dio ese número. El precedente previo
   (Bug D, Supercompensación: 4 obligatorias — FC, HRV, piernas, Borg — + 3 de apoyo) sigue vigente
   como un veredicto aparte, más exigente.
2. Jerarquía/peso de cada variable (¿pesa más HRV, técnica, explosividad, dolor?) — **parcialmente
   resuelto para técnica** (Bug C, ver punto 5 abajo), sigue abierto para el resto.
3. Lista de variables "bloqueadoras" que nunca deben compensarse (ej. dolor 8/10 con todo lo
   demás perfecto → ¿se puede declarar "listo"? mecanismo técnico ya propuesto: capa de veto).
4. Confirmar si la resolución por defecto de contradicciones (mostrar ambas lecturas, nunca
   ocultar la disonancia) es suficiente o si necesita veto como el punto 3.
5. Rol final de las observaciones del entrenador: ¿anulan una alerta del sistema, o solo la
   matizan en el registro? **Sigue sin resolver en general.** El informe de decisiones 2026-07-20
   (Bug C) sí resolvió el caso específico de técnica: técnica observada por el entrenador
   (`coach.technique`) puede *reforzar* (escalar Fatiga funcional → Fatiga excesiva), nunca
   *anular* una lectura mejor. No se generalizó al resto de observaciones del entrenador.
6. ~~Tamaño exacto de ventana móvil del baseline~~ **resuelto el 2026-07-20** (Bug B.2: 7 días
   calendario, mínimo 4 lecturas válidas — ver `src/engine/baselineEngine.ts`). El **umbral de
   exclusión de outliers (±2–3 desviaciones estándar, Motor ATR §1.8) sigue sin resolver** — no
   implementado, no inventado.
7. Cuántos resultados competitivos mínimos para que el Perfil Competitivo Individual
   (Motor ATR sección 13) tome precedencia sobre el perfil genérico (propuesta a validar: 3–5 podios).
8. ~~Ponderación exacta de variables/categorías del Índice de Riesgo de Lesión (IRL) y umbrales
   numéricos entre Bajo/Moderado/Alto/Crítico~~ **resuelto el 2026-07-21** — árbol de decisión
   acumulativo en `src/engine/injuryRiskEngine.ts` (`evaluateInjuryRisk`). **Confirmado el
   2026-07-21 (quinta interacción del día):** el usuario trajo la definición completa
   Bajo/Moderado/Alto/Crítico con fundamento de literatura (reducción de HRV ~4.5% tras 3-5 días de
   carga alta en nadadores; aceleración del deterioro fisiológico ~7 días antes de lesión en
   triatletas — Crítico se fija en 5 días, antes del punto de aceleración, filosofía "alerta
   temprana, no diagnóstico") y coincide EXACTAMENTE con la implementación ya existente: `sustained
   >= 3` para Alto, `sustained >= 5` Y `decliningCount >= 2` para Crítico. No se cambió código, solo
   se confirma que los umbrales de días/variables ya no son una elección propia de Claude sino
   una decisión del entrenador respaldada en literatura. Los dos números que siguen sin confirmar
   explícita del entrenador son otros: el piso de "dolor/molestia leve presente" (≥3, mismo valor
   que "Leve" en las opciones de captura) y el umbral de "por debajo de lo esperado" por variable
   de rendimiento (reusa los mismos números que ya usa Capa 2 — 4 en Carga/Impacto, 5 en el resto).
9. Confirmar si las "Alertas" del Dashboard Entrenador son exactamente los 4 tipos de la
   sección 11.4 del Motor ATR, o si hay tipos adicionales.
10. Fórmula exacta de "deterioro progresivo" para la Recuperación Autonómica Post-Entreno (métrica
    nueva del informe de decisiones 2026-07-20) — se implementó una heurística provisional (3
    lecturas consecutivas empeorando dentro del bloque actual, ver `src/engine/postWorkoutEngine.ts`),
    explícitamente no confirmada por el entrenador.
11. Índice/unidad real de HRV que entregará Apple Health cuando se integre (rMSSD vs. SDNN —
    Apple Health reporta SDNN por defecto, distinto del rMSSD al que aplica la literatura citada
    en el informe de decisiones 2026-07-20 para el promedio móvil con ln-transform). No se fuerza
    ninguna transformación todavía porque no se sabe qué índice va a llegar.
12. Diseño del backend/proxy para la capa de redacción con IA del motor de explicación (informe de
    decisiones 2026-07-21) — el paso determinístico ya está implementado
    (`src/engine/explanationEngine.ts`), pero llamar a la API de OpenAI directo desde la app
    expondría la API key en el cliente (CLAUDE.md §10: nunca hardcodear secretos). Necesita un
    backend/Cloud Function que no exista todavía (Firebase solo "previsto", §3). Decisión explícita
    del usuario 2026-07-21: no implementar esa llamada hasta que exista ese proxy.
13. **Decisiones de Frontend/UX (informe de decisiones 2026-07-21, a partir de un mockup) —
    IMPLEMENTADAS el 2026-07-21** (cuarta ronda del mismo día; recibidas y guardadas sin
    implementar en la tercera ronda, el usuario pidió retomarlas en esta ronda):
    - **Eliminar cualquier score único tipo "Readiness 87/100".** Contradice el principio
      fundacional del proyecto (nunca reducir el estado a un número genérico tipo Whoop). El
      estado se comunica siempre por los 6 estados oficiales (o "no evaluable"), nunca como score
      aislado. (Verificado el 2026-07-21: sigue sin existir ningún score de ese tipo en el código —
      regla preventiva, nada que implementar.)
    - **Comparación de dos niveles, no uno** -- ~~la secundaria NO está implementada~~ **resuelto**:
      `describeVsPreviousDay` en `atrEngine.ts` (delta FC/HRV/sueño vs. el registro previo,
      puramente informativo, sin semáforo propio, nunca decide `state`). Si el atleta se salta
      días de registro, la etiqueta lo refleja ("vs. último registro (hace N días)") en vez de
      decir "vs. día anterior" cuando no lo es (hallazgo de `code-reviewer`, corregido antes de
      cerrar).
    - **Estructura drill-down** -- ~~NO implementado~~ **resuelto**: `home.tsx` ahora separa resumen
      (siempre visible: estado ATR, confianza, IRL si no es Bajo, alertas) de detalle plegable
      ("Ver detalle": comparación esperado-vs-actual, disonancia, Nivel 2/3, desglose subjetivo y
      de carga). Dolor/molestia elevado (mismo umbral que el gate de IRL, `isPainElevated` en
      `physiologicalRanges.ts`) sube al resumen aunque sea una variable "subjetiva" -- el veto
      visual documentado.
    - **Escala de Borg CR-10 oficial** -- ~~NO implementado~~ **resuelto**: `register.tsx`
      (`BORG_OPTIONS`) ahora usa los anclajes verbales oficiales (0 Nada en absoluto ... 10 Máximo
      esfuerzo, 6 y 8 omitidos a propósito). Verificado que `getBorgExpectedRange` en
      `physiologicalRanges.ts` ya usaba estos mismos rangos reales (Carga 5-8, etc.) desde antes --
      solo la UI estaba desalineada, no la lógica de dominio.
    - **"Subcompensado" descartado** — confirmación sin acción de código, sigue sin agregarse.
    - **"Sensación general" = variables ya existentes** — sin acción de código, restricción
      respetada (no se crearon campos duplicados).
    - **"Listo para competir" nunca visible al atleta** -- ~~solo comentado en código~~ **aplicado**:
      `home.tsx` gana un toggle "Vista Entrenador / Vista Atleta" (`viewMode`) que oculta la card
      en modo Atleta. Es un filtro de PRESENTACIÓN, no una separación real de dashboards ni un
      límite de seguridad (sigue sin auth/roles, fase single-user) -- ver también el gap de
      sección 4 ("separación Dashboard Atleta/Entrenador").
    - **"Entrenador IA" — spec recibida el 2026-07-21 (quinta interacción del día), NO
      implementada todavía.** El usuario confirmó qué es: chat conversacional para el atleta,
      mismo motor de explicación (Capa 2, ya implementado en `explanationEngine.ts`) pero en
      formato pregunta-respuesta. Restricción no negociable (ya aplicada en código desde la
      tercera ronda): nunca revela "listo/no listo" (`buildExplanationPayload` excluye `readiness`
      cuando `audience==="athlete"`). Contexto: solo `CoachMetrics.shareableNote` (ya implementado)
      entra al chat, nunca `coachNotes` (privada). Confirmado: el diseño ya está resuelto en
      `explanationEngine.ts` tal cual (`coachShareableNote` en el payload, guardrail de audiencia)
      -- lo que falta es únicamente la UI de chat + la llamada real a la API de OpenAI, bloqueada
      por la misma razón de siempre (sección 5 punto 12: no hay backend/proxy que no exponga la
      API key en el cliente). No se implementó nada nuevo de código para esto en esta ronda, ya
      estaba listo de rondas anteriores.

### Ya tienen propuesta inicial (arquitectura, se puede avanzar sin bloquear):
- ~~Índice de Confianza del Análisis (Alta/Media/Baja según variables disponibles)~~ **implementado
  el 2026-07-21** (`computeConfidenceLevel` en `atrEngine.ts`, versión provisional razonable — los
  umbrales exactos de completitud de datos no están confirmados por el entrenador).
- Procedencia del dato (medido / reportado / ausente / no aplica).
- Prioridad de alertas simultáneas (propuesta: seguridad del atleta primero, luego preparación
  competitiva, luego recuperación/carga general).
- ~~Motor de explicación en lenguaje natural~~ **paso determinístico implementado el 2026-07-21**
  (`src/engine/explanationEngine.ts`: tabla fija estado→acción + `buildExplanationPayload`) — la
  redacción en lenguaje natural en sí (paso 2, con IA) sigue sin implementar, ver punto 12 arriba.
- Fórmula exacta del Índice de Evolución ATR: propuesta inicial dada (sección 5.5 del Motor
  ATR), no validada — granularidad confirmada: por macrociclo completo.

---

## 6. Registro de sesiones (log corto — añadir una entrada breve al final de cada sesión relevante)

- **2026-07-08** — Se crea este `CLAUDE.md` a partir de los 5 documentos maestro ya existentes
  (System Prompt, Documento Maestro Extendido, Motor ATR v1, Preguntas Estructurales, Documento
  Maestro Borrador Integral). Próximo paso acordado: revisar el código ya avanzado en Visual
  Studio contra esta lógica antes de decidir sobre framework/frontend.
- **2026-07-08** — Primera auditoría de código contra los documentos maestro (ver sección 4 para
  el detalle completo). Confirmado: stack correcto (React Native + Expo), no hace falta cambiar
  de framework. El motor ATR actual (`atrEngine.ts`) cubre solo el Nivel 1 de comparación
  (perfil esperado por microciclo) y una versión simplificada del cruce fisiológico-subjetivo;
  faltan Niveles 2/3, IRL, Índice de Evolución ATR y el modelo de capas con bandera de divergencia
  FC/HRV. Hallazgo más urgente: `metricsRepository.ts` sobreescribe un único registro por
  categoría en vez de mantener historial diario — bloquea casi todo lo demás (baseline con
  ventana móvil, comparación entre microciclos, registro de macrociclo). Integración Apple Health
  y `athleteRepository.ts` siguen vacíos (esperado, es el siguiente paso del roadmap). Próximo
  paso sugerido: decidir si se ataca primero el historial real (fundacional) o se sigue el
  roadmap literal (Apple Health primero).
- **2026-07-16** — Se eligió atacar primero el historial real (opción fundacional). Reescrito
  `metricsRepository.ts` para acumular `DailyRecord[]` por `athleteId` en vez de sobreescribir un
  único objeto por categoría (detalle completo en sección 4). `register.tsx` y `home.tsx`
  migrados; `npx tsc --noEmit` pasa limpio. No se tocó el motor ATR (`atrEngine.ts`) ni se
  implementó cálculo de baseline por ventana móvil — sigue pendiente de la decisión del
  entrenador (sección 5, punto 6). Próximo paso sugerido: con historial real ya disponible,
  decidir entre (a) implementar Apple Health para dejar de depender de datos manuales, o
  (b) construir Niveles 2/3 del motor ATR sobre el historial ya persistido.
- **2026-07-16** — Se eligió (b). Reescrito `atr.ts`/`atrEngine.ts` con la arquitectura de capas
  del Motor ATR (Capas 1–3, §2–4), los 5 estados oficiales (§0.1) y Nivel 2 (§5.2, comparación
  contra el bloque de microciclo anterior). Nivel 3 (§5.3) deliberadamente diferido con un gate
  honesto de "historial insuficiente" en vez de simularlo sin datos — detalle completo en sección
  4. Durante pruebas manuales (smoke test compilado y corrido con `node`, no hay test suite
  automatizada en el repo) se encontró y corrigió un bug real: la clasificación cruda de HRV usa
  convención de signo opuesta a la de FC, así que comparar las etiquetas sin normalizar marcaba
  como "divergencia FC/HRV" los casos donde ambas fuentes coincidían perfectamente. `npx tsc
  --noEmit` pasa limpio. Próximo paso sugerido: decidir entre (a) implementar Apple Health, o
  (b) escribir un test suite real (Jest) para el motor ATR — hoy solo hay verificación manual ad
  hoc, no cubierta por CI ni reproducible sin repetir los pasos de esta sesión.
- **2026-07-16** — Se eligió (b). Se agregó Jest (`jest` + `ts-jest` + `@types/jest`,
  `jest.config.js`, `tsconfig.jest.json`, script `npm test`) y `src/engine/atrEngine.test.ts` con
  34 tests cubriendo Capas 1–3, Nivel 1, Nivel 2 y Nivel 3 (detalle completo en sección 4).
  Escribir los tests encontró un segundo bug real (además del de divergencia FC/HRV de la sesión
  anterior): en Carga/Impacto, "dentro del rango esperado" se mapeaba a "Recuperación adecuada"
  en vez de "Fatiga funcional". Corregido antes de que los tests se escribieran en verde, con un
  test de regresión que lo cubre. `npm test` (34/34) y `npx tsc --noEmit` (app y jest tsconfig)
  pasan limpio. Cambios sin commitear todavía al cierre de esta sesión — próximo paso sugerido:
  revisar el diff, commitear/pushear, y luego decidir entre Apple Health o seguir avanzando en el
  motor (IRL, Índice de Evolución ATR, Perfil Competitivo Individual — todos bloqueados por falta
  de macrociclos completos reales, así que probablemente Apple Health es el desbloqueador más
  productivo ahora).
- **2026-07-20** — Se integraron al proyecto las reglas de ingeniería de una plantilla base
  genérica (Python/Django-oriented), adaptadas a este stack (React Native + Expo + TypeScript, sin
  backend propio todavía) — detalle completo en la nueva sección 10. Resumen: se agregó ESLint
  (`eslint-config-expo` 56.0.4, `eslint.config.js` — no estaba instalado, `npm run lint` fallaba
  antes de esta sesión; corre limpio con 0 errores, 7 warnings preexistentes sin tocar), CI en
  GitHub Actions (`.github/workflows/ci.yml`: lint + `tsc --noEmit` + Jest + `gitleaks` +
  `npm audit`, corre en cada push a `main`), y cinco subagentes en `.claude/agents/` adaptados al
  dominio del proyecto (`code-reviewer` con criterios específicos de fidelidad a la lógica
  deportiva CLAUDE.md §1/§2, `data-schema-reviewer` — nuevo, equivalente al revisor de migraciones
  de la plantilla pero para cambios a modelos ya persistidos en `AsyncStorage`/Firestore,
  `doc-updater`, `test-writer`, `release-manager`). Se agregaron `docs/git-workflow.md`,
  `docs/security-checklist.md`, `docs/environments.md`, `docs/error-monitoring.md` y
  `docs/definition-of-done.md`, todos adaptados (no copiados) al estado real del proyecto. Decisión
  explícita del usuario, confirmada antes de implementar: seguir trabajando directo sobre `main`
  (sin rama `dev`/PR) mientras el proyecto sea single-user, con el subagente `code-reviewer` como
  gate de calidad invocado proactivamente por Claude Code (sin requerir aprobación manual del
  usuario en cada cambio) y el CI como red de seguridad independiente que no depende de que nadie
  se acuerde de invocar nada. Pre-commit hooks locales quedaron diferidos (no hay `pre-commit`ni
  `gitleaks` instalados localmente) — el escaneo de secretos corre solo en CI por ahora. No se
  adoptaron `docs/django.md`/`flask.md`/`fastapi.md`/`decision-framework.md`/`automation.md` de la
  plantilla base — no aplican a este stack, ver el cierre de la sección 10 para el detalle de qué
  se dejó fuera y por qué. `npm run lint`, `npx tsc --noEmit` (app y jest), y `npm test` (34/34)
  verificados limpios tras los cambios. Commiteado y pusheado (`837be31`). Dos commits de
  seguimiento el mismo día: `9d3ebbc` actualiza `actions/checkout`/`actions/setup-node`/
  `gitleaks-action` a versiones sin la deprecación de Node 20 que GitHub anunció para 2026
  (sin cambios de comportamiento), y `e7272de` corrige los 7 warnings de ESLint preexistentes
  (helper duplicado sin uso en `home.tsx`, import sin usar en `metricsRepository.ts`, imports
  duplicados fusionados, variable `hrvRange` sin uso en `atrEngine.ts` — señalada esa última como
  posible hueco de lógica, no solo estilo, ver el bug A de la entrada siguiente). CI verificado en
  verde en GitHub Actions después de cada push.
- **2026-07-21** — El usuario pidió una revisión honesta de la interpretación de datos del motor
  ATR (Capas 1–3, no los microciclos en sí, que quedan tal como están) comparada contra literatura
  real de ciencias del deporte. Hallazgos entregados: la filosofía general (individualización,
  nunca declarar por una sola variable, subjetivo tan válido como fisiológico) coincide con
  consenso real (Meeusen et al. 2013 ECSS/ACSM sobre sobreentrenamiento; Saw/Main/Gastin 2016 sobre
  medidas subjetivas; Foster 2001 para carga interna, ya bien implementado). Se reportaron 5
  hallazgos concretos (A–E). El usuario los llevó a una sesión de decisión con el entrenador y
  volvió con un informe de decisiones que resuelve los 5 más una métrica nueva no prevista
  originalmente. Todo implementado y verificado en esta sesión (57/57 tests, incluidos 23 nuevos;
  `npx tsc --noEmit` y `npm run lint` limpios):
  - **Bug A (fix directo):** `isExcessiveFatigue` en `atrEngine.ts` usaba umbrales fijos
    (`fcDelta>18`, `hrvDelta<-30`) independientes de la tolerancia por microciclo ya definida en
    Capa 1 — un FC +19% en Carga (centro exacto de la fatiga funcional buscada, Motor ATR §1.2) se
    marcaba "Fatiga excesiva" solo porque 19>18. Ahora usa `classifyAgainstRange`/`toFatigueAxis`
    con los mismos `getFcTargetRange`/`getHrvTargetRange` + tolerancia que el resto del motor.
    **Ajuste encontrado al correr los tests existentes, no estaba en el informe:** generalizar
    este check a los 6 microciclos (no solo Carga/Impacto) rompía Recuperación→Activación —
    bandas esperadas muy angostas ahí (ej. Activación 0%–+5%) hacían que cualquier HRV
    "por_debajo" se declarara "Fatiga excesiva" de inmediato, saltándose Capa 3 y Nivel 2 (que es
    quien debe decidir "Preparación insuficiente" en ese caso). Se mantuvo restringido a
    Carga/Impacto, igual que ya estaba el check de FC antes del fix.
  - **Bug B (captura + baseline):** `health.ts` gana `PostWorkoutReading`/`PreSleepReading` como
    estructuras separadas de la lectura matutina (que sigue siendo `restingHeartRate`/`hrv`, sin
    rename — ya era la única que alimenta Capa 1). Nuevo `src/engine/baselineEngine.ts`:
    `calculateHealthBaseline` implementa la ventana móvil de 7 días calendario (los 7 días
    *anteriores* al día evaluado, sin incluirlo — evita comparar un día contra un baseline que ya
    lo contiene a él mismo), excluye días de Carga/Impacto (Motor ATR §1.8, ya confirmado antes),
    y si hay menos de 4 lecturas válidas en la ventana mantiene el baseline anterior en vez de
    sobreescribirlo con un promedio poco representativo. Conectado en `home.tsx`: calcula y
    persiste el baseline real en cada carga, reemplazando el valor estático que se leía sin
    recalcular. **Sin resolver, no inventado:** exclusión de outliers por desviación estándar
    (§1.8), y si HRV llegará como rMSSD o SDNN vía Apple Health (Apple Health por defecto da SDNN,
    no rMSSD, que es a lo que aplica el ln-transform que cita el informe de decisiones) — por eso
    no se aplicó ninguna transformación logarítmica todavía.
  - **Bug C (Capa 2 + Capa 4):** técnica autoreportada (`techniqueQuality`) sigue en el promedio
    subjetivo de `getPerformanceDirection`, pero con la mitad de peso que el resto (constante
    `TECHNIQUE_SELF_REPORT_WEIGHT`), no veto. Técnica observada por el entrenador
    (`coach.technique`) es nueva en el motor — antes `ATRInput.coach` no se usaba en ningún lado
    de `evaluateATR` — ahora, si es ≤2, agrega una alerta explícita y escala Fatiga funcional →
    Fatiga excesiva (nunca degrada un estado ya mejor ni anula uno ya peor). Es la primera vez que
    Capa 4 (Motor ATR §6) hace algo en código. El rol general de "anular vs. matizar" del
    entrenador (§14.3) sigue sin resolver — esto cubre solo el caso específico de técnica.
  - **Bug D (Supercompensación):** `isSupercompensationCoherent` (AND de 6 variables, sin
    distinguir "no cumple" de "no se reportó") reemplazada por `evaluateSupercompensation`: 4
    obligatorias (FC ≤-3%, HRV entre +5% y +20%, piernas ≥8, Borg ≤2) deben estar presentes Y
    cumplirse todas; 3 de apoyo (explosividad, velocidad/reacción — el modelo no tiene un campo de
    "reacción" separado, `speedReaction` cubre ambas —, motivación) pueden faltar sin bloquear la
    declaración, pero generan una alerta explícita de qué falta. Si falta una obligatoria, ya no
    cae en silencio a "Recuperación adecuada": el mensaje dice explícitamente qué dato falta y que
    no fue evaluable (CLAUDE.md §2: no descartar un estado de alto impacto con datos incompletos
    sin marcar la confianza baja).
  - **Bug E (solo comentario):** el comentario en `atrEngine.ts` agrupaba la prioridad FC>HRV
    junto con la banda de tolerancia ±3% bajo "provisional" — la prioridad siempre fue una regla
    confirmada (Motor ATR §2.3), solo el ancho de la tolerancia sigue abierto. Reescrito para no
    ser engañoso. Sin cambio de lógica.
  - **Métrica nueva — Recuperación Autonómica Post-Entreno:** no estaba en el reporte de bugs
    original, surgió de la discusión con el entrenador. Nuevo `src/engine/postWorkoutEngine.ts`:
    Nivel 1 (`observePostWorkoutRecovery`) calcula deltas contra baseline de una lectura ~2h
    (±15min) post-entreno, modo observación pura, nunca dispara estado (no hay rangos esperados
    documentados para esta métrica, no se inventaron). Nivel 2 (`evaluatePostWorkoutTrend`)
    detecta deterioro progresivo de HRV post-entreno dentro del bloque de microciclo actual →
    alerta temprana (no cambia `state`). Arranque en frío: gate de 7 lecturas válidas históricas
    del mismo TIPO de microciclo (piso 5). **Heurística de "deterioro progresivo" explícitamente
    provisional** (3 lecturas consecutivas empeorando) — el documento de decisiones no define la
    fórmula exacta, queda en sección 5 punto 10 como pendiente de confirmar.
  - Refactor de apoyo: `getMicrocycleBlocks`/`MicrocycleBlock` se movieron de `atrEngine.ts` a
    `src/engine/microcycleBlocks.ts` (compartido con `postWorkoutEngine.ts`, evita una dependencia
    circular entre los dos motores).
  Próximo paso sugerido: revisar el diff con el entrenador, commitear/pushear, y decidir entre
  implementar Apple Health (para dejar de depender de captura manual, y para poder confirmar el
  índice real de HRV pendiente arriba) o seguir cerrando huecos de sección 5 (IRL, Perfil
  Competitivo Individual, generalizar el modelo obligatorias/de-apoyo del Bug D a "listo para
  competir" en general). Commiteado y pusheado (`2c4aaa2`); commit de seguimiento `f910775`
  corrige una vulnerabilidad alta (`shell-quote`, vía `react-devtools-core`) que CI encontró en
  `npm audit` — sin relación con los cambios de esta sesión, `npm audit fix` sin breaking changes.
- **2026-07-21 (segunda ronda, mismo día)** — El usuario volvió con una segunda tanda de
  decisiones del entrenador: la misma métrica de recuperación post-entreno (ya implementada en la
  ronda anterior, reconfirmada sin cambios) más cuatro piezas nuevas que no estaban en el informe
  original. Todo implementado y verificado (76/76 tests, 19 nuevos; `tsc`/`eslint` limpios):
  - **Estado "Listo para competir"** (formaliza Preguntas Estructurales §1, resuelve el punto 1 de
    sección 5): distinto de Supercompensación — umbral mínimo para competir sin riesgo, no el pico
    ideal. `evaluateCompetitionReadiness` en `atrEngine.ts`, mismo patrón obligatorias/bloqueadoras/
    de-apoyo que Bug D: 4 obligatorias (FC dentro del rango de Competitivo §1.6, HRV +5%/+20%,
    piernas ≥6, técnica ≥6 como **piso individual** — a propósito distinto del promedio ponderado
    de Capa 2, para no dejar que un 5/10 aislado en técnica se compense con el resto, que era
    justo el caso sin resolver de Preguntas Estructurales §1); veto total por dolor/fatiga/
    molestia ≥8; 4 de apoyo (explosividad, velocidad/reacción, motivación, y "confianza" —
    mapeada a `coach.confidence` porque `SubjectiveMetrics` no tiene un campo de autoreporte de
    confianza del atleta, mapeo señalado explícitamente en el código). **Decisión de producto
    (usuario, confirmada antes de implementar):** visible solo en `home.tsx` (que ya funciona como
    vista de entrenador por defecto) — nunca al atleta, por el efecto nocebo documentado en
    atletas que reciben señales negativas de wearables antes de competir. Queda comentado en el
    código que esta card debe excluirse cuando se construya la vista de atleta separada (gap ya
    documentado en sección 4).
  - **Índice de Confianza del Análisis** (Alta/Media/Baja): `computeConfidenceLevel`, resuelve el
    punto que CLAUDE.md §5 ya tenía pre-aprobado como "se puede avanzar sin bloquear". Versión
    provisional razonable basada en completitud de baseline/lectura del día/subjetivo/Borg — los
    umbrales exactos no están confirmados por el entrenador.
  - **Motor de explicación generalizado — solo el paso 1 (determinístico).** Nuevo
    `src/engine/explanationEngine.ts`: tabla fija de acciones por defecto por resultado (Dentro de
    lo esperado, Fatiga funcional/excesiva, Estimulación insuficiente, Supercompensado, Listo/No
    listo para competir, etc.) y `buildExplanationPayload`, que arma el contrato de datos completo
    (variables responsables — reusa las alertas ya calculadas, nunca inventa una lista nueva —,
    tendencia, índice de confianza, resumen de "listo para competir") listo para un paso 2 que
    redactaría el texto con la API de OpenAI. **Decisión explícita del usuario, confirmada antes
    de implementar: NO se wireó la llamada a OpenAI.** Hacerlo hoy expondría la API key en el
    bundle del cliente (no hay backend/proxy — Firebase solo "previsto", CLAUDE.md §3), justo lo
    que CLAUDE.md §10 prohíbe. Queda como decisión de arquitectura pendiente (sección 5, punto 12).
  - **Disonancia texto-vs-número del comentario libre del atleta:** `detectFreeTextDissonance` en
    `atrEngine.ts` (el campo `subjective.athleteNotes` ya existía, no fue necesario agregarlo).
    Detección simple por palabras clave (dolor, duele, molestia, lesión, incomod) contra
    `musclePain`/`discomfort` bajos — mismo mecanismo que la divergencia FC/HRV, agrega una alerta
    al array `alerts`, nunca mueve `state`. A propósito sin análisis de sentimiento, para mantener
    el mecanismo trazable (regla explícita del informe de decisiones).
  Próximo paso sugerido: revisar con el entrenador, commitear/pushear. Después: decidir el diseño
  del backend/proxy para el paso 2 del motor de explicación (bloquea la redacción con IA), o seguir
  con Apple Health / IRL / Perfil Competitivo Individual como en la ronda anterior. Commiteado y
  pusheado (`52fbac7`), CI verde.
- **2026-07-21 (tercera ronda, mismo día)** — Antes de esta ronda, el usuario pegó un tercer
  documento que incluía una sección nueva de "Decisiones de Frontend/UX" (score único prohibido,
  comparación de dos niveles con delta vs. día anterior, estructura drill-down con dolor como
  excepción de veto visual, escala Borg CR-10 oficial, "Subcompensado" descartado, pestaña
  "Entrenador IA" pendiente de confirmar) y pidió explícitamente **guardarlo para usar más
  adelante, sin implementarlo todavía** — quedó completo en sección 5, punto 13, sin código
  asociado. Luego llegó el resto de esa ronda con dos piezas sí listas para implementar:
  - **Índice de Riesgo de Lesión (IRL)** (resuelve Motor ATR §11.2 y CLAUDE.md §5 punto 8): árbol
    de decisión acumulativo de 4 niveles en `src/engine/injuryRiskEngine.ts`, gateado por dolor o
    molestia presente (sin eso, IRL ni se evalúa — no es "Bajo", es "no aplica" ese día). Alto y
    Crítico requieren confirmación adicional (sostenido N días consecutivos de la condición base,
    o peor que el patrón histórico propio del atleta en ese tipo de microciclo — si no hay
    historial previo de ese microciclo, esa comparación queda "no disponible" explícitamente,
    nunca se asume cumplida ni incumplida). Mensaje nunca diagnóstico, ajustado por nivel. Dos
    umbrales elegidos sin confirmación explícita del entrenador, documentados como tal en el
    código y en sección 5 punto 8.
  - **Refactor de apoyo, encontrado mientras se implementaba IRL:** las tablas de rango FC/HRV/Borg
    y las funciones de Capa 1 (`classifyAgainstRange`, `toFatigueAxis`, etc.) se extrajeron de
    `atrEngine.ts` a `src/engine/physiologicalRanges.ts` — `injuryRiskEngine.ts` las necesitaba y
    duplicarlas habría sido un riesgo real de que las dos copias de datos de dominio (no solo
    helpers triviales) se desincronizaran. De paso se encontró y corrigió una duplicación de tipos
    ya existente de la ronda anterior: `PostWorkoutObservation`/`PostWorkoutTrendResult` estaban
    declarados dos veces (en `postWorkoutEngine.ts` y en `atr.ts`) — no era un error de compilación
    (TypeScript structural typing lo permite en silencio) pero sí un riesgo de divergencia futura;
    ahora `postWorkoutEngine.ts` importa los tipos del modelo en vez de redeclararlos.
  - **Notas del entrenador — privadas vs. compartibles:** `CoachMetrics` gana `shareableNote`
    (separado de `coachNotes`, que sigue siendo privado por defecto). Al implementarlo se detectó
    que `buildExplanationPayload` (motor de explicación de la ronda anterior) no tenía forma de
    garantizar que el veredicto "listo/no listo" NUNCA llegara a un futuro chat del atleta — se
    agregó un parámetro `audience` ("coach" default | "athlete") que excluye `readiness` del
    payload cuando es "athlete", aplicando ese guardrail no negociable en el paso determinístico en
    vez de confiar en que un futuro paso 2 (sin implementar) lo respete.
  - **"Entrenador IA" (el chat en sí) NO se implementó** -- depende de la misma capa de redacción
    con IA que ya se decidió diferir (sección 5, punto 12: no hay backend/proxy seguro). Solo se
    dejó listo el modelo de datos (`shareableNote`) y el guardrail de audiencia.
  89/89 tests (10 nuevos), `tsc`/`eslint` limpios. Próximo paso sugerido: revisar con el
  entrenador, commitear/pushear; después retomar la sección 5 punto 13 (frontend/UX) cuando el
  usuario lo pida, o seguir cerrando huecos (Perfil Competitivo Individual, backend/proxy de IA).
- **2026-07-21 (cuarta ronda, mismo día)** — Sesión previa había quedado sin commitear al cierre.
  Se retomó el trabajo pendiente: `register.tsx` deja de depender de datos que nadie escribía
  (Health de solo lectura, `CoachMetrics` sin pantalla) — se agregaron campos editables para FC/HRV/
  sueño (lectura matutina), post-entreno (2h ±15min), pre-sueño, y una card "Entrenador (uso del
  staff)" con las 9 variables de `CoachMetrics` + nota privada + nota compartible (detalle completo
  en sección 4). Antes de commitear, pasó por `code-reviewer` (regla no negociable de sección 10.6)
  que encontró 2 hallazgos críticos, ambos corregidos en la misma sesión: (1) `handleSave` y la
  carga inicial de `register.tsx` no tenían manejo de errores (violaba "nunca fallar en silencio",
  sección 10.1) — ahora ambos capturan, loguean con contexto y alertan al usuario sin perder lo
  escrito en pantalla; (2) `register.tsx`/`home.tsx` leían/escribían un campo
  `currentMicrocycle`/`microcycle` inexistente en `AthleteProfile` vía `as any` — se formalizó
  `currentMicrocycle?: MicrocycleType` en el modelo (revisado con `data-schema-reviewer`: perfiles
  ya guardados sin el campo siguen cargando bien, es opcional). `npx tsc --noEmit`, lint y tests
  (89/89) verificados después de las correcciones. Commiteado y pusheado (`10fef0e`).
- **2026-07-21 (quinta ronda, mismo día)** — El usuario pidió continuar sin pausas ni preguntas
  hasta terminar el proyecto. Se retomó la sección 5 punto 13 (decisiones de frontend/UX recibidas
  en la tercera ronda pero explícitamente guardadas sin implementar) y se cerró el gap de mensaje
  de arranque en frío (§1.8, sección 4). Todo verificado con tests (96/96, 5 nuevos) y manualmente
  en el navegador (`expo start --web` + Chrome DevTools Protocol, perfil nuevo desde cero):
  - **Mensaje de arranque en frío (§1.8):** `atrEngine.ts` distingue, dentro del caso `default` de
    `mapDissonanceToState`, si el motor cae en "Pendiente de evaluacion" específicamente por falta
    de baseline (vs. otras causas, ej. sin datos subjetivos con baseline ya presente, que sigue
    mostrando el mensaje genérico) y usa un texto específico en ese caso. Verificado en el
    navegador con un atleta recién creado: aparece "Recolectando datos para dar un análisis
    concreto..." en vez del genérico.
  - **Comparación secundaria "vs. día anterior":** nuevo `describeVsPreviousDay` en `atrEngine.ts`
    (tipo `PreviousDayComparison` en el modelo) — deltas de FC/HRV/sueño contra el registro anterior
    del historial, puramente informativo, nunca decide `state` (principio ya establecido: la
    comparación primaria contra baseline es la única que decide color/estado). `code-reviewer`
    encontró que la etiqueta "vs. día anterior" sería engañosa si el atleta se salta días de
    registro (el "anterior" en el historial podría ser de hace varios días) — corregido antes de
    cerrar: `home.tsx` calcula el gap real de días entre registros y la función ajusta la etiqueta
    a "vs. último registro (hace N días)" cuando el gap no es exactamente 1.
  - **Estructura drill-down + veto visual de dolor:** `home.tsx` reestructurado en resumen siempre
    visible (estado ATR, mensaje, confianza, IRL si no es Bajo, dolor/molestia elevado, alertas) +
    detalle plegable ("Ver detalle ▾": comparación esperado-vs-actual, disonancia, Nivel 2/3,
    desglose subjetivo y de carga). El umbral de "dolor elevado" reusa exactamente el mismo que ya
    gatea el árbol de IRL (`PAIN_PRESENT_THRESHOLD`/`isPainElevated`, movido de
    `injuryRiskEngine.ts` a `physiologicalRanges.ts` para compartirlo con la UI en vez de duplicar
    el número) — mismo criterio de "dolor presente" en todo el sistema, no dos umbrales distintos.
  - **Escala de Borg CR-10 oficial:** `register.tsx` (`BORG_OPTIONS`) reemplaza la escala
    simplificada propia por los anclajes verbales oficiales (0 Nada en absoluto ... 10 Máximo
    esfuerzo, 6 y 8 omitidos a propósito). Se confirmó que `getBorgExpectedRange` en
    `physiologicalRanges.ts` ya usaba estos rangos reales desde la primera implementación del motor
    — el desalineamiento era solo de la UI, no de la lógica de dominio.
  - **Toggle Vista Entrenador/Atleta:** `home.tsx` gana `viewMode` ("coach" default | "athlete") que
    por fin APLICA en código la exclusión de "Listo para competir" en modo Atleta — antes esa regla
    solo estaba documentada en un comentario, nunca se ejecutaba porque no existía ninguna vista de
    atleta. Documentado explícitamente en el código y aquí: es un filtro de PRESENTACIÓN sin valor
    de seguridad real (el proyecto sigue sin auth/roles, fase single-user, CLAUDE.md §0) — no
    reemplaza la separación real de dashboards pendiente (sección 4), es un paso intermedio.
  - **Mensaje entrante del usuario a mitad de sesión:** confirmación con fundamento de literatura
    de los umbrales de días del IRL (ya implementados, coincidían exactamente — sección 5 punto 8)
    y spec completa de "Entrenador IA" (chat del atleta, mismo motor de explicación con guardrail
    de audiencia ya implementado desde la tercera ronda) — sin cambios de código necesarios en
    ninguno de los dos, ambos ya estaban resueltos tal cual se confirmó. Documentado en sección 5
    puntos 8 y 13.
  - Pasado por `code-reviewer` antes de cerrar (regla de sección 10.6); los 2 hallazgos que
    reportó (etiqueta "vs. día anterior" engañosa con gap de días, y un caso borde sin cubrir por
    test) se corrigieron/cubrieron en esta misma ronda.
  `npx tsc --noEmit`, `npm run lint`, `npm test` (96/96) limpios. Próximo paso sugerido: decidir
  entre Apple Health, Perfil Competitivo Individual, backend/proxy de IA (desbloquea "Entrenador
  IA"), o construir la separación REAL de Dashboard Atleta/Entrenador (más allá del toggle actual).

---

## 7. Qué NO hacer (checklist rápido antes de escribir código)

- ¿Estoy usando un valor de HRV/FC absoluto en vez de relativo al baseline del atleta? → parar.
- ¿Estoy resolviendo una decisión de juicio deportivo (jerarquía, veto, "listo para competir")
  sin que el entrenador la haya confirmado? → parar y preguntar.
- ¿Estoy simplificando una regla del Motor ATR para que el código sea más simple? → parar,
  señalarlo explícitamente antes de proceder.
- ¿Estoy proponiendo pulido visual antes de que la lógica correspondiente esté resuelta? → parar.
- ¿Estoy declarando un estado de alto impacto con datos incompletos sin marcar la confianza
  como baja? → parar.

---

## 8. Convenciones técnicas acordadas (actualizar conforme se decidan)

- Todo el esquema de datos se indexa por `atleta_id` desde el inicio (preparar para
  multi-usuario aunque el MVP sea single-user).
- El registro diario guarda procedencia del dato, no solo el valor (ver sección 5).
- Ninguna bandera de disonancia (Motor ATR sección 4) se descarta — se almacena junto con la
  interpretación final para re-análisis histórico futuro.
- Historial a dos niveles: registro diario (detalle) + registro de macrociclo (agregado: Índice
  de Evolución ATR, forma final de curvas, banderas acumuladas).

---

## 9. Documentos fuente de verdad (no reemplazan este archivo, lo alimentan)

- `Beast_Mood_System_Prompt.md` — instrucciones de operación del proyecto.
- `Beast_Mood_Documento_Maestro_Extendido.md` — visión, objetivos, dashboards, arquitectura.
- `Beast_Mood_Motor_ATR_v1.md` — lógica de interpretación completa (perfiles, capas, niveles,
  fatiga funcional/excesiva, IRL, Perfil Competitivo Individual).
- `Beast_Mood_Preguntas_Estructurales.md` — huecos de diseño, juicio deportivo vs. arquitectura.
- `Documento_Maestro_Beast_Mood_Borrador_Integral.docx` — borrador original v1.0 (histórico,
  mayormente absorbido por el Documento Maestro Extendido).

Ante cualquier duda o contradicción entre este archivo y los documentos fuente, **los
documentos fuente ganan** — este archivo es un resumen operativo, no la especificación completa.

---

## 10. Reglas de ingeniería, calidad y seguridad (no negociables)

> Adaptadas de una plantilla base genérica (pensada para proyectos Python/Django/FastAPI) al
> stack real de este proyecto (React Native + Expo + TypeScript, sin backend propio todavía).
> No se copió la plantilla completa — ver "Qué NO se adoptó" al final de esta sección.

1. **Nunca fallar en silencio.** Todo error se captura y se loguea con contexto suficiente para
   depurar sin reproducir el problema a mano (qué se intentaba hacer, con qué datos). Nunca
   `catch {}` vacío. Notificación activa de errores en producción queda diferida hasta que haya
   usuarios reales más allá del desarrollador — ver `docs/error-monitoring.md`.
2. **Nunca hardcodear secretos.** Config sensible (claves de Firebase cuando existan, etc.) vía
   variables de entorno + `.env.example` con placeholders. `.env` nunca se commitea (ver
   `.gitignore`). Ver `docs/security-checklist.md`.
3. **El servidor es la fuente de verdad, nunca el cliente** — regla que hoy es en gran parte N/A
   (no hay backend propio, todo vive en `AsyncStorage` local) pero rige desde el día uno de
   Firebase: ningún dato sensible o decisión de permisos se valida solo en el cliente.
4. **Separación estricta de entornos** desde que exista Firebase — desarrollo local nunca apunta
   al proyecto de producción. Ver `docs/environments.md` (hoy documentado como diferido, no
   implementado).
5. **Modo plan antes de ejecutar** en cualquier tarea no trivial, y especialmente antes de
   cambios que toquen datos ya persistidos de un atleta. Para cambios a la forma de un dato ya
   guardado (`DailyRecord`, `HealthBaseline`, etc.), usar siempre el subagente
   `data-schema-reviewer`.
6. **Nada se da por "terminado" sin pasar por el subagente `code-reviewer`.** El proyecto trabaja
   directo sobre `main` (excepción documentada explícitamente, ver `docs/git-workflow.md` — no es
   un descuido, es la decisión tomada el 2026-07-20 mientras el proyecto sea single-user). El
   filtro real de calidad son dos capas independientes de un PR humano: el subagente
   `code-reviewer` (invocado proactivamente antes de cerrar cualquier cambio no trivial) y el CI
   en GitHub Actions (`.github/workflows/ci.yml`, corre solo en cada push a `main`: lint,
   type-check, tests, `gitleaks`, `npm audit`).
7. **Pruebas obligatorias en rutas críticas** — el motor ATR y los repositorios de persistencia,
   ante todo (lo que si falla le cuesta al atleta una interpretación equivocada de su propio
   estado). Estándar: Jest (`ts-jest`), ya configurado. Hábito: tests pasando primero, prueba
   manual en la app después — nunca al revés (ver `docs/definition-of-done.md`, y CLAUDE.md §4/§6
   para los dos bugs reales que este orden ya atrapó).
8. **Lint y tipos.** `npm run lint` (ESLint vía `eslint-config-expo`, configurado en
   `eslint.config.js`) sin errores. `npx tsc --noEmit` limpio, tanto para el tsconfig de la app
   como para `tsconfig.jest.json` si se tocaron tests.
9. **Antes de dar algo por "terminado"**, revisar `docs/definition-of-done.md`. Checklist de
   seguridad específico en `docs/security-checklist.md`.

### Subagentes disponibles (`.claude/agents/`)

- `code-reviewer` — el gate de calidad/seguridad/fidelidad a la lógica ATR antes de cerrar
  cualquier cambio no trivial. Invocarlo proactivamente, sin esperar a que se pida.
- `data-schema-reviewer` — equivalente al revisor de migraciones de la plantilla base, adaptado a
  que este proyecto no tiene SQL: revisa cambios a modelos ya persistidos en `AsyncStorage` (y
  Firestore cuando exista) antes de aplicarlos.
- `doc-updater` — propone (nunca escribe directo) actualizaciones a README/CLAUDE.md/docs después
  de que un cambio ya pasó por `code-reviewer`.
- `test-writer` — escribe/actualiza tests de Jest para código ya aprobado, sin tocar lógica de
  negocio.
- `release-manager` — changelog + versión semántica cuando se corte un release (no atado a un
  merge `dev`→`main`, ya que no existe ese flujo hoy).

### Qué NO se adoptó de la plantilla base, y por qué

- **Flujo `dev` + PR real**: diferido mientras el proyecto sea single-user — ver punto 6 arriba y
  `docs/git-workflow.md` para cuándo reconsiderarlo.
- **Pre-commit hooks locales** (`gitleaks` + linter en cada `git commit`): diferido, no hay
  `pre-commit`/`gitleaks` instalados localmente. El escaneo de secretos sí corre en CI. Instrucciones
  para activarlo más tarde en `docs/security-checklist.md`.
- **`docs/django.md` / `flask.md` / `fastapi.md` / `decision-framework.md`**: no aplican, este
  proyecto no es un backend Python y el stack ya está decidido (React Native + Expo, CLAUDE.md §3).
- **`docs/automation.md`**: no aplica todavía, no hay scripts/automatizaciones desatendidas en el
  proyecto. Si en algún momento se agrega una (ej. un cron de sincronización con Apple Health),
  retomar el patrón de esa sección de la plantilla (manejo de errores con notificación activa,
  reintentos con backoff, idempotencia).
