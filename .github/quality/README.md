# Control de calidad de pull requests

Este circuito es independiente del editor, agente o persona que envíe el cambio.

1. El issue describe historia de usuario, problema, solución y criterios comprobables.
2. El PR vincula ese issue y explica validación, regresión, seguridad, documentación y reversión.
3. Cada PR o nueva versión ejecuta Quality Tests y Quality Security. Codex revisa código y seguridad según la configuración del repositorio.
4. Quality Policy reúne evidencia de la versión actual y publica Quality Gate y un comentario. Estados: requiere correcciones, evaluación incompleta o listo para solicitar autorización. La última opción NO hace merge.
5. El autor o agente de origen consulta el comentario/check, lo comunica a Gibson con enlaces y espera su decisión. No hay conexión automática universal de GitHub a sesiones de terminal; cada cliente debe consultar GitHub o implementar su propio receptor.
6. Las correcciones se envían al MISMO PR y se vuelven a evaluar. Si cambia la rama base, actualizar la rama y ejecutar pruebas otra vez. workflow_dispatch permite refrescar el informe sin cambiar código, también después de resolver hilos; GitHub Actions no ofrece el evento de resolución de hilos como disparador directo.
7. Gibson autoriza cada merge para un PR y versión concretos. Nuevos commits invalidan esa autorización. No se habilita auto-merge.

## Evidencia y pruebas

`project.json` define comandos reales para este proyecto. El runner falla si no hay suite, no se descubren pruebas, hay fallos u omisiones. Las pruebas del propio control no reemplazan la regresión del producto. Si GitHub falla también al publicar la invalidación, un resultado verde anterior puede seguir visible. Consultar el workflow fallido y repetir Quality Policy después de recuperar el servicio; nunca usar ese verde viejo como autorización. Las integraciones requieren servicios efímeros/datos ficticios; jamás conectar CI a producción para lograr un estado verde. Si aún no existe una suite o entorno, el resultado queda incompleto y se debe implementar en trabajo separado.

Quality Security usa Trivy fijado por versión y acción por commit para vulnerabilidades, secretos y configuración de severidad alta/crítica. Codex Security se configura desde severidad media. Estos controles no equivalen a pentest completo ni garantizan que todo funcione. El informe debe explicar límites, pruebas manuales y cobertura de aceptación.

La evidencia de Codex se reconoce únicamente del bot oficial y para el SHA actual. Si cambia el formato de su resultado, no se asume aprobación: adaptar el parser con pruebas. Los controles no aprueban por omisión. Los resultados se publican en GitHub para cualquier autor; el envío a chats requiere un adaptador del cliente.

Los cambios a `.github/`, AGENTS.md, SECURITY.md manifiestos/scripts de dependencias y supresiones del escáner requieren revisión explícita de Gibson: comentario exacto `quality-policy-approved: SHA_COMPLETO`. Solo se acepta del usuario propietario y para ese commit. La confirmación debe ser un comentario nuevo, sin editar; si hay una corrección publicar uno nuevo. Se verifica autor/editor de la evidencia del bot con GraphQL. Esta validación técnica es independiente del permiso de merge. Si dos PR comparten el mismo SHA, separar las ramas o cerrar el duplicado antes de continuar.

Los eventos de revisión se reciben en un workflow sin escritura y solo su finalización despierta el evaluador confiable mediante workflow_run. El evaluador con escritura no usa definiciones de PR ni push a ramas de trabajo. Los comentarios eliminados o editados del propietario/bot invalidan evidencia retirada. Cada evento válido barre todos los PR abiertos; un push a la base invalida la evidencia previa cuando deja de incluirse la base. Esto evita perder PR por reemplazo de eventos pendientes. El barrido manual recupera estados tras una interrupción.

## Seguridad de la automatización

El workflow con escritura usa código confiable de la rama predeterminada; nunca hace checkout ni ejecuta código del PR. Tests y escaneo usan `pull_request`, token de lectura y sin secretos heredados. Se fijan acciones a commits. No agregar `pull_request_target` para ejecutar tests de código no confiable. El propietario debe revisar especialmente cambios a la política/workflows y supresiones de escaneo.

## Activación y limitaciones

Este paquete se instala al integrar su PR de configuración, únicamente tras autorización de Gibson. Antes de ese merge no están activos los workflows nuevos de la rama predeterminada. La revisión de Codex se configura por separado y puede estar activa antes.

Tras activar, requerir Quality Gate en las protecciones/rulesets de la rama predeterminada, descartar aprobaciones antiguas, impedir force push y aplicar a administradores cuando el plan lo permita. No confundir un check fallido con bloqueo técnico si no hay protección. GitHub restringe protecciones de ramas privadas según el plan; si devuelve 403, documentar la limitación sin cambiar visibilidad ni contratar un plan. El dueño siempre puede modificar la configuración: no existe garantía contra una anulación por un administrador.

Los repositorios nuevos necesitan configuración explícita; esta instalación no descubre automáticamente repos futuros. Revisión de código/seguridad de Codex depende de disponibilidad y cuota del servicio: si no concluye, la evaluación sigue incompleta.
