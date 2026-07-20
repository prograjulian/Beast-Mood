# Separación de entornos

## Estado actual: N/A (todavía no aplica)

Hoy BeastMoodApp no tiene backend — todo el historial vive en
`AsyncStorage`, local al dispositivo (ver CLAUDE.md §4). No existe todavía
una base de datos remota ni un proyecto de Firebase, así que no hay riesgo
de que desarrollo local toque datos de producción. Este documento queda
listo para el momento en que eso cambie.

## Regla, desde que exista Firebase

Origen de esta regla (de la plantilla base, aplicable en general): en un
proyecto real, el `.env` local de un colaborador quedó apuntando a la base
de datos de producción en vez de a la local. Consecuencia: datos de prueba
mezclados con datos reales del cliente. Nadie lo hizo a propósito; la
variable de entorno simplemente apuntaba al lugar equivocado. La regla
existe para que eso sea estructuralmente difícil de que pase, no solo
"tener cuidado".

- **Local/desarrollo**: proyecto de Firebase separado (`beastmood-dev` o
  similar), nunca el proyecto de producción.
- **Producción**: sus credenciales viven en las variables de entorno de la
  plataforma de build/hosting (EAS Secrets, por ejemplo), nunca en un
  `.env` que también se use en local.
- `.env.example` siempre debe apuntar a valores de ejemplo/dev, nunca a un
  valor real de producción copiado y pegado.
- Si se necesita probar contra datos "reales", usar un proyecto de staging
  separado — nunca el de producción con datos de atletas reales.

## Chequeo antes de arrancar a trabajar

Cuando exista Firebase: antes de correr la app localmente o cualquier
script que escriba datos, verificar a qué proyecto apunta la config activa
(`app.config.ts` / variable de entorno). Si no se está seguro, loguear el
`projectId` (nunca ninguna credencial) antes de correr cualquier operación
que escriba datos.

## CI / tests

Los tests SIEMPRE corren contra mocks/datos efímeros (ver
`src/engine/atrEngine.test.ts` para el patrón ya establecido con Jest),
nunca contra un proyecto de Firebase real, ni de desarrollo ni de
producción.
