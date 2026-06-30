# COPPE — preparación y acceso a la demostración

## Qué contiene

La demostración usa una empresa completamente ficticia:

- **Hotel Costa Azul — Demo COPPE**;
- 12 clientes ficticios;
- 10 casos con prioridades, categorías, idiomas y canales distintos;
- 15 mensajes;
- 5 seguimientos;
- 4 citas internas;
- 4 notas internas;
- 6 eventos de auditoría;
- un responsable y un miembro de recepción.

No utiliza datos personales reales. Tampoco envía correos, mensajes de
WhatsApp ni solicitudes a OpenAI.

## Preparación inicial

Desde `C:\Users\Juanma\Desktop\coppe`:

```powershell
npm run demo:seed
npm run demo:verify
```

El primer comando crea o actualiza únicamente el espacio ficticio. El segundo
comprueba que todas las piezas necesarias están presentes.

Para regenerar la presentación y los PDF después de editar textos o
capturas:

```powershell
npm run demo:materials
```

## Abrir la demostración

En una primera terminal:

```powershell
npm run dev
```

Cuando aparezca `Ready`, mantener esa terminal abierta.

En una segunda terminal:

```powershell
npm run demo:login
```

Después:

1. Abrir `http://127.0.0.1:3417`.
2. El navegador entrará automáticamente en COPPE.
3. El servidor de acceso se cerrará después de utilizar el enlace.

No se necesita contraseña. El callback que consume la sesión demo devuelve
404 en builds de producción.

## Recorrido recomendado

1. Dashboard: explicar la cola de trabajo.
2. Casos: enseñar filtros y estados.
3. Abrir `Presupuesto para grupo de empresa`, de David Martín.
4. Mostrar resumen, intención, información faltante y borrador.
5. Enseñar responsable, cita, seguimiento y nota interna.
6. Clientes: abrir la ficha de un cliente y su historial.
7. Configuración: enseñar canales, equipo, MFA y exportación.

## Normas para una reunión

- Compartir únicamente la ventana de COPPE, no todo el escritorio.
- No abrir `.env.local`, Supabase ni Vercel.
- No pulsar botones de envío de email o WhatsApp.
- No registrar datos de la empresa interesada.
- Describir email, WhatsApp y OpenAI como integraciones preparadas pendientes
  de activación y validación para producción.
- No entregar credenciales ni acceso autónomo al posible cliente.

## Solución rápida de incidencias

Si los datos no aparecen:

```powershell
npm run demo:seed
npm run demo:verify
```

Si el enlace local ya se utilizó o caducó:

```powershell
npm run demo:login
```

Si el puerto 3000 está ocupado, cerrar la instancia anterior de COPPE antes de
iniciar otra.
