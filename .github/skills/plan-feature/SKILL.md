---
name: plan-feature
description: 'Genera un plan de implementación para una tarea o funcionalidad con un ID proporcionado por el usuario y lo guarda en plans/*.md. Úsala cuando se pida planificar una tarea, crear un plan de trabajo o desglosar una funcionalidad en pasos pequeños con criterios de aceptación.'
argument-hint: 'ID de tarea y descripción de la funcionalidad que se quiere planificar'
---

# Planificar una tarea

## Propósito

Convertir la tarea indicada por el usuario en un plan ejecutable, verificable y persistente. Generar el plan no autoriza a implementar la tarea: durante la planificación solo se crea o actualiza el archivo del plan.

## Procedimiento

1. Identifica la tarea solicitada, su ID, su resultado esperado y sus restricciones. El usuario debe proporcionar el ID de la tarea que se va a planificar: si falta la tarea o su ID, solicítalos mediante la herramienta de preguntas antes de generar el plan; no los inventes ni uses los identificadores internos de pasos (`T01`, `T02`, etc.) como ID de tarea. Comprueba con `git check-ref-format --branch` que `<id_tarea>/<breve-descripcion>` sería un nombre válido para la futura rama de implementación; si no lo es, solicita un ID válido sin cambiarlo silenciosamente.
2. Lee las instrucciones aplicables y examina el código y la documentación necesarios para entender el comportamiento actual, los patrones existentes y las herramientas de validación. Distingue los hechos comprobados de los supuestos.
3. Define el objetivo, el alcance incluido y lo que queda expresamente fuera. No amplíes la tarea con mejoras ajenas.
4. Desglosa el trabajo en tareas concretas de entre 5 y 10 minutos estimados cada una, incluyendo implementación, pruebas y documentación cuando correspondan. Divide cualquier paso mayor y agrupa pasos menores relacionados. Evita tareas vagas como «implementar la funcionalidad».
5. Ordena los pasos por sus dependencias y asigna identificadores estables (`T01`, `T02`, etc.). Para cada paso indica duración, acción, archivos o componentes afectados, dependencias y cómo comprobar su resultado. Usa rutas y comandos reales cuando los hayas verificado; señala lo que esté pendiente de confirmar.
6. Define criterios de aceptación observables y específicos de la tarea, con una forma de verificación para cada uno. Cubre el comportamiento solicitado, los casos límite relevantes, la conservación del comportamiento existente y las validaciones técnicas aplicables. No sustituyas requisitos concretos por «los tests pasan».
7. Recoge al final del plan las dudas y preguntas pendientes, indicando cuáles bloquean la implementación. No resuelvas silenciosamente ambigüedades que cambien significativamente el alcance, el comportamiento o la arquitectura.
8. Documenta también al final todas las decisiones tomadas por iniciativa propia, con su motivo y sus consecuencias o supuestos. Distingue esas decisiones de los requisitos explícitos del usuario. Si no hay dudas o decisiones propias, indícalo expresamente.
9. Lee el archivo `assets/template.md` para que el plan siga la estructura y formato recomendados.
10. Guarda el plan en `plans/<nombre-descriptivo-en-kebab-case>.md`, relativo a la raíz del proyecto. Crea `plans/` si no existe. Usa un nombre que describa la tarea, no nombres genéricos como `plan.md`. No sobrescribas un plan existente sin petición de actualizarlo: usa un sufijo descriptivo o numérico si hay una colisión.
11. Revisa que el archivo contiene el ID de tarea proporcionado por el usuario y todas las secciones, que cada tarea estima entre 5 y 10 minutos y que cada criterio de aceptación tiene una comprobación concreta.
12. Cuando el plan esté guardado y revisado, publica un mensaje breve indicando que el plan ha terminado y está listo para revisión en el canal `issues` de slack que tiene como id `C0CBPC9LUS3`. Incluye el nombre o la ruta del plan para que puedan localizarlo. Si no encuentras el canal o no puedes publicar, informa del problema explícitamente y no afirmes que se envió el aviso.
13. Comunica en la conversación la ruta del plan, confirma si se publicó el aviso en Slack y resume los bloqueos, si existen.

## Seguimiento al implementar el plan

Incluye estas reglas en el propio plan para que un agente pueda aplicarlas al recibir una petición posterior de implementación:

- Lee el plan completo y el estado actual del proyecto antes de modificar código. Resuelve con el usuario las dudas bloqueantes antes de ejecutar los pasos afectados.
- Usa la skill `implement-plan` para ejecutar el plan. Antes de implementar, crea o recupera el worktree en `.vscode/worktrees/<id_tarea>/<breve-descripcion>` con la rama `<id_tarea>/<breve-descripcion>`, partiendo de `development`. Si no existe `development`, créala desde `main` o, en su defecto, `master`. Realiza la implementación y el seguimiento del plan dentro del worktree, conservando el trabajo del checkout original.
- Mantén el mismo archivo como fuente del progreso. Todas las tareas empiezan con `- [ ]`; solo después de completar y comprobar una tarea, márcala con `- [x]` y tacha su título con `~~...~~`. Ejemplo: `- [x] **T01 (5 min)** ~~Añadir la validación del campo~~`.
- Actualiza el plan a medida que termines las tareas, no únicamente al final. No marques como completados pasos pendientes, parcialmente implementados o sin comprobar. Si descubres trabajo necesario adicional, desglósalo en pasos de 5–10 minutos y registra las nuevas decisiones o dudas.
- Marca cada criterio de aceptación únicamente tras verificarlo y anota la evidencia concreta, como el comando ejecutado y su resultado o la comprobación manual realizada. Si una comprobación no se puede ejecutar, déjala pendiente y explica el bloqueo.
- Considera terminada la implementación solo cuando todas las tareas estén completadas, todos los criterios de aceptación estén verificados y no queden dudas bloqueantes. No declares éxito si hay verificaciones pendientes o fallidas.
- Tras completar y verificar toda la implementación y sus commits, publica el aviso de finalización en Slack, canal `C0CBPC9LUS3`, según la skill `implement-plan`. Comprueba el envío e informa explícitamente si falla; no publiques un aviso de implementación completada durante la planificación.
