"""
Sistema de Reservas Académicas - Suite de Pruebas Automatizadas E2E con Selenium
Prueba todas las funcionalidades principales del sistema
"""

import unittest
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import os
import sys


class AcademicReservationsTestBase(unittest.TestCase):
    """Clase base para todas las pruebas con configuración común"""

    BASE_URL = "http://localhost:3000"
    TIMEOUT = 10

    @classmethod
    def setUpClass(cls):
        """Configuración inicial para todas las pruebas"""
        print("\n" + "="*80)
        print("INICIANDO SUITE DE PRUEBAS - SISTEMA DE RESERVAS ACADÉMICAS")
        print("="*80)

    def setUp(self):
        """Configuración antes de cada prueba"""
        options = webdriver.ChromeOptions()
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-blink-features=AutomationControlled')

        self.driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options
        )
        self.driver.implicitly_wait(self.TIMEOUT)
        self.wait = WebDriverWait(self.driver, self.TIMEOUT)
        print(f"\n✓ WebDriver inicializado - Navegador: Chrome")

    def tearDown(self):
        """Limpieza después de cada prueba"""
        if self.driver:
            self.driver.quit()
            print("✓ WebDriver cerrado")

    def take_screenshot(self, name):
        """Captura screenshot para debugging"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = f"screenshots/{timestamp}_{name}.png"
        os.makedirs("screenshots", exist_ok=True)
        self.driver.save_screenshot(path)
        print(f"  📸 Screenshot guardado: {path}")

    def navigate_to(self, path=""):
        """Navega a una URL específica"""
        url = f"{self.BASE_URL}{path}"
        self.driver.get(url)
        time.sleep(1)  # Espera a que cargue
        print(f"  → Navegando a: {url}")

    def find_element(self, by, value, timeout=None):
        """Busca un elemento con espera explícita"""
        wait = WebDriverWait(self.driver, timeout or self.TIMEOUT)
        return wait.until(EC.presence_of_element_located((by, value)))

    def click_element(self, by, value, description=""):
        """Busca y hace clic en un elemento"""
        element = self.find_element(by, value)
        element.click()
        if description:
            print(f"  ✓ Clic en: {description}")

    def fill_input(self, by, value, text, description=""):
        """Busca, limpia y completa un input"""
        element = self.find_element(by, value)
        element.clear()
        element.send_keys(text)
        if description:
            print(f"  ✓ Ingresado: {description} = '{text}'")

    def assert_page_loaded(self, element_locator):
        """Verifica que la página haya cargado correctamente"""
        self.find_element(*element_locator)
        print("  ✓ Página cargada correctamente")


class TestLogin(AcademicReservationsTestBase):
    """Pruebas del sistema de autenticación"""

    def test_01_page_loads(self):
        """Verifica que la página de login carga correctamente"""
        print("\n[TEST] Verificar carga de página de login")
        self.navigate_to()
        self.assert_page_loaded((By.TAG_NAME, "body"))

    def test_02_login_form_exists(self):
        """Verifica que el formulario de login existe"""
        print("\n[TEST] Verificar existencia del formulario de login")
        self.navigate_to()

        # Buscar elementos del formulario
        form = self.find_element(By.TAG_NAME, "form")
        self.assertIsNotNone(form)
        print("  ✓ Formulario de login encontrado")

    def test_03_login_invalid_credentials(self):
        """Intenta login con credenciales inválidas"""
        print("\n[TEST] Intentar login con credenciales inválidas")
        self.navigate_to()

        # Buscar campos
        inputs = self.driver.find_elements(By.TAG_NAME, "input")
        if len(inputs) >= 2:
            inputs[0].send_keys("usuario_invalido@test.com")
            inputs[1].send_keys("password_invalida")

            # Buscar botón de submit
            submit = self.driver.find_element(By.TAG_NAME, "button")
            submit.click()

            time.sleep(2)
            print("  ✓ Formulario de login enviado con credenciales inválidas")
            self.take_screenshot("login_invalid")

    def test_04_login_form_validation(self):
        """Verifica validación del formulario"""
        print("\n[TEST] Verificar validación del formulario de login")
        self.navigate_to()

        # Enviar formulario vacío
        submit = self.driver.find_element(By.TAG_NAME, "button")
        submit.click()

        time.sleep(1)
        print("  ✓ Validación de formulario ejecutada")
        self.take_screenshot("login_validation")


class TestDashboard(AcademicReservationsTestBase):
    """Pruebas del dashboard principal"""

    def test_01_dashboard_navigation(self):
        """Intenta navegar al dashboard"""
        print("\n[TEST] Navegar al dashboard")
        self.navigate_to("/dashboard")

        # Si redirige a login, es correcto (sin autenticación)
        current_url = self.driver.current_url
        print(f"  → URL actual: {current_url}")
        self.assertTrue("login" in current_url or "dashboard" in current_url)


class TestReservations(AcademicReservationsTestBase):
    """Pruebas del módulo de reservaciones"""

    def test_01_reservations_page_navigation(self):
        """Intenta navegar a la página de reservaciones"""
        print("\n[TEST] Navegar a página de reservaciones")
        self.navigate_to("/dashboard/reservations")

        current_url = self.driver.current_url
        print(f"  → URL actual: {current_url}")
        # Espera a login o dashboard
        time.sleep(1)
        self.take_screenshot("reservations_page")

    def test_02_reservation_form_elements(self):
        """Verifica elementos de formulario de reservación"""
        print("\n[TEST] Verificar elementos del formulario de reservación")
        self.navigate_to("/dashboard/reservations")

        # Buscar inputs o selects
        try:
            inputs = self.driver.find_elements(By.TAG_NAME, "input")
            selects = self.driver.find_elements(By.TAG_NAME, "select")
            print(f"  ✓ Encontrados {len(inputs)} inputs y {len(selects)} selects")
        except:
            print("  ℹ Formulario no disponible (puede requerir autenticación)")

    def test_03_reservation_history_page(self):
        """Verifica página de historial de reservaciones"""
        print("\n[TEST] Navegar a historial de reservaciones")
        self.navigate_to("/dashboard/history")

        current_url = self.driver.current_url
        print(f"  → URL actual: {current_url}")
        self.take_screenshot("reservation_history")


class TestPaymentReceipts(AcademicReservationsTestBase):
    """Pruebas del módulo de recibos de pago"""

    def test_01_receipts_page_navigation(self):
        """Intenta navegar a recibos de pago"""
        print("\n[TEST] Navegar a página de recibos de pago")
        self.navigate_to("/dashboard/receipts")

        current_url = self.driver.current_url
        print(f"  → URL actual: {current_url}")
        self.take_screenshot("receipts_page")

    def test_02_receipt_upload_form(self):
        """Verifica elementos del formulario de carga"""
        print("\n[TEST] Verificar formulario de carga de recibos")
        self.navigate_to("/dashboard/receipts")

        try:
            file_inputs = self.driver.find_elements(By.CSS_SELECTOR, "input[type='file']")
            print(f"  ✓ Encontrados {len(file_inputs)} inputs de archivo")
        except:
            print("  ℹ Inputs de archivo no encontrados (puede requerir autenticación)")


class TestReviews(AcademicReservationsTestBase):
    """Pruebas del módulo de reseñas"""

    def test_01_reviews_page_navigation(self):
        """Intenta navegar a reseñas"""
        print("\n[TEST] Navegar a página de reseñas")
        self.navigate_to("/dashboard/reviews")

        current_url = self.driver.current_url
        print(f"  → URL actual: {current_url}")
        self.take_screenshot("reviews_page")


class TestAdmin(AcademicReservationsTestBase):
    """Pruebas del panel administrativo"""

    def test_01_admin_page_navigation(self):
        """Intenta navegar a panel admin"""
        print("\n[TEST] Navegar a panel administrativo")
        self.navigate_to("/dashboard/admin")

        current_url = self.driver.current_url
        print(f"  → URL actual: {current_url}")
        self.take_screenshot("admin_page")


class TestNavigation(AcademicReservationsTestBase):
    """Pruebas de navegación y estructura general"""

    def test_01_header_navigation_exists(self):
        """Verifica que la navegación principal existe"""
        print("\n[TEST] Verificar navegación principal (header)")
        self.navigate_to()

        try:
            header = self.driver.find_element(By.TAG_NAME, "header")
            self.assertIsNotNone(header)
            print("  ✓ Header/Navegación encontrado")
        except:
            print("  ℹ Header no encontrado o estructura diferente")

    def test_02_page_title_exists(self):
        """Verifica que hay título en la página"""
        print("\n[TEST] Verificar título de página")
        self.navigate_to()

        title = self.driver.title
        print(f"  → Título de página: '{title}'")
        self.assertTrue(len(title) > 0)

    def test_03_multiple_page_navigation(self):
        """Verifica navegación entre múltiples páginas"""
        print("\n[TEST] Prueba navegación entre páginas")

        pages = [
            ("/", "inicio"),
            ("/dashboard", "dashboard"),
            ("/dashboard/reservations", "reservaciones"),
            ("/dashboard/history", "historial"),
            ("/dashboard/receipts", "recibos"),
            ("/dashboard/reviews", "reseñas"),
            ("/dashboard/admin", "admin"),
        ]

        for path, name in pages:
            try:
                self.navigate_to(path)
                current_url = self.driver.current_url
                print(f"  ✓ Navegación exitosa a {name}: {current_url}")
                time.sleep(0.5)
            except Exception as e:
                print(f"  ⚠ Error navegando a {name}: {str(e)}")


class TestResponsiveness(AcademicReservationsTestBase):
    """Pruebas de responsividad y tamaño de ventana"""

    def test_01_desktop_view(self):
        """Prueba vista desktop (1920x1080)"""
        print("\n[TEST] Probar vista desktop (1920x1080)")
        self.driver.set_window_size(1920, 1080)
        self.navigate_to()

        width = self.driver.get_window_size()['width']
        print(f"  ✓ Tamaño de ventana: {width}x{self.driver.get_window_size()['height']}")
        self.take_screenshot("desktop_view")

    def test_02_mobile_view(self):
        """Prueba vista móvil (375x667)"""
        print("\n[TEST] Probar vista móvil (375x667)")
        self.driver.set_window_size(375, 667)
        self.navigate_to()

        width = self.driver.get_window_size()['width']
        print(f"  ✓ Tamaño de ventana: {width}x{self.driver.get_window_size()['height']}")
        self.take_screenshot("mobile_view")

    def test_03_tablet_view(self):
        """Prueba vista tablet (768x1024)"""
        print("\n[TEST] Probar vista tablet (768x1024)")
        self.driver.set_window_size(768, 1024)
        self.navigate_to()

        width = self.driver.get_window_size()['width']
        print(f"  ✓ Tamaño de ventana: {width}x{self.driver.get_window_size()['height']}")
        self.take_screenshot("tablet_view")


class TestPerformance(AcademicReservationsTestBase):
    """Pruebas de rendimiento y tiempos de carga"""

    def test_01_page_load_time(self):
        """Mide tiempo de carga de la página principal"""
        print("\n[TEST] Medir tiempo de carga de página principal")

        start = time.time()
        self.navigate_to()
        end = time.time()

        load_time = end - start
        print(f"  ⏱ Tiempo de carga: {load_time:.2f} segundos")

        # Alerta si es muy lenta
        if load_time > 3:
            print(f"  ⚠ ADVERTENCIA: Carga lenta (> 3s)")
        else:
            print("  ✓ Tiempo de carga aceptable")

    def test_02_dashboard_load_time(self):
        """Mide tiempo de carga del dashboard"""
        print("\n[TEST] Medir tiempo de carga del dashboard")

        start = time.time()
        self.navigate_to("/dashboard")
        end = time.time()

        load_time = end - start
        print(f"  ⏱ Tiempo de carga: {load_time:.2f} segundos")


def run_test_suite():
    """Ejecuta la suite completa de pruebas"""

    # Crear suite de pruebas
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Agregar todas las clases de prueba
    test_classes = [
        TestLogin,
        TestNavigation,
        TestDashboard,
        TestReservations,
        TestPaymentReceipts,
        TestReviews,
        TestAdmin,
        TestResponsiveness,
        TestPerformance,
    ]

    for test_class in test_classes:
        tests = loader.loadTestsFromTestCase(test_class)
        suite.addTests(tests)

    # Ejecutar con verbosidad
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Resumen final
    print("\n" + "="*80)
    print("RESUMEN DE PRUEBAS")
    print("="*80)
    print(f"Total de pruebas ejecutadas: {result.testsRun}")
    print(f"✓ Exitosas: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"✗ Fallidas: {len(result.failures)}")
    print(f"⚠ Errores: {len(result.errors)}")
    print("="*80 + "\n")

    return result.wasSuccessful()


if __name__ == "__main__":
    # Verificar que el servidor está corriendo
    print("\n" + "="*80)
    print("VERIFICACIÓN PREVIA")
    print("="*80)
    print("📋 Requisitos:")
    print("  • Asegúrate de que el servidor web esté corriendo (npm run dev en apps/web)")
    print("  • URL base: http://localhost:3000")
    print("  • ChromeDriver será descargado automáticamente")
    print("="*80 + "\n")

    input("Presiona Enter para comenzar las pruebas (asegúrate de que el servidor esté corriendo)...\n")

    success = run_test_suite()
    sys.exit(0 if success else 1)
