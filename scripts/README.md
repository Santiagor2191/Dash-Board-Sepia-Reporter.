# Scripts

Estos scripts leen configuración desde variables de entorno del sistema.

Variables soportadas:
- `SEPIA_DB_HOST`
- `SEPIA_DB_PORT`
- `SEPIA_DB_USER`
- `SEPIA_DB_PASSWORD`
- `SEPIA_DB_NAME`
- `SEPIA_DB_TABLE`
- `SEPIA_EXCEL_SOURCE_PATH`
- `SEPIA_EXCEL_SHEET`
- `SEPIA_EXCEL_DEST_PATH`
- `SEPIA_ONEDRIVE_SOURCE_PATH`

Si no defines rutas de Excel, los scripts intentan usar:
- `data/Historico/mercado_libre_oficial.xlsx` para carga
- rutas comunes de OneDrive para la copia desde OneDrive
