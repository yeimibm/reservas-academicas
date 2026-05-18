"""
Archivo de configuración centralizado para las pruebas automatizadas
"""

# ============================================================================
# CONFIGURACIÓN DE URLS
# ============================================================================

# URL base del frontend
FRONTEND_BASE_URL = "http://localhost:3000"

# URL base de la API
API_BASE_URL = "http://localhost:3001"

# ============================================================================
# CONFIGURACIÓN DE TIMEOUTS
# ============================================================================

# Timeout por defecto para buscar elementos (segundos)
DEFAULT_TIMEOUT = 10

# Timeout para esperas largas (segundos)
LONG_TIMEOUT = 30

# Timeout para esperas cortas (segundos)
SHORT_TIMEOUT = 5

# ============================================================================
# CONFIGURACIÓN DEL NAVEGADOR
# ============================================================================

# Argumentos para Chrome
CHROME_ARGUMENTS = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-extensions',
    '--disable-plugins',
    '--disable-default-apps',
]

# Descomentar para ejecutar en modo sin interfaz (headless)
# CHROME_ARGUMENTS.append('--headless')

# Descomentar para modo incógnito
# CHROME_ARGUMENTS.append('--incognito')

# ============================================================================
# CONFIGURACIÓN DE CAPTURAS DE PANTALLA
# ============================================================================

# Directorio para guardar screenshots
SCREENSHOTS_DIR = "screenshots"

# Guardar screenshot en cada test (True/False)
TAKE_SCREENSHOT_ON_EACH_TEST = True

# Guardar screenshot solo cuando falla (True/False)
TAKE_SCREENSHOT_ON_FAILURE = True

# ============================================================================
# CONFIGURACIÓN DE REPORTES
# ============================================================================

# Crear reporte HTML (requiere html-testRunner)
GENERATE_HTML_REPORT = False

# Directorio para reportes
REPORTS_DIR = "reports"

# ============================================================================
# CONFIGURACIÓN DE LOGS
# ============================================================================

# Nivel de verbosidad (0=silencioso, 1=normal, 2=detallado)
VERBOSITY = 2

# Guardar logs en archivo
SAVE_LOGS_TO_FILE = False

# Archivo de log
LOG_FILE = "test_results.log"

# ============================================================================
# CONFIGURACIÓN DE CREDENCIALES DE PRUEBA
# ============================================================================

# Usuario de prueba válido (cambiar con credenciales reales)
TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "Test123456!"

# Usuario admin de prueba
ADMIN_USER_EMAIL = "admin@example.com"
ADMIN_USER_PASSWORD = "Admin123456!"

# ============================================================================
# CONFIGURACIÓN DE DATOS DE PRUEBA
# ============================================================================

# Datos para pruebas de reservación
TEST_RESERVATION_DATA = {
    "space": "Aula 101",
    "date": "2024-12-25",
    "start_time": "09:00",
    "end_time": "11:00",
}

# Datos para pruebas de usuario
TEST_USER_DATA = {
    "first_name": "Test",
    "last_name": "User",
    "email": "testuser@example.com",
    "student_id": "STU123456",
}

# ============================================================================
# CONFIGURACIÓN DE RETRYOS
# ============================================================================

# Número de intentos si una prueba falla
MAX_RETRIES = 1

# Espera entre reintentos (segundos)
RETRY_DELAY = 2

# ============================================================================
# CONFIGURACIÓN DE RENDIMIENTO
# ============================================================================

# Tiempo máximo de carga de página aceptable (segundos)
MAX_PAGE_LOAD_TIME = 3.0

# Tiempo máximo de carga de API aceptable (segundos)
MAX_API_RESPONSE_TIME = 1.0

# ============================================================================
# SELECTORES CSS/XPATH COMUNES
# ============================================================================

SELECTORS = {
    # Login
    "login_form": "form",
    "email_input": "input[type='email']",
    "password_input": "input[type='password']",
    "login_button": "button[type='submit']",

    # Navegación
    "header": "header",
    "nav_links": "nav a",

    # Dashboard
    "dashboard_container": ".dashboard",
    "sidebar": "aside",

    # Reservaciones
    "reservation_form": "form[id*='reservation']",
    "date_input": "input[type='date']",
    "time_input": "input[type='time']",

    # Elementos generales
    "loading_spinner": ".spinner, .loader",
    "error_message": ".error, [role='alert']",
    "success_message": ".success, .toast-success",
}

# ============================================================================
# CONFIGURACIÓN DE NOTIFICACIONES
# ============================================================================

# Enviar notificación a Slack cuando las pruebas fallan
SLACK_NOTIFICATIONS_ENABLED = False

# Webhook URL de Slack
SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# ============================================================================
# FUNCIONES DE UTILIDAD
# ============================================================================

def get_all_settings():
    """Retorna un diccionario con todas las configuraciones"""
    import sys
    current_module = sys.modules[__name__]

    settings = {}
    for attr in dir(current_module):
        if attr.isupper():
            settings[attr] = getattr(current_module, attr)

    return settings


def print_config():
    """Imprime la configuración actual"""
    print("\n" + "="*80)
    print("CONFIGURACIÓN ACTUAL DE PRUEBAS")
    print("="*80)

    settings = get_all_settings()
    for key, value in sorted(settings.items()):
        if not key.startswith('_'):
            print(f"{key}: {value}")

    print("="*80 + "\n")


if __name__ == "__main__":
    print_config()
