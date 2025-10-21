
# Manual de Usuario: Liquidación de Servicios a Clientes

## 1. Introducción

Bienvenido al manual avanzado para la Liquidación de Servicios a Clientes de Frio Alimentaria. Esta guía está diseñada para los administradores y personal de facturación, y cubre de manera exhaustiva todo el ciclo de vida de la liquidación: desde la configuración de conceptos de cobro hasta la generación de informes finales y el uso de asistentes especializados.

Este sistema permite automatizar y estandarizar el cobro de todos los servicios logísticos prestados, asegurando precisión y eficiencia.

---

## 2. Gestión de Conceptos de Liquidación de Clientes

Este es el cerebro del sistema de facturación. Aquí se definen **qué servicios se cobran, a quién se le cobran, cómo se calculan y cuánto cuestan**. Cada "concepto" es una regla de negocio que el sistema buscará en las operaciones diarias para generar un cobro.

**Ruta de Acceso:** `Consultas y Herramientas` > `Informes para Facturación` > `Liquidación de Servicios Clientes` > Botón `Gestionar Conceptos`.

### 2.1. Creación de un Nuevo Concepto

Para crear una nueva regla de cobro, sigue estos pasos:

1.  Haz clic en **"Nuevo Concepto"**.
2.  Completa los siguientes campos en el formulario:

#### **Información Básica**

*   **Nombre del Concepto:** El nombre del servicio que se va a liquidar. Es fundamental que sea claro y único. Ejemplos: `ALMACENAMIENTO PALLET/DIA`, `MOVIMIENTO ENTRADA PRODUCTO - PALETA`, `INSPECCIÓN ZFPC`.
*   **Aplicar a Cliente(s):** Define a qué clientes aplica esta regla. Puedes seleccionar uno o más clientes específicos, o elegir **"TODOS (Cualquier Cliente)"** si es una tarifa general.
*   **Unidad de Medida (Para Reporte):** La unidad que aparecerá en el informe final (ej. KILOGRAMOS, PALETA, HORA, DIA, VIAJE).
*   **Estado:** Permite activar o desactivar una regla de cobro sin tener que eliminarla.

#### **Tipo de Cálculo**

Define **cómo el sistema identificará** que debe aplicar este concepto.

*   **Por Reglas:** Es el modo más común. El sistema buscará en los **formularios de operación** (recepciones/despachos) que cumplan con una serie de filtros que definas:
    *   **Calcular Usando:** La base para el cálculo de la cantidad (ej. TONELADAS, CANTIDAD DE PALETAS, etc.).
    *   **Filtrar por Tipo de Operación:** Limita el concepto a `Recepción`, `Despacho` o `Ambos`.
    *   **Filtrar por Tipo de Producto:** Limita a `Peso Fijo`, `Peso Variable` o `Ambos`.
    *   **Filtrar por Sesión (Cámara):** Limita a `Congelados (CO)`, `Refrigerado (RE)`, `Seco (SE)` o `Ambos`.
    *   **Filtrar por Tipos de Pedido:** Permite seleccionar uno o más tipos de pedido específicos (ej. `VENTA NACIONAL`, `MAQUILA`).

*   **Por Observación:** El sistema aplicará el concepto si un operario selecciona una **observación específica** en un formulario y le asigna una cantidad.
    *   **Observación Asociada:** Debes seleccionar de la lista la observación que activará el cobro (ej. `REESTIBADO`).

*   **Op. Manual:** El concepto solo se podrá aplicar desde el módulo de **"Registro de Operaciones Manuales Clientes"**. Es para servicios que no se registran en los formularios estándar (ej. `CONEXIÓN ELÉCTRICA CONTENEDOR`).

*   **Saldo Inventario:** Calcula el cobro basándose en el saldo de inventario diario.
    *   **Fuente del Dato:** Actualmente, la única opción es `Posiciones Almacenadas (Consolidado)`.
    *   **Sesión de Inventario:** Debes especificar si se cobrará por el saldo de `CO`, `RE` o `SE`.

*   **Lógica Especial:** Para conceptos con reglas de negocio muy complejas que están programadas directamente en el sistema (ej. `SERVICIO LOGÍSTICO MANIPULACIÓN CARGA` para SMYL).

#### **Tipo de Tarifa**

Define **cuánto se va a cobrar**.

*   **Única:** Se aplica una tarifa fija por la unidad de medida.
    *   **Tarifa Única (COP):** El valor a cobrar por cada unidad.
    *   **Período de Facturación (Opcional):** Para conceptos de cobro recurrente (ej. `POSICIONES FIJAS`), puedes definir si el cobro es `Diario`, `Quincenal` o `Mensual`. El sistema multiplicará la tarifa por el número de días correspondiente.

*   **Rangos:** Permite definir tarifas diferentes según el peso (en toneladas) y el turno de la operación.
    *   **Definición de Turno Diurno:** Configura las horas que se consideran "Diurno" para días de semana (L-V) y sábados. Lo que esté fuera de ese rango se considera "Nocturno" (L-V) o "Extra" (Sábados, Domingos y Festivos).
    *   **Rangos de Tarifas:** Puedes agregar múltiples rangos. Para cada uno, defines:
        *   `Min. Toneladas` y `Max. Toneladas`.
        *   `Tipo Vehículo`: Nombre descriptivo (ej. TURBO, SENCILLO).
        *   `Tarifa Diurna`, `Tarifa Nocturna` y `Tarifa Extra`.

*   **Específica:** Para conceptos con múltiples sub-servicios, cada uno con su propia tarifa. Es ideal para liquidar jornales o servicios complejos.
    *   **Configuración de Horarios (si aplica):** Para conceptos como `TIEMPO EXTRA FRIOAL`, se configuran los horarios base de la jornada.
    *   **Tarifas Específicas:** Puedes agregar una lista de "sub-tarifas", cada una con su nombre, valor y unidad de medida.

*   **Por Temperatura:** La tarifa se aplica según la temperatura registrada.
    *   **Rangos de Temperatura:** Defines rangos (`Temp. Mín`, `Temp. Máx`) y una `Tarifa por Kilo` para cada uno.

---

## 3. Registro de Operaciones Manuales Clientes

Este módulo permite registrar cobros de servicios que no se capturan en los formularios de operación estándar, como alquileres, servicios especiales o inspecciones.

**Ruta de Acceso:** `Consultas y Herramientas` > `Informes para Facturación` > Botón `Registro de Op. Manuales`.

### 3.1. Crear una Operación Manual

1.  Haz clic en **"Nueva Operación"**.
2.  Selecciona el **Cliente** y el **Concepto de Liquidación**. El formulario cambiará dinámicamente según el concepto que elijas.
3.  Completa los campos requeridos. A continuación, se detallan los más importantes según el tipo de concepto:

#### **Conceptos de Tarifa Única**

*   **Fecha de Operación:** El día en que se realizó el servicio.
*   **Cantidad:** El número de unidades a cobrar (ej. si la unidad es `VIAJE` y se hicieron 2, pones `2`).
*   **Detalles Adicionales:** Campos opcionales para añadir contexto, como `Placa`, `Contenedor`, etc.

#### **Concepto: `INSPECCIÓN ZFPC`**

*   **Fecha de Operación:** El día de la inspección.
*   **Hora Inicio y Hora Fin:** Cruciales para el cálculo automático de la duración. El sistema redondeará las horas según la regla (>= 10 minutos redondea hacia arriba).
*   **Número de Personas:** La cantidad de inspectores que participaron.
*   **# ARIN y # FMM:** Los números de documento asociados a la inspección.

> **¡Importante!** Al guardar, el sistema verificará si parte del horario cae en un período de **hora extra** (L-V después de las 6 PM, Sábados después de las 12 PM, o todo el día en Domingo). Si es así, aparecerá una alerta con el detalle de las horas extra a liquidar por separado en el concepto `TIEMPO EXTRA ZFPC`.

#### **Concepto: `CONEXIÓN ELÉCTRICA CONTENEDOR`**

*   Este concepto no usa "Fecha de Operación". En su lugar, debes especificar:
    *   **Fecha y Hora de Arribo**.
    *   **Fecha y Hora de Salida**.
*   El sistema calculará automáticamente la duración en horas y la asignará a la "Cantidad".

#### **Concepto: `TIEMPO EXTRA FRIOAL (FIJO)`** (Liquidación por Lote de Fechas)

*   **Fechas de Operación:** Permite seleccionar múltiples días a la vez.
*   **Asignación de Personal:** Ingresa el número de personas por cada rol que trabajó en esas fechas.
*   **Horas Excedentes:** Si la jornada se extendió más allá del horario base configurado, puedes añadir aquí las horas excedentes para cada día.

### 3.2. Carga Masiva desde Excel

Para conceptos como `FMM`, `ARIN` e `INSPECCIÓN ZFPC`, puedes cargar un archivo Excel para registrar múltiples operaciones a la vez.

1.  En el módulo de "Registro de Operaciones Manuales", ve a la sección **"Carga Masiva desde Excel"**.
2.  Selecciona el **Tipo de Carga** (FMM, ARIN o Inspección).
3.  El sistema te mostrará las columnas requeridas para el archivo.
4.  Selecciona tu archivo y haz clic en **"Cargar Archivo"**. El sistema procesará los datos, validará duplicados (por # FMM o # ARIN) y registrará las operaciones. Si hay errores, se te informará para que puedas corregirlos.

---

## 4. Informes de Facturación

Este es el módulo central para consultar y exportar los datos necesarios para la facturación. Se divide en 4 pestañas.

**Ruta de Acceso:** `Consultas y Herramientas` > `Informes para Facturación`.

### 4.1. Pestaña: Operaciones Detalladas

Genera un reporte completo de cada operación registrada en los formularios.

*   **Filtros:** Puedes buscar por rango de fechas (obligatorio), cliente, tipo de operación, tipo de pedido y número de contenedor.
*   **Resultados:** Muestra una tabla con el detalle de cada operación: fechas, horas, duración, vehículo, productos, cantidades, paletas y observaciones.
*   **Exportación:** Los datos se pueden exportar a **Excel** y **PDF**.

### 4.2. Pestaña: Inventario Acumulado

Permite gestionar y consultar el stock diario de paletas por cliente.

*   **Cargar Inventario:**
    *   Sube un archivo Excel o CSV con el stock diario. El formato del archivo es estricto y debe contener columnas específicas como `FECHA`, `PROPIETARIO`, `PALETA`, `SE`, etc.
    *   El sistema procesa el archivo y guarda el inventario para la fecha indicada en la columna `FECHA`.

*   **Consultar Inventario:**
    *   Filtra por rango de fechas, cliente(s) y sesión (CO, RE, SE).
    *   Muestra una tabla pivot con el **total de paletas únicas por cliente para cada día**.

*   **Exportar Detallado:** Descarga un Excel con el detalle completo del inventario (fila por fila del archivo original) para los filtros seleccionados.
*   **Eliminar Registros:** Permite eliminar de forma masiva los registros de inventario para un rango de fechas específico.

### 4.3. Pestaña: Consolidado Movimientos/Inventario

Combina los datos de movimientos (formularios) y de inventario (archivos subidos) para validar el stock.

*   **Filtros:** Cliente, rango de fechas y sesión son obligatorios.
*   **Resultados:** Muestra una tabla día a día con las siguientes columnas:
    *   `Fecha`.
    *   `Recibidas`: Paletas que entraron según los formularios.
    *   `Despachadas`: Paletas que salieron según los formularios.
    *   `Posiciones Almacenadas`: Es el **saldo calculado** (Saldo del día anterior + Recibidas - Despachadas).
    *   `Inventario Acumulado`: Es el **stock real** según el archivo de inventario que subiste.
    *   `Validación`: Compara `Posiciones Almacenadas` vs. `Inventario Acumulado`. Mostrará "OK" si coinciden y "Error" si hay una discrepancia.

### 4.4. Pestaña: Liquidación de Servicios Clientes

Genera el pre-factura o el reporte final de cobros para un cliente.

*   **Filtros:**
    *   **Cliente y Rango de Fechas:** Obligatorios.
    *   **Conceptos a Liquidar:** El sistema te mostrará automáticamente los conceptos que tienen actividad para ese cliente en ese rango de fechas. Debes seleccionar cuáles quieres incluir en el reporte.
    *   **No. de Contenedor / Lotes (SMYL):** Filtros opcionales para acotar la búsqueda.

*   **Generar Liquidación:** Al hacer clic, el sistema:
    1.  Busca todas las operaciones (de formularios y manuales) que coincidan con los filtros.
    2.  Aplica las reglas de cada concepto seleccionado.
    3.  Calcula las cantidades y valores.
    4.  Muestra una tabla detallada con cada cobro generado.

*   **Edición en Línea:** Puedes hacer clic en el ícono del lápiz (`Editar`) en cualquier fila para **modificar manualmente** la cantidad, valor unitario, etc., de un cobro específico. Los cambios se resaltarán y solo afectarán a esta exportación.
*   **Exportación:** Puedes exportar el resultado a **Excel** (con una pestaña de resumen y otra de detalle) y a **PDF**.

---

## 5. Asistentes de Liquidación

Estos son módulos especializados para clientes con lógicas de cobro particulares.

### 5.1. Asistente de Liquidación SMYL

Diseñado para la liquidación de lotes de SMYL que pesan más de 20 toneladas.

**Ruta de Acceso:** `Consultas y Herramientas` > `Gestión y Liquidación Clientes` > `Asistente de Liquidación SMYL`.

*   **Funcionamiento:**
    1.  Selecciona un **rango de fechas**.
    2.  Ingresa uno o más **números de lote**.
    3.  El sistema buscará la recepción inicial de cada lote y todos sus movimientos posteriores (despachos, ingresos de saldo).
    4.  Generará una tabla que muestra, día por día, el saldo de paletas del lote y si ese día está dentro del **período de gracia** de 4 días (donde no se cobra almacenamiento diario).
*   **Utilidad:** Facilita el cálculo manual para los conceptos `SERVICIO LOGÍSTICO MANIPULACIÓN CARGA` y `SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)`.

### 5.2. Asistente de Liquidación de Inventario

Permite liquidar conceptos de almacenamiento y movimientos de manera dinámica y registrar los cobros como operaciones manuales.

**Ruta de Acceso:** `Consultas y Herramientas` > `Gestión y Liquidación Clientes` > `Asistente de Liquidación de Inventario`.

*   **Funcionamiento:**
    1.  Selecciona un **Cliente** y un **rango de fechas**.
    2.  Ingresa el **Saldo Inicial de Paletas** al comienzo del período.
    3.  El sistema genera una tabla interactiva para que ingreses las **Entradas** y **Salidas** de paletas de cada día.
    4.  Automáticamente, se calcula el **Saldo Final** diario y el resumen de la liquidación (costo de almacenamiento, costo por movimientos).
*   **Enviar a Liquidación:** Al hacer clic en este botón, el sistema creará automáticamente los registros en **"Operaciones Manuales Clientes"** para cada día con saldo y para cada movimiento de entrada/salida, dejándolos listos para ser facturados.
