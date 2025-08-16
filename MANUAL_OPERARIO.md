
# Manual de Operario: App de Control de Operaciones

## 1. Introducción

¡Bienvenido! Este manual está diseñado para guiarte en tus tareas diarias utilizando la aplicación de Control de Operaciones. Aquí aprenderás a generar los formatos de **recepción** y **despacho** de mercancía y a consultar los registros que has guardado.

## 2. Pantalla Principal: Tu Punto de Partida

Al iniciar la aplicación, verás dos secciones principales. Para tus tareas diarias, te enfocarás en la primera: **"Control de Operaciones Logísticas"**.

<img src="https://i.imgur.com/example1.png" alt="Pantalla Principal" width="400"/>

Para comenzar, debes hacer dos elecciones:

1.  **Tipo de Operación:** ¿Vas a recibir o a despachar mercancía?
2.  **Tipo de Producto:** ¿Los productos tienen un peso estándar o cada uno varía?

Una vez que hayas seleccionado ambas opciones, haz clic en el botón **"Generar Formato"**.

---

## 3. Llenado de Formularios de Operación

A continuación se detalla cómo llenar cada tipo de formulario.

### 3.1. Formulario de Peso Fijo (Para Recepción y Despacho)

Este es el formato más sencillo. Úsalo cuando los productos vienen en cajas o unidades con un peso estándar ya conocido.

**Pasos a seguir:**

1.  **Información General:**
    *   **Pedido SISLOG, Cliente, Fecha:** Son campos obligatorios.
    *   **Hora de Inicio/Fin:** Registra la hora exacta en que comenzó y terminó la operación.
    *   **Información del Vehículo:** Llena los datos del conductor, placa, contenedor, etc.

2.  **Características del Producto:**
    *   Haz clic en **"Agregar Producto"**. Se abrirá una ventana.
    *   Busca y selecciona el **Código** o la **Descripción** del producto. La información se autocompletará si el producto ya está registrado para ese cliente.
    *   Ingresa el **No. de Cajas**, el **Total de Paletas** y el **Peso Neto** en kilogramos.
    *   Registra al menos una **temperatura** para el producto.

3.  **Anexos (Fotos):**
    *   Puedes adjuntar evidencia fotográfica usando los botones **"Subir archivos"** (desde tu galería) o **"Tomar Foto"** (usando la cámara de tu dispositivo).

4.  **Responsables:**
    *   Selecciona el **Coordinador** a cargo de la operación.
    *   Indica si la operación fue realizada por una **cuadrilla** externa.

> **Función Clave: Guardado Automático**
> ¡No te preocupes por perder tu trabajo! El formulario se guarda como un **borrador** en tu dispositivo cada pocos segundos. Si la aplicación se cierra, al volver a generar el mismo tipo de formato, te preguntará si quieres restaurar la información.

### 3.2. Formulario de Peso Variable (Recepción)

Usa este formato cuando cada producto o paleta debe ser pesado individualmente al momento de la recepción.

**Modos de Operación (según el "Tipo de Pedido"):**

*   **Recepción General:**
    *   Agrega ítems uno por uno. Cada ítem representa una paleta.
    *   Debes ingresar el **Peso Bruto** (producto + estiba + caja), la **Tara de la Estiba** y la **Tara de la Caja**.
    *   El sistema calculará automáticamente el **Peso Neto**.

*   **Modo Resumen (Paleta "0"):**
    *   Si necesitas registrar un producto sin detallar cada paleta, ingresa el número **"0"** en el campo "Paleta".
    *   Esto te permitirá ingresar los **totales** directamente (Total Cantidad, Total Paletas, Total Peso Neto).

*   **Recepción tipo "TUNEL":**
    *   Este modo te permite agrupar ítems por la **placa del vehículo**.
    *   Primero, selecciona "TUNEL" como tipo de pedido.
    *   Haz clic en el botón **"Agregar Placa"**.
    *   Ingresa el número de la placa.
    *   Dentro de cada placa que agregues, podrás añadir los ítems correspondientes a ese vehículo.
    *   El campo "Placa" en la sección de información general se llenará automáticamente con todas las placas que registres.

*   **Recepción "MAQUILA" o "INGRESO DE SALDOS":**
    *   Al seleccionar estos tipos de pedido, los campos de información del vehículo (conductor, placa, etc.) se vuelven **opcionales**.

### 3.3. Formulario de Peso Variable (Despacho)

Similar a la recepción de peso variable, pero para la salida de mercancía.

**Modos de Operación (según el Cliente):**

*   **Despacho General:**
    *   Funciona igual que la recepción: puedes agregar ítems de forma individual (paleta por paleta) o en modo resumen (Paleta "0").

*   **Pedido por Destino (Clientes Especiales):**
    *   Si seleccionas un cliente como **"AVICOLA EL MADROÑO S.A."** o **"AVICOLA EMBUTIDOS"**, se activará una nueva casilla: **"Pedido por Destino"**.
    *   **Marca esta casilla** si el pedido tiene múltiples puntos de entrega.
    *   Haz clic en **"Agregar Destino"**.
    *   Ingresa el nombre del destino (ej. una ciudad, una sucursal, etc.).
    *   Dentro de cada destino, agrega los ítems correspondientes.

### 3.4. Funciones Comunes en Todos los Formularios

*   **Limpiar Formato:** Si necesitas empezar de cero, este botón borrará toda la información que has ingresado. Te pedirá una confirmación para evitar borrados accidentales.
*   **Anexos:** Los botones de **"Subir archivos"** y **"Tomar Foto"** están disponibles en todos los formularios para que puedas adjuntar evidencia fotográfica.

---

## 4. Consultar Formatos Guardados

Esta herramienta te permite buscar, ver, editar o eliminar los formatos que ya has enviado.

1.  **Accede al Módulo:** En la pantalla principal, haz clic en el botón **"Consultar Formatos Guardados"** en la sección "Consultas y Herramientas".

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
