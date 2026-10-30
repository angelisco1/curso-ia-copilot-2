---
name: commit
description: Genera mensajes de commit estandarizados siguiendo la especificación de Conventional Commits. Úsala cuando el usuario pida escribir, generar o formatear un mensaje de commit, o cuando analice cambios para realizar un commit.
---


# Asistente de Conventional Commits


Genera mensajes de commit limpios y estandarizados en Git siguiendo la especificación de [Conventional Commits](https://www.conventionalcommits.org/).



## Cuándo usar esta skill



Utiliza esta skill cuando el usuario pida ayuda para escribir, formatear o generar un mensaje de commit basándose en cambios de código, una descripción del trabajo realizado o un diff de Git.



## Estructura de un Mensaje de Commit


```
<tipo>[alcance opcional]: <descripción>

[cuerpo opcional]

[pie(s) de página opcional(es)]

```

## Tipos de Commit



* **feat**: Una nueva característica o funcionalidad para el usuario (corresponde a `MINOR` en Semantic Versioning).

* **fix**: Una corrección de errores para el usuario (corresponde a `PATCH` en Semantic Versioning).

* **docs**: Cambios exclusivamente en la documentación.

* **style**: Cambios que no afectan el significado del código (espacios en blanco, formato, puntos y comas faltantes, etc.).

* **refactor**: Un cambio de código que ni corrige un error ni añade una característica.

* **perf**: Un cambio de código que mejora el rendimiento.

* **test**: Añadir pruebas faltantes o corregir prueba****istentes.

* **build**: Cambios que afectan el sistema de compilación o dependencia****ternas (ejemplos de alcance: npm, webpack, maven).

* **ci**: Cambios en los archivos y scripts de configuración de integración continua (ejemplos de alcance: GitHub Actions, GitLab CI, Jenkins).

* **chore**: Otros cambios que no modifican archivos fuente (src) ni de pruebas (test).

* **revert**: Revierte un commit anterior.



## Reglas y Directrices



1. **Línea de descripción**:

   * Usa el imperativo o presente simple en minúsculas: "añade" o "agrega" en lugar de "añadido" o "agregando".

   * No uses mayúscula inicial inmediatamente después del tipo/alcance.

   * Sin punto final (.) al terminar la línea.

   * Mantenla concisa y descriptiva (preferiblemente menos de 72 caracteres).



2. **Cambios Rompedores (Breaking Changes)**:

   * Deben indicarse añadiendo un signo de exclamación `!` justo antes de los dos puntos en el tipo/alcance (ejemplo: `feat(api)!: cambiar la estructura de respuesta`).

   * Alternativamente, incluye `BREAKING CHANGE: <descripción>` en el pie de página o cuerpo del mensaje.



3. **Alcance (Scope)**:

   * Opcional, sustantivo entre paréntesis que especifica el lugar del código afectado (ejemplo: `fix(auth): corregir fuga de tokens`).


## Flujo de Trabajo


1. Analizar los cambios o la descripción facilitada por el usuario.
2. Determinar el `tipo` adecuado y el `alcance` opcional.
3. Redactar una descripción concisa siguiendo las reglas de formato.
4. Si procede, añadir un cuerpo explicativo o un pie de página para cambios rompedores.
5. Muestrale al usuario el mensaje de commit para que lo revise, y utiliza la tool `askQuestion` para obtener su confirmación o realizar ajustes si es necesario. Si te confirma que es correcto, sigue con el siguiente paso. Si no, vuelve a redactar el mensaje según sus indicaciones.
6. Haz el commit.