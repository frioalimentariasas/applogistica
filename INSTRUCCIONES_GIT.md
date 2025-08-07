# Guía Paso a Paso para Crear una Copia de Seguridad con Git y GitHub

Git es una herramienta que se ejecuta en tu computadora local. Esta guía te mostrará cómo descargar tu código de Firebase Studio, crear un "punto de restauración" (commit) y subirlo a GitHub para tener una copia de seguridad remota.

**Requisitos Previos:**
*   Tener [Git instalado](https://git-scm.com/downloads) en tu computadora.
*   Tener una cuenta en [GitHub](https://github.com/).

---

### Parte 1: Guardar los Cambios en tu Computadora (Commit Local)

Estos pasos guardan el estado actual de tu código en tu máquina.

**Paso 1: Descargar tu Proyecto**

1.  **Encuentra el menú de opciones:** En la esquina superior derecha de Firebase Studio, haz clic en el botón con tres puntos verticales (⋮).
2.  **Descarga el código:** Selecciona la opción **"Download Code"** o **"Descargar Código"**.
3.  **Descomprime el archivo:** Esto descargará un archivo `.zip`. Descomprímelo en una carpeta fácil de encontrar (por ejemplo, `C:\proyectos\mi-app-logistica` o `/Users/TuUsuario/proyectos/mi-app-logistica`). Si ya tenías una versión anterior, reemplaza los archivos con los nuevos.

**Paso 2: Abrir una Terminal en la Carpeta del Proyecto**

1.  Abre una terminal (o "línea de comandos") en la carpeta que acabas de descomprimir.
    *   **En Windows:** Navega a la carpeta, haz clic derecho en un espacio vacío y selecciona "Abrir en Terminal" o una opción similar.
    *   **En Mac/Linux:** Abre la aplicación "Terminal". Escribe `cd ` (con un espacio), arrastra la carpeta del proyecto a la terminal y presiona Enter.

**Paso 3: Crear tu Punto de Restauración (Commit)**

1.  **Inicializar Git (solo si es la primera vez):**
    Si nunca has usado Git en esta carpeta, ejecuta este comando. Si ya lo hiciste, puedes omitirlo.
    ```bash
    git init
    ```

2.  **Preparar todos los archivos para la "instantánea":**
    El `.` significa "todo en esta carpeta".
    ```bash
    git add .
    ```

3.  **Crear la "instantánea" con un mensaje descriptivo:**
    Este es el paso que guarda la copia local.
    ```bash
    git commit -m "Versión final del proyecto lista para producción"
    ```

**¡Felicidades!** Tu código ya está guardado de forma segura en tu computadora. Ahora, vamos a subirlo a GitHub.

---

### Parte 2: Subir tu Código a GitHub (Copia de Seguridad Remota)

Estos pasos conectan tu carpeta local con un repositorio en la nube.

**Paso 4: Crear un Repositorio en GitHub**

1.  Ve a [GitHub](https://github.com/) y haz clic en el botón **"New"** o ve a [github.com/new](https://github.com/new).
2.  Dale un nombre a tu repositorio (ej. `app-logistica`).
3.  Puedes dejarlo **Público** o **Privado**.
4.  **Importante:** **NO** inicialices el repositorio con un `README`, `.gitignore` o `licencia`, ya que tu proyecto ya tiene esos archivos.
5.  Haz clic en **"Create repository"**.

**Paso 5: Conectar tu Proyecto Local con GitHub**

GitHub te mostrará una página con comandos. Busca la sección que dice **"...or push an existing repository from the command line"**. Copia y pega esos comandos en tu terminal, uno por uno. Serán similares a estos:

1.  **Conectar tu repositorio local al remoto (de GitHub):**
    *Reemplaza la URL con la que te proporciona GitHub.*
    ```bash
    git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
    ```

2.  **Renombrar la rama principal a "main" (práctica estándar):**
    ```bash
    git branch -M main
    ```

3.  **Subir tu código a GitHub:**
    Este comando envía tu "commit" a la nube.
    ```bash
    git push -u origin main
    ```

¡Y listo! Si ahora refrescas la página de tu repositorio en GitHub, verás todo el código de tu proyecto. Has creado exitosamente una copia de seguridad remota.