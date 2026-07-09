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

> Última actualización: 2026-07-08 — primera auditoría real del código (`BeastMoodApp/src`) contra
> los documentos maestro. Repo ya en GitHub: https://github.com/prograjulian/Beast-Mood

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
  - **Falta implementar — modelo de capas del motor (Motor ATR §2–4):** no hay resolución
    explícita FC vs HRV con prioridad de FC ni bandera `divergencia_FC_HRV`; no hay agregación
    subjetiva ponderada (dolor/fatiga dominante); no existe la tabla de cruce fisiológico×subjetivo
    de 7 resultados (§4). Todo vive mezclado en un único árbol if/else.
  - **Falta implementar — Niveles 2 y 3 de comparación (§5):** el motor solo compara contra el
    perfil genérico del microciclo actual (Nivel 1). No compara contra el microciclo anterior
    (evolución) ni contra el historial del atleta — documentado como "el diferenciador central
    del proyecto".
  - **Estados oficiales (§0.1) no coinciden exactamente:** el `ATRState` en `atr.ts` no tiene
    "Preparación insuficiente" como estado explícito, y agrega estados no oficiales ("Dentro de
    lo esperado", "Mas fresco de lo esperado") en su lugar.
  - **No implementado:** Índice de Evolución ATR (§5.5), Índice de Riesgo de Lesión / IRL (§11),
    Perfil Competitivo Individual (§13, esperable en esta fase), modelo de recomendación
    explícito qué/por qué/qué hacer (§10.1).
- [x] **Hallazgo crítico — violación del principio "no negociable" de persistencia longitudinal**
      (System Prompt §4, CLAUDE.md §8): `metricsRepository.ts` guarda un único objeto por
      categoría (baseline, snapshot, subjetivo, training, daily) bajo una sola clave de
      AsyncStorage — **cada registro nuevo sobreescribe el anterior, no hay historial real**.
      Sin esto es estructuralmente imposible construir baseline con ventana móvil, exclusión de
      días Carga/Impacto (§1.8, ya confirmado en el documento), Niveles 2/3, o registro de
      macrociclo (§5.5.1). Este es el hueco más urgente a resolver, porque casi todo lo demás
      depende de él.
- [x] Integración Apple Health (`src/services/health/*.ts`: appleHealth, healthConnect,
      healthService, mapper, permissions) — **archivos vacíos (0 líneas), aún no arrancada**.
      Coherente con el roadmap declarado (System Prompt §4/§6: Apple Health → BD → historial →
      dashboard → IA), no es un desvío, solo el siguiente paso pendiente.
- [x] `athleteRepository.ts` también vacío (0 líneas).
- [ ] No hay separación Dashboard Atleta / Dashboard Entrenador (Documento Maestro §6):
      `home.tsx` es una única pantalla que muestra HRV/FC crudos y alertas técnicas a cualquiera
      que la abra — funciona como vista de entrenador mostrada por defecto, sin la vista
      minimalista de atleta que pide §6.1.
- [ ] `CoachMetrics` existe como modelo (guardado/leído) pero ninguna pantalla lo captura todavía.
- [ ] No existe "procedencia del dato" (medido/reportado/ausente) ni Índice de Confianza del
      Análisis (CLAUDE.md §5, ya propuestos pero no codificados).
- [ ] No hay mensaje de arranque en frío ("Recolectando datos para dar un análisis concreto",
      §1.8) cuando falta baseline — la UI solo deja `expectedVsActualReady` en `false` sin
      mostrar ese mensaje específico.
- Lógica deportiva (documentos maestro): ampliamente definida, ver sección 9.
- Huecos de diseño abiertos: ver sección 5 (varios requieren decisión del entrenador antes de
  poder codificarse con confianza).

---

## 5. Decisiones pendientes (resumen vivo — fuente completa: `Beast_Mood_Preguntas_Estructurales.md`)

### Requieren al entrenador (NO inventar, preguntar):
1. Variables obligatorias vs. de apoyo para declarar "listo para competir".
2. Jerarquía/peso de cada variable (¿pesa más HRV, técnica, explosividad, dolor?).
3. Lista de variables "bloqueadoras" que nunca deben compensarse (ej. dolor 8/10 con todo lo
   demás perfecto → ¿se puede declarar "listo"? mecanismo técnico ya propuesto: capa de veto).
4. Confirmar si la resolución por defecto de contradicciones (mostrar ambas lecturas, nunca
   ocultar la disonancia) es suficiente o si necesita veto como el punto 3.
5. Rol final de las observaciones del entrenador: ¿anulan una alerta del sistema, o solo la
   matizan en el registro?
6. Tamaño exacto de ventana móvil del baseline y umbral exacto de exclusión de outliers.
7. Cuántos resultados competitivos mínimos para que el Perfil Competitivo Individual
   (Motor ATR sección 13) tome precedencia sobre el perfil genérico (propuesta a validar: 3–5 podios).
8. Ponderación exacta de variables/categorías del Índice de Riesgo de Lesión (IRL) y umbrales
   numéricos entre Bajo/Moderado/Alto/Crítico.
9. Confirmar si las "Alertas" del Dashboard Entrenador son exactamente los 4 tipos de la
   sección 11.4 del Motor ATR, o si hay tipos adicionales.

### Ya tienen propuesta inicial (arquitectura, se puede avanzar sin bloquear):
- Índice de Confianza del Análisis (Alta/Media/Baja según variables disponibles).
- Procedencia del dato (medido / reportado / ausente / no aplica).
- Prioridad de alertas simultáneas (propuesta: seguridad del atleta primero, luego preparación
  competitiva, luego recuperación/carga general).
- Motor de explicación en lenguaje natural (plantilla: "[Estado] porque [variables con valores
  reales vs. esperados]. Esta respuesta [coincide/no coincide] con el perfil esperado para
  [microciclo] [+ tendencia si aplica]").
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
