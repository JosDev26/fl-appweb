import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('=== REINICIANDO MODO PAGO ===');

  try {
    // Desactivar modoPago para todos los usuarios
    const { error: usuariosError } = await supabase
      .from('usuarios')
      .update({ modoPago: false })
      .neq('id', ''); // Actualizar todos los registros

    if (usuariosError) {
      console.error('Error al actualizar usuarios:', usuariosError);
      throw usuariosError;
    }

    // Desactivar modoPago para todas las empresas
    const { error: empresasError } = await supabase
      .from('empresas')
      .update({ modoPago: false })
      .neq('id', ''); // Actualizar todos los registros

    if (empresasError) {
      console.error('Error al actualizar empresas:', empresasError);
      throw empresasError;
    }

    console.log('✓ Modo pago reiniciado para todos los usuarios y empresas');
    console.log('=== REINICIO COMPLETADO ===');

    return NextResponse.json({
      success: true,
      message: "Modo pago reiniciado exitosamente",
    });

  } catch (error: any) {
    console.error('Error al reiniciar modo pago:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido",
      },
      { status: 500 }
    );
  }
}
