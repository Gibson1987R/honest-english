

## Revisión automatizada de cambios

Revisar controles de autorización, acceso entre usuarios, tratamiento de secretos/datos, validación de entradas, inyección, dependencias y permisos de CI. Trivy comprueba vulnerabilidades conocidas, secretos y configuración; Codex aporta revisión semántica. Ninguno garantiza ausencia absoluta de riesgos.

No publicar credenciales, datos privados ni ejemplos reales en comentarios o artefactos. Los tests de PR corren sin secretos de producción, con token de solo lectura y runners efímeros. La evaluación privilegiada solo ejecuta política de la rama predeterminada. Cualquier evidencia ausente debe quedar incompleta. El merge requiere autorización explícita del propietario.
