# Bot de Recordatorios — Telegram

Bot personal para gestionar recordatorios y agenda. Corre localmente o en cualquier servidor con Node 18+. Sin base de datos externa: usa un archivo `reminders.json` local.

## Requisitos

- Node.js 18 o superior
- Una cuenta de Telegram

---

## Configuración inicial

### 1. Crear el bot con @BotFather

1. Abre Telegram y busca `@BotFather`
2. Escribe `/newbot`
3. Elige un nombre (ej: "Mis Recordatorios")
4. Elige un username que termine en `bot` (ej: `mis_recordatorios_bot`)
5. Copia el **token** que te da BotFather. Se ve así:
   ```
   123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
   ```

### 2. Obtener tu chat_id

1. Busca tu bot en Telegram y escríbele `/start`
2. Abre esta URL en el navegador (reemplaza `TU_TOKEN`):
   ```
   https://api.telegram.org/botTU_TOKEN/getUpdates
   ```
3. Busca en la respuesta el campo `"id"` dentro de `"chat"`. Ese es tu `OWNER_CHAT_ID`.

### 3. Crear el archivo .env

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
OWNER_CHAT_ID=987654321
```

### 4. Instalar dependencias

```bash
npm install
```

### 5. Iniciar el bot

```bash
node bot.js
```

---

## Comandos disponibles

| Comando | Descripción | Ejemplo |
|---|---|---|
| `/recordar [texto] [fecha]` | Guarda un recordatorio | `/recordar llamar a Carolayn mañana a las 3pm` |
| `/agenda` | Lista todos los pendientes ordenados por fecha | `/agenda` |
| `/hoy` | Muestra solo los de hoy | `/hoy` |
| `/borrar [id]` | Elimina un recordatorio | `/borrar 3` |
| `/listo [id]` | Marca como completado | `/listo 2` |
| `/posponer [id] [minutos]` | Reprograma N minutos hacia adelante (default: 30) | `/posponer 2 30` |
| `/help` | Muestra la ayuda | `/help` |

### Ejemplos de fechas en español

```
/recordar pagar el alquiler el 1 de mayo a las 10am
/recordar comprar leche hoy a las 6pm
/recordar llamar al médico mañana a las 9
/recordar reunión de trabajo el lunes a las 11
/recordar tomar pastilla en 2 horas
/recordar revisar correo este viernes a las 3pm
```

---

## Comportamiento de las notificaciones

- Cada minuto el bot revisa si hay recordatorios cuya hora ya llegó.
- Cuando dispara un recordatorio, envía un mensaje con opciones:
  ```
  ⏰ Recordatorio #2
  📝 Llamar a Carolayn

  ¿Lo completaste?
    ✅ /listo_2
    ⏩ /posponer_2 30
  ```
- `/listo_2` lo marca como completado.
- `/posponer_2 30` lo pospone 30 minutos (puedes cambiar el número).

---

## Estructura de reminders.json

```json
[
  {
    "id": 1,
    "texto": "Llamar a Carolayn",
    "fecha_iso": "2025-04-10T15:00:00.000Z",
    "completado": false,
    "disparado": false
  }
]
```

---

## Mantenerlo corriendo en segundo plano

### Con pm2 (recomendado)

```bash
npm install -g pm2
pm2 start bot.js --name recordatorios
pm2 save
pm2 startup   # para que inicie al reiniciar el servidor
```

### Con nohup (sin instalar nada extra)

```bash
nohup node bot.js > bot.log 2>&1 &
```

---

## Seguridad

El bot ignora mensajes de cualquier chat que no sea el `OWNER_CHAT_ID` configurado. Es un bot completamente privado.
