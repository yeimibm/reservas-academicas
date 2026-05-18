"""
Generador de Reportes HTML para Pruebas Automatizadas
Crea reportes visuales con resultados, errores y soluciones
"""

import unittest
import sys
import os
from datetime import datetime
from io import StringIO
import re


class TestResultCollector(unittest.TextTestResult):
    """Colector de resultados de pruebas"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.test_results = []
        self.start_time = datetime.now()

    def startTest(self, test):
        super().startTest(test)
        self.current_test_start = datetime.now()

    def addSuccess(self, test):
        super().addSuccess(test)
        self.test_results.append({
            'name': str(test),
            'status': 'PASSED',
            'error': None,
            'traceback': None,
            'duration': (datetime.now() - self.current_test_start).total_seconds()
        })

    def addError(self, test, err):
        super().addError(test, err)
        exc_type, exc_value, exc_traceback = err
        self.test_results.append({
            'name': str(test),
            'status': 'ERROR',
            'error': str(exc_value),
            'traceback': self._exc_info_to_string(err, test),
            'duration': (datetime.now() - self.current_test_start).total_seconds()
        })

    def addFailure(self, test, err):
        super().addFailure(test, err)
        exc_type, exc_value, exc_traceback = err
        self.test_results.append({
            'name': str(test),
            'status': 'FAILED',
            'error': str(exc_value),
            'traceback': self._exc_info_to_string(err, test),
            'duration': (datetime.now() - self.current_test_start).total_seconds()
        })


class HTMLReportGenerator:
    """Genera reportes HTML de pruebas"""

    ERROR_SOLUTIONS = {
        "NoSuchElementException": {
            "title": "Elemento No Encontrado",
            "description": "El selector CSS o XPATH no pudo localizar el elemento en la página",
            "solutions": [
                {
                    "title": "1. Verificar el selector con DevTools",
                    "steps": [
                        "Abre DevTools (F12) en el navegador",
                        "Ve a la pestaña 'Inspector'",
                        "Haz clic en la lupa y luego en el elemento",
                        "Copia el selector CSS correcto",
                        "Actualiza el test con el selector correcto"
                    ]
                },
                {
                    "title": "2. Verificar que el elemento existe",
                    "steps": [
                        "Abre el navegador en http://localhost:3000",
                        "¿Ves el elemento que busca la prueba?",
                        "Si NO existe: Implementar en apps/web/src/",
                        "Si SÍ existe: Revisar selector en test_automation.py"
                    ]
                }
            ],
            "files_to_check": [
                "test_automation.py (selector incorrecto)",
                "apps/web/src/ (elemento no implementado)"
            ]
        },

        "TimeoutException": {
            "title": "Timeout - Elemento Tardío",
            "description": "El elemento no apareció dentro del tiempo máximo de espera",
            "solutions": [
                {
                    "title": "1. Revisar errores JavaScript",
                    "steps": [
                        "Abre DevTools (F12) → Console",
                        "¿Hay errores rojos?",
                        "Si SÍ: Busca el error en apps/web/src/ y corrígelo",
                        "Si NO: El servidor es lento o el elemento carga dinámicamente"
                    ]
                },
                {
                    "title": "2. Aumentar el timeout",
                    "steps": [
                        "Abre test_config.py",
                        "Cambia: DEFAULT_TIMEOUT = 10",
                        "A: DEFAULT_TIMEOUT = 30",
                        "Ejecuta la prueba de nuevo"
                    ]
                }
            ],
            "files_to_check": [
                "test_config.py (aumentar DEFAULT_TIMEOUT)",
                "apps/web/src/ (errores JavaScript)"
            ]
        },

        "AssertionError": {
            "title": "Assertion Error - Resultado Incorrecto",
            "description": "El valor esperado no coincide con el valor actual",
            "solutions": [
                {
                    "title": "1. Entender qué falla",
                    "steps": [
                        "Lee el mensaje de error exacto",
                        "Identifica: valor esperado vs valor actual",
                        "Abre screenshot de la prueba (carpeta screenshots/)",
                        "Compara visualmente con lo que esperas"
                    ]
                },
                {
                    "title": "2. Agregar prints para debug",
                    "steps": [
                        "Edita test_automation.py",
                        "Agrega: print(f'DEBUG: {variable}')",
                        "Ejecuta la prueba de nuevo",
                        "Lee los valores impresos en consola"
                    ]
                }
            ],
            "files_to_check": [
                "test_automation.py (agregar prints)",
                "apps/web/src/ (funcionalidad faltante)"
            ]
        },

        "ConnectionRefusedError": {
            "title": "Connection Refused - Servidor No Responde",
            "description": "No se puede conectar al servidor web",
            "solutions": [
                {
                    "title": "1. Verificar que el servidor está corriendo",
                    "steps": [
                        "Abre una terminal nueva",
                        "Ejecuta: cd apps/web && npm run dev",
                        "Espera a que diga: http://localhost:3000",
                        "En otra terminal, ejecuta la prueba"
                    ]
                },
                {
                    "title": "2. Verificar la URL",
                    "steps": [
                        "En test_config.py",
                        "Verifica: FRONTEND_BASE_URL = 'http://localhost:3000'",
                        "Abre en navegador: http://localhost:3000",
                        "¿Carga? → Todo bien. ¿No? → Ver logs del servidor"
                    ]
                }
            ],
            "files_to_check": [
                "Terminal: npm run dev en apps/web/",
                "test_config.py (FRONTEND_BASE_URL)"
            ]
        },

        "WebDriverException": {
            "title": "WebDriver Exception",
            "description": "Problema con Chrome o el WebDriver",
            "solutions": [
                {
                    "title": "1. Actualizar webdriver-manager",
                    "steps": [
                        "Abre terminal",
                        "Ejecuta: pip install --upgrade webdriver-manager",
                        "Ejecuta: pip install --upgrade selenium",
                        "Intenta la prueba de nuevo"
                    ]
                },
                {
                    "title": "2. Verificar Chrome",
                    "steps": [
                        "¿Chrome está instalado?",
                        "Si NO: Descarga desde https://www.google.com/chrome/",
                        "Si SÍ: Intenta reinstalar Chrome"
                    ]
                }
            ],
            "files_to_check": [
                "Terminal: pip install --upgrade webdriver-manager",
                "Navegador: Verificar que Chrome está instalado"
            ]
        }
    }

    @staticmethod
    def get_error_solution(error_message):
        """Busca la solución para un error específico"""
        for error_type, solution in HTMLReportGenerator.ERROR_SOLUTIONS.items():
            if error_type.lower() in error_message.lower():
                return solution
        return None

    @staticmethod
    def generate_html(results, filename=None):
        """Genera reporte HTML"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            os.makedirs("reports", exist_ok=True)
            filename = f"reports/test_report_{timestamp}.html"

        total_tests = len(results.test_results)
        passed = sum(1 for r in results.test_results if r['status'] == 'PASSED')
        failed = sum(1 for r in results.test_results if r['status'] == 'FAILED')
        errors = sum(1 for r in results.test_results if r['status'] == 'ERROR')

        duration = (datetime.now() - results.start_time).total_seconds()

        html = f"""
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reporte de Pruebas Automatizadas</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }}

        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            overflow: hidden;
        }}

        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }}

        .header h1 {{
            font-size: 2.5em;
            margin-bottom: 10px;
        }}

        .stats {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }}

        .stat {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}

        .stat-value {{
            font-size: 2em;
            font-weight: bold;
            margin-bottom: 5px;
        }}

        .stat-label {{
            color: #666;
            font-size: 0.9em;
        }}

        .passed {{ color: #28a745; }}
        .failed {{ color: #dc3545; }}
        .error {{ color: #ffc107; }}
        .skipped {{ color: #6c757d; }}

        .content {{
            padding: 30px;
        }}

        .test-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }}

        .test-table th {{
            background: #f8f9fa;
            padding: 15px;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid #dee2e6;
        }}

        .test-table td {{
            padding: 15px;
            border-bottom: 1px solid #dee2e6;
        }}

        .test-table tr:hover {{
            background: #f8f9fa;
        }}

        .status-badge {{
            display: inline-block;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
        }}

        .status-passed {{
            background: #d4edda;
            color: #155724;
        }}

        .status-failed {{
            background: #f8d7da;
            color: #721c24;
        }}

        .status-error {{
            background: #fff3cd;
            color: #856404;
        }}

        .error-details {{
            background: #f8f9fa;
            border-left: 4px solid #dc3545;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 4px;
        }}

        .error-details h3 {{
            color: #dc3545;
            margin-bottom: 10px;
        }}

        .error-message {{
            background: white;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            overflow-x: auto;
            color: #666;
        }}

        .solution {{
            background: #d4edda;
            border-left: 4px solid #28a745;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 4px;
        }}

        .solution h4 {{
            color: #155724;
            margin-bottom: 10px;
            font-size: 1.1em;
        }}

        .solution p {{
            color: #155724;
            margin-bottom: 10px;
            line-height: 1.6;
        }}

        .solution ol {{
            margin-left: 20px;
            color: #155724;
        }}

        .solution li {{
            margin-bottom: 8px;
            line-height: 1.6;
        }}

        .files-to-check {{
            background: #e7f3ff;
            border-left: 4px solid #0066cc;
            padding: 15px;
            margin-top: 10px;
            border-radius: 4px;
        }}

        .files-to-check strong {{
            color: #0066cc;
        }}

        .files-to-check ul {{
            margin-left: 20px;
            margin-top: 10px;
        }}

        .files-to-check li {{
            color: #0066cc;
            margin-bottom: 5px;
        }}

        .traceback {{
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
            overflow-x: auto;
            color: #333;
            margin-top: 10px;
            border: 1px solid #ddd;
        }}

        .section-title {{
            font-size: 1.5em;
            font-weight: 600;
            margin-top: 30px;
            margin-bottom: 20px;
            color: #333;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }}

        .footer {{
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 0.9em;
            border-top: 1px solid #dee2e6;
        }}

        .no-errors {{
            background: #d4edda;
            padding: 20px;
            border-radius: 8px;
            color: #155724;
            text-align: center;
            font-size: 1.1em;
        }}

        .summary {{
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 30px;
        }}

        @media (max-width: 768px) {{
            .summary {{
                grid-template-columns: repeat(2, 1fr);
            }}

            .header h1 {{
                font-size: 1.5em;
            }}

            .test-table {{
                font-size: 0.9em;
            }}

            .test-table th,
            .test-table td {{
                padding: 10px 5px;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Reporte de Pruebas Automatizadas</h1>
            <p>Sistema de Reservas Académicas</p>
        </div>

        <div class="stats">
            <div class="stat">
                <div class="stat-value" style="color: #0066cc;">{total_tests}</div>
                <div class="stat-label">Total de Pruebas</div>
            </div>
            <div class="stat">
                <div class="stat-value passed">✓ {passed}</div>
                <div class="stat-label">Exitosas</div>
            </div>
            <div class="stat">
                <div class="stat-value failed">✗ {failed}</div>
                <div class="stat-label">Fallidas</div>
            </div>
            <div class="stat">
                <div class="stat-value error">⚠ {errors}</div>
                <div class="stat-label">Errores</div>
            </div>
            <div class="stat">
                <div class="stat-value" style="color: #666;">⏱ {duration:.2f}s</div>
                <div class="stat-label">Duración</div>
            </div>
            <div class="stat">
                <div class="stat-value" style="color: {'#28a745' if failed == 0 and errors == 0 else '#dc3545'};">
                    {'✅ PASS' if failed == 0 and errors == 0 else '❌ FAIL'}
                </div>
                <div class="stat-label">Estado General</div>
            </div>
        </div>

        <div class="content">
"""

        # Tabla de resultados
        html += '<div class="section-title">📋 Resultados Detallados</div>'
        html += '<table class="test-table">'
        html += '<thead><tr>'
        html += '<th>Prueba</th>'
        html += '<th>Estado</th>'
        html += '<th>Duración</th>'
        html += '<th>Detalles</th>'
        html += '</tr></thead>'
        html += '<tbody>'

        for result in results.test_results:
            status_class = f"status-{result['status'].lower()}"
            status_badge = f'<span class="status-badge {status_class}">{result["status"]}</span>'

            test_name = result['name'].split()[-1].replace(')', '')

            html += '<tr>'
            html += f'<td><strong>{test_name}</strong></td>'
            html += f'<td>{status_badge}</td>'
            html += f'<td>{result["duration"]:.2f}s</td>'

            if result['status'] == 'PASSED':
                html += '<td>✅ OK</td>'
            else:
                html += '<td><span style="color: #dc3545; cursor: pointer;" onclick="toggleDetails(this)">Ver detalles ↓</span></td>'

            html += '</tr>'

            if result['error']:
                html += f'<tr style="display: none;" class="error-row">'
                html += '<td colspan="4">'

                html += '<div class="error-details">'
                html += f'<h3>❌ {result["status"]}</h3>'
                html += f'<div class="error-message"><strong>Error:</strong><br>{result["error"]}</div>'

                # Buscar solución
                solution = HTMLReportGenerator.get_error_solution(result["error"])

                if solution:
                    html += '<div class="solution">'
                    html += f'<h4>💡 {solution["title"]}</h4>'
                    html += f'<p>{solution["description"]}</p>'

                    for sol in solution["solutions"]:
                        html += f'<h4 style="font-size: 0.95em; margin-top: 15px;">{sol["title"]}</h4>'
                        html += '<ol>'
                        for step in sol["steps"]:
                            html += f'<li>{step}</li>'
                        html += '</ol>'

                    html += '<div class="files-to-check">'
                    html += '<strong>📁 Archivos a revisar:</strong>'
                    html += '<ul>'
                    for file in solution["files_to_check"]:
                        html += f'<li>{file}</li>'
                    html += '</ul>'
                    html += '</div>'
                    html += '</div>'

                if result['traceback']:
                    html += '<div class="traceback">'
                    html += '<strong>Traceback completo:</strong><br>'
                    html += result['traceback'].replace('<', '&lt;').replace('>', '&gt;')
                    html += '</div>'

                html += '</div>'
                html += '</td>'
                html += '</tr>'

        html += '</tbody>'
        html += '</table>'

        # Resumen
        if failed == 0 and errors == 0:
            html += '<div class="no-errors">✅ ¡Todas las pruebas pasaron! Excelente trabajo.</div>'
        else:
            html += f'<div class="section-title">🔍 Resumen de Errores</div>'
            html += '<div style="background: #fff3cd; padding: 15px; border-radius: 8px; color: #856404;">'
            html += f'<strong>{failed + errors} prueba(s) necesitan atención.</strong><br>'
            html += 'Revisa los detalles arriba y sigue las soluciones sugeridas.'
            html += '</div>'

        html += """
        </div>

        <div class="footer">
            <p>🧪 Reporte generado automáticamente por el sistema de pruebas automatizadas</p>
            <p style="margin-top: 10px; font-size: 0.85em;">
                Para más información: <a href="https://github.com/anthropics/claude-code" style="color: #667eea;">Ver documentación</a>
            </p>
        </div>
    </div>

    <script>
        function toggleDetails(element) {
            const row = element.closest('tr').nextElementSibling;
            if (row && row.classList.contains('error-row')) {
                if (row.style.display === 'none') {
                    row.style.display = 'table-row';
                    element.textContent = 'Ocultar ↑';
                } else {
                    row.style.display = 'none';
                    element.textContent = 'Ver detalles ↓';
                }
            }
        }

        // Auto-expandir errores al cargar
        document.querySelectorAll('.error-row').forEach((row, index) => {
            if (index < 3) {  // Mostrar solo los primeros 3 errores
                row.style.display = 'table-row';
                const link = row.previousElementSibling.querySelector('[onclick*="toggleDetails"]');
                if (link) link.textContent = 'Ocultar ↑';
            }
        });
    </script>
</body>
</html>
"""

        with open(filename, 'w', encoding='utf-8') as f:
            f.write(html)

        return filename


def run_tests_with_html_report():
    """Ejecuta pruebas y genera reporte HTML"""
    print("\n" + "="*80)
    print("🧪 Ejecutando pruebas con generación de reporte HTML...")
    print("="*80 + "\n")

    # Importar pruebas
    import test_automation
    import test_advanced

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Cargar pruebas
    test_classes = [
        test_automation.TestLogin,
        test_automation.TestNavigation,
        test_automation.TestDashboard,
        test_automation.TestReservations,
        test_automation.TestPaymentReceipts,
        test_automation.TestReviews,
        test_automation.TestAdmin,
        test_automation.TestResponsiveness,
        test_automation.TestPerformance,
    ]

    for test_class in test_classes:
        tests = loader.loadTestsFromTestCase(test_class)
        suite.addTests(tests)

    # Ejecutar con colector personalizado
    runner = unittest.TextTestRunner(resultclass=TestResultCollector, verbosity=2)
    results = runner.run(suite)

    # Generar reporte HTML
    report_file = HTMLReportGenerator.generate_html(results)

    print("\n" + "="*80)
    print("✅ Reporte generado exitosamente")
    print(f"📁 Ubicación: {report_file}")
    print("="*80 + "\n")

    # Mostrar resumen
    print(f"📊 RESUMEN:")
    print(f"   • Total: {len(results.test_results)}")
    print(f"   • ✅ Exitosas: {sum(1 for r in results.test_results if r['status'] == 'PASSED')}")
    print(f"   • ❌ Fallidas: {sum(1 for r in results.test_results if r['status'] == 'FAILED')}")
    print(f"   • ⚠️  Errores: {sum(1 for r in results.test_results if r['status'] == 'ERROR')}")
    print("\n")

    return results.wasSuccessful()


if __name__ == "__main__":
    success = run_tests_with_html_report()
    sys.exit(0 if success else 1)
