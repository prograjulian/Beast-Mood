# Checklist de seguridad

Aplica a cualquier cambio en BeastMoodApp (React Native + Expo +
TypeScript).

## Secretos

- [ ] `.env` en `.gitignore`, nunca commiteado. Verificar con
      `git log --all -- .env` que nunca se coló históricamente.
- [ ] `.env.example` con placeholders genéricos, nunca con un valor real
      copiado y pegado "para que sirva de ejemplo" (aplica sobre todo
      cuando llegue la config de Firebase — API keys, project ID, etc.).
- [ ] Config sensible se lee vía `app.config.ts` + variables de entorno
      (o `expo-constants`), nunca hardcodeada directo en `app.json` ni en
      componentes.
- [ ] Escaneo de secretos con `gitleaks` corre en CI
      (`.github/workflows/ci.yml`) en cada push a `main`, como red de
      seguridad. (Pre-commit local con `gitleaks` queda como mejora
      opcional futura — no configurado todavía, ver nota abajo.)

### Nota — pre-commit local (diferido)

La plantilla base incluye un hook de pre-commit (`gitleaks` + linter)
corriendo en cada `git commit` local, antes de que el secreto llegue
siquiera a existir en el historial. Se decidió diferirlo por ahora (no hay
`pre-commit`/`gitleaks` instalados localmente) y confiar en el escaneo de
CI. Para activarlo más adelante:

```bash
pip install pre-commit
# gitleaks binario: https://github.com/gitleaks/gitleaks#installation
pre-commit install
```

y crear un `.pre-commit-config.yaml` equivalente al de CI.

## Comparación de secretos/tokens

- [ ] Si en algún momento se agrega un endpoint protegido por secreto
      compartido (webhook, Cloud Function con callback de terceros), nunca
      comparar el secreto con `===`/`!==` directo — usar una comparación en
      tiempo constante (ej. `crypto.timingSafeEqual` del lado del backend).
      No aplica hoy porque no hay backend propio todavía.

## Datos del atleta (AsyncStorage hoy, Firebase después)

- [ ] El rol/permiso de quién puede ver o modificar datos de un atleta
      SIEMPRE lo decide el servidor cuando exista uno (Firebase), nunca un
      campo que venga del cliente sin validar de nuevo. Hoy es N/A (todo es
      local, single-user) pero es una regla no negociable desde que exista
      backend (CLAUDE.md, principio de "servidor como fuente de verdad").
- [ ] Nunca usar datos reales de un atleta como "datos de prueba" al
      desarrollar/hacer demos, ni al revés (ver `docs/environments.md`).
- [ ] `AsyncStorage` no es almacenamiento seguro — si en algún momento se
      guarda algo sensible más allá de métricas de rendimiento (ej.
      credenciales), usar `expo-secure-store`, no `AsyncStorage`.

## Autenticación (cuando exista, hoy N/A)

- [ ] Rate limiting en login/registro y cualquier endpoint público que
      escriba datos, una vez exista backend propio.
- [ ] Validación de permisos duplicada: filtrar en la interfaz (UX) Y
      validar de nuevo en el backend (seguridad real).

## Dependencias

- [ ] `npm audit` corriendo en CI para detectar vulnerabilidades conocidas
      en dependencias (ver `.github/workflows/ci.yml`).
