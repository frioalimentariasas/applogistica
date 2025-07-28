# Guía Paso a Paso para Crear una Copia de Seguridad con Git

Git es una herramienta que se ejecuta en tu computadora local. Esta guía te mostrará cómo descargar tu código de Firebase Studio y crear tu primer "punto de restauración" (conocido como "commit").

**Requisito Previo:** Asegúrate de tener [Git instalado](https://git-scm.com/downloads) en tu computadora.

---

### Paso 1: Descargar tu Proyecto a tu Computadora

Antes de poder usar Git, necesitas una copia local de tu código.

1.  **Encuentra el menú de opciones:**
    *   **Ubicación:** En la esquina superior derecha de la pantalla de Firebase Studio, busca el **ícono de código (`</>`)** que está a la izquierda del botón azul "Publish".

2.  **Descarga el código:**
    *   Haz clic en el ícono de código (`</>`).
    *   En el menú que aparece, selecciona la opción **"Download Code"** o **"Descargar Código"**.

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