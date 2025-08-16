# Manual de Usuario: App de Control de Operaciones Logísticas

## 1. Introducción

Bienvenido a la aplicación de Control de Operaciones Logísticas de Frio Alimentaria. Este manual está diseñado para guiar a los nuevos operarios a través de todas las funcionalidades del sistema, desde el registro diario de operaciones hasta la consulta de informes y la gestión de datos maestros.

## 2. Inicio de Sesión

Para acceder a la aplicación, necesitarás un correo electrónico y una contraseña proporcionados por el administrador del sistema.

1.  **Accede a la aplicación:** Abre la dirección web de la aplicación en tu navegador.
2.  **Ingresa tus credenciales:** Escribe tu correo electrónico y contraseña en los campos correspondientes.
3.  **Haz clic en "Ingresar":** Si los datos son correctos, serás dirigido a la pantalla principal.

> **Nota:** Si olvidas tu contraseña, contacta al administrador para que te asigne una nueva.

## 3. Pantalla Principal

La pantalla principal es tu centro de operaciones. Desde aquí puedes:

*   **Generar nuevos formatos de operación:** Elige el tipo de operación y producto.
*   **Acceder a los módulos de consulta y gestión:** Utiliza los botones de la sección "Consultas y Herramientas".

### 3.1. Generar un Nuevo Formato

Esta es la tarea más común. Sigue estos pasos:

1.  **Selecciona el Tipo de Operación:**
    *   **Recepción:** Para registrar la entrada de mercancía.
    *   **Despacho:** Para registrar la salida de mercancía.

2.  **Selecciona el Tipo de Producto:**
    *   **Peso Fijo:** Para productos que se manejan en unidades o cajas con un peso estándar.
    *   **Peso Variable:** Para productos cuyo peso varía en cada unidad (ej. piezas de carne).

3.  **Haz clic en "Generar Formato":** Esto te llevará al formulario correspondiente.

## 4. Formularios de Operación

Existen tres formularios principales que se adaptan a las necesidades de la operación. Todos comparten campos comunes como "Pedido SISLOG", "Cliente", "Fecha", "Hora de Inicio/Fin", "Observaciones", etc.

### 4.1. Formulario de Peso Fijo (Recepción y Despacho)

*   **Uso:** Para productos con peso conocido y estandarizado.
*   **Campos Clave:**
    *   **Información General:** Llena los datos del pedido, cliente y transporte.
    *   **Características del Producto:**
        *   Haz clic en **"Agregar Producto"**.
        *   Selecciona el **Código** y la **Descripción** del producto (se autocompletarán si el producto ya existe para ese cliente).
        *   Ingresa el **No. de Cajas**, **Total Paletas** y los pesos **Bruto y Neto**.
        *   Registra al menos una **temperatura**.
    *   **Anexos:** Puedes subir fotos desde tu galería o tomarlas directamente con la cámara del dispositivo.
    *   **Responsables:** Asigna al coordinador y define si la operación fue realizada por cuadrilla.

### 4.2. Formulario de Peso Variable (Recepción)

*   **Uso:** Para productos que necesitan ser pesados individualmente al momento de la recepción.
*   **Modos de Operación (según Tipo de Pedido):**
    *   **Recepción General:** Agrega ítems uno por uno. Cada ítem representa una paleta o un grupo de productos. Debes especificar el peso bruto, las taras (caja y estiba) y la cantidad por paleta. El sistema calculará el peso neto.
    *   **Modo Resumen (Paleta 0):** Si ingresas "0" en el campo "Paleta", puedes registrar totales de un producto sin detallar cada paleta.
    *   **Recepción tipo "TUNEL":** Esta opción te permite agrupar ítems por **placa de vehículo**.
        1.  Selecciona "TUNEL" como tipo de pedido.
        2.  Haz clic en **"Agregar Placa"**.
        3.  Ingresa el número de la placa.
        4.  Dentro de cada placa, agrega los ítems correspondientes.
        5.  El campo "Placa" en la sección de información general se llenará automáticamente con todas las placas que hayas agregado.
    *   **Recepción tipo "MAQUILA" o "INGRESO DE SALDOS":** Los campos de información del vehículo (conductor, placa, etc.) son opcionales.

### 4.3. Formulario de Peso Variable (Despacho)

*   **Uso:** Similar a la recepción de peso variable, pero para la salida de mercancía.
*   **Modos de Operación (según Cliente):**
    *   **Despacho General:** Agrega ítems de forma individual o en modo resumen (Paleta 0).
    *   **Pedido por Destino (Clientes Especiales):** Si seleccionas un cliente como "AVICOLA EL MADROÑO S.A." o "AVICOLA EMBUTIDOS", se activará la opción "Pedido por Destino".
        1.  Marca la casilla **"Pedido por Destino"**.
        2.  Haz clic en **"Agregar Destino"**.
        3.  Ingresa el nombre del destino (ej. una ciudad o sucursal).
        4.  Dentro de cada destino, agrega los ítems correspondientes.

### 4.4. Funciones Comunes en Formularios

*   **Guardar Borrador:** El formulario se guarda automáticamente en tu dispositivo cada pocos segundos. Si cierras la aplicación, al volver al mismo formulario se te preguntará si quieres restaurar los datos.
*   **Limpiar Formato:** El botón **"Limpiar Formato"** borra todos los datos ingresados para que puedas empezar de nuevo.
*   **Anexos:** Usa los botones **"Subir archivos"** o **"Tomar Foto"** para adjuntar evidencia fotográfica.

## 5. Módulos de Consultas y Herramientas

Desde la pantalla principal, puedes acceder a varios módulos para gestionar y consultar información.

### 5.1. Consultar Formatos Guardados

*   Busca formularios ya enviados por **Pedido SISLOG, Cliente, Fecha de Operación o Tipo de Operación**.
*   Desde los resultados, puedes:
    *   **Ver (Ojo):** Abre una vista previa del reporte en PDF.
    *   **Editar (Lápiz):** Abre el formulario con los datos cargados para que puedas modificarlos.
    *   **Eliminar (Basura):** Borra el formulario permanentemente.

### 5.2. Informes para Facturación

Este módulo contiene 4 tipos de reportes:

1.  **Movimientos Diarios:** Genera un resumen de paletas recibidas y despachadas por día para un cliente y rango de fechas.
2.  **Operaciones Detalladas:** Ofrece un desglose completo de cada operación (tiempos, vehículos, productos) en un rango de fechas. Puedes filtrar por cliente, tipo de operación, etc.
3.  **Inventario por Día:**
    *   **Cargar Inventario:** Sube un archivo Excel con el stock diario. El formato requerido es estricto.
    *   **Consultar Inventario:** Muestra el total de paletas por cliente para cada día en el rango de fechas seleccionado.
    *   **Exportar Detallado:** Descarga un Excel con el detalle completo del inventario para los filtros seleccionados.
4.  **Consolidado Movimientos/Inventario:** Combina los datos de movimientos y de inventario para mostrar entradas, salidas y el stock final de cada día.

### 5.3. Informe de Desempeño y Liquidación de Cuadrilla

Este módulo es una herramienta poderosa para medir la eficiencia de las operaciones y calcular automáticamente los valores a pagar a las cuadrillas. Se compone de tres partes interconectadas.

#### 5.3.1. Indicadores y Liquidación Cuadrilla (El Informe Principal)

Esta es la pantalla principal del módulo, donde puedes analizar el rendimiento.

*   **Uso:** Generar un reporte detallado del desempeño de las operaciones de cargue y descargue, y ver los conceptos liquidados por operación.
*   **Filtros Disponibles:**
    *   Rango de Fechas (obligatorio).
    *   Cliente(s), Operario, Tipo de Operación, Tipo de Producto.
    *   **Operaciones de Cuadrilla:** Filtra para ver solo operaciones con cuadrilla, solo sin cuadrilla, o todas.
    *   **Concepto Liquidación:** Permite buscar operaciones que incluyan un concepto específico (ej. todas las que tuvieron REESTIBADO).
*   **Interpretación de la Tabla de Productividad:**
    *   **T. Operativo:** Es el tiempo total de la operación menos los minutos justificados en novedades. Este es el tiempo que se compara con el estándar.
    *   **Productividad:** Una calificación automática que te indica la eficiencia de la operación:
        *   **Óptimo (Verde):** El tiempo operativo fue menor que el tiempo estándar definido.
        *   **Normal (Amarillo):** El tiempo operativo estuvo dentro de un margen aceptable (hasta 10 minutos por encima del estándar).
        *   **Lento (Rojo):** El tiempo operativo excedió significativamente el estándar. **Estas operaciones requieren una justificación**.
        *   **Pendiente (Naranja):** En formatos de peso fijo, indica que falta legalizar el peso bruto para poder hacer el cálculo.
        *   **Sin Estándar (Gris):** No se encontró una regla de tiempo (estándar) que coincida con esta operación. Debes crear una en la "Gestión de Estándares".
*   **Acciones en la Tabla:**
    *   **Legalizar (Peso Fijo):** Permite ingresar el peso bruto total de una operación de peso fijo que quedó pendiente.
    *   **Novedad (Justificación):** Para operaciones marcadas como "Lento", puedes agregar una novedad (ej. "DAÑO TRILATERAL") y los minutos de inactividad. **Estos minutos se restarán del tiempo total para recalcular la productividad**.
*   **Pestaña de Liquidación:**
    *   Muestra un desglose de todos los conceptos que generan un cobro (CARGUE, DESCARGUE, REESTIBADO, etc.), con su cantidad, valor unitario y valor total.
    *   El informe se puede exportar a Excel o PDF.

#### 5.3.2. Gestión de Estándares (La Base del Rendimiento)

*   **Uso:** Definir los **tiempos base en minutos** que el sistema usará para medir la productividad. Una operación se considera "Lenta" si su tiempo operativo supera el tiempo definido aquí.
*   **¿Cómo Funciona?**
    1.  **Crear un Nuevo Estándar:** Define una regla combinando criterios. Puedes ser tan general o específico como necesites.
        *   **Cliente(s):** Selecciona uno, varios, o "TODOS".
        *   **Tipo de Operación y Producto:** Recepción, Despacho, Fijo, Variable, o "TODAS".
        *   **Descripción:** Un nombre claro para la regla (ej. "Cargue Pollo Entero").
        *   **Rangos de Toneladas:** **Lo más importante.** Define uno o más rangos de peso (ej. de 0 a 5 Toneladas) y asigna los **minutos base** para cada uno (ej. 45 minutos).
    2.  **Edición y Eliminación:** Puedes editar cualquier estándar existente o eliminarlo. También puedes seleccionar varios y aplicar cambios en lote (ej. cambiar el cliente a varios estándares a la vez).

#### 5.3.3. Gestión de Conceptos de Liquidación (La Base del Cobro)

*   **Uso:** Definir los **conceptos facturables** y su valor. El informe de liquidación usará estas reglas para calcular los totales.
*   **¿Cómo Funciona?**
    1.  **Crear un Nuevo Concepto:**
        *   **Nombre del Concepto:** Debe coincidir con el nombre usado en los formularios (ej. CARGUE, DESCARGUE, REESTIBADO, EMPAQUE DE CAJAS, JORNAL DIURNO).
        *   **Cliente(s):** **Función clave.** Asigna el concepto a uno, varios o "TODOS" los clientes. Esto te permite tener valores diferentes para un mismo concepto según el cliente o excluir a un cliente de un concepto general.
        *   **Tipo de Operación y Producto:** Filtra aún más cuándo se debe aplicar la regla.
        *   **Unidad de Medida y Valor:** Define cómo se cobra el concepto (por TONELADA, por PALETA, por UNIDAD, etc.) y cuál es su valor.

> **Ejemplo Práctico:**
> 1.  Creas un concepto **"EMPAQUE DE CAJAS"** de $500 por CAJA y lo asignas a **TODOS** los clientes.
> 2.  Creas otro concepto **"JORNAL DIURNO"** de $80.000 por UNIDAD y lo asignas **únicamente** a "AVICOLA EL MADROÑO S.A.".
> 3.  **Resultado:** Cuando se haga una operación de maquila para cualquier cliente, se liquidará el empaque. Pero cuando sea para AVICOLA EL MADROÑO S.A., se liquidará el jornal, no el empaque (siempre que el formulario se llene correctamente).

### 5.4. Módulos de Gestión (Acceso Restringido)

*   **Gestión de Artículos:** Crea, edita o elimina productos y asócialos a un cliente y una sesión (Congelado, Refrigerado, Seco). También permite la carga masiva desde un archivo Excel.
*   **Gestión de Clientes:** Añade, edita o elimina clientes.
*   **Gestión de Observaciones:** Administra las observaciones estándar que aparecen en los formularios.
*   **Gestión de Tipos de Pedido:** Define los diferentes tipos de pedido (TUNEL, MAQUILA, etc.) y a qué formularios se aplican.
*   **Gestión de Usuarios:** (Solo Super Admin) Permite crear usuarios, asignar permisos, cambiar contraseñas y cerrar sesiones activas.

---

Este manual cubre las funcionalidades principales de la aplicación. Para cualquier duda o problema no resuelto aquí, por favor, contacta al administrador del sistema.
