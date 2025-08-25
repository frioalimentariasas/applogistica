# Manual de Usuario: App de Control de Operaciones Logísticas

## 1. Introducción

Bienvenido a la aplicación de Control de Operaciones Logísticas de Frio Alimentaria. Este manual está diseñado para guiar a los operarios a través de todas las funcionalidades del sistema, desde el registro diario de operaciones hasta la consulta de informes y la gestión de datos maestros.

## 2. Inicio de Sesión

Para acceder a la aplicación, necesitarás un correo electrónico y una contraseña proporcionados por el administrador del sistema.

1.  **Accede a la aplicación:** Abre la dirección web de la aplicación en tu navegador.
2.  **Ingresa tus credenciales:** Escribe tu correo electrónico y contraseña en los campos correspondientes.
3.  **Haz clic en "Ingresar":** Si los datos son correctos, serás dirigido a la pantalla principal.

> [PENDIENTE: Insertar pantallazo de la pantalla de inicio de sesión]

> **Nota:** Si olvidas tu contraseña, contacta al administrador para que te asigne una nueva.

## 3. Pantalla Principal

La pantalla principal es tu centro de operaciones. Desde aquí puedes:

*   **Generar nuevos formatos de operación:** Elige el tipo de operación y producto.
*   **Acceder a los módulos de consulta y gestión:** Utiliza los botones de la sección "Consultas y Herramientas".

> [PENDIENTE: Insertar pantallazo de la pantalla principal, mostrando la sección de "Generar Formato" y "Consultas y Herramientas"]

### 3.1. Generar un Nuevo Formato

Esta es la tarea más común. Sigue estos pasos:

1.  **Selecciona el Tipo de Operación:**
    *   **Recepción:** Para registrar la entrada de mercancía.
    *   **Despacho:** Para registrar la salida de mercancía.

2.  **Selecciona el Tipo de Producto:**
    *   **Peso Fijo:** Para productos que se manejan en unidades o cajas con un peso estándar.
    *   **Peso Variable:** Para productos cuyo peso varía en cada unidad (ej. piezas de carne).

3.  **Haz clic en "Generar Formato":** Esto te llevará al formulario correspondiente.

> [PENDIENTE: Insertar pantallazo de la sección "Generar Nuevo Formato" con las opciones seleccionadas]

## 4. Formularios de Operación

Existen tres formularios principales que se adaptan a las necesidades de la operación. Todos comparten campos comunes como "Pedido SISLOG", "Cliente", "Fecha", "Hora de Inicio/Fin", "Observaciones", etc.

### 4.1. Formulario de Peso Fijo (Recepción y Despacho)

*   **Uso:** Para productos con peso conocido y estandarizado, tanto para entradas (recepción) como para salidas (despacho).
*   **Campos Clave:**
    *   **Información General:** Llena los datos del pedido, cliente, fechas y horas. El "Tipo de Pedido" es crucial:
        *   **Recepción tipo "MAQUILA":** Si seleccionas esta opción, aparecerán campos adicionales para "Tipo de Empaque" y "No. de Operarios" si aplica cuadrilla.
        *   **Otros Tipos de Pedido:** Se comportan como una recepción/despacho estándar.
    *   **Características del Producto:**
        *   Haz clic en **"Agregar Producto"**.
        *   Selecciona el **Código** y la **Descripción** del producto (se autocompletarán si el producto ya existe para ese cliente).
        *   Ingresa el **No. de Cajas**, **Total Paletas** y el **Peso Neto (kg)**.
        *   Registra al menos una **temperatura**.
    *   **Información del Vehículo:** Completa los datos del conductor, placa, muelle y contenedor. Estos campos son obligatorios, excepto en recepciones tipo "MAQUILA" o "INGRESO DE SALDOS".
    *   **Anexos:** Puedes subir fotos desde tu galería o tomarlas directamente con la cámara del dispositivo.
    *   **Responsables:** Asigna al coordinador y define si la operación fue realizada por cuadrilla.

> [PENDIENTE: Insertar pantallazo del formulario de Peso Fijo, destacando las secciones principales]

### 4.2. Formulario de Peso Variable (Recepción)

*   **Uso:** Para productos que necesitan ser pesados individualmente al momento de la recepción.
*   **Modos de Operación (según Tipo de Pedido):**
    *   **Recepción General:** Agrega ítems uno por uno. Cada ítem representa una paleta o un grupo de productos. Debes especificar el peso bruto, las taras (caja y estiba) y la cantidad por paleta. El sistema calculará el peso neto automáticamente.
    *   **Modo Resumen (Paleta 0):** Si ingresas "0" en el campo "Paleta", puedes registrar totales de un producto sin detallar cada paleta. Deberás ingresar el "Total Cantidad", "Total Paletas" y "Total Peso Neto".
    *   **Recepción tipo "TUNEL":** Esta opción te permite agrupar ítems por **placa de vehículo**.
        1.  Selecciona "TUNEL" como tipo de pedido.
        2.  Marca la casilla **"Recepción por Placa"**.
        3.  Haz clic en **"Agregar Placa"**.
        4.  Ingresa el número de la placa, conductor y cédula.
        5.  Dentro de cada placa, agrega los ítems correspondientes.
        6.  El sistema llenará automáticamente los campos de información general del vehículo con los datos de todas las placas que hayas agregado.
    *   **Recepción tipo "MAQUILA" o "INGRESO DE SALDOS":** Los campos de información del vehículo (conductor, placa, etc.) son opcionales.

> [PENDIENTE: Insertar pantallazo del formulario de Peso Variable (Recepción), mostrando la sección de ítems y la opción "Recepción por Placa"]

### 4.3. Formulario de Peso Variable (Despacho)

*   **Uso:** Similar a la recepción de peso variable, pero para la salida de mercancía.
*   **Modos de Operación (según Cliente):**
    *   **Despacho General:** Agrega ítems de forma individual o en modo resumen (Paleta 0).
    *   **Pedido por Destino (Clientes Especiales):** Si seleccionas un cliente como "AVICOLA EL MADROÑO S.A.", "AVICOLA EMBUTIDOS", etc., se activará la opción "Pedido por Destino".
        1.  Marca la casilla **"Pedido por Destino"**.
        2.  Haz clic en **"Agregar Destino"**.
        3.  Ingresa el nombre del destino (ej. una ciudad o sucursal).
        4.  Dentro de cada destino, agrega los ítems correspondientes, ya sea de forma individual o en modo resumen.

> [PENDIENTE: Insertar pantallazo del formulario de Peso Variable (Despacho), mostrando la opción "Pedido por Destino"]

### 4.4. Funciones Comunes en Formularios

*   **Observaciones Especiales:**
    *   **CARGUE/DESCARGUE PARCIAL DE PALETAS**: Al seleccionar esta observación, el formulario te pedirá dos datos adicionales:
        *   **Cantidad de Paletas**: El número de paletas movidas en la operación parcial.
        *   **Peso por Paleta (KG)**: El peso promedio de una de esas paletas.
        El sistema usará estos datos para calcular las toneladas a liquidar automáticamente.

> [PENDIENTE: Insertar pantallazo mostrando los campos que aparecen al seleccionar la observación "CARGUE/DESCARGUE PARCIAL DE PALETAS"]

*   **Guardar Borrador:** El formulario se guarda automáticamente en tu dispositivo cada pocos segundos. Si cierras la aplicación, al volver al mismo tipo de formulario se te preguntará si quieres restaurar los datos.
*   **Limpiar Formato:** El botón **"Limpiar Formato"** borra todos los datos ingresados para que puedas empezar de nuevo.
*   **Anexos:** Usa los botones **"Subir archivos"** o **"Tomar Foto"** para adjuntar evidencia fotográfica.

## 5. Módulos de Consultas y Herramientas

Desde la pantalla principal, puedes acceder a varios módulos para gestionar y consultar información.

### 5.1. Consultar Formatos Guardados

*   Busca formularios ya enviados por **Pedido SISLOG, Cliente, Placa, Fecha de Operación, Tipo de Operación o Tipo de Producto**.
*   Desde los resultados, puedes:
    *   **Ver (Ojo):** Abre una vista previa del reporte en PDF.
    *   **Editar (Lápiz):** Abre el formulario con los datos cargados para que puedas modificarlos.
    *   **Eliminar (Basura):** Borra el formulario permanentemente.

> [PENDIENTE: Insertar pantallazo de la página "Consultar Formatos Guardados" con los filtros y la tabla de resultados]

### 5.2. Informes para Facturación

Este módulo contiene 4 tipos de reportes:

1.  **Movimientos Diarios:** Genera un resumen de paletas recibidas y despachadas por día para un cliente y rango de fechas.
2.  **Operaciones Detalladas:** Ofrece un desglose completo de cada operación (tiempos, vehículos, productos) en un rango de fechas. Puedes filtrar por cliente, tipo de operación, etc.
3.  **Inventario por Día:**
    *   **Cargar Inventario:** Sube un archivo Excel con el stock diario. El formato requerido es estricto y debe contener columnas específicas.
    *   **Consultar Inventario:** Muestra el total de paletas por cliente para cada día en el rango de fechas seleccionado.
    *   **Exportar Detallado:** Descarga un Excel con el detalle completo del inventario para los filtros seleccionados.
4.  **Consolidado Movimientos/Inventario:** Combina los datos de movimientos y de inventario para mostrar entradas, salidas y el stock final de cada día.

> [PENDIENTE: Insertar pantallazo de una de las pestañas del módulo "Informes para Facturación", por ejemplo, "Movimientos Diarios"]

### 5.3. Informe de Desempeño y Liquidación de Cuadrilla

Este módulo es una herramienta poderosa para medir la eficiencia de las operaciones y calcular automáticamente los valores a pagar a las cuadrillas. Se compone de dos pestañas principales.

#### 5.3.1. Pestaña "Análisis de Productividad"

Esta es la pantalla principal del módulo, donde puedes analizar el rendimiento.

> [PENDIENTE: Insertar pantallazo de la pestaña "Análisis de Productividad" con la tabla de resultados]

*   **Uso:** Generar un reporte detallado del desempeño de las operaciones de cargue y descargue.
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

#### 5.3.2. Pestaña "Liquidación de Cuadrilla"

Muestra un desglose de todos los conceptos que generan un cobro a la cuadrilla.

> [PENDIENTE: Insertar pantallazo de la pestaña "Liquidación de Cuadrilla"]

*   **Interpretación de la Tabla:**
    *   Muestra cada concepto (CARGUE, DESCARGUE, REESTIBADO, etc.), con su cantidad, valor unitario y valor total.
    *   Al final de la tabla, se muestra un **TOTAL GENERAL LIQUIDACIÓN**.
*   **Exportación:** El informe se puede exportar a Excel.

### 5.4. Módulos de Configuración (Accesibles desde el informe de productividad)

*   **Gestionar Estándares (La Base del Rendimiento)**
    *   **Uso:** Definir los **tiempos base en minutos** que el sistema usará para medir la productividad. Una operación se considera "Lenta" si su tiempo operativo supera el tiempo definido aquí.
    *   **¿Cómo Funciona?**
        1.  **Crear un Nuevo Estándar:** Define una regla combinando criterios. Puedes ser tan general o específico como necesites.
            *   **Cliente(s):** Selecciona uno, varios, o "TODOS".
            *   **Tipo de Operación y Producto:** Recepción, Despacho, Fijo, Variable, o "TODAS".
            *   **Descripción:** Un nombre claro para la regla (ej. "Cargue Pollo Entero").
            *   **Rangos de Toneladas:** **Lo más importante.** Define uno o más rangos de peso (ej. de 0 a 5 Toneladas) y asigna los **minutos base** para cada uno (ej. 45 minutos).
        2.  **Edición y Eliminación:** Puedes editar cualquier estándar existente o eliminarlo. También puedes seleccionar varios y aplicar cambios en lote (ej. cambiar el cliente a varios estándares a la vez).

> [PENDIENTE: Insertar pantallazo del módulo "Gestionar Estándares"]

*   **Gestionar Conceptos de Liquidación (La Base del Cobro)**
    *   **Uso:** Definir los **conceptos facturables** y su valor. El informe de liquidación usará estas reglas para calcular los totales.
    *   **¿Cómo Funciona?**
        1.  **Crear un Nuevo Concepto:**
            *   **Nombre del Concepto:** Debe coincidir con el nombre usado en los formularios (ej. CARGUE, DESCARGUE, REESTIBADO, EMPAQUE DE CAJAS, JORNAL DIURNO).
            *   **Cliente(s):** **Función clave.** Asigna el concepto a uno, varios o "TODOS" los clientes. Esto te permite tener valores diferentes para un mismo concepto según el cliente.
            *   **Tipo de Operación y Producto:** Filtra aún más cuándo se debe aplicar la regla.
            *   **Unidad de Medida y Valor:** Define cómo se cobra el concepto (por TONELADA, por PALETA, por UNIDAD, etc.) y cuál es su valor.

> [PENDIENTE: Insertar pantallazo del módulo "Gestionar Conceptos de Liquidación"]

> **Ejemplo Práctico:**
> 1.  Creas un concepto **"EMPAQUE DE CAJAS"** de $500 por CAJA y lo asignas a **TODOS** los clientes.
> 2.  Creas otro concepto **"JORNAL DIURNO"** de $80.000 por UNIDAD y lo asignas **únicamente** a "AVICOLA EL MADROÑO S.A.".
> 3.  **Resultado:** Cuando se haga una operación de maquila para cualquier cliente, se liquidará el empaque. Pero cuando sea para AVICOLA EL MADROÑO S.A., se liquidará el jornal, no el empaque (siempre que el formulario se llene correctamente).

### 5.5. Módulos de Gestión (Acceso Restringido)

*   **Gestión de Artículos:** Crea, edita o elimina productos y asócialos a un cliente y una sesión (Congelado, Refrigerado, Seco). También permite la carga masiva desde un archivo Excel.
*   **Gestión de Clientes:** Añade, edita o elimina clientes.
*   **Gestión de Observaciones:** Administra las observaciones estándar que aparecen en los formularios.
*   **Gestión de Tipos de Pedido:** Define los diferentes tipos de pedido (TUNEL, MAQUILA, etc.) y a qué formularios se aplican.
*   **Gestión de Usuarios:** (Solo Super Admin) Permite crear usuarios, asignar permisos, cambiar contraseñas y cerrar sesiones activas.

> [PENDIENTE: Insertar un pantallazo de uno de los módulos de gestión, por ejemplo, "Gestión de Artículos"]

---

Este manual cubre las funcionalidades principales de la aplicación. Para cualquier duda o problema no resuelto aquí, por favor, contacta al administrador del sistema.
