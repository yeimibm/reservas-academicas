"""
Script para ejecutar pruebas automatizadas de forma fácil y con opciones
"""

import subprocess
import sys
import os
import time
from pathlib import Path


def check_server_running():
    """Verifica si el servidor web está corriendo"""
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', 3000))
    sock.close()
    return result == 0


def ensure_screenshots_dir():
    """Crea carpeta de screenshots si no existe"""
    os.makedirs("screenshots", exist_ok=True)


def run_all_tests():
    """Ejecuta todas las pruebas"""
    print("\n🧪 Ejecutando TODAS las pruebas...\n")
    subprocess.run([sys.executable, "test_automation.py"])


def run_specific_test_class(class_name):
    """Ejecuta una clase específica de pruebas"""
    print(f"\n🧪 Ejecutando pruebas de: {class_name}\n")
    subprocess.run([
        sys.executable, "-m", "unittest",
        f"test_automation.{class_name}", "-v"
    ])


def run_specific_test(class_name, method_name):
    """Ejecuta un método de prueba específico"""
    print(f"\n🧪 Ejecutando: {class_name}.{method_name}\n")
    subprocess.run([
        sys.executable, "-m", "unittest",
        f"test_automation.{class_name}.{method_name}", "-v"
    ])


def list_available_tests():
    """Lista todas las pruebas disponibles"""
    print("\n" + "="*80)
    print("PRUEBAS DISPONIBLES")
    print("="*80 + "\n")

    tests = {
        "TestLogin": [
            "test_01_page_loads",
            "test_02_login_form_exists",
            "test_03_login_invalid_credentials",
            "test_04_login_form_validation",
        ],
        "TestDashboard": [
            "test_01_dashboard_navigation",
        ],
        "TestReservations": [
            "test_01_reservations_page_navigation",
            "test_02_reservation_form_elements",
            "test_03_reservation_history_page",
        ],
        "TestPaymentReceipts": [
            "test_01_receipts_page_navigation",
            "test_02_receipt_upload_form",
        ],
        "TestReviews": [
            "test_01_reviews_page_navigation",
        ],
        "TestAdmin": [
            "test_01_admin_page_navigation",
        ],
        "TestNavigation": [
            "test_01_header_navigation_exists",
            "test_02_page_title_exists",
            "test_03_multiple_page_navigation",
        ],
        "TestResponsiveness": [
            "test_01_desktop_view",
            "test_02_mobile_view",
            "test_03_tablet_view",
        ],
        "TestPerformance": [
            "test_01_page_load_time",
            "test_02_dashboard_load_time",
        ],
    }

    for category, methods in tests.items():
        print(f"📌 {category}")
        for method in methods:
            print(f"   • {method}")
        print()

    print("="*80 + "\n")


def show_menu():
    """Muestra menú interactivo"""
    while True:
        print("\n" + "="*80)
        print("SUITE DE PRUEBAS AUTOMATIZADAS - SISTEMA DE RESERVAS ACADÉMICAS")
        print("="*80)
        print("\nOpciones:")
        print("  1. Ejecutar TODAS las pruebas")
        print("  2. Ejecutar pruebas de Login")
        print("  3. Ejecutar pruebas de Navegación")
        print("  4. Ejecutar pruebas de Reservaciones")
        print("  5. Ejecutar pruebas de Recibos de Pago")
        print("  6. Ejecutar pruebas de Reseñas")
        print("  7. Ejecutar pruebas de Admin")
        print("  8. Ejecutar pruebas de Responsividad")
        print("  9. Ejecutar pruebas de Rendimiento")
        print("  10. Listar todas las pruebas disponibles")
        print("  11. Salir")
        print("\n" + "="*80)

        choice = input("\nSelecciona una opción (1-11): ").strip()

        if choice == "1":
            if not check_server_running():
                print("\n⚠️ ADVERTENCIA: El servidor web no está corriendo en http://localhost:3000")
                if input("¿Deseas continuar de todas formas? (s/n): ").lower() != "s":
                    continue
            run_all_tests()
        elif choice == "2":
            run_specific_test_class("TestLogin")
        elif choice == "3":
            run_specific_test_class("TestNavigation")
        elif choice == "4":
            run_specific_test_class("TestReservations")
        elif choice == "5":
            run_specific_test_class("TestPaymentReceipts")
        elif choice == "6":
            run_specific_test_class("TestReviews")
        elif choice == "7":
            run_specific_test_class("TestAdmin")
        elif choice == "8":
            run_specific_test_class("TestResponsiveness")
        elif choice == "9":
            run_specific_test_class("TestPerformance")
        elif choice == "10":
            list_available_tests()
        elif choice == "11":
            print("\n👋 ¡Hasta luego!\n")
            break
        else:
            print("\n❌ Opción inválida. Por favor intenta de nuevo.")

        input("\nPresiona Enter para continuar...")


if __name__ == "__main__":
    ensure_screenshots_dir()

    if len(sys.argv) > 1:
        # Ejecutar con argumentos de línea de comandos
        command = sys.argv[1]

        if command == "all":
            run_all_tests()
        elif command == "menu":
            show_menu()
        elif command == "list":
            list_available_tests()
        elif command.startswith("class:"):
            class_name = command.replace("class:", "")
            run_specific_test_class(class_name)
        else:
            print(f"Comando desconocido: {command}")
            print("\nUsos:")
            print("  python run_tests.py all              # Ejecutar todas las pruebas")
            print("  python run_tests.py menu             # Menú interactivo")
            print("  python run_tests.py list             # Listar pruebas")
            print("  python run_tests.py class:TestLogin  # Ejecutar clase específica")
    else:
        # Mostrar menú interactivo por defecto
        show_menu()
