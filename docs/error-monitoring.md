# Monitoreo de errores en producción

## Estado actual: diferido

Loguear un error localmente no sirve de nada si nadie está viendo ese log
en el momento — sin notificación activa, te enteras de un error cuando ya
causó daño. Esta es la razón de fondo de la regla, pero hoy BeastMoodApp
no tiene usuarios más allá del propio desarrollador/entrenador (CLAUDE.md
§0, fase single-user), así que un servicio de monitoreo dedicado es
prematuro. Se documenta acá para no tener que redecidir esto desde cero
cuando llegue el momento.

## Cuándo activar esto

Cuando la app pase a tener al menos un usuario real más allá del
desarrollador (otro atleta, otro entrenador probando la app), o antes de
cualquier build que se distribuya fuera del propio dispositivo de
desarrollo.

## Herramienta recomendada: Sentry (React Native / Expo)

Tiene tier gratuito suficiente para proyectos pequeños y se integra vía
`@sentry/react-native` con soporte oficial para Expo.

### Instalación (cuando se active)

```bash
npx @sentry/wizard@latest -i reactNative -p ios android
```

o manualmente:

```bash
npm install @sentry/react-native
```

### Inicialización (`app/_layout.tsx` o punto de entrada equivalente)

```ts
import * as Sentry from "@sentry/react-native";

if (!__DEV__) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
```

## Configuración

- El DSN va en variables de entorno (ver `docs/environments.md`), nunca
  hardcodeado.
- Solo activar fuera de `__DEV__` — no se quiere que cada error de
  desarrollo local llene el dashboard de alertas.
- `sendDefaultPii: false` por defecto: revisar caso por caso si hace falta
  más contexto, con cuidado de no mandar datos de salud/rendimiento de un
  atleta real a un tercero sin necesidad — este proyecto maneja datos
  sensibles de salud (HRV, FC, dolor), no es un dato genérico.

## Qué hacer cuando llega una alerta

No es solo "enterarse" — define un mínimo: quién la revisa, en cuánto
tiempo, y cómo se prioriza (¿el atleta ve un estado incorrecto por esto?
¿es un error raro de un caso borde?). Sin esto, Sentry se vuelve ruido que
nadie mira.
