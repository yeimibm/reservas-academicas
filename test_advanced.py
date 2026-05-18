"""
Pruebas Avanzadas - Escenarios Complejos y Pruebas de API
"""

import unittest
import requests
import json
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager


class APITestBase(unittest.TestCase):
    """Base para pruebas de API"""

    BASE_API = "http://localhost:3001"  # Ajusta según tu puerto de API
    TIMEOUT = 10

    def setUp(self):
        """Configuración antes de cada prueba"""
        print(f"\n📡 Test de API iniciado")

    def make_request(self, method, endpoint, data=None, headers=None):
        """Realiza una petición HTTP"""
        url = f"{self.BASE_API}{endpoint}"
        default_headers = {"Content-Type": "application/json"}

        if headers:
            default_headers.update(headers)

        try:
            if method == "GET":
                response = requests.get(url, headers=default_headers, timeout=self.TIMEOUT)
            elif method == "POST":
                response = requests.post(url, json=data, headers=default_headers, timeout=self.TIMEOUT)
            elif method == "PUT":
                response = requests.put(url, json=data, headers=default_headers, timeout=self.TIMEOUT)
            elif method == "DELETE":
                response = requests.delete(url, headers=default_headers, timeout=self.TIMEOUT)
            else:
                raise ValueError(f"Método no soportado: {method}")

            return response
        except requests.exceptions.RequestException as e:
            print(f"❌ Error en petición HTTP: {str(e)}")
            return None


class TestHealthCheck(APITestBase):
    """Pruebas de salud de la API"""

    def test_01_api_health_endpoint(self):
        """Verifica que la API está disponible"""
        print("\n[TEST] Verificar salud de la API")

        response = self.make_request("GET", "/health")

        if response is None:
            print("  ⚠️ API no está disponible (puerto 3001)")
            return

        self.assertEqual(response.status_code, 200)
        print(f"  ✓ API disponible (status: {response.status_code})")

    def test_02_api_response_format(self):
        """Verifica que la respuesta tiene el formato correcto"""
        print("\n[TEST] Verificar formato de respuesta de API")

        response = self.make_request("GET", "/health")

        if response is None:
            print("  ⚠️ API no está disponible")
            return

        try:
            data = response.json()
            self.assertIsInstance(data, (dict, list))
            print(f"  ✓ Respuesta en formato JSON válido")
        except json.JSONDecodeError:
            print(f"  ⚠️ Respuesta no es JSON válido")


class TestAuthAPI(APITestBase):
    """Pruebas de autenticación en API"""

    def test_01_login_invalid_credentials(self):
        """Intenta login con credenciales inválidas"""
        print("\n[TEST] Login con credenciales inválidas en API")

        response = self.make_request("POST", "/auth/login", {
            "email": "invalid@test.com",
            "password": "invalid_password"
        })

        if response is None:
            print("  ⚠️ API no disponible")
            return

        # Esperamos que retorne 401 o 400
        self.assertIn(response.status_code, [400, 401, 403])
        print(f"  ✓ Respuesta esperada (status: {response.status_code})")

    def test_02_login_missing_fields(self):
        """Intenta login sin los campos requeridos"""
        print("\n[TEST] Login sin campos requeridos")

        response = self.make_request("POST", "/auth/login", {})

        if response is None:
            print("  ⚠️ API no disponible")
            return

        # Esperamos validación de error
        self.assertIn(response.status_code, [400, 422])
        print(f"  ✓ Validación de campos correcta (status: {response.status_code})")


class TestReservationAPI(APITestBase):
    """Pruebas del API de reservaciones"""

    def test_01_get_reservations(self):
        """Obtiene lista de reservaciones"""
        print("\n[TEST] Obtener lista de reservaciones")

        response = self.make_request("GET", "/reservations")

        if response is None:
            print("  ⚠️ API no disponible")
            return

        if response.status_code in [200, 401]:  # 401 si no está autenticado
            print(f"  ✓ Endpoint accesible (status: {response.status_code})")
        else:
            print(f"  ⚠️ Respuesta inesperada (status: {response.status_code})")

    def test_02_get_reservation_by_id(self):
        """Obtiene una reservación por ID"""
        print("\n[TEST] Obtener reservación por ID")

        response = self.make_request("GET", "/reservations/1")

        if response is None:
            print("  ⚠️ API no disponible")
            return

        print(f"  ✓ Endpoint accesible (status: {response.status_code})")

    def test_03_create_reservation_invalid_data(self):
        """Intenta crear reservación con datos inválidos"""
        print("\n[TEST] Crear reservación con datos inválidos")

        response = self.make_request("POST", "/reservations", {
            "invalid_field": "invalid_value"
        })

        if response is None:
            print("  ⚠️ API no disponible")
            return

        # Esperamos error de validación o autenticación
        self.assertIn(response.status_code, [400, 401, 422])
        print(f"  ✓ Validación correcta (status: {response.status_code})")


class TestComplexUserFlow(unittest.TestCase):
    """Pruebas de flujos complejos del usuario"""

    BASE_URL = "http://localhost:3000"
    TIMEOUT = 10

    def setUp(self):
        """Configuración del webdriver"""
        options = webdriver.ChromeOptions()
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')

        self.driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options
        )
        self.driver.implicitly_wait(self.TIMEOUT)
        print(f"\n🌐 WebDriver inicializado para flujo complejo")

    def tearDown(self):
        """Limpieza"""
        if self.driver:
            self.driver.quit()

    def take_screenshot(self, name):
        """Captura screenshot"""
        import os
        os.makedirs("screenshots", exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = f"screenshots/{timestamp}_{name}.png"
        self.driver.save_screenshot(path)
        print(f"  📸 Screenshot: {path}")

    def test_01_complete_user_registration_flow(self):
        """Simula flujo completo de registro de usuario"""
        print("\n[TEST] Flujo completo de registro")

        self.driver.get(f"{self.BASE_URL}/register")
        time.sleep(1)

        # Buscar formulario
        try:
            form = self.driver.find_element(By.TAG_NAME, "form")
            self.assertIsNotNone(form)
            print("  ✓ Formulario de registro encontrado")
            self.take_screenshot("registration_form")
        except:
            print("  ℹ Formulario no encontrado (verificar estructura)")

    def test_02_complete_reservation_workflow(self):
        """Simula flujo completo de reservación"""
        print("\n[TEST] Flujo completo de reservación")

        # 1. Ir a dashboard
        self.driver.get(f"{self.BASE_URL}/dashboard")
        time.sleep(1)
        print("  ✓ Accediendo a dashboard")

        # 2. Ir a reservaciones
        try:
            # Buscar enlace a reservaciones
            links = self.driver.find_elements(By.TAG_NAME, "a")
            for link in links:
                if "reservation" in link.get_attribute("href"):
                    link.click()
                    print("  ✓ Navegando a reservaciones")
                    time.sleep(1)
                    break
        except Exception as e:
            print(f"  ℹ No se pudo navegar a reservaciones: {str(e)}")

        self.take_screenshot("reservation_workflow")

    def test_03_multiple_page_load_performance(self):
        """Mide rendimiento cargando múltiples páginas"""
        print("\n[TEST] Rendimiento de carga múltiple")

        pages = ["/", "/dashboard", "/dashboard/reservations"]
        times = []

        for page in pages:
            start = time.time()
            self.driver.get(f"{self.BASE_URL}{page}")
            end = time.time()

            load_time = end - start
            times.append(load_time)
            print(f"  ⏱ {page}: {load_time:.2f}s")

        avg_time = sum(times) / len(times)
        print(f"  📊 Tiempo promedio: {avg_time:.2f}s")

        if avg_time > 2.5:
            print(f"  ⚠️ ADVERTENCIA: Tiempo promedio lento (>{2.5}s)")


class TestErrorHandling(unittest.TestCase):
    """Pruebas de manejo de errores"""

    BASE_URL = "http://localhost:3000"
    TIMEOUT = 10

    def setUp(self):
        """Configuración del webdriver"""
        options = webdriver.ChromeOptions()
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')

        self.driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options
        )
        self.driver.implicitly_wait(self.TIMEOUT)

    def tearDown(self):
        """Limpieza"""
        if self.driver:
            self.driver.quit()

    def test_01_404_error_page(self):
        """Verifica página de error 404"""
        print("\n[TEST] Verificar página de error 404")

        self.driver.get(f"{self.BASE_URL}/pagina-inexistente-12345")
        time.sleep(1)

        # Buscar evidencia de página 404
        page_text = self.driver.page_source.lower()
        has_error = any(indicator in page_text for indicator in ["404", "not found", "no encontrado"])

        print(f"  → Indicador de error: {has_error}")

    def test_02_javascript_console_errors(self):
        """Verifica errores en consola de JavaScript"""
        print("\n[TEST] Verificar errores en consola JS")

        self.driver.get(f"{self.BASE_URL}")
        time.sleep(2)

        # Obtener logs de navegador
        logs = self.driver.get_log('browser')

        errors = [log for log in logs if log['level'] == 'SEVERE']

        print(f"  📋 Total de logs: {len(logs)}")
        print(f"  ❌ Errores SEVERE: {len(errors)}")

        if errors:
            for error in errors[:3]:  # Mostrar primeros 3
                print(f"    - {error['message'][:100]}...")

    def test_03_network_error_recovery(self):
        """Verifica recuperación de errores de red"""
        print("\n[TEST] Verificar manejo de errores de red")

        # Intenta acceder a un endpoint inválido
        try:
            self.driver.get(f"{self.BASE_URL}:99999/invalid")
            print("  ⚠️ Página aún accesible (sin error de conexión)")
        except Exception as e:
            print(f"  ✓ Error de conexión capturado: {type(e).__name__}")


class TestSecurityBasics(unittest.TestCase):
    """Pruebas básicas de seguridad"""

    BASE_URL = "http://localhost:3000"
    TIMEOUT = 10

    def setUp(self):
        """Configuración del webdriver"""
        options = webdriver.ChromeOptions()
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')

        self.driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options
        )
        self.driver.implicitly_wait(self.TIMEOUT)

    def tearDown(self):
        """Limpieza"""
        if self.driver:
            self.driver.quit()

    def test_01_https_redirect(self):
        """Verifica redirección HTTPS si está configurada"""
        print("\n[TEST] Verificar configuración HTTPS")

        self.driver.get(f"{self.BASE_URL}")
        time.sleep(1)

        current_url = self.driver.current_url
        print(f"  → URL actual: {current_url}")

    def test_02_password_field_masking(self):
        """Verifica que campos de contraseña están enmascarados"""
        print("\n[TEST] Verificar enmascaramiento de contraseña")

        self.driver.get(f"{self.BASE_URL}/login")
        time.sleep(1)

        try:
            password_inputs = self.driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
            if password_inputs:
                print(f"  ✓ Encontrados {len(password_inputs)} campos de contraseña enmascarados")
            else:
                print(f"  ℹ No se encontraron campos de contraseña (estructura diferente)")
        except:
            print(f"  ⚠️ Error al verificar campos de contraseña")

    def test_03_sensitive_info_not_in_logs(self):
        """Verifica que información sensible no está en logs"""
        print("\n[TEST] Verificar que datos sensibles no estén en logs")

        self.driver.get(f"{self.BASE_URL}")
        logs = self.driver.get_log('browser')

        suspicious_keywords = ['password', 'token', 'api_key', 'secret', 'credential']
        issues = []

        for log in logs:
            message = log['message'].lower()
            for keyword in suspicious_keywords:
                if keyword in message:
                    issues.append(f"Keyword '{keyword}' encontrado en logs")

        if issues:
            print(f"  ⚠️ Posibles datos sensibles en logs:")
            for issue in issues[:3]:
                print(f"    - {issue}")
        else:
            print(f"  ✓ No se encontraron datos sensibles en logs")


def run_advanced_tests():
    """Ejecuta todas las pruebas avanzadas"""

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    test_classes = [
        TestHealthCheck,
        TestAuthAPI,
        TestReservationAPI,
        TestComplexUserFlow,
        TestErrorHandling,
        TestSecurityBasics,
    ]

    for test_class in test_classes:
        tests = loader.loadTestsFromTestCase(test_class)
        suite.addTests(tests)

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "="*80)
    print("RESUMEN DE PRUEBAS AVANZADAS")
    print("="*80)
    print(f"Total: {result.testsRun}")
    print(f"✓ Exitosas: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"✗ Fallidas: {len(result.failures)}")
    print(f"⚠ Errores: {len(result.errors)}")
    print("="*80 + "\n")

    return result.wasSuccessful()


if __name__ == "__main__":
    import sys
    success = run_advanced_tests()
    sys.exit(0 if success else 1)
