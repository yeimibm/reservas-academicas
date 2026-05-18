"""
HERRAMIENTA INTERACTIVA DE DEBUGGING
Ayuda a identificar y solucionar errores en pruebas automatizadas
"""

import os
import sys
from pathlib import Path
from datetime import datetime


class DebugHelper:
    """Asistente de debugging interactivo"""

    COMMON_ERRORS = {
        "NoSuchElementException": {
            "título": "Elemento No Encontrado ❌",
            "descripción": "El selector CSS/XPATH no encontró el elemento",
            "síntomas": [
                "no such element: Unable to locate element",
                "NoSuchElementException",
            ],
            "causas": [
                "1. El selector es incorrecto",
                "2. El elemento no existe en la página",
                "3. La página no cargó completamente",
                "4. Cambió la estructura HTML",
            ],
            "solución": """
SOLUCIÓN PASO A PASO:

1. ABRE DEVTOOLS (F12):
   - Presiona F12 en el navegador
   - Ve a la pestaña "Inspector"

2. BUSCA EL ELEMENTO:
   - Haz clic en la lupa (Inspector)
   - Haz clic en el elemento que busca la prueba
   - Devtools te mostrará el código HTML

3. COPIA EL SELECTOR:
   - Mira el código HTML resaltado
   - Si el elemento tiene ID: usar By.ID
   - Si tiene class: usar By.CSS_SELECTOR
   - Copia el selector exacto

4. ACTUALIZA EL TEST:

   ANTES (incorrecto):
   button = self.driver.find_element(By.TAG_NAME, "button")

   DESPUÉS (correcto):
   button = self.driver.find_element(By.CSS_SELECTOR, "button.btn-login")

   O si tiene ID:
   button = self.driver.find_element(By.ID, "submit-btn")

5. EJECUTA DE NUEVO:
   python -m unittest test_automation.TestLogin -v
            """
        },

        "TimeoutException": {
            "título": "Timeout - Elemento Tardío ⏱️",
            "descripción": "El elemento no apareció en el tiempo esperado",
            "síntomas": [
                "TimeoutException",
                "Timed out after",
                "Unable to find element within 10 seconds",
            ],
            "causas": [
                "1. La página es lenta",
                "2. El servidor no responde",
                "3. Hay error de JavaScript",
                "4. El elemento carga con JavaScript",
            ],
            "solución": """
SOLUCIÓN PASO A PASO:

1. ABRE DEVTOOLS → CONSOLE (F12):
   - Presiona F12
   - Ve a "Console"
   - ¿Ves errores rojos?
   - ¿Hay mensajes extraños?

2. SI HAY ERRORES JavaScript:
   - Lee el error exacto
   - Busca en apps/web/src/
   - Arregla el error

3. SI NO HAY ERRORES:
   - El elemento tarda mucho
   - OPCIÓN A: Aumentar timeout

     En test_config.py:
     DEFAULT_TIMEOUT = 30  # Aumenta de 10 a 30

   - OPCIÓN B: Esperar a otro elemento primero

     En test_automation.py:
     # Espera a que desaparezca el spinner primero
     self.wait.until(EC.invisibility_of_element_located(
         (By.CSS_SELECTOR, ".spinner")
     ))
     # Ahora busca el elemento
     element = self.find_element(By.ID, "login-button")

4. EJECUTA DE NUEVO:
   python -m unittest test_automation.TestLogin -v
            """
        },

        "AssertionError": {
            "título": "Assertion - Resultado Incorrecto ❌",
            "descripción": "El valor esperado no coincide con el actual",
            "síntomas": [
                "AssertionError",
                "False is not true",
                "!= expected",
            ],
            "causas": [
                "1. El flujo del usuario es diferente",
                "2. El texto cambió",
                "3. La estructura HTML cambió",
                "4. Los datos de prueba son incorrectos",
            ],
            "solución": """
SOLUCIÓN PASO A PASO:

1. LEE EL ERROR EXACTO:
   AssertionError: 'login' != 'dashboard'

   Significa: Esperaba 'dashboard' pero encontró 'login'

2. AGREGA PRINTS PARA DEBUG:

   En test_automation.py, encuentra la línea que falla.
   Agrega prints antes de la aserción:

   print(f"DEBUG: URL actual = {self.driver.current_url}")
   print(f"DEBUG: Título = {self.driver.title}")

   if error_expected:
       elements = self.driver.find_elements(By.CLASS_NAME, "error")
       print(f"DEBUG: Errores encontrados = {len(elements)}")
       for e in elements:
           print(f"DEBUG: Mensaje = {e.text}")

3. EJECUTA Y LEE LOS PRINTS:
   python -m unittest test_automation.TestLogin -v

   Verás los valores reales:
   DEBUG: URL actual = http://localhost:3000/login
   DEBUG: Título = Login Page
   DEBUG: Errores encontrados = 0

   → Ahora sabes exactamente qué encontró

4. BUSCA EN apps/web/src/:
   Si no hay mensaje de error, no está implementado
   Revisa el componente y agrégalo

5. ACTUALIZA EL TEST:
   Con los valores reales que encontraste

6. EJECUTA DE NUEVO
            """
        },

        "ConnectionRefusedError": {
            "título": "Conexión Rechazada 🔌",
            "descripción": "No se puede conectar al servidor",
            "síntomas": [
                "ConnectionRefusedError",
                "Connection refused",
                "localhost:3000",
            ],
            "causas": [
                "1. El servidor NO está corriendo",
                "2. Está en otro puerto",
                "3. Firewall lo bloquea",
            ],
            "solución": """
SOLUCIÓN PASO A PASO:

1. VERIFICA QUE EL SERVIDOR ESTÁ CORRIENDO:

   Abre otra terminal y ejecuta:
   cd apps/web
   npm run dev

   Deberías ver:
   ▲ Next.js 15.1.2
   - Local: http://localhost:3000

   Si no ves esto, el servidor NO está corriendo

2. COMPRUEBA EL PUERTO:

   Windows:
   netstat -an | find "3000"

   Linux/Mac:
   lsof -i :3000

   Deberías ver: LISTEN en puerto 3000

3. COMPRUEBA MANUALMENTE:

   Abre en el navegador: http://localhost:3000

   ¿Carga? → Servidor está corriendo
   ¿Conexión rechazada? → Servidor no corriendo

4. REINICIA EL SERVIDOR:

   Si ya estaba corriendo:
   - Presiona Ctrl+C en la terminal del servidor
   - Ejecuta de nuevo: npm run dev
   - Intenta la prueba

5. EJECUTA LA PRUEBA
            """
        },

        "WebDriverException": {
            "título": "WebDriver Error 🚗",
            "descripción": "Problema con Chrome o WebDriver",
            "síntomas": [
                "WebDriverException",
                "Chrome failed to start",
                "chromedriver",
            ],
            "causas": [
                "1. ChromeDriver desactualizado",
                "2. Chrome no está instalado",
                "3. Permisos insuficientes",
            ],
            "solución": """
SOLUCIÓN PASO A PASO:

1. ACTUALIZA WEBDRIVER-MANAGER:

   pip install --upgrade webdriver-manager
   pip install --upgrade selenium

2. VERIFICA QUE CHROME ESTÁ INSTALADO:

   Windows:
   cd "C:\\Program Files\\Google\\Chrome\\Application"

   Linux:
   which google-chrome

   Mac:
   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome

3. SI NO ESTÁ INSTALADO:

   Descarga desde: https://www.google.com/chrome/
   E instala normalmente

4. PRUEBA CON COMANDO:

   En Python:
   from webdriver_manager.chrome import ChromeDriverManager
   from selenium.webdriver.chrome.service import Service
   path = ChromeDriverManager().install()
   print(path)

   Deberías ver una ruta válida

5. EJECUTA LA PRUEBA
            """
        },
    }

    def mostrar_menu_principal(self):
        """Menú principal del debugger"""
        while True:
            print("\n" + "="*80)
            print("🔧 HERRAMIENTA DE DEBUGGING - PRUEBAS AUTOMATIZADAS")
            print("="*80)
            print("\nOpciones:")
            print("1. 🔍 Identificar mi error")
            print("2. 📋 Ver guía de errores comunes")
            print("3. 🛠️ Generar reporte de debugging")
            print("4. 📁 Abrir carpeta de screenshots")
            print("5. 💡 Consejos de debugging")
            print("6. 📖 Ver documentación completa")
            print("7. ❌ Salir")
            print("="*80)

            opcion = input("\nSelecciona una opción (1-7): ").strip()

            if opcion == "1":
                self.identificar_error()
            elif opcion == "2":
                self.ver_errores_comunes()
            elif opcion == "3":
                self.generar_reporte()
            elif opcion == "4":
                self.abrir_screenshots()
            elif opcion == "5":
                self.consejos()
            elif opcion == "6":
                self.ver_documentacion()
            elif opcion == "7":
                print("\n👋 ¡Hasta luego!\n")
                break
            else:
                print("\n❌ Opción inválida")

    def identificar_error(self):
        """Ayuda a identificar el tipo de error"""
        print("\n" + "="*80)
        print("🔍 IDENTIFICAR MI ERROR")
        print("="*80)
        print("\nCopia el mensaje de error exacto y pégalo aquí:")
        print("(Presiona Enter dos veces cuando termines)\n")

        lineas = []
        while True:
            linea = input()
            if linea == "":
                if lineas and lineas[-1] == "":
                    break
                lineas.append(linea)
            else:
                lineas.append(linea)

        error_texto = "\n".join(lineas).lower()

        # Buscar coincidencias
        mejor_match = None
        mejor_score = 0

        for error_type, info in self.COMMON_ERRORS.items():
            for sintoma in info["síntomas"]:
                if sintoma.lower() in error_texto:
                    score = len(sintoma)
                    if score > mejor_score:
                        mejor_score = score
                        mejor_match = error_type

        if mejor_match:
            self.mostrar_error(mejor_match)
        else:
            print("\n⚠️ No se encontró un error exacto coincidente.")
            print("\nErrores conocidos:")
            for i, error_type in enumerate(self.COMMON_ERRORS.keys(), 1):
                print(f"{i}. {error_type}")

            seleccion = input("\nSelecciona el que más se parezca (número): ").strip()
            try:
                idx = int(seleccion) - 1
                error_keys = list(self.COMMON_ERRORS.keys())
                if 0 <= idx < len(error_keys):
                    self.mostrar_error(error_keys[idx])
            except:
                print("❌ Selección inválida")

    def mostrar_error(self, error_type):
        """Muestra información detallada de un error"""
        info = self.COMMON_ERRORS[error_type]

        print("\n" + "="*80)
        print(info["título"])
        print("="*80)
        print(f"\n📝 Descripción:\n{info['descripción']}")

        print(f"\n⚠️ Síntomas:")
        for sintoma in info["síntomas"]:
            print(f"   • {sintoma}")

        print(f"\n🔎 Causas posibles:")
        for causa in info["causas"]:
            print(f"   {causa}")

        print(f"\n✅ Solución:\n{info['solución']}")

        input("\nPresiona Enter para volver al menú...")

    def ver_errores_comunes(self):
        """Lista todos los errores comunes"""
        print("\n" + "="*80)
        print("📋 ERRORES COMUNES")
        print("="*80)

        for i, error_type in enumerate(self.COMMON_ERRORS.keys(), 1):
            info = self.COMMON_ERRORS[error_type]
            print(f"\n{i}. {info['título']}")
            print(f"   {info['descripción']}")

        print("\n" + "="*80)
        seleccion = input("Selecciona un error para ver detalles (número o Enter para volver): ").strip()

        if seleccion:
            try:
                idx = int(seleccion) - 1
                error_keys = list(self.COMMON_ERRORS.keys())
                if 0 <= idx < len(error_keys):
                    self.mostrar_error(error_keys[idx])
            except:
                print("❌ Selección inválida")

    def generar_reporte(self):
        """Genera reporte de debugging"""
        print("\n" + "="*80)
        print("🛠️ GENERAR REPORTE DE DEBUGGING")
        print("="*80)

        reporte = f"""
REPORTE DE DEBUGGING
====================
Generado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

INFORMACIÓN DEL SISTEMA:
- OS: {sys.platform}
- Python: {sys.version}

PASOS PARA DEBUGGING:
1. Verifica que el servidor está corriendo:
   cd apps/web && npm run dev

2. Abre DevTools (F12) en el navegador

3. Copia el error exacto en la consola

4. Usa esta herramienta para identificar el tipo

5. Sigue la solución propuesta

6. Actualiza el código necesario

7. Ejecuta la prueba de nuevo

ARCHIVOS IMPORTANTES:
- test_automation.py     → Pruebas básicas
- test_advanced.py       → Pruebas avanzadas
- test_config.py         → Configuración
- DEBUG_GUIDE.md         → Guía de debugging
- screenshots/           → Capturas de pantalla

RECURSOS:
- DevTools (F12)                → Inspeccionar elementos
- test_config.py               → Cambiar configuración
- apps/web/src/                → Código fuente frontend
- apps/api/src/                → Código fuente backend
"""

        # Guardar reporte
        os.makedirs("reports", exist_ok=True)
        filename = f"reports/debug_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

        with open(filename, "w") as f:
            f.write(reporte)

        print(reporte)
        print(f"✅ Reporte guardado en: {filename}")
        input("\nPresiona Enter para volver...")

    def abrir_screenshots(self):
        """Muestra screenshots disponibles"""
        print("\n" + "="*80)
        print("📸 CAPTURAS DE PANTALLA")
        print("="*80)

        screenshots_dir = "screenshots"
        if not os.path.exists(screenshots_dir):
            print("\n⚠️ No hay capturas de pantalla aún.")
            print("Ejecuta pruebas y se generarán automáticamente.")
            input("\nPresiona Enter para volver...")
            return

        screenshots = sorted(os.listdir(screenshots_dir))

        if not screenshots:
            print("\n⚠️ Carpeta vacía")
            input("\nPresiona Enter para volver...")
            return

        print(f"\n📁 Encontradas {len(screenshots)} capturas:\n")

        for i, screenshot in enumerate(screenshots[-10:], 1):  # Últimas 10
            filepath = os.path.join(screenshots_dir, screenshot)
            size = os.path.getsize(filepath)
            print(f"{i}. {screenshot} ({size/1024:.1f} KB)")

        print("\n💡 Consejo: Los screenshots están guardados en orden cronológico")
        print("Abre el último para ver dónde falló la prueba")
        input("\nPresiona Enter para volver...")

    def consejos(self):
        """Muestra consejos útiles"""
        print("\n" + "="*80)
        print("💡 CONSEJOS DE DEBUGGING")
        print("="*80)

        consejos = """
1. SIEMPRE REVISA SCREENSHOTS:
   - Ve a carpeta screenshots/
   - Abre la última imagen
   - Te mostrará exactamente dónde falló

2. USA DEVTOOLS (F12):
   - Inspector: Buscar selectores
   - Console: Ver errores JavaScript
   - Network: Ver peticiones API

3. AGREGA PRINTS:
   - Añade print() en el test
   - Ejecuta de nuevo
   - Verás exactamente qué valoresfound

4. PRUEBA MANUALMENTE:
   - Abre el navegador
   - Intenta el flujo manualmente
   - Si falla acá también, es problema del código
   - Si funciona manual pero falla test, es problema del test

5. AUMENTA TIMEOUT SI ES NECESARIO:
   - En test_config.py: DEFAULT_TIMEOUT = 30
   - Útil si el servidor es lento

6. VERIFICA CREDENCIALES:
   - En test_config.py
   - ¿El usuario existe?
   - ¿La contraseña es correcta?

7. REVISA EL CÓDIGO FUENTE:
   - apps/web/src/ → Frontend
   - apps/api/src/ → Backend
   - ¿La funcionalidad existe?

8. GOOGLEA EL ERROR:
   - Copia el mensaje exacto
   - Stack Overflow probablemente tiene la respuesta

9. LEE LOS LOGS:
   - Consola Python: mensajes de prueba
   - DevTools Console: errores JavaScript
   - Terminal del servidor: peticiones/errores

10. EMPIEZA SIMPLE:
    - Ejecuta pruebas pequeñas primero
    - Luego vuelve a las complejas
    - Así aislas el problema
"""

        print(consejos)
        input("\nPresiona Enter para volver...")

    def ver_documentacion(self):
        """Muestra la documentación"""
        print("\n" + "="*80)
        print("📖 DOCUMENTACIÓN DISPONIBLE")
        print("="*80)

        docs = [
            ("DEBUG_GUIDE.md", "Guía completa de debugging"),
            ("PRUEBAS_README.md", "Documentación de pruebas"),
            ("QUICK_START.md", "Inicio rápido"),
        ]

        print("\nArchivos disponibles:\n")
        for i, (archivo, desc) in enumerate(docs, 1):
            if os.path.exists(archivo):
                print(f"✅ {i}. {archivo}")
                print(f"   {desc}\n")
            else:
                print(f"❌ {i}. {archivo} (NO ENCONTRADO)\n")

        print("Para leer: abre los archivos .md con tu editor favorito")
        input("\nPresiona Enter para volver...")


def main():
    """Punto de entrada principal"""
    helper = DebugHelper()
    helper.mostrar_menu_principal()


if __name__ == "__main__":
    main()
