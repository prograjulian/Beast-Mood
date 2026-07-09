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

> Última actualización: 2026-07-08 — inicio del CLAUDE.md, aún no se ha revisado el código existente.

- [ ] Código existente en Visual Studio aún no compartido/revisado con Claude.
- [ ] No se ha confirmado si el stack actual (¿React Native + Expo?) coincide con lo documentado.
- [ ] No se ha auditado qué parte de la lógica del Motor ATR v1 ya está implementada en código
      vs. qué se simplificó por conveniencia técnica.
- [ ] No se ha decidido si se cambia de framework/frontend. Pendiente ver el código real antes
      de opinar — la sospecha de trabajo es que el problema más probable es "lógica mal
      traducida a código", no "stack incorrecto", pero está por confirmar.
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
