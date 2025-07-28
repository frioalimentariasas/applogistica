# Guía Paso a Paso para Crear una Copia de Seguridad con Git

Git es una herramienta que se ejecuta en tu computadora local. Esta guía te mostrará cómo descargar tu código de Firebase Studio y crear tu primer "punto de restauración" (conocido como "commit").

**Requisito Previo:** Asegúrate de tener [Git instalado](https://git-scm.com/downloads) en tu computadora.

---

### Paso 1: Descargar tu Proyecto a tu Computadora

Antes de poder usar Git, necesitas una copia local de tu código.

1.  **Encuentra el menú de opciones:**
    *   **Ubicación:** En la esquina superior derecha de la pantalla de Firebase Studio, verás un botón con tres puntos verticales (⋮). Este es el menú de opciones.

2.  **Descarga el código:**
    *   Haz clic en el menú de los tres puntos (⋮).
    *   Selecciona la opción **"Download Code"** o **"Descargar Código"**.

3.  **Descomprime el archivo:**
    *   Esto descargará un archivo `.zip` con todo tu proyecto. Descomprímelo en una carpeta fácil de encontrar (por ejemplo, `C:\proyectos\mi-app-logistica` o `/Users/TuUsuario/proyectos/mi-app-logistica`).

---

### Paso 2: Abrir una Terminal en la Carpeta del Proyecto

Una vez que tengas el código en tu computadora, debes abrir una terminal (o "línea de comandos") en esa carpeta específica.

*   **En Windows:** Navega a la carpeta en el explorador de archivos, haz clic derecho en un espacio vacío y selecciona "Abrir en Terminal", "Abrir con PowerShell" o una opción similar.
*   **En Mac/Linux:** Abre la aplicación "Terminal". Escribe `cd ` (con un espacio al final), y luego arrastra y suelta la carpeta de tu proyecto desde el Finder/explorador de archivos a la ventana de la terminal. Presiona Enter.

Sabrás que estás en el lugar correcto porque verás el nombre de la carpeta de tu proyecto en la línea de comandos.

---

### Paso 3: Crear tu Primer Punto de Restauración (Commit)

Estos son los comandos que "guardan" el estado actual de tu código. Ejecútalos uno por uno en la terminal.

1.  **Inicializar Git (solo la primera vez):**
    Este comando prepara la carpeta para que Git pueda empezar a rastrear los cambios.
    ```bash
    git init
    ```

2.  **Preparar todos los archivos para la "instantánea":**
    Este comando le dice a Git que quieres incluir todos los archivos del proyecto en tu punto de restauración. El `.` significa "todo en esta carpeta".
    ```bash
    git add .
    ```

3.  **Crear la "instantánea" con un mensaje:**
    Este es el comando que realmente guarda la copia. El mensaje (`-m`) es una nota para que recuerdes qué contiene esta versión. ¡Elige un mensaje descriptivo!
    ```bash
    git commit -m "Punto de restauración inicial del proyecto Frio Alimentaria"
    ```

**¡Felicidades!** Has creado tu primer punto de restauración. Todo tu código está ahora guardado de forma segura en el historial de Git en tu computadora.

---

### Siguientes Pasos (Opcional pero Recomendado)

*   **Hacer más cambios:** Continúa trabajando en tu código conmigo en Firebase Studio.
*   **Guardar nuevos puntos:** Cuando lleguemos a otro punto importante, vuelve a descargar el código (sobrescribiendo el anterior) y repite los **Pasos 2 y 3** (excepto `git init`). Usa un nuevo mensaje para cada commit. Por ejemplo:
    ```bash
    git add .
    git commit -m "Agregado el formulario de despacho de peso variable"
    ```
*   **Ver tu historial:** En cualquier momento, puedes ver todas tus "instantáneas" con el comando:
    ```bash
    git log
    ```

---

### ¡Ayuda! Cómo Restablecer tu Proyecto a un Punto Anterior

Si algo sale mal y necesitas volver a una versión anterior que guardaste, puedes hacerlo con estos pasos.

1.  **Encuentra el Punto de Restauración Correcto:**
    Abre la terminal en la carpeta de tu proyecto y ejecuta el siguiente comando para ver tu historial:
    ```bash
    git log --oneline
    ```
    Verás una lista de todos tus commits, algo así:
    ```
    a1b2c3d Agregada la funcionalidad de reportes
    e4f5g6h Corregido error en el formulario de despacho
    i7j8k9l Punto de restauración inicial
    ```
    Cada línea tiene un código único (como `a1b2c3d`). Este es el "hash" del commit.

2.  **Restaura el Código:**
    Elige el hash del commit al que quieres volver. Luego, usa el siguiente comando, reemplazando `<hash-del-commit>` con el código que copiaste.
    ```bash
    git reset --hard <hash-del-commit>
    ```
    Por ejemplo, para volver al commit donde se corrigió el error:
    ```bash
    git reset --hard e4f5g6h
    ```

    **¡ADVERTENCIA!** Este comando es destructivo. Eliminará **permanentemente** cualquier cambio que hayas hecho en los archivos desde que creaste tu último commit. Úsalo solo cuando estés seguro de que quieres descartar todo lo nuevo y volver a ese punto exacto del historial.

3.  **Continúa trabajando:**
    ¡Listo! Todos los archivos en tu carpeta habrán vuelto exactamente al estado en que estaban cuando hiciste ese commit. Para continuar trabajando en Firebase Studio con esa versión restaurada, tendrías que copiar manualmente el contenido de los archivos de tu computadora y pegarlos en el editor de Studio.
