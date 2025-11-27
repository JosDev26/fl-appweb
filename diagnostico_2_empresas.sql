-- ============================================
-- PASO 2: EMPRESAS CON modoPago = true
-- IMPORTANTE: Ahora se cobra el MES ANTERIOR
-- Si hoy es DICIEMBRE, se buscan datos de NOVIEMBRE
-- Ajusta las fechas según el mes que quieres verificar
-- Copia y ejecuta esta consulta después
-- ============================================

SELECT 
  'EMPRESA' as tipo,
  e.id,
  e.nombre,
  e.cedula,
  e."modoPago",
  -- Verificar si tiene horas en NOVIEMBRE (mes anterior a diciembre)
  (SELECT COUNT(*) 
   FROM casos c
   WHERE c.id_cliente = e.id
     AND EXISTS (
       SELECT 1 FROM trabajos_por_hora tph 
       WHERE tph.caso_asignado = c.id 
         AND tph.fecha >= '2025-11-01'::date 
         AND tph.fecha <= '2025-11-30'::date
     )
  ) as casos_horas_nov,
  -- Verificar mensualidades
  (SELECT COUNT(*) 
   FROM solicitudes s 
   WHERE s.id_cliente = e.id 
     AND LOWER(TRIM(s.modalidad_pago)) = 'mensualidad'
     AND (s.estado_pago IS NULL OR LOWER(TRIM(s.estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado'))
     AND (s.monto_pagado IS NULL OR s.total_a_pagar IS NULL OR s.monto_pagado < s.total_a_pagar)
  ) as mensualidades,
  -- Verificar gastos en NOVIEMBRE (mes anterior a diciembre)
  (SELECT COUNT(*) 
   FROM gastos g 
   WHERE g.id_cliente = e.id 
     AND g.fecha >= '2025-11-01'::date 
     AND g.fecha <= '2025-11-30'::date
     AND g.total_cobro > 0
  ) as gastos_nov,
  -- SUMA TOTAL (horas + mensualidades + gastos de NOVIEMBRE)
  (SELECT COUNT(*) 
   FROM casos c
   WHERE c.id_cliente = e.id
     AND EXISTS (
       SELECT 1 FROM trabajos_por_hora tph 
       WHERE tph.caso_asignado = c.id 
         AND tph.fecha >= '2025-11-01'::date 
         AND tph.fecha <= '2025-11-30'::date
     )
  ) +
  (SELECT COUNT(*) 
   FROM solicitudes s 
   WHERE s.id_cliente = e.id 
     AND LOWER(TRIM(s.modalidad_pago)) = 'mensualidad'
     AND (s.estado_pago IS NULL OR LOWER(TRIM(s.estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado'))
     AND (s.monto_pagado IS NULL OR s.total_a_pagar IS NULL OR s.monto_pagado < s.total_a_pagar)
  ) +
  (SELECT COUNT(*) 
   FROM gastos g 
   WHERE g.id_cliente = e.id 
     AND g.fecha >= '2025-11-01'::date 
     AND g.fecha <= '2025-11-30'::date
     AND g.total_cobro > 0
  ) as total_razones
FROM empresas e
WHERE e."modoPago" = true
ORDER BY total_razones ASC, e.nombre;

-- ⚠️ IMPORTANTE: Los que tengan total_razones = 0 NO DEBERÍAN tener modoPago activado
