Manual de Usuario: App de Control de Operaciones Logísticas

1. Introducción

Bienvenido a la aplicación de Control de Operaciones Logísticas de Frio Alimentaria. Este manual está diseñado para guiar a los operarios a través de todas las funcionalidades del sistema de manera exhaustiva, desde el registro diario de operaciones hasta la consulta de informes complejos y la gestión de datos maestros.

2. Inicio de Sesión

Para acceder a la aplicación, necesitarás un correo electrónico y una contraseña proporcionados por el administrador del sistema.

1.  Accede a la aplicación: Abre la dirección web de la aplicación en tu navegador. Verás el logo de la empresa y los campos de acceso.
2.  Ingresa tus credenciales:
    *   Correo Electrónico: Escribe tu correo electrónico completo (ej. `operario@frioalimentaria.com.co`).
    *   Contraseña: Escribe la contraseña que te fue asignada.
3.  Haz clic en "Ingresar": Si los datos son correctos, serás dirigido a la pantalla principal.

(PENDIENTE: Insertar pantallazo de la pantalla de inicio de sesión)

> Nota: Si olvidas tu contraseña o tienes problemas para acceder, contacta al administrador del sistema para que te asigne una nueva.

3. Pantalla Principal

La pantalla principal es tu centro de operaciones. Desde aquí puedes acceder a todas las funciones de la aplicación.

(PENDIENTE: Insertar pantallazo de la pantalla principal, destacando las dos secciones)

Se divide en dos secciones principales:

3.1. Generar un Nuevo Formato

Esta es la sección para las tareas diarias de registro de mercancía.

1.  Selecciona el Tipo de Operación:
    *   Recepción: Para registrar la entrada de mercancía a la bodega.
    *   Despacho: Para registrar la salida de mercancía de la bodega.

2.  Selecciona el Tipo de Producto:
    *   Peso Fijo: Para productos que se manejan en unidades o cajas con un peso estándar y conocido (ej. cajas de pollo de 20kg).
    *   Peso Variable: Para productos cuyo peso no es estándar y debe ser registrado individualmente (ej. piezas de carne, productos a granel).

3.  Haz clic en "Generar Formato": Una vez seleccionadas ambas opciones, este botón se activará y te llevará al formulario correspondiente.

3.2. Consultas y Herramientas

Esta sección contiene los módulos para ver datos históricos, generar reportes y configurar el sistema. Cada botón te llevará a una página especializada.

4. Formularios de Operación

Los formularios son el corazón del sistema. Es crucial llenarlos con precisión. Todos comparten campos comunes en la cabecera (Información General) y en el pie (Observaciones, Responsables, Anexos).

4.1. Formulario de Peso Fijo (Recepción y Despacho)

*   Uso: Para registrar productos con peso conocido, tanto en entradas (recepción) como en salidas (despacho).
*   Lógica Principal: Se enfoca en la cantidad de cajas/unidades y el sistema calcula los totales basándose en el peso neto que se ingrese.

(PENDIENTE: Insertar pantallazo general del formulario de Peso Fijo)

Paso a Paso Detallado:

1.  Información General (Cabecera):
    *   Tipo de Pedido: ¡Campo Crucial! La selección aquí puede cambiar los campos que aparecen en el resto del formulario.
        *   MAQUILA (Solo en Recepción): Al seleccionar esta opción, los campos del vehículo se vuelven opcionales y aparecen dos campos nuevos: "Tipo de Empaque (Maquila)" y "No. de Operarios" (si aplica cuadrilla).
        *   INGRESO DE SALDOS (Solo en Recepción): Los campos de información del vehículo se vuelven opcionales.
        *   Otros Tipos: Se comportan como una operación estándar donde los datos del vehículo son obligatorios.
    *   Pedido SISLOG: Ingresa el número de pedido del sistema SISLOG. Es un campo obligatorio.
    *   Nombre del Cliente: Selecciona el cliente de la lista. Este campo es obligatorio y filtra los productos que puedes agregar.
    *   Fecha: Se llena automáticamente con la fecha actual, pero un administrador puede modificarla si es necesario.
    *   Hora de Inicio/Fin: Usa el reloj para capturar la hora exacta o ingrésala manualmente en formato HH:MM (24 horas). No pueden ser iguales.
    *   Precinto/Sello: Ingresa el número del precinto del vehículo.
    *   Documento de Transporte / Factura/Remisión: Campos opcionales para información adicional.

2.  Características del Producto:
    *   Haz clic en "Agregar Producto" para añadir una nueva fila.
    *   Código / Descripción: Haz clic para abrir el selector de productos. Solo aparecerán los artículos previamente asociados al cliente seleccionado. Al elegir uno, ambos campos se autocompletarán.
    *   No. de Cajas: Ingresa la cantidad total de cajas o unidades para ese producto.
    *   Total Paletas: Ingresa el número total de paletas que ocupa este producto.
    *   Peso Neto (kg): Ingresa el peso total neto de todas las cajas de este producto.
    *   Temperaturas (°C): Ingresa al menos una medición de temperatura del producto. Puedes usar hasta tres campos (T1, T2, T3).

3.  Total Peso Bruto (kg): Este campo es para legalizar el peso de la operación y es fundamental para los reportes de productividad. Debes ingresar el peso bruto total registrado en la báscula del vehículo.

4.  Información del Vehículo:
    *   Estos campos (Nombre Conductor, Cédula, Placa, Muelle, Contenedor, Set Point, etc.) son obligatorios, excepto en recepciones de tipo "MAQUILA" o "INGRESO DE SALDOS".

5.  Observaciones, Responsables y Anexos: Se explican en detalle más adelante, ya que son comunes a todos los formularios.

4.2. Formulario de Peso Variable (Recepción)

*   Uso: Para registrar la entrada de productos que deben ser pesados individualmente.
*   Lógica Principal: El sistema permite dos modos de ingreso: detallado (paleta por paleta) o resumido (totales por producto).

(PENDIENTE: Insertar pantallazo general del formulario de Peso Variable - Recepción)

Paso a Paso Detallado:

1.  Información General (Cabecera): Similar al formulario de Peso Fijo. Presta especial atención al "Tipo de Pedido".

2.  Lógica del "Tipo de Pedido":
    *   TUNEL: Activa la opción de "Recepción por Placa". Esto es para operaciones donde un solo cliente envía producto en varios vehículos pequeños.
        *   Marca la casilla "Recepción por Placa".
        *   Usa el botón "Agregar Placa" para crear secciones, cada una con sus propios campos de vehículo (Placa, Conductor, Cédula) y su propia lista de ítems.
        *   Los datos del vehículo en la cabecera del formulario se llenarán automáticamente con la información de todas las placas que agregues.
        (PENDIENTE: Insertar pantallazo de la opción "Recepción por Placa")
    *   MAQUILA / INGRESO DE SALDOS: Los campos de información del vehículo en la cabecera se vuelven opcionales.

3.  Detalle de la Recepción (Ítems):
    *   Modo Detallado (Paleta Individual):
        *   Paleta: Ingresa el número de la etiqueta o sticker de la paleta física (ej. 1, 2, 3...). Este número debe ser único por operación.
        *   Código / Descripción: Selecciona el producto.
        *   Lote / Presentación: Ingresa los datos correspondientes.
        *   Cantidad por Paleta: Número de cajas/unidades en esa paleta.
        *   Peso Bruto (kg): Peso total de la paleta en la báscula.
        *   Tara Estiba (kg): Peso de la estiba vacía.
        *   Tara Caja (kg): Peso de una caja vacía.
        *   El sistema calculará automáticamente el Peso Neto.
    *   Modo Resumen (Paleta 0):
        *   Para registrar totales de un producto sin detallar cada paleta.
        *   Paleta: Ingresa el número 0.
        *   Aparecerán tres campos nuevos: Total Cantidad, Total Paletas, Total Peso Neto. Debes llenarlos con los totales correspondientes para ese producto. Los campos de peso individual se desactivarán.
        (PENDIENTE: Insertar pantallazo comparando el modo detallado y el modo resumen)

4.  Resumen Agrupado de Productos:
    *   Esta tabla se genera automáticamente y muestra los totales por cada tipo de producto, sumando todos los ítems (individuales y resumidos) que hayas ingresado.
    *   Importante: Debes ingresar al menos una Temperatura (°C) para cada grupo de producto en esta tabla resumen.
    (PENDIENTE: Insertar pantallazo de la tabla de resumen agrupado)

4.3. Formulario de Peso Variable (Despacho)

*   Uso: Para registrar la salida de productos de peso variable. Es el más complejo debido a la lógica de búsqueda de paletas y despacho por destinos.
*   Lógica Principal: Permite buscar paletas existentes por su código para autocompletar datos, y agrupar los ítems bajo diferentes destinos de entrega.

(PENDIENTE: Insertar pantallazo general del formulario de Peso Variable - Despacho)

Paso a Paso Detallado:

1.  Información General (Cabecera): Completa los datos como en los otros formularios. Es obligatorio seleccionar un Cliente primero para poder agregar ítems.

2.  Lógica del Cliente y "Pedido por Destino":
    *   Clientes Especiales (ej. AVICOLA EL MADROÑO S.A.): Si seleccionas uno de estos clientes, se activará la casilla "Pedido por Destino".
    *   Al marcarla, podrás usar el botón "Agregar Destino" para crear secciones. Cada sección representa un punto de entrega (ej. una ciudad) y contendrá su propia lista de ítems.
    (PENDIENTE: Insertar pantallazo mostrando la opción "Pedido por Destino")

3.  Detalle del Despacho (Ítems):
    *   Búsqueda de Paleta (Modo Detallado):
        1.  Selecciona un Cliente primero. El campo "Paleta" estará deshabilitado hasta que lo hagas.
        2.  En el campo "Paleta", ingresa el código de una paleta existente y sal del campo (o presiona Enter).
        3.  El sistema buscará ese código en todos los formularios de Recepción de Peso Variable que pertenezcan a ese cliente y que no hayan sido despachados previamente.
        4.  Si encuentra la paleta: Aparecerá un diálogo preguntando: "¿Desea cargar los datos de esta paleta?".
        (PENDIENTE: Insertar pantallazo del diálogo de paleta encontrada)
        5.  Al aceptar, los campos Código, Descripción, Lote, Presentación y los pesos se llenarán automáticamente con la información de su recepción original.
        6.  Si no la encuentra o ya fue despachada: Aparecerá un diálogo informando el problema. Puedes corregir el código o continuar ingresando los datos del producto manualmente.
        (PENDIENTE: Insertar pantallazo del diálogo de paleta no encontrada)
    *   Modo Resumen (Paleta 0): Funciona igual que en la recepción. Ingresa 0 en el campo "Paleta" para registrar totales de un producto.
    *   Paleta Especial (Paleta 999): Usa el código 999 para ítems que no corresponden a una paleta física estándar o que son un ajuste. Se comportan como una paleta individual pero se identifican de forma especial en los reportes.

4.  Resumen Agrupado de Productos: Al igual que en la recepción, esta tabla se actualiza automáticamente y requiere que ingreses la temperatura para cada grupo de producto.

4.4. Funciones Comunes en Todos los Formularios

*   Observaciones:
    *   Puedes agregar múltiples observaciones a un formato.
    *   CARGUE/DESCARGUE PARCIAL DE PALETAS: Si seleccionas esta observación, el sistema te pedirá dos datos adicionales para calcular las toneladas a liquidar automáticamente: `Cantidad de Paletas` y `Peso por Paleta (KG)`.
    *   Otras Observaciones: Algunas, como "REESTIBADO", tienen campos adicionales como "Cantidad" y "Unidad de Medida" que son cruciales para el informe de liquidación de cuadrilla.
*   Responsables:
    *   Coordinador: Selecciona el coordinador a cargo.
    *   Operación Realizada por Cuadrilla: Selecciona "Sí" o "No". Esta elección es fundamental para los reportes de productividad y liquidación.
*   Anexos:
    *   Usa los botones "Subir archivos" o "Tomar Foto" para adjuntar evidencia fotográfica (máximo 60 imágenes, 10MB en total).
*   Guardado Automático (Borrador): El formulario se guarda localmente en tu dispositivo cada pocos segundos. Si la aplicación se cierra, al volver a abrir el mismo tipo de formulario (ej. Recepción Peso Fijo), se te preguntará si deseas restaurar los datos.
*   Limpiar Formato: Este botón borra todos los datos que has ingresado para que puedas empezar de nuevo.

5. Módulos de Consultas y Herramientas

5.1. Consultar Formatos Guardados

Permite buscar, visualizar, editar y eliminar formularios ya enviados.

(PENDIENTE: Insertar pantallazo de la página de consulta de formatos)

*   Filtros: Puedes buscar por Pedido SISLOG, Cliente, Placa, Rango de Fechas, Tipo de Operación, Tipo de Producto o Tipo de Pedido.
*   Resultados: La tabla muestra los formatos que coinciden con tu búsqueda.
*   Acciones:
    *   Ver (Ojo): Abre una vista previa del reporte en formato PDF.
    *   Editar (Lápiz): Carga el formulario con todos sus datos para que puedas modificarlos y volver a guardarlos.
    *   Cambiar Tipo (Flechas): Cambia una `Recepción` a `Despacho` o viceversa. Útil para corregir errores.
    *   Eliminar (Basura): Borra el formulario permanentemente (requiere permiso).

5.2. Informes para Facturación

Módulo clave para la facturación. Se divide en 3 pestañas:

1.  Operaciones Detalladas:
    *   Genera un reporte completo de cada operación en un rango de fechas.
    *   Incluye columnas como Fecha, Tipo de Operación, Duración, Vehículo, Productos, Cantidades, Paletas y Observaciones.
    *   Puedes filtrar por Cliente, Tipo de Operación, Tipo de Pedido, etc.
    *   Se puede exportar a Excel y PDF.

2.  Inventario Acumulado:
    *   Cargar Inventario: Permite subir un archivo Excel o CSV con el stock diario. El formato del archivo es estricto y debe contener columnas específicas como `FECHA`, `PROPIETARIO`, `PALETA`, `SE`, etc.
    (PENDIENTE: Insertar pantallazo de la sección de carga de inventario)
    *   Consultar Inventario: Muestra una tabla pivot con el total de paletas por cliente para cada día en el rango de fechas seleccionado.
    *   Exportar Detallado: Descarga un Excel con el detalle completo del inventario (fila por fila) para los filtros seleccionados.
    *   Eliminar Registros: Permite eliminar los registros de inventario cargados para un rango de fechas específico.

3.  Consolidado Movimientos/Inventario:
    *   Combina los datos de movimientos (entradas/salidas) y de inventario para mostrar un reporte día a día.
    *   Columnas: `Fecha`, `Recibidas`, `Despachadas`, `Posiciones Almacenadas` (saldo calculado), `Inventario Acumulado` (stock real del archivo) y una `Validación` que compara ambos saldos.
    (PENDIENTE: Insertar pantallazo del reporte consolidado con la columna de validación)

5.3. Informe de Productividad y Liquidación de Cuadrilla

Herramienta poderosa para medir la eficiencia y calcular pagos. Se divide en 2 pestañas:

5.3.1. Pestaña "Análisis de Productividad"

(PENDIENTE: Insertar pantallazo de la tabla de productividad con los indicadores de colores)

*   Filtros: Permite buscar por Rango de Fechas, Cliente, Operario, Tipo de Operación/Producto, si fue con cuadrilla o no, y por Concepto de Liquidación.
*   Tabla de Productividad: Muestra un desglose de cada operación.
    *   T. Operativo: Tiempo total de la operación menos los minutos justificados en novedades.
    *   Productividad: Calificación automática basada en la comparación del `T. Operativo` con el tiempo estándar definido.
        *   Óptimo (Verde): Tiempo operativo fue menor que el estándar.
        *   Normal (Amarillo): Dentro de un margen aceptable (+10 min).
        *   Lento (Rojo): Excedió significativamente el estándar. Requiere una acción.
        *   Pendiente (Naranja): En formatos de peso fijo, falta ingresar el peso bruto para poder calcular.
        *   Sin Estándar (Gris): No hay una regla de tiempo definida para esta operación.
*   Acciones en la Tabla:
    *   Legalizar (Peso Fijo): Para operaciones "Pendientes", permite ingresar el `Total Peso Bruto (kg)` para completar el cálculo.
    (PENDIENTE: Insertar pantallazo del diálogo de legalización)
    *   Novedad (Justificación): Para operaciones "Lentas", permite agregar una justificación (ej. "DAÑO TRILATERAL") y los minutos de inactividad. Estos minutos se restan del tiempo total, lo que puede mejorar la calificación de productividad.
    (PENDIENTE: Insertar pantallazo del diálogo para agregar novedad)

5.3.2. Pestaña "Liquidación de Cuadrilla"

*   Muestra un desglose de todos los conceptos que generan un cobro a la cuadrilla (CARGUE, DESCARGUE, REESTIBADO, etc.).
*   La tabla muestra la cantidad, valor unitario y valor total para cada concepto, con un TOTAL GENERAL al final.
*   Se puede exportar a Excel.

5.4. Módulos de Configuración (Accesibles desde el informe de productividad)

*   Gestionar Estándares:
    *   Uso: Definir los tiempos base en minutos para medir la productividad.
    *   Crear Estándar: Combina criterios (Cliente, Tipo de Operación/Producto) y define uno o más rangos de toneladas con sus respectivos minutos base.
*   Gestionar Conceptos de Liquidación:
    *   Uso: Definir los conceptos facturables (ej. CARGUE, JORNAL DIURNO) y su valor.
    *   Crear Concepto: Asigna un nombre, un valor, una unidad de medida y, lo más importante, a qué cliente(s) aplica. Esto permite tener diferentes tarifas para un mismo servicio según el cliente.

5.5. Módulos de Gestión (Acceso Restringido)

*   Gestión de Artículos: Crea, edita, elimina y carga masivamente productos, asociándolos a un cliente y una sesión.
*   Gestión de Clientes: Añade o edita clientes.
*   Gestión de Observaciones: Administra las observaciones estándar disponibles en los formularios.
*   Gestión de Tipos de Pedido: Define los tipos de pedido y a qué formularios aplican.
*   Gestión de Usuarios: (Solo Super Admin) Permite crear usuarios, asignar permisos, cambiar contraseñas y cerrar sesiones activas.

---

Este manual cubre todas las funcionalidades de la aplicación. Para cualquier duda, por favor, contacta al administrador del sistema.
