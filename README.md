# Sistema de Reservas Academicas
este flujo tiene como objetivo reservar aquellos salones segun esten disponibles, si en caso dado el usuario deseea una extencio de dias/horas se realiza una solicitud hacia direccion, haciendo que esta misma rechaze u apruebe las solicitudes de igual manera se hace una validacion y extracion de datos a partir de la imagen de comprobante usando un modelo LLM (Anthropic). 

# Diagrama General 
```mermaid
flowchart TD
    A[Usuario inicia sesion] --> B{Rol}
    B -->|DIRECTION| C[Panel administrativo]
    B -->|STUDENT o TEACHER| D[Panel de reservas]

    C --> C1[Crear facultades]
    C --> C2[Crear salones]
    C --> C3[Crear usuarios]
    C --> C4[Revisar comprobantes]
    C --> C5[Revisar solicitudes]
    C --> C6[Aprobar o rechazar]

    D --> D1[Consultar disponibilidad]
    D --> D2[Crear reserva normal]
    D --> D3[Solicitar extension]
    D --> D4[Solicitar varios dias]
    D --> D5[Subir comprobante]
    D --> D6[Ver estado de solicitudes]

```


## Servicios y puertos 

- Frontend: `http://localhost:3000`
- API health: `http://localhost:3001/health`
- RabbitMQ management: `http://localhost:15672`


