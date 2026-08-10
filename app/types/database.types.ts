export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      acciones_disponibles: {
        Row: {
          accion: string
          modulo_clave: string
          nombre: string
        }
        Insert: {
          accion: string
          modulo_clave: string
          nombre: string
        }
        Update: {
          accion?: string
          modulo_clave?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "acciones_disponibles_modulo_clave_fkey"
            columns: ["modulo_clave"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["clave"]
          },
        ]
      }
      alertas: {
        Row: {
          created_at: string
          empresa_id: string
          entidad_id: string
          entidad_tipo: string
          estado: Database["public"]["Enums"]["estado_alerta"]
          fecha_vencimiento: string
          id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          entidad_id: string
          entidad_tipo: string
          estado?: Database["public"]["Enums"]["estado_alerta"]
          fecha_vencimiento: string
          id?: string
          tipo: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          entidad_id?: string
          entidad_tipo?: string
          estado?: Database["public"]["Enums"]["estado_alerta"]
          fecha_vencimiento?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      archivos: {
        Row: {
          created_at: string
          empresa_id: string
          entidad_id: string
          entidad_tipo: string
          id: string
          storage_path: string
          subido_por: string
          tipo: Database["public"]["Enums"]["tipo_archivo"]
        }
        Insert: {
          created_at?: string
          empresa_id: string
          entidad_id: string
          entidad_tipo: string
          id?: string
          storage_path: string
          subido_por: string
          tipo: Database["public"]["Enums"]["tipo_archivo"]
        }
        Update: {
          created_at?: string
          empresa_id?: string
          entidad_id?: string
          entidad_tipo?: string
          id?: string
          storage_path?: string
          subido_por?: string
          tipo?: Database["public"]["Enums"]["tipo_archivo"]
        }
        Relationships: [
          {
            foreignKeyName: "archivos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archivos_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      aseguradoras: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          razon_social: string
          rfc: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          razon_social: string
          rfc: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          razon_social?: string
          rfc?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aseguradoras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      asignaciones_conductor_vehiculo: {
        Row: {
          asignado_por: string
          conductor_id: string
          created_at: string
          empresa_id: string
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          vehiculo_id: string
        }
        Insert: {
          asignado_por: string
          conductor_id: string
          created_at?: string
          empresa_id: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          vehiculo_id: string
        }
        Update: {
          asignado_por?: string
          conductor_id?: string
          created_at?: string
          empresa_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asignaciones_conductor_vehiculo_asignado_por_fkey"
            columns: ["asignado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_conductor_vehiculo_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_conductor_vehiculo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_conductor_vehiculo_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          accion: Database["public"]["Enums"]["accion_auditoria"]
          created_at: string
          empresa_id: string | null
          entidad: string
          entidad_id: string
          id: string
          usuario_id: string | null
          valores_antes: Json | null
          valores_despues: Json | null
        }
        Insert: {
          accion: Database["public"]["Enums"]["accion_auditoria"]
          created_at?: string
          empresa_id?: string | null
          entidad: string
          entidad_id: string
          id?: string
          usuario_id?: string | null
          valores_antes?: Json | null
          valores_despues?: Json | null
        }
        Update: {
          accion?: Database["public"]["Enums"]["accion_auditoria"]
          created_at?: string
          empresa_id?: string | null
          entidad?: string
          entidad_id?: string
          id?: string
          usuario_id?: string | null
          valores_antes?: Json | null
          valores_despues?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cargas_combustible: {
        Row: {
          cantidad: number
          costo_total: number
          costo_unitario: number
          creado_por: string
          created_at: string
          empresa_id: string
          estado: Database["public"]["Enums"]["estado_registro"]
          factura_archivo_id: string | null
          fecha: string
          id: string
          odometro: number
          producto_id: string
          proveedor_id: string
          vehiculo_id: string
        }
        Insert: {
          cantidad: number
          costo_total: number
          costo_unitario: number
          creado_por: string
          created_at?: string
          empresa_id: string
          estado?: Database["public"]["Enums"]["estado_registro"]
          factura_archivo_id?: string | null
          fecha: string
          id?: string
          odometro: number
          producto_id: string
          proveedor_id: string
          vehiculo_id: string
        }
        Update: {
          cantidad?: number
          costo_total?: number
          costo_unitario?: number
          creado_por?: string
          created_at?: string
          empresa_id?: string
          estado?: Database["public"]["Enums"]["estado_registro"]
          factura_archivo_id?: string | null
          fecha?: string
          id?: string
          odometro?: number
          producto_id?: string
          proveedor_id?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargas_combustible_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_combustible_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_combustible_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_combustible_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_combustible_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cargas_combustible_factura_archivo"
            columns: ["factura_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          checklist_id: string
          cumple: boolean
          empresa_id: string
          id: string
          nombre_item: string
          observaciones: string | null
        }
        Insert: {
          checklist_id: string
          cumple: boolean
          empresa_id: string
          id?: string
          nombre_item: string
          observaciones?: string | null
        }
        Update: {
          checklist_id?: string
          cumple?: boolean
          empresa_id?: string
          id?: string
          nombre_item?: string
          observaciones?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          created_at: string
          empresa_id: string
          fecha: string
          id: string
          responsable_id: string
          resultado: Database["public"]["Enums"]["resultado_checklist"]
          tipo_vehiculo_id: string
          vehiculo_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          fecha?: string
          id?: string
          responsable_id: string
          resultado: Database["public"]["Enums"]["resultado_checklist"]
          tipo_vehiculo_id: string
          vehiculo_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          fecha?: string
          id?: string
          responsable_id?: string
          resultado?: Database["public"]["Enums"]["resultado_checklist"]
          tipo_vehiculo_id?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_tipo_vehiculo_id_fkey"
            columns: ["tipo_vehiculo_id"]
            isOneToOne: false
            referencedRelation: "tipos_vehiculo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      conductores: {
        Row: {
          activo: boolean
          apellidos: string
          calle: string | null
          celular: string | null
          colonia: string | null
          created_at: string
          empresa_id: string
          fecha_vencimiento_licencia: string
          foto_archivo_id: string | null
          id: string
          licencia_archivo_id: string | null
          motivo_baja: string | null
          nombre: string
          numero: string | null
          numero_licencia: string
          tipo_licencia: Database["public"]["Enums"]["tipo_licencia"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          apellidos: string
          calle?: string | null
          celular?: string | null
          colonia?: string | null
          created_at?: string
          empresa_id: string
          fecha_vencimiento_licencia: string
          foto_archivo_id?: string | null
          id?: string
          licencia_archivo_id?: string | null
          motivo_baja?: string | null
          nombre: string
          numero?: string | null
          numero_licencia: string
          tipo_licencia: Database["public"]["Enums"]["tipo_licencia"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          apellidos?: string
          calle?: string | null
          celular?: string | null
          colonia?: string | null
          created_at?: string
          empresa_id?: string
          fecha_vencimiento_licencia?: string
          foto_archivo_id?: string | null
          id?: string
          licencia_archivo_id?: string | null
          motivo_baja?: string | null
          nombre?: string
          numero?: string | null
          numero_licencia?: string
          tipo_licencia?: Database["public"]["Enums"]["tipo_licencia"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conductores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conductores_foto_archivo_id_fkey"
            columns: ["foto_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conductores_licencia_archivo"
            columns: ["licencia_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          activo: boolean
          correo: string | null
          created_at: string
          id: string
          logo_url: string | null
          moneda: string
          nombre: string
          pais: string
          rfc: string
          telefono_movil: string | null
          telefono_oficina_1: string | null
          telefono_oficina_2: string | null
          unidad_combustible: Database["public"]["Enums"]["unidad_combustible"]
          unidad_distancia: Database["public"]["Enums"]["unidad_distancia"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          correo?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          moneda?: string
          nombre: string
          pais?: string
          rfc: string
          telefono_movil?: string | null
          telefono_oficina_1?: string | null
          telefono_oficina_2?: string | null
          unidad_combustible?: Database["public"]["Enums"]["unidad_combustible"]
          unidad_distancia?: Database["public"]["Enums"]["unidad_distancia"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          correo?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          moneda?: string
          nombre?: string
          pais?: string
          rfc?: string
          telefono_movil?: string | null
          telefono_oficina_1?: string | null
          telefono_oficina_2?: string | null
          unidad_combustible?: Database["public"]["Enums"]["unidad_combustible"]
          unidad_distancia?: Database["public"]["Enums"]["unidad_distancia"]
          updated_at?: string
        }
        Relationships: []
      }
      mantenimiento_detalles: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          llanta_condicion:
            | Database["public"]["Enums"]["condicion_llanta"]
            | null
          llanta_kilometraje: number | null
          llanta_marca: string | null
          llanta_medida: string | null
          llanta_numero_serie: string | null
          mantenimiento_id: string
          producto_id: string
          servicio_fecha_proximo: string | null
          servicio_frecuencia_km: number | null
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          llanta_condicion?:
            | Database["public"]["Enums"]["condicion_llanta"]
            | null
          llanta_kilometraje?: number | null
          llanta_marca?: string | null
          llanta_medida?: string | null
          llanta_numero_serie?: string | null
          mantenimiento_id: string
          producto_id: string
          servicio_fecha_proximo?: string | null
          servicio_frecuencia_km?: number | null
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          llanta_condicion?:
            | Database["public"]["Enums"]["condicion_llanta"]
            | null
          llanta_kilometraje?: number | null
          llanta_marca?: string | null
          llanta_medida?: string | null
          llanta_numero_serie?: string | null
          mantenimiento_id?: string
          producto_id?: string
          servicio_fecha_proximo?: string | null
          servicio_frecuencia_km?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mantenimiento_detalles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mantenimiento_detalles_mantenimiento_id_fkey"
            columns: ["mantenimiento_id"]
            isOneToOne: false
            referencedRelation: "mantenimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mantenimiento_detalles_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      mantenimientos: {
        Row: {
          costo_total: number
          creado_por: string
          created_at: string
          empresa_id: string
          estado: Database["public"]["Enums"]["estado_registro"]
          factura_archivo_id: string | null
          fecha: string
          id: string
          notas: string | null
          proveedor_id: string
          tipo: Database["public"]["Enums"]["tipo_mantenimiento"]
          vehiculo_id: string
        }
        Insert: {
          costo_total: number
          creado_por: string
          created_at?: string
          empresa_id: string
          estado?: Database["public"]["Enums"]["estado_registro"]
          factura_archivo_id?: string | null
          fecha: string
          id?: string
          notas?: string | null
          proveedor_id: string
          tipo: Database["public"]["Enums"]["tipo_mantenimiento"]
          vehiculo_id: string
        }
        Update: {
          costo_total?: number
          creado_por?: string
          created_at?: string
          empresa_id?: string
          estado?: Database["public"]["Enums"]["estado_registro"]
          factura_archivo_id?: string | null
          fecha?: string
          id?: string
          notas?: string | null
          proveedor_id?: string
          tipo?: Database["public"]["Enums"]["tipo_mantenimiento"]
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_mantenimientos_factura_archivo"
            columns: ["factura_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mantenimientos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mantenimientos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mantenimientos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mantenimientos_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos: {
        Row: {
          clave: string
          nombre: string
          orden: number
        }
        Insert: {
          clave: string
          nombre: string
          orden?: number
        }
        Update: {
          clave?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      permisos: {
        Row: {
          clave: string
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          tipo: Database["public"]["Enums"]["tipo_permiso"]
          updated_at: string
        }
        Insert: {
          clave: string
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          tipo: Database["public"]["Enums"]["tipo_permiso"]
          updated_at?: string
        }
        Update: {
          clave?: string
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          tipo?: Database["public"]["Enums"]["tipo_permiso"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permisos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          tipo: Database["public"]["Enums"]["tipo_producto"]
          unidad: string | null
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          tipo: Database["public"]["Enums"]["tipo_producto"]
          unidad?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          tipo?: Database["public"]["Enums"]["tipo_producto"]
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          calle: string | null
          celular: string | null
          colonia: string | null
          correo: string | null
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          numero: string | null
          rfc: string | null
          telefono_oficina_1: string | null
          telefono_oficina_2: string | null
          updated_at: string
        }
        Insert: {
          calle?: string | null
          celular?: string | null
          colonia?: string | null
          correo?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          numero?: string | null
          rfc?: string | null
          telefono_oficina_1?: string | null
          telefono_oficina_2?: string | null
          updated_at?: string
        }
        Update: {
          calle?: string | null
          celular?: string | null
          colonia?: string | null
          correo?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          numero?: string | null
          rfc?: string | null
          telefono_oficina_1?: string | null
          telefono_oficina_2?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios_obligatorios: {
        Row: {
          archivo_id: string | null
          created_at: string
          empresa_id: string
          fecha_realizado: string
          fecha_vencimiento: string
          id: string
          tipo: Database["public"]["Enums"]["tipo_servicio_obligatorio"]
          updated_at: string
          vehiculo_id: string
        }
        Insert: {
          archivo_id?: string | null
          created_at?: string
          empresa_id: string
          fecha_realizado: string
          fecha_vencimiento: string
          id?: string
          tipo: Database["public"]["Enums"]["tipo_servicio_obligatorio"]
          updated_at?: string
          vehiculo_id: string
        }
        Update: {
          archivo_id?: string | null
          created_at?: string
          empresa_id?: string
          fecha_realizado?: string
          fecha_vencimiento?: string
          id?: string
          tipo?: Database["public"]["Enums"]["tipo_servicio_obligatorio"]
          updated_at?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_servicios_obligatorios_archivo"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_obligatorios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_obligatorios_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_vehiculo: {
        Row: {
          clave: string
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          clave: string
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          clave?: string
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipos_vehiculo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_permisos: {
        Row: {
          accion: string
          created_at: string
          empresa_id: string
          id: string
          modulo_clave: string
          otorgado_por: string
          usuario_id: string
        }
        Insert: {
          accion: string
          created_at?: string
          empresa_id: string
          id?: string
          modulo_clave: string
          otorgado_por: string
          usuario_id: string
        }
        Update: {
          accion?: string
          created_at?: string
          empresa_id?: string
          id?: string
          modulo_clave?: string
          otorgado_por?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_permisos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_permisos_modulo_clave_fkey"
            columns: ["modulo_clave"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["clave"]
          },
          {
            foreignKeyName: "usuario_permisos_otorgado_por_fkey"
            columns: ["otorgado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_permisos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          activo: boolean
          auth_user_id: string
          correo: string
          created_at: string
          empresa_id: string | null
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          auth_user_id: string
          correo: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          nombre: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          auth_user_id?: string
          correo?: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculo_permisos: {
        Row: {
          created_at: string
          empresa_id: string
          fecha_vencimiento: string | null
          id: string
          permiso_id: string
          vehiculo_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          fecha_vencimiento?: string | null
          id?: string
          permiso_id: string
          vehiculo_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          fecha_vencimiento?: string | null
          id?: string
          permiso_id?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehiculo_permisos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_permisos_permiso_id_fkey"
            columns: ["permiso_id"]
            isOneToOne: false
            referencedRelation: "permisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_permisos_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculos: {
        Row: {
          anio: number | null
          aseguradora_id: string | null
          baja: boolean
          capacidad_carga: number | null
          color: string | null
          combustible: string | null
          created_at: string
          empresa_id: string
          fecha_vencimiento_poliza: string | null
          foto_archivo_id: string | null
          id: string
          kilometraje_actual: number | null
          marca: string
          modelo: string
          motivo_baja: string | null
          numero_ejes: number | null
          numero_motor: string | null
          numero_poliza: string | null
          numero_serie: string | null
          placa: string
          poliza_archivo_id: string | null
          tipo_vehiculo_id: string
          transmision: string | null
          updated_at: string
          vin: string | null
        }
        Insert: {
          anio?: number | null
          aseguradora_id?: string | null
          baja?: boolean
          capacidad_carga?: number | null
          color?: string | null
          combustible?: string | null
          created_at?: string
          empresa_id: string
          fecha_vencimiento_poliza?: string | null
          foto_archivo_id?: string | null
          id?: string
          kilometraje_actual?: number | null
          marca: string
          modelo: string
          motivo_baja?: string | null
          numero_ejes?: number | null
          numero_motor?: string | null
          numero_poliza?: string | null
          numero_serie?: string | null
          placa: string
          poliza_archivo_id?: string | null
          tipo_vehiculo_id: string
          transmision?: string | null
          updated_at?: string
          vin?: string | null
        }
        Update: {
          anio?: number | null
          aseguradora_id?: string | null
          baja?: boolean
          capacidad_carga?: number | null
          color?: string | null
          combustible?: string | null
          created_at?: string
          empresa_id?: string
          fecha_vencimiento_poliza?: string | null
          foto_archivo_id?: string | null
          id?: string
          kilometraje_actual?: number | null
          marca?: string
          modelo?: string
          motivo_baja?: string | null
          numero_ejes?: number | null
          numero_motor?: string | null
          numero_poliza?: string | null
          numero_serie?: string | null
          placa?: string
          poliza_archivo_id?: string | null
          tipo_vehiculo_id?: string
          transmision?: string | null
          updated_at?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_vehiculos_poliza_archivo"
            columns: ["poliza_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_aseguradora_id_fkey"
            columns: ["aseguradora_id"]
            isOneToOne: false
            referencedRelation: "aseguradoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_foto_archivo_id_fkey"
            columns: ["foto_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_tipo_vehiculo_id_fkey"
            columns: ["tipo_vehiculo_id"]
            isOneToOne: false
            referencedRelation: "tipos_vehiculo"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      listar_operarios_propios: {
        Args: Record<PropertyKey, never>
        Returns: {
          activo: boolean
          correo: string
          created_at: string
          id: string
          nombre: string
          pendiente: boolean
        }[]
      }
    }
    Enums: {
      accion_auditoria:
        | "crear"
        | "editar"
        | "eliminar"
        | "cancelar"
        | "desactivar"
        | "reactivar"
      condicion_llanta: "nueva" | "renovada"
      estado_alerta: "pendiente" | "enviada" | "resuelta"
      estado_registro: "activo" | "cancelado"
      resultado_checklist: "aprobado" | "con_observaciones"
      rol_usuario: "superusuario" | "admin" | "operario"
      tipo_archivo:
        | "poliza"
        | "licencia"
        | "factura"
        | "foto"
        | "foto_conductor"
      tipo_licencia: "federal" | "local"
      tipo_mantenimiento: "correctivo" | "preventivo"
      tipo_permiso: "estatal" | "federal"
      tipo_producto:
        | "refaccion"
        | "combustible"
        | "servicio"
        | "llanta"
        | "consumible"
      tipo_servicio_obligatorio:
        | "revision_fisico_mecanica"
        | "verificacion_ambiental"
        | "renovacion_aditamentos"
      unidad_combustible: "litros" | "galones"
      unidad_distancia: "km" | "millas"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      accion_auditoria: [
        "crear",
        "editar",
        "eliminar",
        "cancelar",
        "desactivar",
        "reactivar",
      ],
      condicion_llanta: ["nueva", "renovada"],
      estado_alerta: ["pendiente", "enviada", "resuelta"],
      estado_registro: ["activo", "cancelado"],
      resultado_checklist: ["aprobado", "con_observaciones"],
      rol_usuario: ["superusuario", "admin", "operario"],
      tipo_archivo: ["poliza", "licencia", "factura", "foto", "foto_conductor"],
      tipo_licencia: ["federal", "local"],
      tipo_mantenimiento: ["correctivo", "preventivo"],
      tipo_permiso: ["estatal", "federal"],
      tipo_producto: [
        "refaccion",
        "combustible",
        "servicio",
        "llanta",
        "consumible",
      ],
      tipo_servicio_obligatorio: [
        "revision_fisico_mecanica",
        "verificacion_ambiental",
        "renovacion_aditamentos",
      ],
      unidad_combustible: ["litros", "galones"],
      unidad_distancia: ["km", "millas"],
    },
  },
} as const

