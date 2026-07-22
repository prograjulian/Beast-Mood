export interface CoachMetrics {
  technique?: number;
  reaction?: number;
  speed?: number;
  explosiveness?: number;
  strikingPower?: number;
  mood?: number;
  attitude?: number;
  focus?: number;
  confidence?: number;
  /**
   * Notas del entrenador -- PRIVADAS por defecto (informe de decisiones
   * 2026-07-21). Nunca llegan al chat "Entrenador IA" del atleta ni a
   * ninguna vista del atleta. Esto es lo que el entrenador escribe
   * normalmente.
   */
  coachNotes?: string;
  /**
   * Parte explícitamente marcada como COMPARTIBLE con el atleta -- la
   * única que un futuro chat "Entrenador IA" podría usar como contexto de
   * redacción (informe de decisiones 2026-07-21). Campo separado de
   * `coachNotes` a propósito: compartir es una acción explícita del
   * entrenador, nunca inferida ni activada por defecto. El chat en sí NO
   * está implementado todavía (depende del mismo backend/proxy de IA que
   * el paso 2 del motor de explicación, ver CLAUDE.md §5) -- este campo
   * solo deja el modelo de datos listo para cuando exista.
   */
  shareableNote?: string;
  /**
   * Resultado de competencia del día -- alimenta el Perfil Competitivo
   * Individual (Motor ATR §13): "podio" marca este día como uno de los
   * mejores resultados históricos reales del atleta, candidato a construir
   * el vector de referencia personalizado. Lo determina el entrenador/staff
   * (resultado oficial), no el atleta. Sin relación con los estados ATR del
   * día (un día con estado "Fatiga funcional" puede igual ser un día de
   * podio si la competencia salió bien).
   */
  competitionResult?: "podio" | "sin_podio";
  /** Nombre/torneo de la competencia -- opcional, solo contexto. */
  competitionName?: string;
}

export const emptyCoachMetrics: CoachMetrics = {};
