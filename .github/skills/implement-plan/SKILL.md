---
name: implement-plan
description: 'Implementa un plan con ID de tarea en un git worktree desde development, con TDD estricto (rojo, verde y refactor), un commit por tarea usando la skill commit, seguimiento en el plan y aviso final por Slack. Úsala cuando se pida implementar, ejecutar o continuar un plan de trabajo.'
argument-hint: 'Ruta del plan e ID de tarea indicado por el usuario'
---

# Implementar un plan con TDD

## Propósito

Ejecutar el plan recibido de forma incremental y verificable. Cada tarea se cierra con un único commit que incluye sus pruebas, los cambios necesarios y su actualización de seguimiento en el plan.

## Preparación

1. Identifica el plan indicado mediante una ruta, un archivo adjunto o el contexto explícito del usuario. Si falta o hay varios candidatos, pide que concrete cuál implementar. No elijas uno arbitrariamente ni generes un plan distinto.
2. Lee el plan completo, las instrucciones del repositorio y la documentación aplicable. Comprueba objetivos, alcance, dependencias, criterios de aceptación, decisiones y dudas bloqueantes.
3. Comprueba que el plan contiene el ID de tarea proporcionado por el usuario. Si falta, solicítalo mediante la herramienta de preguntas antes de crear ramas o implementar; no lo inventes ni lo confundas con los identificadores internos de pasos (`T01`, `T02`, etc.). Si el ID solicitado contradice el del plan, acláralo antes de continuar.
4. Inspecciona el estado de Git, incluidos los cambios preparados, y los archivos afectados antes de editar. Conserva el trabajo previo del usuario; no lo reviertas ni lo incluyas en tus commits. Si no puedes separar con seguridad cambios previos en los mismos archivos o en el índice, pide instrucciones antes de continuar.
5. Prepara o recupera el worktree siguiendo la sección siguiente. No empieces la implementación en el checkout original.
6. Desde el worktree, comprueba los scripts y las herramientas de pruebas del paquete afectado. Usa las convenciones y herramientas existentes; no confundas la compilación, las pruebas de otro paquete o la validación manual con cobertura automatizada del comportamiento que vas a cambiar.
7. Si faltan herramientas para practicar TDD, o el plan prohíbe incorporarlas, explica el bloqueo y solicita una decisión antes de cambiar código de producción. No añadas dependencias ni cambies el alcance silenciosamente. Registra en el plan los ajustes acordados y sus motivos.
8. Identifica las tareas ya completadas y continúa con las pendientes, respetando sus dependencias. No repitas tareas cerradas ni marques como hechas las que carezcan de verificación.

## Worktree y rama de implementación

- Localiza la raíz del repositorio y consulta las ramas locales y `git worktree list --porcelain`. Usa rutas absolutas y argumentos entrecomillados en los comandos.
- La rama debe llamarse exactamente `<id_tarea>/<breve-descripcion>`. Conserva el ID del usuario y deriva una descripción breve en kebab-case del objetivo del plan. Valida el nombre completo con `git check-ref-format --branch`; si no es válido, solicita al usuario un ID o nombre válido, sin modificar silenciosamente su ID.
- Usa como destino `<raiz>/.vscode/worktrees/<id_tarea>/<breve-descripcion>`. Verifica que la ruta queda dentro de `.vscode/worktrees/` y excluye este directorio de Git antes de crear el worktree, mediante una regla existente o una entrada local en el archivo de exclusiones resuelto con `git rev-parse --git-path info/exclude`. No prepares ni incluyas worktrees anidados en los commits.
- Para una implementación nueva, usa la rama local `development` como base. Si no existe, créala desde la rama local `main`; si tampoco existe `main`, usa `master`. Si no existe ninguna de las dos, detente y solicita una rama base. No sustituyas ni reinicies una `development` existente, ni cambies de rama en el checkout original.
- Crea la rama base, solo si falta, con `git branch development main` o `git branch development master`, según lo comprobado. Después crea la rama y el worktree con `git worktree add -b "<id_tarea>/<breve-descripcion>" "<ruta-absoluta-worktree>" development`.
- Al continuar una implementación, reutiliza su rama y worktree existentes solo tras comprobar que corresponden al ID, al plan y a la ruta previstos. Si la rama existe pero no tiene worktree, usa `git worktree add "<ruta-absoluta-worktree>" "<id_tarea>/<breve-descripcion>"`. Ante una ruta ocupada, una rama asociada a otro trabajo o cualquier conflicto, pregunta antes de actuar; no uses `--force`, no borres directorios ni recrees ramas.
- Comprueba que el plan está disponible en el worktree y que coincide con la versión indicada por el usuario. Si el plan es nuevo o tiene cambios sin commit en el checkout original, traslada únicamente ese archivo al mismo destino relativo del worktree, sin eliminar ni alterar el original ni sobrescribir una versión diferente sin confirmación. Si faltan otros cambios necesarios que no están en `development`, explica el bloqueo y solicita cómo incorporarlos; no copies el checkout completo.
- Ejecuta todas las lecturas, ediciones, pruebas y operaciones de Git de la implementación desde el worktree (`git -C "<ruta-absoluta-worktree>" ...` o directorio de trabajo explícito). Actualiza allí el mismo archivo del plan e incluye su seguimiento en los commits de cada tarea; no mantengas dos copias de progreso.
- Verifica la ruta y la rama activa antes de modificar código y antes de cada commit. Al finalizar, conserva el worktree y la rama para revisión; no los elimines ni fusiones automáticamente.

## Ciclo obligatorio por tarea

Ejecuta el ciclo completo para una sola tarea antes de empezar otra. No acumules tareas para hacer un commit conjunto.

### 1. Delimitar el resultado

- Comprueba que las dependencias de la tarea están completas.
- Identifica el resultado observable, los casos límite relevantes, los archivos afectados y las pruebas que lo demostrarán.
- Si la tarea es demasiado amplia o mezcla trabajo independiente, acuerda su división y actualiza el plan conservando identificadores y dependencias trazables.

### 2. Rojo: escribir y ejecutar primero la prueba

- Añade o modifica una prueba automatizada que exprese el comportamiento solicitado o reproduzca el defecto, antes de modificar el código de producción.
- Ejecuta la prueba contra la implementación actual y observa un fallo por la causa esperada. Un fallo de sintaxis, importación, configuración o infraestructura no demuestra el rojo: corrígelo y vuelve a ejecutar.
- Si la prueba ya pasa, investiga si el comportamiento ya existe o si la prueba no representa el requisito; no introduzcas un fallo artificial ni cambies producción solo para hacerla fallar.
- Registra en la evidencia de la tarea el comando, el resultado y la causa del fallo. No afirmes haber observado un fallo que no has ejecutado.

### 3. Verde: implementar lo necesario

- Solo después del rojo confirmado, modifica el código de producción para satisfacer la prueba y el requisito, siguiendo los patrones del proyecto.
- Ejecuta de nuevo la prueba y comprueba que pasa.
- Para cada comportamiento adicional de la tarea, repite rojo → verde. No escribas toda la implementación y añadas pruebas retrospectivas presentándolo como TDD.

### 4. Refactorizar y comprobar regresiones

- Simplifica únicamente lo necesario dentro del alcance, manteniendo las pruebas en verde. No mezcles mejoras ajenas.
- Ejecuta las pruebas relacionadas y las validaciones exigidas por el repositorio para el paquete afectado, incluidos compilación, tipos o lint cuando correspondan.
- Comprueba los criterios concretos, no solo el resultado global del runner. Conserva el comportamiento existente y actualiza la documentación directamente relacionada.
- Si una comprobación falla o no puede ejecutarse, deja explícito el bloqueo: no cierres la tarea ni hagas un commit que la presente como terminada.

### 5. Actualizar el plan

- Después de completar y verificar la tarea, cambia su casilla a `- [x]` y tacha el título, conservando el identificador, la estimación y el contenido útil:
  `- [x] **T02 (10 min)** ~~Implementar la validación del campo~~`.
- Añade bajo la tarea evidencia breve y real del rojo, el verde y las comprobaciones de regresión: comandos, resultados y comportamiento verificado.
- Marca los criterios de aceptación cubiertos únicamente cuando estén verificados y registra su evidencia. No marques criterios globales que aún dependan de tareas pendientes.
- Mantén el mismo archivo como fuente del progreso. No esperes al final para actualizarlo ni crees un documento paralelo de seguimiento.

### 6. Crear un único commit de la tarea

- Invoca la skill `commit` para preparar y realizar el commit siguiendo sus instrucciones, incluida la revisión del mensaje y la confirmación del usuario. Usa la herramienta de preguntas disponible para solicitar esa confirmación.
- Prepara únicamente los cambios de esta tarea mediante rutas o hunks explícitos. No uses `git add .` ni `git add -A` para incluir cambios indiscriminadamente.
- Revisa el diff preparado: debe contener las pruebas de la tarea, su implementación o cambios necesarios, la documentación relacionada cuando proceda y la actualización del plan. Excluye secretos y cambios ajenos.
- Crea un solo commit con todo ese contenido, usando Conventional Commits y los trailers exigidos por las instrucciones aplicables. No crees commits separados para el rojo, el verde, el refactor o el seguimiento.
- Si se rechaza la confirmación o falla el commit, no continúes con otra tarea: resuelve el bloqueo. Mantén claro que la tarea aún no está cerrada; no dejes una marca de finalización definitiva sin su commit.
- Verifica que el commit existe y contiene los archivos y el cambio de seguimiento previstos. No añadas su propio hash al plan mediante otro commit ni mediante un amend.
- Solo entonces continúa con la siguiente tarea.

## Tareas sin cambios de comportamiento

Las tareas exclusivamente de diagnóstico, documentación o validación no justifican inventar cambios de producción ni pruebas artificiales para simular TDD. Ejecuta y registra su comprobación reproducible, indica por qué el ciclo rojo → verde no aplica y conserva la regla de un commit por tarea con sus artefactos y la actualización del plan. Todo cambio de comportamiento, aunque aparezca dentro de una de estas tareas, exige el ciclo TDD completo y pruebas persistentes incluidas en su commit.

## Bloqueos y finalización

- Si una ambigüedad afecta al comportamiento, la arquitectura o el alcance, pregunta antes de implementar la parte afectada. Documenta el bloqueo en el plan sin marcar la tarea como hecha.
- No desactives pruebas, debilites aserciones ni omitas validaciones para conseguir verde. No ocultes fallos previos; distingue cuáles son anteriores y cuáles están ligados a tus cambios.
- Si el trabajo se interrumpe, informa de la última tarea confirmada, la tarea en curso y las verificaciones pendientes. No presentes cambios sin commit como tareas cerradas.
- Finaliza solo cuando todas las tareas estén verificadas y confirmadas en sus commits, los criterios de aceptación estén comprobados y no queden bloqueos.
- Una vez completada toda la implementación, busca la herramienta de publicación de Slack y envía un mensaje al canal con ID `C0CBPC9LUS3` mediante `slack_post_message` (parámetros `channel_id` y `text`). Incluye el ID de tarea, el resumen del resultado, la ruta del plan, la rama, el worktree, los commits y las validaciones realizadas. No envíes este aviso de implementación completada si quedan tareas, criterios, commits o verificaciones pendientes.
- Comprueba la respuesta de Slack antes de afirmar que se notificó. Si la herramienta no está disponible o el envío falla, informa explícitamente del error y distingue «implementación completada» de «notificación pendiente»; no inventes un envío exitoso ni repitas la implementación para reintentar el aviso.
- Resume las tareas cerradas, los commits creados, las pruebas ejecutadas, la rama y la ruta del worktree, e indica si se publicó el aviso en Slack. Si falta algo, indícalo expresamente y no declares el plan completado.
