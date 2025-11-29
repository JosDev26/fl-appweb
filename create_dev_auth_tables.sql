    -- ============================================
    -- SISTEMA DE AUTENTICACIÓN PARA /DEV
    -- ============================================

    -- Tabla de usuarios administradores
    CREATE TABLE IF NOT EXISTS public.dev_admins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
    );

    -- Tabla de códigos de autenticación temporal
    CREATE TABLE IF NOT EXISTS public.dev_auth_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID NOT NULL REFERENCES public.dev_admins(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    ip_address TEXT,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE
    );

    -- Tabla de sesiones activas
    CREATE TABLE IF NOT EXISTS public.dev_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID NOT NULL REFERENCES public.dev_admins(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE
    );

    -- Índices
    CREATE INDEX idx_dev_admins_email ON public.dev_admins(email);
    CREATE INDEX idx_dev_auth_codes_admin ON public.dev_auth_codes(admin_id);
    CREATE INDEX idx_dev_auth_codes_code ON public.dev_auth_codes(code);
    CREATE INDEX idx_dev_auth_codes_active ON public.dev_auth_codes(is_active, expires_at);
    CREATE INDEX idx_dev_sessions_token ON public.dev_sessions(session_token);
    CREATE INDEX idx_dev_sessions_admin ON public.dev_sessions(admin_id);

    -- Políticas RLS
    ALTER TABLE public.dev_admins ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.dev_auth_codes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.dev_sessions ENABLE ROW LEVEL SECURITY;

    -- Políticas para dev_admins
    CREATE POLICY "Permitir lectura de admins"
    ON public.dev_admins FOR SELECT
    USING (true);

    CREATE POLICY "Permitir actualización de admins"
    ON public.dev_admins FOR UPDATE
    USING (true);

    -- Políticas para dev_auth_codes
    CREATE POLICY "Permitir inserción de códigos"
    ON public.dev_auth_codes FOR INSERT
    WITH CHECK (true);

    CREATE POLICY "Permitir lectura de códigos"
    ON public.dev_auth_codes FOR SELECT
    USING (true);

    CREATE POLICY "Permitir actualización de códigos"
    ON public.dev_auth_codes FOR UPDATE
    USING (true);

    -- Políticas para dev_sessions
    CREATE POLICY "Permitir inserción de sesiones"
    ON public.dev_sessions FOR INSERT
    WITH CHECK (true);

    CREATE POLICY "Permitir lectura de sesiones"
    ON public.dev_sessions FOR SELECT
    USING (true);

    CREATE POLICY "Permitir actualización de sesiones"
    ON public.dev_sessions FOR UPDATE
    USING (true);

    CREATE POLICY "Permitir eliminación de sesiones"
    ON public.dev_sessions FOR DELETE
    USING (true);

    -- Trigger para actualizar updated_at
    CREATE OR REPLACE FUNCTION update_dev_admins_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    DROP TRIGGER IF EXISTS update_dev_admins_timestamp ON public.dev_admins;
    CREATE TRIGGER update_dev_admins_timestamp 
    BEFORE UPDATE ON public.dev_admins
    FOR EACH ROW EXECUTE FUNCTION update_dev_admins_updated_at();

    -- Función para limpiar códigos y sesiones expirados
    CREATE OR REPLACE FUNCTION cleanup_expired_dev_data()
    RETURNS void AS $$
    BEGIN
    -- Eliminar códigos expirados (más de 24 horas)
    DELETE FROM public.dev_auth_codes
    WHERE expires_at < NOW() - INTERVAL '24 hours';
    
    -- Eliminar sesiones expiradas
    DELETE FROM public.dev_sessions
    WHERE expires_at < NOW();
    END;
    $$ LANGUAGE plpgsql;

    -- Comentarios
    COMMENT ON TABLE public.dev_admins IS 'Usuarios administradores con acceso al panel /dev';
    COMMENT ON TABLE public.dev_auth_codes IS 'Códigos temporales de autenticación enviados por correo (expiran en 10 minutos)';
    COMMENT ON TABLE public.dev_sessions IS 'Sesiones activas de administradores (duran 8 horas)';

    -- ============================================
    -- INSERTAR ADMIN INICIAL
    -- ============================================
    -- IMPORTANTE: Cambia estos valores antes de ejecutar
    -- La contraseña debe ser hasheada con bcrypt antes de insertar
    -- Ejemplo: bcrypt.hashSync('tu-contraseña', 10)

    -- INSERT INTO public.dev_admins (email, password_hash, name, is_active)
    -- VALUES (
    --   'admin@tuempresa.com',
    --   '$2a$10$HASH_DE_TU_CONTRASEÑA_AQUI',  -- Cambia esto
    --   'Administrador Principal',
    --   true
    -- );

    -- Verificación
    SELECT 
    'dev_admins' as tabla,
    COUNT(*) as registros
    FROM public.dev_admins
    UNION ALL
    SELECT 
    'dev_auth_codes' as tabla,
    COUNT(*) as registros
    FROM public.dev_auth_codes
    UNION ALL
    SELECT 
    'dev_sessions' as tabla,
    COUNT(*) as registros
    FROM public.dev_sessions;
