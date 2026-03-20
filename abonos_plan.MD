Plan: Sistema de Abonos para Solicitudes
Implementar sistema de abonos que registre pagos parciales en solicitudes, con tabla dedicada abonos_solicitud, recálculo automático de saldos, y sincronización bidireccional con AppSheet.

Steps

Fase 1: Base de Datos
Crear tabla abonos_solicitud con: id, id_solicitud, monto, fecha, descripcion, creado_por, eliminado_at, eliminado_por
Crear función SQL que recalcule monto_pagado y saldo_pendiente automáticamente
Crear trigger que ejecute el recálculo al insertar/actualizar/eliminar abonos
Fase 2: Modificar Sincronización (parallel con Fase 3)
Modificar /api/sync-solicitudes para NO sobrescribir monto_pagado y saldo_pendiente desde Sheets (estos campos fluyen de Supabase → Sheets)
Crear hoja "Abonos" en Google Sheets y endpoint /api/sync-abonos bidireccional
Fase 3: API Backend (parallel con Fase 2)
Crear /api/abonos-solicitud/route.ts con GET (listar), POST (crear), DELETE (soft-delete con auditoría)
Fase 4: UI en /dev
Nueva sección "Abonos" con: buscador de solicitud, lista de abonos, formulario para agregar, historial
Relevant Files

route.ts — modificar para no sobrescribir campos de pago
page.tsx — agregar sección de Abonos
Verification

Crear abono → verificar que monto_pagado y saldo_pendiente se actualicen en Supabase
Ejecutar sync → verificar que NO sobrescribe los campos calculados
Verificar que abonos aparezcan en Google Sheets/AppSheet
Decisions

Los abonos NO modifican cantidad_cuotas ni monto_por_cuota (son el acuerdo original)
monto_pagado = SUM(abonos) → calculado por trigger
saldo_pendiente = total_a_pagar - monto_pagado
Soft-delete para auditoría (columnas eliminado_at, eliminado_por)
Sincronización bidireccional de abonos a hoja separada en Sheets
¿Apruebas este plan para proceder con la implementación?