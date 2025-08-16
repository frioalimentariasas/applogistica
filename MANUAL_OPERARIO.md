
# Manual de Operario: App de Control de Operaciones

## 1. Introducción

¡Bienvenido! Este manual está diseñado para guiarte en tus tareas diarias utilizando la aplicación de Control de Operaciones. Aquí aprenderás a generar los formatos de **recepción** y **despacho** de mercancía y a consultar los registros que has guardado.

## 2. Pantalla Principal: Tu Punto de Partida

Al iniciar la aplicación, verás dos secciones principales. Para tus tareas diarias, te enfocarás en la primera: **"Control de Operaciones Logísticas"**.

Para comenzar, debes hacer dos elecciones:

1.  **Tipo de Operación:** ¿Vas a recibir o a despachar mercancía?
2.  **Tipo de Producto:** ¿Los productos tienen un peso estándar o cada uno varía?

Una vez que hayas seleccionado ambas opciones, haz clic en el botón **"Generar Formato"**.

---

## 3. Llenado de Formularios de Operación

A continuación se detalla cómo llenar cada tipo de formulario.

### 3.1. Formulario de Peso Fijo (Para Recepción y Despacho)

Este es el formato más sencillo. Úsalo cuando los productos vienen en cajas o unidades con un peso estándar ya conocido.

*   **Información General:** Llena los campos obligatorios como Pedido SISLOG, Cliente y Fecha. Registra la hora de inicio y fin, y los datos del vehículo.
*   **Características del Producto:**
    *   Haz clic en **"Agregar Producto"**.
    *   Busca y selecciona el **Código** o la **Descripción** del producto.
    *   Ingresa el **No. de Cajas**, el **Total de Paletas** y el **Peso Neto** en kilogramos.
    *   Registra al menos una **temperatura** para el producto.
*   **Anexos (Fotos):** Puedes adjuntar evidencia fotográfica usando los botones **"Subir archivos"** o **"Tomar Foto"**.
*   **Responsables:** Selecciona el **Coordinador** y si la operación fue realizada por una **cuadrilla**.

> **Función Clave: Guardado Automático**
> ¡No te preocupes por perder tu trabajo! El formulario se guarda como un **borrador** en tu dispositivo cada pocos segundos. Si la aplicación se cierra, al volver a generar el mismo tipo de formato, te preguntará si quieres restaurar la información.

### 3.2. Formulario de Peso Variable (Recepción)

Este formato es el más versátil para la entrada de mercancía. Su comportamiento cambia según el **"Tipo de Pedido"** que selecciones.

#### Modos de Operación (según "Tipo de Pedido"):

*   **RECEPCIÓN GENERAL:**
    *   **Uso:** Es el modo estándar para recibir productos que deben ser pesados individualmente.
    *   **Funcionamiento:** Agrega ítems uno por uno. Cada ítem representa una paleta. Debes ingresar el **Peso Bruto** (producto + estiba + caja), la **Tara de la Estiba** y la **Tara de la Caja**. El sistema calculará automáticamente el **Peso Neto**.

*   **MODO RESUMEN (Ingresando "0" en Paleta):**
    *   **Uso:** Para registrar rápidamente un producto sin detallar cada paleta individual.
    *   **Funcionamiento:** En el campo "Paleta" de un ítem, ingresa el número **"0"**. Esto activará el modo resumen para esa fila, permitiéndote ingresar los **totales** directamente (Total Cantidad, Total Paletas, Total Peso Neto).

*   **INGRESO DE SALDOS:**
    *   **Uso:** Para registrar mercancía que ya se encuentra en la bodega (saldos iniciales, inventarios).
    *   **Funcionamiento:** Al seleccionar este tipo de pedido, los campos de información del vehículo (conductor, placa, etc.) se vuelven **opcionales**. Puedes usar el modo de resumen (Paleta "0") para un registro más rápido.

*   **MAQUILA:**
    *   **Uso:** Para productos que entran a un proceso de transformación o reempaque.
    *   **Funcionamiento:**
        *   Los campos de información del vehículo son **opcionales**.
        *   Aparecerá un nuevo campo obligatorio: **"Tipo de Empaque (Maquila)"**, donde deberás seleccionar si son SACOS o CAJAS.
        *   Si la operación es realizada por cuadrilla, deberás indicar el **"No. de Operarios"**.

*   **TUNEL:**
    *   **Uso:** Para recepciones grandes que involucran múltiples vehículos y se necesita agrupar la mercancía por placa.
    *   **Funcionamiento:**
        1.  Activa la casilla **"Recepción por Placa"**.
        2.  Haz clic en **"Agregar Placa"**. Ingresa el número de placa, nombre y cédula del conductor.
        3.  Dentro de cada placa, agrega los ítems correspondientes a ese vehículo.
        4.  El campo "Placa" en la información general se llenará automáticamente con todas las placas que registres.

*   **TUNEL DE CONGELACIÓN:**
    *   **Uso:** Proceso específico para mercancía que requiere ser congelada en un túnel. Es similar a la recepción por "TUNEL".
    *   **Funcionamiento:** La opción **"Recepción por Placa" se activa automáticamente**. Debes registrar cada placa y, dentro de ella, cada producto con su peso y cantidad. Al final, el sistema te pedirá ingresar las temperaturas en una tabla de resumen.

*   **TUNEL A CÁMARA CONGELADOS:**
    *   **Uso:** Para registrar el movimiento de mercancía desde un túnel de congelación hacia la cámara de almacenamiento final.
    *   **Funcionamiento:** Es un formato simplificado. Solo necesitas seleccionar el producto, la cantidad de paletas y el peso total.

### 3.3. Formulario de Peso Variable (Despacho)

Para la salida de mercancía de peso variable, el formulario se adapta según el cliente y las opciones que elijas.

#### Modos de Operación:

*   **DESPACHO GENERAL:**
    *   **Uso:** Es el modo estándar para despachar productos.
    *   **Funcionamiento:** Al igual que en la recepción, puedes agregar ítems de forma individual (paleta por paleta) o en modo resumen (Paleta "0").

*   **PEDIDO POR DESTINO (Clientes Especiales):**
    *   **Uso:** Se activa para clientes como **AVICOLA EL MADROÑO S.A.** o **AVICOLA EMBUTIDOS** cuando un solo pedido tiene múltiples puntos de entrega.
    *   **Funcionamiento:**
        1.  Marca la casilla **"Pedido por Destino"**.
        2.  Haz clic en **"Agregar Destino"**. Ingresa el nombre del destino (ej. una ciudad o sucursal).
        3.  Dentro de cada destino, agrega los ítems correspondientes.

### 3.4. Funciones Comunes en Todos los Formularios

*   **Limpiar Formato:** Si necesitas empezar de cero, este botón borrará toda la información que has ingresado. Te pedirá una confirmación para evitar borrados accidentales.
*   **Anexos:** Los botones de **"Subir archivos"** y **"Tomar Foto"** están disponibles en todos los formularios para que puedas adjuntar evidencia fotográfica.

---

## 4. Consultar Formatos Guardados

Esta herramienta te permite buscar, ver, editar o eliminar los formatos que ya has enviado.

1.  **Accede al Módulo:** En la pantalla principal, haz clic en el botón **"Consultar Formatos Guardados"**.

2.  **Usa los Filtros:** Puedes buscar por:
    *   **Pedido SISLOG:** La forma más rápida y precisa de encontrar un formato.
    *   **Nombre del Cliente.**
    *   **Rango de Fechas.**
    *   **Tipo de Operación** (Recepción o Despacho).
    *   **Tipo de Producto** (Fijo o Variable).

3.  **Acciones Disponibles:** Una vez que encuentres el formato, tendrás tres opciones:
    *   **Ver (icono del ojo):** Abre una vista previa del reporte en formato PDF, lista para ser compartida o impresa.
    *   **Editar (icono del lápiz):** Abre el formulario con toda la información cargada para que puedas hacer correcciones y volver a guardarlo.
    *   **Eliminar (icono de la basura):** Borra el formulario permanentemente del sistema (esta acción requiere confirmación).

¡Y eso es todo! Con esta guía, tienes toda la información necesaria para realizar tus tareas de operación diarias de manera eficiente.
