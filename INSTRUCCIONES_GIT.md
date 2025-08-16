# Guía Paso a Paso para Crear una Copia de Seguridad con Git y GitHub

Git es una herramienta que se ejecuta en tu computadora local. Esta guía te mostrará cómo descargar tu código de Firebase Studio, crear un "punto de restauración" (commit) y subirlo a GitHub para tener una copia de seguridad remota.

**Requisitos Previos:**
*   Tener [Git instalado](https://git-scm.com/downloads) en tu computadora.
*   Tener una cuenta en [GitHub](https://github.com/).

---

### Parte 1: Guardar los Cambios en tu Computadora (Commit Local)

Estos pasos guardan el estado actual de tu código en tu máquina.

**Paso 1: Descargar tu Proyecto**

1.  **Encuentra el menú de opciones del Explorador de Archivos:** En la barra lateral izquierda de Firebase Studio, busca el título **"EXPLORER"**. Justo a la derecha de esa palabra, verás un botón con tres puntos horizontales (`...`).
2.  **Descarga el código:** Haz clic en el menú de los tres puntos (`...`) y selecciona la opción **"Download..."**.
3.  **Descomprime el archivo:** Esto descargará un archivo `.zip` que contiene **todo tu proyecto**. Descomprímelo en una carpeta fácil de encontrar (por ejemplo, `C:\proyectos\mi-app-logistica` o `/Users/TuUsuario/proyectos/mi-app-logistica`). Si ya tenías una versión anterior, reemplaza los archivos con los nuevos.

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
    git commit -m "Proyecto Frio Alimentaria versión final"
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

---

### Parte 3: Cómo Volver a una Versión Anterior (Punto de Restauración)

Si necesitas descartar cambios y regresar a una versión guardada previamente en tu historial de Git, sigue estos pasos.

**¡ADVERTENCIA!** Este proceso **descartará permanentemente** todos los cambios que hayas hecho después del punto al que quieres volver. Si tienes cambios importantes que no has guardado, asegúrate de hacer un `git commit` antes de continuar.

**Paso 6: Encontrar el Punto de Restauración**

1.  **Abre una terminal** en la carpeta de tu proyecto.
2.  **Visualiza el historial de commits:** Ejecuta el siguiente comando para ver todos los puntos de restauración que has creado.
    ```bash
    git log --oneline
    ```
3.  **Identifica el commit:** Verás una lista de tus commits. Cada uno tiene un identificador único (un "hash") y el mensaje que escribiste. Por ejemplo:
    ```
    8547ee6 Proyecto Frio Alimentaria versión final
    a1b2c3d Añadido formulario de despacho
    f9d8e7c Primera versión funcional
    ```
4.  **Copia el ID del commit:** Copia el identificador (el hash) del punto al que quieres regresar. Por ejemplo, si quieres volver a la "versión final", copiarías `8547ee6`.

**Paso 7: Restaurar el Código**

1.  **Ejecuta el comando de restauración:** Usa `git reset --hard` con el ID que copiaste.
    ```bash
    git reset --hard 8547ee6
    ```
    Git te confirmará que tu proyecto local ahora está exactamente en ese punto.

**Paso 8: Actualizar GitHub (Opcional, pero recomendado)**

Tu repositorio local ahora está en la versión anterior, pero GitHub todavía tiene la versión más reciente. Para que GitHub refleje la restauración, debes "forzar" la subida.

1.  **Sube los cambios forzadamente:**
    ```bash
    git push --force
    ```

Ahora, tanto tu computadora local como tu repositorio en GitHub estarán sincronizados en la versión que restauraste. Ya puedes seguir trabajando desde ese punto.
